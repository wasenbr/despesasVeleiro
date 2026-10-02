import { describe, expect, it } from "vitest";
import { newClient, setupTwoUsers } from "./helpers";

describe("autenticação", () => {
  it("primeiro acesso cria o usuário e só funciona uma vez", async () => {
    const c = newClient();
    expect((await c.call("GET", "/api/status")).data).toEqual({ needs_setup: true, logged_in: false });
    const r = await c.call("POST", "/api/setup", { username: "cleiton", name: "Cleiton", password: "senha-forte-1" });
    expect(r.status).toBe(201);
    expect((await c.call("GET", "/api/status")).data).toEqual({ needs_setup: false, logged_in: true });
    c.clearCookie();
    expect((await c.call("POST", "/api/setup", { username: "x", password: "senha-forte-1" })).status).toBe(403);
  });

  it("exige login e o cabeçalho anti-CSRF", async () => {
    const c = newClient();
    await setupTwoUsers(c);
    c.clearCookie();
    expect((await c.call("GET", "/api/expenses")).status).toBe(401);
    expect((await c.call("POST", "/api/login", { username: "cleiton", password: "senha-forte-1" }, { "X-Requested-With": "" })).status).toBe(403);
    expect((await c.call("POST", "/api/login", { username: "CLEITON", password: "senha-forte-1" })).status).toBe(200);
    expect((await c.call("GET", "/api/expenses")).status).toBe(200);
    await c.call("POST", "/api/logout");
    expect((await c.call("GET", "/api/expenses")).status).toBe(401);
  });

  it("bloqueia após 5 tentativas erradas", async () => {
    const c = newClient();
    await setupTwoUsers(c);
    c.clearCookie();
    for (let i = 0; i < 5; i++) expect((await c.call("POST", "/api/login", { username: "cleiton", password: "errada" })).status).toBe(401);
    expect((await c.call("POST", "/api/login", { username: "cleiton", password: "senha-forte-1" })).status).toBe(429);
  });

  it("rejeita senha curta e usuário duplicado; troca de senha", async () => {
    const c = newClient();
    await setupTwoUsers(c);
    expect((await c.call("POST", "/api/users", { username: "novo", password: "curta" })).status).toBe(400);
    expect((await c.call("POST", "/api/users", { username: "EDUARDO", password: "senha-forte-9" })).status).toBe(400);
    expect((await c.call("POST", "/api/password", { old: "errada", new: "outra-senha-1" })).status).toBe(403);
    expect((await c.call("POST", "/api/password", { old: "senha-forte-1", new: "outra-senha-1" })).status).toBe(200);
    c.clearCookie();
    expect((await c.call("POST", "/api/login", { username: "cleiton", password: "outra-senha-1" })).status).toBe(200);
  });

  it("não guarda a senha nem o token em texto puro", async () => {
    const c = newClient();
    await setupTwoUsers(c);
    const u = await c.db.prepare("SELECT password_hash FROM users WHERE username='cleiton'").first<{ password_hash: string }>();
    expect(u!.password_hash.startsWith("pbkdf2$")).toBe(true);
    expect(u!.password_hash).not.toContain("senha-forte-1");
  });
});

