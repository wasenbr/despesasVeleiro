/** Adaptador do SQLite embutido do Node (node:sqlite) com a mesma interface do D1. Usado em testes e no modo Node. */
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Db, Stmt } from "./db";

type Param = null | number | bigint | string;
const clean = (v: unknown[]): Param[] => v.map((x) => (x === undefined ? null : (x as Param)));

export function openSqlite(path: string, migrationsDir?: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new DatabaseSync(path);
  sqlite.exec("PRAGMA foreign_keys = ON");
  if (path !== ":memory:") sqlite.exec("PRAGMA journal_mode = WAL");
  if (migrationsDir) {
    // Mesmo controle do D1 (`wrangler d1 migrations`): cada arquivo roda uma única vez.
    sqlite.exec("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)");
    const done = new Set((sqlite.prepare("SELECT name FROM _migrations").all() as { name: string }[]).map((r) => r.name));
    const files = readdirSync(migrationsDir).filter((n) => n.endsWith(".sql")).sort();
    // Bancos criados antes do controle de migrações já têm a primeira aplicada.
    if (!done.size && sqlite.prepare("SELECT 1 FROM sqlite_master WHERE name='users'").get()) {
      sqlite.prepare("INSERT INTO _migrations VALUES (?)").run(files[0]!);
      done.add(files[0]!);
    }
    for (const f of files) {
      if (done.has(f)) continue;
      sqlite.exec("BEGIN");
      try {
        sqlite.exec(readFileSync(join(migrationsDir, f), "utf8"));
        sqlite.prepare("INSERT INTO _migrations VALUES (?)").run(f);
        sqlite.exec("COMMIT");
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    }
  }

  const make = (sql: string, params: Param[] = []): Stmt => ({
    bind: (...values) => make(sql, clean(values)),
    async first<T>() {
      return (sqlite.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async all<T>() {
      return { results: sqlite.prepare(sql).all(...params) as T[] };
    },
    async run() {
      const r = sqlite.prepare(sql).run(...params);
      return { meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } };
    },
  });

  return {
    prepare: (sql) => make(sql),
    async batch(stmts) {
      sqlite.exec("BEGIN");
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        sqlite.exec("COMMIT");
        return out;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
