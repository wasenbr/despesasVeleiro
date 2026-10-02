/**
 * Servidor Node (desenvolvimento local ou hospedagem própria): API + PWA, com SQLite em arquivo.
 *   DESPESAS_DB=caminho/do/banco.sqlite  PORT=8787  npm start
 */
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { createApp } from "./app";
import { openSqlite } from "./sqlite-adapter";

const dbPath = process.env.DESPESAS_DB ?? "data/despesas.sqlite";
const port = Number(process.env.PORT ?? 8787);
const db = openSqlite(dbPath, "migrations");

const api = createApp();
const root = new Hono();
root.all("/api/*", (c) => api.fetch(c.req.raw, { DB: db }));
root.use("/*", serveStatic({ root: "./dist/public" }));
root.get("/*", serveStatic({ path: "./dist/public/index.html" }));

serve({ fetch: root.fetch, port, hostname: process.env.HOST ?? "127.0.0.1" }, (info) => {
  console.log(`Despesas do veleiro: http://${info.address}:${info.port}  (banco: ${dbPath})`);
});
