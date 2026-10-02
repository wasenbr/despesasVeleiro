/** Entrada do Cloudflare Workers. Arquivos estáticos (PWA) são servidos pelo binding de assets. */
import { createApp, type Env } from "./app";
import type { Db } from "./db";

const app = createApp();

interface WorkerEnv {
  DB: unknown;
}

export default {
  fetch: (req: Request, env: WorkerEnv) => app.fetch(req, { DB: env.DB as Db } satisfies Env),
};
