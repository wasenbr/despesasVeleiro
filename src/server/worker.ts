/** Entrada do Cloudflare Workers. Arquivos estáticos (PWA) são servidos pelo binding de assets. */
import { createApp, type Env } from "./app";
import type { Db } from "./db";

const app = createApp();

interface WorkerEnv {
  DB: unknown;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  OPENROUTER_BASE_URL?: string;
}

export default {
  fetch: (req: Request, env: WorkerEnv) => app.fetch(req, { DB: env.DB as Db, OPENROUTER_API_KEY: env.OPENROUTER_API_KEY, OPENROUTER_MODEL: env.OPENROUTER_MODEL, OPENROUTER_BASE_URL: env.OPENROUTER_BASE_URL } satisfies Env),
};
