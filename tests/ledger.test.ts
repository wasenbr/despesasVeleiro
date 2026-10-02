import { describe, expect, it } from "vitest";
import { balances, computeStats, monthRange, transfers } from "../src/server/ledger";
import type { Category, Expense, Settlement } from "../src/shared/types";

const C = 1;
const E = 2;
let seq = 0;
const exp = (date: string, cents: number, user: number, kind: Expense["kind"] = "despesa", cat: number | null = 1, nature: Expense["nature"] = "outro"): Expense => ({
  id: ++seq, date, description: "x", amount_cents: cents, kind, nature, user_id: user, category_id: cat, created_by: user, created_at: "",
});
const set = (date: string, from: number, to: number, cents: number): Settlement => ({
  id: ++seq, date, from_user: from, to_user: to, amount_cents: cents, note: "",
});

describe("saldo", () => {
  it("divide as despesas igualmente", () => {
    const b = balances([C, E], [exp("2024-01-01", 10000, C), exp("2024-01-02", 30000, E)], []);
    expect(b[C]!.balance).toBe(-10000);
    expect(b[E]!.balance).toBe(10000);
    expect(transfers(b)).toEqual([{ from: C, to: E, amount_cents: 10000 }]);
  });

  it("acerto zera o saldo", () => {
    const b = balances([C, E], [exp("2024-01-01", 10000, C), exp("2024-01-02", 30000, E)], [set("2024-02-01", C, E, 10000)]);
    expect(b[C]!.balance).toBe(0);
    expect(b[E]!.balance).toBe(0);
    expect(transfers(b)).toEqual([]);
  });

  it("venda abate do total: quem recebeu o dinheiro fica devendo metade", () => {
    // C pagou 100, E pagou 300 e depois E vendeu uma peça por 100 (ficou com o dinheiro).
    const b = balances([C, E], [exp("2024-01-01", 10000, C), exp("2024-01-02", 30000, E), exp("2024-01-03", 10000, E, "venda")], []);
    expect(b[C]!.balance).toBe(-5000);
    expect(b[E]!.balance).toBe(5000);
  });

  it("reproduz o saldo da planilha original (Cleiton +742,91)", () => {
    // Totais da aba Atual: Cleiton 18105,67; Eduardo 21371; acertos: Cleiton enviou 3800, Eduardo enviou 1424,425.
    const b = balances(
      [C, E],
      [exp("2024-01-01", 1810567, C), exp("2024-01-01", 2137100, E)],
      [set("2024-01-16", C, E, 380000), set("2026-01-09", E, C, 142443)],
    );
    expect(Math.abs(b[C]!.balance - 74291)).toBeLessThanOrEqual(1);
    expect(b[C]!.balance + b[E]!.balance).toBeLessThanOrEqual(1);
  });
});

describe("estatísticas", () => {
  const users = [{ id: C, name: "Cleiton" }, { id: E, name: "Eduardo" }];
  const cats: Category[] = [{ id: 1, name: "Marina" }, { id: 2, name: "Velas" }];

  it("agrupa por categoria só com despesas e separa vendas por mês", () => {
    const s = computeStats(users, cats, [
      exp("2024-01-10", 10000, C, "despesa", 1),
      exp("2024-01-20", 5000, E, "despesa", 2),
      exp("2024-03-05", 2000, E, "venda", null),
    ], []);
    expect(s.totals).toMatchObject({ expenses: 15000, sales: 2000, net: 13000, count: 3 });
    expect(s.categories.map((c) => c.name)).toEqual(["Marina", "Velas"]);
    expect(s.monthly.map((m) => m.month)).toEqual(["2024-01", "2024-02", "2024-03"]);
    expect(s.monthly[2]!.sales).toBe(2000);
    expect(s.cumulative.at(-1)!.total).toBe(13000);
  });

  it("totaliza por tipo de despesa (ignora vendas) e por mês", () => {
    const s = computeStats(users, cats, [
      exp("2024-01-10", 10000, C, "despesa", 1, "marina"),
      exp("2024-01-12", 3000, E, "despesa", 2, "manutencao"),
      exp("2024-02-01", 7000, E, "despesa", 2, "melhoria"),
      exp("2024-02-02", 9999, E, "venda", null, "outro"),
    ], []);
    const total = (id: string) => s.natures.find((n) => n.id === id)!;
    expect(total("marina")).toMatchObject({ total: 10000, count: 1 });
    expect(total("manutencao").total).toBe(3000);
    expect(total("melhoria").total).toBe(7000);
    expect(total("outro").total).toBe(0);
    expect(s.monthly[0]!.by_nature).toEqual({ marina: 10000, manutencao: 3000 });
    expect(s.monthly[1]!.by_nature).toEqual({ melhoria: 7000 });
  });

  it("filtra por período mas mantém o saldo geral", () => {
    const s = computeStats(users, cats, [exp("2023-05-01", 10000, C), exp("2024-05-01", 4000, E)], [], "2024-01-01", null);
    expect(s.totals.expenses).toBe(4000);
    expect(s.balances[C]!.balance).toBe(3000); // histórico completo: 10000 - 7000
  });

  it("junta categorias pequenas em 'Demais'", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: `C${i + 1}` }));
    const s = computeStats(users, many, many.map((c, i) => exp("2024-01-01", 1000 * (10 - i), C, "despesa", c.id)), [], null, null, 3);
    expect(s.category_order).toEqual(["C1", "C2", "C3", "Demais"]);
    expect(Object.keys(s.monthly[0]!.by_category).sort()).toEqual(["C1", "C2", "C3", "Demais"]);
  });

  it("monthRange cruza anos", () => {
    expect(monthRange("2023-11", "2024-02")).toEqual(["2023-11", "2023-12", "2024-01", "2024-02"]);
  });
});
