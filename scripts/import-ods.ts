/**
 * Converte a planilha .ods original em um arquivo SQL de importação.
 *
 *   npm run import -- planilha.ods                  # confere e gera import.sql
 *   npm run import -- planilha.ods --listar         # também lista cada lançamento por categoria
 *   npm run import -- planilha.ods --apenas-atual   # só a aba "Atual" (com o "Ajuste saldo" inicial)
 *   npm run import -- planilha.ods --substituir     # o SQL apaga lançamentos existentes antes
 *
 * Antes de rodar o SQL, crie os usuários "Cleiton" e "Eduardo" no sistema (nomes iguais aos da planilha).
 */
import { writeFileSync } from "node:fs";
import { balances } from "../src/server/ledger";
import { extract, readOds, toSql } from "./ods";

const args = process.argv.slice(2);
const file = args.find((a: string) => !a.startsWith("--"));
if (!file) {
  console.error("Uso: npm run import -- arquivo.ods [--listar] [--apenas-atual] [--substituir] [--out import.sql]");
  process.exit(1);
}
const flag = (n: string) => args.includes(n);
const out = args[args.indexOf("--out") + 1] && flag("--out") ? args[args.indexOf("--out") + 1]! : "import.sql";

const result = extract(readOds(file), flag("--apenas-atual"));
const { expenses, settlements, expectedBalance, report } = result;

const perCat = new Map<string, number>();
for (const e of expenses) perCat.set(e.category, (perCat.get(e.category) ?? 0) + 1);
console.log(`${expenses.length} lançamentos (${expenses.filter((e) => e.kind === "venda").length} vendas), ${settlements.length} acertos\n`);
console.log("Categorias:");
for (const [k, v] of [...perCat].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);

const perNature = new Map<string, { n: number; cents: number }>();
for (const e of expenses.filter((x) => x.kind === "despesa")) {
  const cur = perNature.get(e.nature) ?? { n: 0, cents: 0 };
  perNature.set(e.nature, { n: cur.n + 1, cents: cur.cents + Math.round(e.amount * 100) });
}
console.log("\nTipos de despesa (sugeridos; ajuste no app):");
for (const [k, v] of perNature) console.log(`  ${String(v.n).padStart(4)}  ${k.padEnd(11)} R$ ${(v.cents / 100).toFixed(2)}`);

// Conferência: recalcula o saldo com as regras do sistema e compara com o da planilha.
const names = [...new Set([...expenses.map((e) => e.user), ...settlements.flatMap((s) => [s.from, s.to])])].sort();
const id = (n: string) => names.indexOf(n) + 1;
const bal = balances(
  names.map((_, i) => i + 1),
  expenses.map((e) => ({ amount_cents: Math.round(e.amount * 100), kind: e.kind, user_id: id(e.user) })),
  settlements.map((s) => ({ from_user: id(s.from), to_user: id(s.to), amount_cents: Math.round(s.amount * 100) })),
);
console.log("\nSaldos calculados:");
for (const n of names) console.log(`  ${n}: ${(bal[id(n)]!.balance / 100).toFixed(2)}`);
if (expectedBalance !== null) {
  const mine = bal[id("Cleiton")]!.balance / 100;
  const ok = Math.abs(mine - expectedBalance) <= 0.011;
  console.log(`Saldo Cleiton na planilha: ${expectedBalance.toFixed(2)} | calculado: ${mine.toFixed(2)} ${ok ? "OK" : "DIFERENTE!"}`);
}
if (report.length) console.log(`\nAvisos e correções (${report.length}):\n${report.map((r) => "  " + r).join("\n")}`);

if (flag("--listar")) {
  for (const cat of [...perCat.keys()].sort()) {
    console.log(`\n== ${cat}`);
    for (const e of expenses.filter((x) => x.category === cat))
      console.log(`   ${e.final!.toISOString().slice(0, 10)}  ${e.user.padEnd(8)} ${e.amount.toFixed(2).padStart(9)}  ${e.nature.padEnd(10)} ${e.description}`);
  }
}
writeFileSync(out, toSql(result, flag("--substituir")));
console.log(`\nSQL gravado em ${out}`);
