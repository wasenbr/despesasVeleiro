# Despesas do Veleiro

Controle simples das despesas de um veleiro dividido entre sócios. Cada um lança as próprias despesas; o sistema divide igualmente, calcula o saldo de quem deve a quem e mostra gráficos de evolução e de onde o dinheiro está indo. Funciona como aplicativo no celular (PWA): dá para colocar o atalho na Tela de Início do iPhone.

Foi construído a partir da planilha `Veleiro Macanudo - despesas.ods`, com as mesmas regras de cálculo.

## O que ele faz

- **Lançamento rápido** no celular: valor, descrição, quem pagou, categoria e data. A descrição sugere categoria e valor a partir dos lançamentos anteriores ("Marinheiro" já vem com R$ 200).
- **Categoria e tipo**: toda despesa tem uma *categoria* (onde foi gasto: Marina, Velas, Elétrica…) e um *tipo* (por que foi gasto): **Manutenção**, **Melhoria**, **Custos de marina** (vaga, marinheiro, clube) ou **Outros**. O tipo aparece como etiqueta colorida em cada lançamento, tem filtro na lista e gráfico próprio. O sistema sugere categoria e tipo pela descrição e pelos lançamentos anteriores, e você pode trocar na hora.
- **Vendas e entradas**: venda de uma peça ou qualquer dinheiro recebido abate do total de despesas. Quem recebeu o dinheiro fica com a parte do sócio a acertar.
- **Saldo** entre os sócios e **acertos** (transferências entre eles), como na planilha.
- **Gráficos**: despesas por mês (por pessoa ou categoria), para onde vai o dinheiro, gasto acumulado, evolução do saldo e maiores despesas, com filtro de período. Os dados principais também estão disponíveis em tabela.
- Login simples, modo escuro, exportação CSV para backup.

## Como o saldo é calculado

```
parte justa = (despesas − vendas) / nº de pessoas
saldo       = (o que pagou − o que recebeu em vendas) − parte justa + acertos enviados − acertos recebidos
```

Saldo positivo: tem a receber. Negativo: deve. É a mesma conta de "Saldo Cleiton / Saldo Eduardo" da planilha.

## Publicar de graça (Cloudflare Workers + D1)

Não precisa de cartão de crédito. O plano gratuito (100 mil requisições por dia, banco de 5 GB) é muito maior do que este uso.

```bash
npm install
npx wrangler login                    # abre o navegador para entrar na sua conta Cloudflare (grátis)
npx wrangler d1 create veleiro        # copie o database_id mostrado e cole em wrangler.toml
npm run db:migrate:remote             # cria as tabelas e as categorias
npm run deploy                        # publica; mostra o endereço https://despesas-veleiro.<você>.workers.dev
```

Abra o endereço: no primeiro acesso o sistema pede para criar o primeiro usuário. Depois, em **Ajustes → Pessoas**, adicione o segundo sócio.

### Importar a planilha

Crie os usuários com os mesmos nomes da planilha ("Cleiton" e "Eduardo") e rode:

```bash
npm run import -- "Veleiro Macanudo - despesas.ods"     # confere, mostra o relatório e gera import.sql
npx wrangler d1 execute veleiro --remote --file=import.sql
```

O importador:
- lê as 3 abas (09-10/2022, 11/2022-03/2023 e Atual) e descarta as linhas "Ajuste saldo", que só carregavam o saldo de uma aba para a outra;
- recalcula o saldo com as regras do sistema e compara com o da planilha (Cleiton +742,91 — confere);
- corrige datas claramente erradas (ex.: `2024-12-20` entre lançamentos de dez/2023 e jan/2024 vira `2023-12-20`) e usa a data da linha anterior quando falta; **cada correção é listada**, confira antes de executar o SQL;
- classifica cada lançamento em uma categoria e em um tipo (manutenção, melhoria, custos de marina ou outros). São sugestões automáticas: `--listar` mostra o resultado e você ajusta no app o que quiser;
- avisa o que ignorou (ex.: a bateria com valor "DEFINIR").

Use `--substituir` para apagar os lançamentos existentes antes de importar de novo, e `--apenas-atual` para importar só a aba "Atual".

### Instalar no iPhone

No **Safari**, abra o endereço, toque em compartilhar → **Adicionar à Tela de Início**. O app abre em tela cheia e a sessão fica salva por 90 dias.

### Backup

Em **Ajustes → Exportar dados** baixe CSVs dos lançamentos e acertos. Para uma cópia completa do banco: `npx wrangler d1 export veleiro --remote --output=backup.sql`.

## Rodar no computador (ou em servidor próprio)

Precisa de Node 22.13 ou mais novo. O mesmo código roda com SQLite em arquivo:

```bash
npm install
npm run dev                  # http://127.0.0.1:8787, banco em data/despesas.sqlite
npm run import -- planilha.ods && npm run db:apply:local -- import.sql
```

Variáveis: `PORT`, `HOST` (use `0.0.0.0` para aceitar acessos da rede), `DESPESAS_DB` (caminho do arquivo). Para uso fora de casa, coloque atrás de um proxy com HTTPS (o service worker do app só funciona em HTTPS, e atrás de um proxy defina o cabeçalho `X-Forwarded-Proto`).

## Desenvolvimento

```bash
npm test             # regras de saldo, API, importador (55 testes)
npm run typecheck    # TypeScript do servidor, do navegador e do service worker
npm run build        # gera dist/public (app.js, sw.js, css, ícones)
npm run cf:dev       # roda o Worker com D1 local (precisa de wrangler.toml com um database_id)
```

Estrutura:

```
src/server/   API (Hono) e regras de saldo/estatísticas; worker.ts (Cloudflare) e node.ts (Node + SQLite)
src/web/      interface em TypeScript puro (sem framework), gráficos com Chart.js
src/shared/   tipos e regras de categoria usados pelos dois lados
migrations/   esquema do banco (D1 e SQLite)
scripts/      importador da planilha, build e geração de ícones
tests/        vitest
```

## Segurança

Senhas com PBKDF2-SHA256 (100 mil iterações); sessões com token aleatório guardado só como hash no banco, cookie `HttpOnly`/`SameSite`; bloqueio de 5 minutos após 5 senhas erradas; proteção contra CSRF por cabeçalho obrigatório nas requisições que alteram dados; todo texto é escapado na interface; CSV exportado neutraliza fórmulas. Qualquer pessoa cadastrada pode ver e editar todos os lançamentos (a ideia é confiança entre sócios).
