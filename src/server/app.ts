/** API JSON do controle de despesas (Hono). Funciona em Cloudflare Workers e em Node. */
import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { isNature, natureLabel } from "../shared/types";
import type { Bootstrap, Category, ClassifyResult, Expense, Nature, Settlement, User } from "../shared/types";
import { norm } from "../shared/categorize";
import { hashPassword, hashToken, newToken, verifyPassword } from "./auth";
import type { Db } from "./db";
import { DEFAULT_MODEL, classifyDescription, type Example } from "./classify";
import { computeStats } from "./ledger";

export interface Env {
  DB: Db;
  /** Chave do OpenRouter (segredo). Sem ela, a classificação por IA fica desligada. */
  OPENROUTER_API_KEY?: string;
  /** Modelo do OpenRouter, ex.: openai/gpt-4o-mini. */
  OPENROUTER_MODEL?: string;
  /** Endereço da API (padrão: https://openrouter.ai/api/v1). Útil para testes ou gateways compatíveis. */
  OPENROUTER_BASE_URL?: string;
}
type Vars = { uid: number };
type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

const COOKIE = "sid";
// Sessão deslizante: cada uso renova o prazo, então quem abre o app de vez em quando não precisa logar de novo.
// 400 dias é o máximo que os navegadores aceitam no Max-Age do cookie.
const SESSION_DAYS = 400;
const MAX_ATTEMPTS = 5;
const LOCK_SECONDS = 300;
const MIN_PASSWORD = 8;
const AI_MAX_PER_HOUR = 60; // teto de chamadas à IA (controle de custo)

class ApiError extends Error {
  constructor(
    message: string,
    public status: 400 | 401 | 403 | 404 | 429 = 400,
  ) {
    super(message);
  }
}

const now = () => Math.floor(Date.now() / 1000);

// ---------- validação ----------

function parseAmount(v: unknown): number {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new ApiError("Valor inválido (use no máximo 2 casas decimais).");
  const cents = Math.round(Number(s) * 100);
  if (cents <= 0 || cents > 1_000_000_000) throw new ApiError("O valor deve ser maior que zero.");
  return cents;
}

