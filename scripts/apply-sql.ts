/** Aplica um arquivo SQL (ex.: import.sql) no banco do modo Node: `npm run db:apply:local -- import.sql`. */
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Uso: npm run db:apply:local -- arquivo.sql");
  process.exit(1);
}
const db = new DatabaseSync(process.env.DESPESAS_DB ?? "data/despesas.sqlite");
db.exec("PRAGMA foreign_keys = ON");
db.exec("BEGIN");
try {
  db.exec(readFileSync(file, "utf8"));
  db.exec("COMMIT");
  console.log("SQL aplicado.");
} catch (e) {
  db.exec("ROLLBACK");
  throw e;
}
