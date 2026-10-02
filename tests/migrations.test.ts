import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openSqlite } from "../src/server/sqlite-adapter";

describe("migrações do modo Node", () => {
  it("atualiza um banco antigo (sem controle de migrações) sem perder dados", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "veleiro-")), "antigo.sqlite");
    const old = new DatabaseSync(path);
    old.exec(readFileSync("migrations/0001_init.sql", "utf8")); // como era antes do campo "tipo"
    old.exec("INSERT INTO users(username, name, password_hash) VALUES ('c','Cleiton','x')");
    old.exec("INSERT INTO expenses(date, description, amount_cents, user_id) VALUES ('2024-01-01','Marina',29000,1)");
    old.close();

    const db = openSqlite(path, "migrations");
    const row = await db.prepare("SELECT description, nature FROM expenses").first<{ description: string; nature: string }>();
    expect(row).toEqual({ description: "Marina", nature: "outro" });
    expect((await db.prepare("SELECT COUNT(*) AS n FROM _migrations").first<{ n: number }>())!.n).toBe(2);
    openSqlite(path, "migrations"); // abrir de novo não reaplica nada
  });

  it("banco novo recebe todas as migrações uma única vez", async () => {
    const db = openSqlite(":memory:", "migrations");
    const cols = (await db.prepare("SELECT name FROM pragma_table_info('expenses')").all<{ name: string }>()).results.map((c) => c.name);
    expect(cols).toContain("nature");
  });
});