function parseDate(v: unknown): string {
  const s = String(v ?? "");
  const d = new Date(`${s}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    throw new ApiError("Data inválida.");
  }
  const y = d.getUTCFullYear();
  if (y < 2000 || y > 2100) throw new ApiError("Data inválida.");
  return s;
}

function text(v: unknown, max: number, what: string, required = true): string {
  const s = String(v ?? "").trim();
  if ((required && !s) || s.length > max) throw new ApiError(`${what} inválido(a) (até ${max} caracteres).`);
  return s;
}

async function body(c: Ctx): Promise<Record<string, unknown>> {
  const data = await c.req.json().catch(() => null);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new ApiError("JSON inválido.");
  return data as Record<string, unknown>;
}

export function createApp(options: { fetch?: typeof fetch } = {}) {
  const app = new Hono<{ Bindings: Env; Variables: Vars }>();

  const needUser = async (db: Db, id: unknown): Promise<number> => {
    const n = Number(id);
    if (!Number.isInteger(n) || !(await db.prepare("SELECT 1 AS ok FROM users WHERE id=?").bind(n).first()))
      throw new ApiError("Usuário inválido.");
    return n;
  };
  const needCategory = async (db: Db, id: unknown): Promise<number | null> => {
    if (id === null || id === undefined || id === "") return null;
    const n = Number(id);
    if (!Number.isInteger(n) || !(await db.prepare("SELECT 1 AS ok FROM categories WHERE id=?").bind(n).first()))
      throw new ApiError("Categoria inválida.");
    return n;
  };

  app.onError((err, c) => {
    if (err instanceof ApiError) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: "Erro interno." }, 500);
  });

  // Cabeçalhos de segurança, autenticação e proteção contra CSRF.
  app.use("/api/*", async (c, next) => {
    // Requisições que alteram dados exigem este cabeçalho: um site de terceiros não consegue
    // enviá-lo sem passar por CORS (que não liberamos).
    if (!["GET", "HEAD"].includes(c.req.method) && c.req.header("X-Requested-With") !== "fetch") {
      throw new ApiError("Requisição inválida.", 403);
    }
    const publicPaths = ["/api/status", "/api/login", "/api/setup"];
    if (!publicPaths.includes(c.req.path)) {
      const token = getCookie(c, COOKIE);
      const hash = token ? await hashToken(token) : "";
      const row = token
        ? await c.env.DB.prepare("SELECT user_id, expires_at FROM sessions WHERE token_hash=? AND expires_at>?")
            .bind(hash, now())
            .first<{ user_id: number; expires_at: number }>()
        : null;
      if (!row) throw new ApiError("Faça login.", 401);
      c.set("uid", row.user_id);
      // Renova no máximo uma vez por dia (evita uma escrita a cada requisição).
      if (token && row.expires_at < now() + (SESSION_DAYS - 1) * 86400) {
        await c.env.DB.prepare("UPDATE sessions SET expires_at=? WHERE token_hash=?").bind(now() + SESSION_DAYS * 86400, hash).run();
        setSessionCookie(c, token);
      }
    }
    await next();
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
  });

  function setSessionCookie(c: Ctx, token: string) {
    setCookie(c, COOKIE, token, {
      httpOnly: true,
      sameSite: "Lax",
      secure: new URL(c.req.url).protocol === "https:",
      path: "/",
      maxAge: SESSION_DAYS * 86400,
    });
  }

  async function startSession(c: Ctx, userId: number) {
    const token = newToken();
    const db = c.env.DB;
    await db.prepare("DELETE FROM sessions WHERE expires_at<?").bind(now()).run();
    await db
      .prepare("INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?,?,?)")
      .bind(await hashToken(token), userId, now() + SESSION_DAYS * 86400)
      .run();
    setSessionCookie(c, token);
  }

  // ---------- autenticação ----------

  app.get("/api/status", async (c) => {
    const n = (await c.env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>())?.n ?? 0;
    const token = getCookie(c, COOKIE);
    const logged = token
      ? !!(await c.env.DB.prepare("SELECT 1 AS ok FROM sessions WHERE token_hash=? AND expires_at>?")
          .bind(await hashToken(token), now())
          .first())
      : false;
    return c.json({ needs_setup: n === 0, logged_in: logged });
  });

  async function createUser(c: Ctx, data: Record<string, unknown>): Promise<number> {
    const db = c.env.DB;
    const username = text(data.username, 40, "Usuário");
    const name = text(data.name || username, 60, "Nome");
    const password = String(data.password ?? "");
    if (password.length < MIN_PASSWORD) throw new ApiError(`A senha deve ter pelo menos ${MIN_PASSWORD} caracteres.`);
    if (await db.prepare("SELECT 1 AS ok FROM users WHERE username=?").bind(username).first())
      throw new ApiError("Esse usuário já existe.");
    const r = await db
      .prepare("INSERT INTO users(username, name, password_hash) VALUES (?,?,?)")
      .bind(username, name, await hashPassword(password))
      .run();
    return r.meta.last_row_id;
  }

  // Só funciona enquanto não existe nenhum usuário (primeiro acesso).
  app.post("/api/setup", async (c) => {
    const n = (await c.env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>())?.n ?? 0;
    if (n > 0) throw new ApiError("O sistema já foi configurado.", 403);
    const id = await createUser(c, await body(c));
    await startSession(c, id);
    return c.json({ id }, 201);
  });

  app.post("/api/login", async (c) => {
    const data = await body(c);
    const db = c.env.DB;
    const username = String(data.username ?? "").trim().toLowerCase();
    const recent = await db
      .prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE key=? AND ts>?")
      .bind(username, now() - LOCK_SECONDS)
      .first<{ n: number }>();
    if ((recent?.n ?? 0) >= MAX_ATTEMPTS) throw new ApiError("Muitas tentativas. Aguarde alguns minutos.", 429);
    const user = await db
      .prepare("SELECT id, password_hash FROM users WHERE username=?")
      .bind(username)
      .first<{ id: number; password_hash: string }>();
    const ok = user ? await verifyPassword(String(data.password ?? ""), user.password_hash) : false;
    if (!user || !ok) {
      await db.batch([
        db.prepare("INSERT INTO login_attempts(key, ts) VALUES (?,?)").bind(username, now()),
        db.prepare("DELETE FROM login_attempts WHERE ts<?").bind(now() - 86400),
      ]);
      throw new ApiError("Usuário ou senha incorretos.", 401);
    }
    await db.prepare("DELETE FROM login_attempts WHERE key=?").bind(username).run();
    await startSession(c, user.id);
    return c.json({ ok: true });
  });

  app.post("/api/logout", async (c) => {
    const token = getCookie(c, COOKIE);
    if (token) await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await hashToken(token)).run();
    deleteCookie(c, COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  app.post("/api/password", async (c) => {
    const data = await body(c);
    const db = c.env.DB;
    const uid = c.get("uid");
    const user = await db.prepare("SELECT password_hash FROM users WHERE id=?").bind(uid).first<{ password_hash: string }>();
    if (!user || !(await verifyPassword(String(data.old ?? ""), user.password_hash)))
      throw new ApiError("Senha atual incorreta.", 403);
    const next = String(data.new ?? "");
    if (next.length < MIN_PASSWORD) throw new ApiError(`A senha deve ter pelo menos ${MIN_PASSWORD} caracteres.`);
    await db.prepare("UPDATE users SET password_hash=? WHERE id=?").bind(await hashPassword(next), uid).run();
    return c.json({ ok: true });
  });

  app.post("/api/users", async (c) => c.json({ id: await createUser(c, await body(c)) }, 201));

  // ---------- dados de apoio ----------

  app.get("/api/bootstrap", async (c) => {
    const db = c.env.DB;
    const users = (await db.prepare("SELECT id, username, name FROM users ORDER BY id").all<User>()).results;
    const categories = (
      await db.prepare("SELECT id, name FROM categories ORDER BY name COLLATE NOCASE").all<Category>()
    ).results;
    const out: Bootstrap = {
      me: c.get("uid"),
      users,
      categories,
      ai: { enabled: !!c.env.OPENROUTER_API_KEY, model: c.env.OPENROUTER_API_KEY ? (c.env.OPENROUTER_MODEL || DEFAULT_MODEL) : null },
    };
    return c.json(out);
  });

  app.post("/api/categories", async (c) => {
    const name = text((await body(c)).name, 60, "Nome");
    try {
      const r = await c.env.DB.prepare("INSERT INTO categories(name) VALUES (?)").bind(name).run();
      return c.json({ id: r.meta.last_row_id, name }, 201);
    } catch {
      throw new ApiError("Essa categoria já existe.");
    }
  });

  app.put("/api/categories/:id", async (c) => {
    const name = text((await body(c)).name, 60, "Nome");
    try {
      await c.env.DB.prepare("UPDATE categories SET name=? WHERE id=?").bind(name, Number(c.req.param("id"))).run();
    } catch {
      throw new ApiError("Essa categoria já existe.");
    }
    return c.json({ ok: true });
  });

  app.delete("/api/categories/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const used = await c.env.DB.prepare("SELECT 1 AS ok FROM expenses WHERE category_id=? LIMIT 1").bind(id).first();
    if (used) throw new ApiError("Há lançamentos nessa categoria. Mude-os de categoria antes de excluir.");
    await c.env.DB.prepare("DELETE FROM categories WHERE id=?").bind(id).run();
    return c.json({ ok: true });
  });

  // ---------- classificação por IA ----------

  /** Sugere categoria e tipo a partir da descrição. Só a descrição é enviada ao provedor (nada de valores ou nomes). */
  app.post("/api/classify", async (c) => {
    const description = text((await body(c)).description, 200, "Descrição");
    const none: ClassifyResult = { source: "none", category_id: null, nature: null };
    if (!c.env.OPENROUTER_API_KEY) return c.json(none);
    const db = c.env.DB;
    const cats = (await db.prepare("SELECT id, name FROM categories").all<Category>()).results;
    const idOf = (name: string) => cats.find((x) => x.name === name)?.id ?? null;
    const key = norm(description);

    const cached = await db
      .prepare("SELECT category, nature FROM classifications WHERE key=?")
      .bind(key)
      .first<{ category: string; nature: Nature }>();
    if (cached && idOf(cached.category) !== null) {
      return c.json({ source: "cache", category_id: idOf(cached.category), nature: cached.nature } satisfies ClassifyResult);
    }

    const since = now() - 3600;
    const used = (await db.prepare("SELECT COUNT(*) AS n FROM ai_calls WHERE ts>?").bind(since).first<{ n: number }>())?.n ?? 0;
    if (used >= AI_MAX_PER_HOUR) throw new ApiError("Limite de classificações por IA atingido. Tente mais tarde.", 429);
    await db.batch([
      db.prepare("INSERT INTO ai_calls(ts) VALUES (?)").bind(now()),
      db.prepare("DELETE FROM ai_calls WHERE ts<?").bind(since),
    ]);

    // Exemplos reais dos sócios, para o modelo seguir as convenções deles.
    const examples = (
      await db
        .prepare(
          `SELECT e.description, c.name AS category, e.nature FROM expenses e JOIN categories c ON c.id = e.category_id
           WHERE e.kind = 'despesa' GROUP BY lower(e.description) ORDER BY MAX(e.date) DESC LIMIT 40`,
        )
        .all<Example>()
    ).results;

    const result = await classifyDescription(
      { apiKey: c.env.OPENROUTER_API_KEY, model: c.env.OPENROUTER_MODEL || DEFAULT_MODEL, baseUrl: c.env.OPENROUTER_BASE_URL, fetchImpl: options.fetch },
      description,
      cats.map((x) => x.name),
      examples,
    );
    if (!result) return c.json(none);
    await db
      .prepare("INSERT OR REPLACE INTO classifications(key, category, nature, created_at) VALUES (?,?,?,?)")
      .bind(key, result.category, result.nature, now())
      .run();
    return c.json({ source: "ia", category_id: idOf(result.category), nature: result.nature } satisfies ClassifyResult);
  });

  // ---------- lançamentos ----------

  async function expenseValues(c: Ctx) {
    const data = await body(c);
    const db = c.env.DB;
    const kind = data.kind ?? "despesa";
    if (kind !== "despesa" && kind !== "venda") throw new ApiError("Tipo inválido.");
    const nature = data.nature ?? "outro";
    if (!isNature(nature)) throw new ApiError("Tipo de despesa inválido.");
    return [
      parseDate(data.date),
      text(data.description, 200, "Descrição"),
      parseAmount(data.amount),
      kind,
      nature,
      await needUser(db, data.user_id),
      await needCategory(db, data.category_id),
    ] as const;
  }

  app.get("/api/expenses", async (c) => {
    const rows = await c.env.DB.prepare("SELECT * FROM expenses ORDER BY date DESC, id DESC").all<Expense>();
    return c.json(rows.results);
  });

  app.post("/api/expenses", async (c) => {
    const vals = await expenseValues(c);
    const db = c.env.DB;
    const r = await db
      .prepare(
        "INSERT INTO expenses(date, description, amount_cents, kind, nature, user_id, category_id, created_by) VALUES (?,?,?,?,?,?,?,?)",
      )
      .bind(...vals, c.get("uid"))
      .run();
    const row = await db.prepare("SELECT * FROM expenses WHERE id=?").bind(r.meta.last_row_id).first<Expense>();
    return c.json(row, 201);
  });

  app.put("/api/expenses/:id", async (c) => {
    const vals = await expenseValues(c);
    const r = await c.env.DB
      .prepare("UPDATE expenses SET date=?, description=?, amount_cents=?, kind=?, nature=?, user_id=?, category_id=?, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(...vals, c.get("uid"), Number(c.req.param("id")))
      .run();
    if (!r.meta.changes) throw new ApiError("Lançamento não encontrado.", 404);
    return c.json({ ok: true });
  });

  app.delete("/api/expenses/:id", async (c) => {
    const r = await c.env.DB.prepare("DELETE FROM expenses WHERE id=?").bind(Number(c.req.param("id"))).run();
    if (!r.meta.changes) throw new ApiError("Lançamento não encontrado.", 404);
    return c.json({ ok: true });
  });

  // ---------- acertos ----------

  async function settlementValues(c: Ctx) {
    const data = await body(c);
    const db = c.env.DB;
    const from = await needUser(db, data.from_user);
    const to = await needUser(db, data.to_user);
    if (from === to) throw new ApiError("Quem paga e quem recebe devem ser pessoas diferentes.");
    return [
      parseDate(data.date),
      from,
      to,
      parseAmount(data.amount),
      text(data.note, 200, "Observação", false),
    ] as const;
  }

  app.get("/api/settlements", async (c) => {
    const rows = await c.env.DB.prepare("SELECT * FROM settlements ORDER BY date DESC, id DESC").all<Settlement>();
    return c.json(rows.results);
  });

  app.post("/api/settlements", async (c) => {
    const vals = await settlementValues(c);
    const r = await c.env.DB
      .prepare("INSERT INTO settlements(date, from_user, to_user, amount_cents, note, created_by) VALUES (?,?,?,?,?,?)")
      .bind(...vals, c.get("uid"))
      .run();
    return c.json({ id: r.meta.last_row_id }, 201);
  });

  app.put("/api/settlements/:id", async (c) => {
    const vals = await settlementValues(c);
    const r = await c.env.DB
      .prepare("UPDATE settlements SET date=?, from_user=?, to_user=?, amount_cents=?, note=?, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(...vals, c.get("uid"), Number(c.req.param("id")))
      .run();
    if (!r.meta.changes) throw new ApiError("Acerto não encontrado.", 404);
    return c.json({ ok: true });
  });

  app.delete("/api/settlements/:id", async (c) => {
    const r = await c.env.DB.prepare("DELETE FROM settlements WHERE id=?").bind(Number(c.req.param("id"))).run();
    if (!r.meta.changes) throw new ApiError("Acerto não encontrado.", 404);
    return c.json({ ok: true });
  });

  // ---------- estatísticas e exportação ----------

  app.get("/api/stats", async (c) => {
    const db = c.env.DB;
    const from = c.req.query("from") ? parseDate(c.req.query("from")) : null;
    const to = c.req.query("to") ? parseDate(c.req.query("to")) : null;
    const [users, cats, expenses, settlements] = await Promise.all([
      db.prepare("SELECT id, name FROM users ORDER BY id").all<User>(),
      db.prepare("SELECT id, name FROM categories").all<Category>(),
      db.prepare("SELECT * FROM expenses").all<Expense>(),
      db.prepare("SELECT * FROM settlements").all<Settlement>(),
    ]);
    return c.json(computeStats(users.results, cats.results, expenses.results, settlements.results, from, to));
  });

  const money = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
  // Evita injeção de fórmula ao abrir o CSV no Excel/LibreOffice.
  const safe = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
  const csv = (rows: string[][]) =>
    "﻿" + rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(";")).join("\r\n") + "\r\n";

  app.get("/api/export/:kind", async (c) => {
    const db = c.env.DB;
    const kind = c.req.param("kind");
    const users = new Map(
      (await db.prepare("SELECT id, name FROM users").all<User>()).results.map((u) => [u.id, u.name]),
    );
    // Auditoria: quem lançou e quem alterou por último (vazio no que veio da planilha).
    const audit = (r: { created_by: number | null; created_at: string; updated_by: number | null; updated_at: string | null }) => [
      r.created_by !== null ? (users.get(r.created_by) ?? "") : "importado",
      r.created_at,
      r.updated_by !== null ? (users.get(r.updated_by) ?? "") : "",
      r.updated_at ?? "",
    ];
    const auditHead = ["Lançado por", "Lançado em", "Alterado por", "Alterado em"];
    let rows: string[][];
    if (kind === "lancamentos.csv") {
      const r = await db
        .prepare(
          "SELECT e.*, c.name AS cat FROM expenses e LEFT JOIN categories c ON c.id=e.category_id ORDER BY e.date, e.id",
        )
        .all<Expense & { cat: string | null }>();
      rows = [
        ["Data", "Descrição", "Tipo", "Valor", "Quem", "Categoria", "Natureza", ...auditHead],
        ...r.results.map((e) => [
          e.date,
          safe(e.description),
          e.kind === "venda" ? "Venda/entrada" : "Despesa",
          money(e.amount_cents),
          users.get(e.user_id) ?? "",
          e.cat ?? "",
          e.kind === "despesa" ? natureLabel(e.nature) : "",
          ...audit(e),
        ]),
      ];
    } else if (kind === "acertos.csv") {
      const r = await db.prepare("SELECT * FROM settlements ORDER BY date, id").all<Settlement>();
      rows = [
        ["Data", "De", "Para", "Valor", "Observação", ...auditHead],
        ...r.results.map((s) => [
          s.date,
          users.get(s.from_user) ?? "",
          users.get(s.to_user) ?? "",
          money(s.amount_cents),
          safe(s.note),
          ...audit(s),
        ]),
      ];
    } else {
      throw new ApiError("Exportação desconhecida.", 404);
    }
    return c.body(csv(rows), 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}"`,
    });
  });

  app.notFound((c) => (c.req.path.startsWith("/api/") ? c.json({ error: "Não encontrado." }, 404) : c.text("Não encontrado", 404)));

  return app;
}
