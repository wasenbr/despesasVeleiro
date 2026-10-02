import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { categorize } from "../src/shared/categorize";
import { fixDates, toSql, type ImportResult, type Item } from "../scripts/ods";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const items = (dates: (string | null)[]): Item[] =>
  dates.map((x, i) => ({ row: i + 2, description: `item ${i}`, date: x === null ? null : x.includes("/") ? x : d(x) }));
const run = (dates: (string | null)[]) => {
  const it = items(dates);
  const report: string[] = [];
  fixDates(it, report, "t");
  return { dates: it.map((x) => x.final!.toISOString().slice(0, 10)), report };
};

describe("categorização", () => {
  it.each([
    ["Marina", "Marina"], ["Mensalidade box", "Marina"], ["marinheiro tapes", "Marinheiro"],
    ["Serviço vedação marinheiro Tapes", "Mão de obra e serviços"], ["Fio 6mm + borne bateria serviço", "Elétrica e eletrônica"],
    ["Velas e Filtro motor", "Motor e combustível"], ["Corte Vela Mestra", "Velas, lonas e capas"],
    ["AMARRA ÂNCORA- CLUBE PAGAR", "Cabos, ferragens e fundeio"], ["Cabos bolina, tape", "Cabos, ferragens e fundeio"],
    ["Material Fibra - caixa de bolina", "Casco e reforma"], ["Sikaflex", "Materiais e ferramentas"],
    ["Geladeira 12v", "Equipamentos de bordo"], ["Transferência Título Atílio", "Clube, títulos e regatas"],
    ["Serra de arco", "Materiais e ferramentas"], ["Coisa desconhecida", "Outros"],
  ])("%s -> %s", (desc, cat) => expect(categorize(desc)).toBe(cat));

  it("vendas sempre vão para Vendas e entradas", () => expect(categorize("Navman", "venda")).toBe("Vendas e entradas"));
});

describe("correção de datas", () => {
  it("corrige ano trocado e dia/mês invertidos, sem mexer em datas boas", () => {
    const base = ["2024-06-02", "2024-06-30", "2024-01-07", "2024-07-15", "2024-08-01"];
    expect(run(base).dates).toEqual(["2024-06-02", "2024-06-30", "2024-07-01", "2024-07-15", "2024-08-01"]);
    expect(run(["2023-12-01", "2024-12-20", "2024-01-03", "2024-01-17", "2024-02-01"]).dates[1]).toBe("2023-12-20");
  });

  it("entende datas em texto com ano truncado", () => {
    const r = run(["2023-02-11", "22/02/0202", "2023-02-23", "2023-02-28", "2023-03-04"]);
    expect(r.dates[1]).toBe("2023-02-22");
  });

  it("linhas sem data herdam a anterior e pequenas desordens não são tocadas", () => {
    const r = run(["2023-08-06", null, "2023-08-30", "2023-08-20", "2023-09-02"]);
    expect(r.dates).toEqual(["2023-08-06", "2023-08-06", "2023-08-30", "2023-08-20", "2023-09-02"]);
  });
});

describe("SQL gerado", () => {
  it("executa no esquema real e vincula usuários e categorias por nome", () => {
    const e = (over: object) => ({ row: 2, date: d("2024-01-01"), final: d("2024-01-01"), description: "Marina", amount: 290.5, kind: "despesa" as const, user: "Cleiton", category: "Marina", ...over });
    const result: ImportResult = {
      expenses: [e({}), e({ description: "O'Brien 'x'", user: "Eduardo", kind: "venda", category: "Vendas e entradas", amount: 10 })],
      settlements: [{ row: 2, date: d("2024-02-01"), final: d("2024-02-01"), description: "pix", from: "Cleiton", to: "Eduardo", amount: 100 }],
      expectedBalance: null, report: [],
    };
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(readFileSync("migrations/0001_init.sql", "utf8"));
    db.exec("INSERT INTO users(username, name, password_hash) VALUES ('c','Cleiton','x'),('e','eduardo','x')");
    db.exec(toSql(result, true));
    const rows = db.prepare("SELECT e.description, e.amount_cents, e.kind, u.name AS u, c.name AS c FROM expenses e JOIN users u ON u.id=e.user_id JOIN categories c ON c.id=e.category_id ORDER BY e.id").all();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ amount_cents: 29050, u: "Cleiton", c: "Marina" });
    expect(rows[1]).toMatchObject({ description: "O'Brien 'x'", kind: "venda", u: "eduardo" });
    expect(db.prepare("SELECT note, amount_cents FROM settlements").get()).toMatchObject({ note: "pix", amount_cents: 10000 });
  });
});
