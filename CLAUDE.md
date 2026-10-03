# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

PWA de despesas compartilhadas de um veleiro entre sócios. TypeScript puro, sem framework no front. Código, comentários, mensagens de erro e UI em pt-BR.

## Comandos

```bash
npm run dev                         # build + servidor Node em http://127.0.0.1:8787 (SQLite em data/despesas.sqlite)
npm test                            # vitest (todos)
npx vitest run tests/ledger.test.ts # um arquivo
npx vitest run -t "nome do teste"   # um teste pelo nome
npm run typecheck                   # 3 tsconfigs: server, web, sw
npm run build                       # gera dist/public (app.js e sw.js via esbuild + cópia de public/)
npm run cf:dev                      # Worker + D1 local (exige database_id real no wrangler.toml)
npm run import -- planilha.ods      # importa a planilha .ods → import.sql (ver --listar, --substituir, --apenas-atual)
npm run db:apply:local -- import.sql
```

Node >= 22.13 (usa `node:sqlite`). Sempre rodar `npm run typecheck` além dos testes: vitest não checa tipos.

## Arquitetura

**Um app Hono, dois runtimes.** `src/server/app.ts` (`createApp`) contém toda a API JSON (`/api/*`). Ele recebe o banco via `Env.DB`, tipado pela interface mínima `Db` de `src/server/db.ts` (subconjunto do D1: `prepare/bind/first/all/run/batch`).
- `worker.ts`: Cloudflare Workers + D1. Os estáticos vêm do binding `ASSETS` (`dist/public`); o Worker só roda em `/api/*` (`wrangler.toml`).
- `node.ts`: Node + `sqlite-adapter.ts`, que implementa `Db` sobre `node:sqlite` e aplica as migrações na abertura, controladas pela tabela `_migrations`.
- Ao adicionar uma variável de ambiente, repasse-a em `worker.ts`, `node.ts` e `tests/helpers.ts`.

**Migrações** (`migrations/NNNN_*.sql`) servem aos dois runtimes: `wrangler d1 migrations` no D1 e o adaptador no Node. Elas são só aditivas; nunca edite uma migração existente. `tests/migrations.test.ts` verifica a atualização de bancos antigos.

**Regras de negócio:**
- `src/server/ledger.ts`: saldos, transferências sugeridas e estatísticas (`computeStats`). Replica a planilha original (fórmula no README).
- Valores sempre em centavos inteiros (`amount_cents`). Vendas/entradas têm `kind` próprio e entram com sinal negativo via `signed()`.
- Cada despesa tem *categoria* (onde) e *tipo/nature* (por quê: manutenção, melhoria, custos de marina, outros).

**Classificação:** `src/shared/categorize.ts` tem regras regex (a ordem importa; a primeira que casar vence). Elas são usadas no importador e no front. `src/server/classify.ts` consulta o OpenRouter (opcional, via `OPENROUTER_API_KEY`), valida a resposta contra as categorias existentes e cai nas regras locais em caso de falha. O servidor guarda cache por descrição e limita a 60 chamadas/hora. `createApp({ fetch })` aceita um `fetch` injetado para os testes.

**Front (`src/web/`):** roteamento por hash em `main.ts`, estado global em `state.ts`, recarregado de `/api/bootstrap`, `/api/expenses`, `/api/settlements` e `/api/stats`. Após mutações, as views chamam `emitChanged()` (`bus.ts`), e o app recarrega e redesenha. `dom.ts` tem o template `html` com escape automático (use `Safe` só para HTML confiável). `sw.ts` é o service worker, com `BUILD_ID` injetado no build.

**Segurança da API:** requisições não-GET exigem o cabeçalho `X-Requested-With` (CSRF). A sessão é um cookie `sid` com o token guardado como hash. O CSV exportado neutraliza fórmulas.

## Testes

`tests/helpers.ts` → `newClient()` cria um app com SQLite `:memory:` e um cliente que guarda o cookie e envia o cabeçalho CSRF. `setupTwoUsers()` cria os dois sócios. Os testes de API usam `app.request` direto, sem servidor.