describe("lançamentos", () => {
  const base = { date: "2024-05-10", description: "Marina", amount: "290,50", kind: "despesa", category_id: null };

  it("cria, lista, edita e exclui", async () => {
    const c = newClient();
    const { cleiton, eduardo } = await setupTwoUsers(c);
    const cat = (await c.call("GET", "/api/bootstrap")).data.categories.find((x: any) => x.name === "Marina");
    const r = await c.call("POST", "/api/expenses", { ...base, user_id: cleiton, category_id: cat.id });
    expect(r.status).toBe(201);
    expect(r.data).toMatchObject({ amount_cents: 29050, user_id: cleiton, created_by: cleiton });
    const id = r.data.id;
    expect((await c.call("PUT", `/api/expenses/${id}`, { ...base, amount: 300, user_id: eduardo })).status).toBe(200);
    const list = (await c.call("GET", "/api/expenses")).data;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ amount_cents: 30000, user_id: eduardo });
    expect((await c.call("DELETE", `/api/expenses/${id}`)).status).toBe(200);
    expect((await c.call("DELETE", `/api/expenses/${id}`)).status).toBe(404);
  });

  it("valida os campos", async () => {
    const c = newClient();
    const { cleiton } = await setupTwoUsers(c);
    const bad = async (patch: object) => (await c.call("POST", "/api/expenses", { ...base, user_id: cleiton, ...patch })).status;
    expect(await bad({ amount: "0" })).toBe(400);
    expect(await bad({ amount: "-5" })).toBe(400);
    expect(await bad({ amount: "abc" })).toBe(400);
    expect(await bad({ amount: "1,234" })).toBe(400);
    expect(await bad({ date: "2024-02-31" })).toBe(400);
    expect(await bad({ date: "10/05/2024" })).toBe(400);
    expect(await bad({ description: "   " })).toBe(400);
    expect(await bad({ kind: "outro" })).toBe(400);
    expect(await bad({ user_id: 999 })).toBe(400);
    expect(await bad({ category_id: 999 })).toBe(400);
    expect(await bad({})).toBe(201);
  });

  it("grava o tipo da despesa, valida e exporta", async () => {
    const c = newClient();
    const { cleiton } = await setupTwoUsers(c);
    const r = await c.call("POST", "/api/expenses", { ...base, user_id: cleiton, nature: "melhoria" });
    expect(r.data.nature).toBe("melhoria");
    expect((await c.call("POST", "/api/expenses", { ...base, user_id: cleiton })).data.nature).toBe("outro"); // padrão
    expect((await c.call("POST", "/api/expenses", { ...base, user_id: cleiton, nature: "luxo" })).status).toBe(400);
    expect((await c.call("PUT", `/api/expenses/${r.data.id}`, { ...base, user_id: cleiton, nature: "manutencao" })).status).toBe(200);
    expect((await c.call("GET", "/api/expenses")).data.map((e: any) => e.nature).sort()).toEqual(["manutencao", "outro"]);
    const stats = (await c.call("GET", "/api/stats")).data;
    expect(stats.natures.find((n: any) => n.id === "manutencao").total).toBe(29050);
    expect((await c.call("GET", "/api/export/lancamentos.csv")).data).toContain("Manutenção");
  });

  it("vendas entram no saldo como dinheiro recebido", async () => {
    const c = newClient();
    const { cleiton, eduardo } = await setupTwoUsers(c);
    const add = (user_id: number, amount: number, kind = "despesa") =>
      c.call("POST", "/api/expenses", { ...base, user_id, amount, kind });
    await add(cleiton, 100);
    await add(eduardo, 300);
    await add(eduardo, 100, "venda");
    const s = (await c.call("GET", "/api/stats")).data;
    expect(s.totals).toMatchObject({ expenses: 40000, sales: 10000, net: 30000 });
    expect(s.balances[cleiton].balance).toBe(-5000);
    expect(s.transfers).toEqual([{ from: cleiton, to: eduardo, amount_cents: 5000 }]);
  });

  it("exclui categoria só se não estiver em uso", async () => {
    const c = newClient();
    const { cleiton } = await setupTwoUsers(c);
    const cats = (await c.call("GET", "/api/bootstrap")).data.categories;
    await c.call("POST", "/api/expenses", { ...base, user_id: cleiton, category_id: cats[0].id });
    expect((await c.call("DELETE", `/api/categories/${cats[0].id}`)).status).toBe(400);
    expect((await c.call("DELETE", `/api/categories/${cats[1].id}`)).status).toBe(200);
    expect((await c.call("POST", "/api/categories", { name: "Nova" })).status).toBe(201);
    expect((await c.call("POST", "/api/categories", { name: "nova" })).status).toBe(400);
  });
});

describe("acertos e exportação", () => {
  it("registra acerto e atualiza o saldo", async () => {
    const c = newClient();
    const { cleiton, eduardo } = await setupTwoUsers(c);
    const exp = { date: "2024-05-10", description: "Casco", amount: 1000, kind: "despesa" };
    await c.call("POST", "/api/expenses", { ...exp, user_id: eduardo });
    expect((await c.call("GET", "/api/stats")).data.balances[cleiton].balance).toBe(-50000);
    const s = { date: "2024-06-01", from_user: cleiton, to_user: eduardo, amount: "500", note: "pix" };
    expect((await c.call("POST", "/api/settlements", { ...s, to_user: cleiton })).status).toBe(400);
    const r = await c.call("POST", "/api/settlements", s);
    expect(r.status).toBe(201);
    expect((await c.call("GET", "/api/stats")).data.balances[cleiton].balance).toBe(0);
    expect((await c.call("DELETE", `/api/settlements/${r.data.id}`)).status).toBe(200);
  });

  it("exporta CSV neutralizando fórmulas", async () => {
    const c = newClient();
    const { cleiton } = await setupTwoUsers(c);
    await c.call("POST", "/api/expenses", { date: "2024-05-10", description: "=HYPERLINK(\"x\")", amount: 10, kind: "despesa", user_id: cleiton });
    const r = await c.call("GET", "/api/export/lancamentos.csv");
    expect(r.status).toBe(200);
    expect(r.data).toContain(`"'=HYPERLINK(""x"")"`);
    expect((await c.call("GET", "/api/export/outro.csv")).status).toBe(404);
  });
});
