import { createApp } from "../src/server/app";
import { openSqlite } from "../src/server/sqlite-adapter";

/** App novo com banco em memória e um "navegador" que guarda o cookie de sessão. */
export function newClient(opts: { apiKey?: string; model?: string; fetch?: typeof fetch } = {}) {
  const app = createApp({ fetch: opts.fetch });
  const env = { OPENROUTER_API_KEY: opts.apiKey, OPENROUTER_MODEL: opts.model };
  const db = openSqlite(":memory:", "migrations");
  let cookie = "";
  async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await app.request(
      path,
      {
        method,
        headers: {
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(method !== "GET" ? { "X-Requested-With": "fetch" } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
      { DB: db, ...env },
    );
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.startsWith("sid=;") || /Max-Age=0/i.test(set) ? "" : set.split(";")[0]!;
    const ct = res.headers.get("content-type") ?? "";
    const data = ct.includes("json") ? await res.json() : await res.text();
    return { status: res.status, data: data as any, res };
  }
  return { call, db, clearCookie: () => (cookie = "") };
}

/** Cria dois usuários (Cleiton logado) e devolve seus ids. */
export async function setupTwoUsers(c: ReturnType<typeof newClient>) {
  const a = await c.call("POST", "/api/setup", { username: "cleiton", name: "Cleiton", password: "senha-forte-1" });
  const b = await c.call("POST", "/api/users", { username: "eduardo", name: "Eduardo", password: "senha-forte-2" });
  return { cleiton: a.data.id as number, eduardo: b.data.id as number };
}
