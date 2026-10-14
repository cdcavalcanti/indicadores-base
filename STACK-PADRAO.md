# Stack padrão — painel de indicadores

> Referência desta base. Painel de indicadores com ETL próprio e warehouse
> self-hosted. Ajuste só o que for específico do cliente. Os nomes de loja do exemplo são fictícios.
>
> Filosofia: **dados na nossa mão**. Sem BI externo, sem depender de n8n quando dá pra fazer
> ETL próprio. Tudo em Docker, roda local e sobe numa VPS sem mudança de arquitetura.

---

## 1. Visão geral da arquitetura

Três peças, um banco no meio:

```
FONTES (ERP / APIs)  ──►  WORKER (ETL, cron)  ──►  POSTGRES (warehouse)  ◄──  APP (Next.js)
```

- **App** — Next.js (App Router) servindo os painéis. Lê o Postgres direto via `pg`
  em Server Components. Sem backend separado, sem ORM.
- **Worker** — processo Node/TypeScript com `node-cron`. Extrai das fontes, transforma e
  faz UPSERT no Postgres. Cada job é independente e idempotente.
- **Postgres** — warehouse self-hosted (schema `warehouse`), única fonte de verdade do app.
- **Docker Compose** — orquestra `db` + `worker` + `app` (+ `adminer` em dev).

Regra de ouro: **o app nunca fala com fonte externa**. Só lê o warehouse. Quem fala com
ERP/API é o worker. Isso mantém o painel rápido e resiliente a API caindo / token expirando.

---

## 2. Stack fixa (versões de referência)

| Camada | Tecnologia | Versão de referência |
|---|---|---|
| Runtime | **Node.js** | 22 (Docker) / 20+ (dev e CI) |
| Linguagem | **TypeScript** | ^5.7 (`strict: true`) |
| Frontend | **Next.js** (App Router) | ^15.5 |
| UI | **React** | 19 |
| Estilo | **Tailwind CSS** | v4 (via `@tailwindcss/postcss`) |
| Gráficos | **Recharts** | ^2.15 |
| Banco | **PostgreSQL** | 16-alpine |
| Driver DB | **pg** (node-postgres) | ^8.13 — **sem ORM** |
| Scheduler ETL | **node-cron** | ^3.0 |
| Exec TS no worker | **tsx** | ^4.19 |
| Cliente MySQL (origem ERP) | **mysql2** | ^3.11 — só se houver ERP MySQL |
| Env | **dotenv** | ^16.4 |
| Container | Docker + Docker Compose | — |
| CI | GitHub Actions | — |

Decisões deliberadas:
- **Sem ORM** (Prisma/Drizzle). SQL escrito à mão em `lib/queries*.ts`. Mais controle,
  menos mágica, menos peso.
- **Sem framework de UI pesado** (MUI/Chakra). Tailwind + componentes próprios.
- **Sem state manager** (Redux/Zustand). Server Components + filtros na URL.
- **Sem API REST/tRPC própria**. O app lê o Postgres direto no servidor.

---

## 3. Estrutura de pastas (monorepo simples)

```
projeto/
├── app/                    # Next.js (App Router, TS, Tailwind v4) — a UI
│   ├── app/                #   rotas: / · /<dominio> · /etl
│   ├── components/         #   KpiCard, Section, Sidebar, Topbar, charts/ (Recharts)
│   └── lib/                #   db.ts (pool pg), queries*.ts, filters.ts, format.ts
├── worker/                 # ETL (TS + node-cron)
│   └── src/
│       ├── index.ts        #   scheduler (cron) — entrypoint do container
│       ├── cli.ts          #   roda um job único pela linha de comando
│       ├── migrate.ts      #   aplica db/schema.sql (idempotente)
│       ├── jobs/           #   um arquivo por fonte (sales, instagram, meta, ...)
│       └── clients/        #   http, mysql, supabase, ... (acesso às fontes)
├── db/                     # schema.sql do warehouse (idempotente) + seeds
├── docs/                   # material de referência / specs (GITIGNORED se tiver segredo)
├── .github/workflows/      # CI: build do app + typecheck do worker
├── docker-compose.yml      # db (Postgres) + adminer + worker + app
├── .env.example            # TODAS as variáveis, sem valores reais
└── README.md
```

`app/` e `worker/` têm `package.json` próprios (não é workspace npm — são dois projetos
Node independentes que compartilham só o Postgres).

---

## 4. Convenções

### Banco / warehouse
- Tudo no schema **`warehouse`**. O pool já seta `search_path=warehouse`.
- **`db/schema.sql` é idempotente** (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).
  Roda no init do container e via `npm run migrate`. Nunca um migration por arquivo numerado —
  um schema só, sempre aplicável.
- Worker **faz UPSERT** (`ON CONFLICT ... DO UPDATE`), **nunca DELETE**. Histórico persiste;
  re-rodar um job é seguro (full refresh).
- Toda execução de ETL é logada em `warehouse.etl_sync_log` e exposta na página **/etl**.

### Acesso ao banco no app (`app/lib/db.ts`)
- Um único `pg.Pool` em singleton global (sobrevive ao HMR do Next em dev).
- Type parsers ajustados: `NUMERIC → number` (não string) e `DATE → 'YYYY-MM-DD'` (sem TZ).
- Helper `q<T>(sql, params)` retorna `rows` tipados. SQL parametrizado (`$1, $2`), **nunca**
  concatenação de string.

### Frontend
- **Server Components por padrão**; `'use client'` só onde precisa (gráficos Recharts, interação).
- **Filtros (filial, datas) vivem na URL** (`searchParams`) e são validados em `lib/filters.ts`
  — data inválida na URL não pode derrubar a página.
- KPIs com **variação vs período anterior** (delta), sparklines. Componente `KpiCard` reutilizável.
- Formatação (moeda BRL, datas em fuso de Brasília) centralizada em `lib/format.ts`.
  **Storage em UTC**, exibição em America/Sao_Paulo.
- `next.config.mjs`: `output: 'standalone'` (build enxuto p/ Docker) e `remotePatterns`
  liberando só os CDNs de imagem necessários.

### Worker / ETL
- Um **job por fonte** em `src/jobs/`, exportando uma função async. Cada job: extrai → transforma
  → UPSERT → grava no `etl_sync_log`.
- **`cli.ts` roda um job avulso** (`npm run sync:<fonte>`); **`index.ts` é o scheduler** que
  agenda todos via cron. Em dev, roda job a job pela CLI.
- Crons configuráveis por env (ex.: `CRON_SALES`, `CRON_MARKETING`). Flag `ETL_SCHEDULE_ENABLED`
  liga/desliga o scheduler.
- Clients de fonte isolados em `src/clients/` (1 arquivo por protocolo/serviço).

### Segredos
- **Só em `.env`** (gitignored). `.env.example` lista todas as chaves, com valores em branco/placeholder.
- Material de referência com segredo (exports, dumps) vai em `docs/` **gitignored**.
- Token de API com validade? Documentar data de expiração no README e na memória do projeto.

---

## 5. Docker & Compose

- **Postgres** `16-alpine` com healthcheck; volume nomeado pra persistir dados; `schema.sql`
  montado em `/docker-entrypoint-initdb.d/`.
- **App**: Dockerfile multi-stage (`deps` → `builder` → `runner`) usando o output `standalone`
  do Next. Imagem final só com `server.js` + `.next/static` + `public`.
- **Worker**: Dockerfile single-stage, `npm install --omit=dev`, roda com `tsx` (sem build).
- **Profiles**: `dev` (só adminer extra) e `full` (db + worker + app + adminer). Em dev sobe
  só o `db` e roda app/worker na máquina.
- Dentro do compose o host do Postgres é **`db`**; rodando local é **`localhost`**.

Comandos típicos:
```bash
docker compose up -d db                       # só o warehouse (dev)
docker compose --profile full up -d --build   # tudo em container
docker compose --profile full build app && docker compose --profile full up -d app   # atualizar só o app
```

---

## 6. CI (GitHub Actions)

Dois jobs independentes, Node 20, cache de npm por `package-lock.json`:
- **app** — `npm ci && npm run build` (em `app/`)
- **worker** — `npm ci && npm run typecheck` (`tsc --noEmit`, em `worker/`)

Roda em push na `main` e em todo PR. Mantenha o `typecheck` verde — é a rede de segurança
do worker (que não tem build).

---

## 7. Setup de um projeto novo (checklist)

1. Copiar a estrutura de pastas e os arquivos base (`docker-compose.yml`, Dockerfiles,
   `tsconfig.json`, `.env.example`, CI, `lib/db.ts`).
2. `cp .env.example .env` e preencher credenciais.
3. Modelar o `db/schema.sql` (schema `warehouse`, tabelas idempotentes, `etl_sync_log`).
4. Escrever os jobs do worker (um por fonte) + registrar no `cli.ts` e no scheduler.
5. Montar as queries em `app/lib/queries.ts` e as páginas (`/`, domínios, `/etl`).
6. `docker compose up -d db && cd worker && npm i && npm run migrate && npm run seed-demo`.
7. `cd ../app && npm i && npm run dev` → http://localhost:3000.
8. Subir repo no GitHub `IAINFINITY/<projeto>`, CI ligado.

---

## 8. Quando fugir do padrão

Este padrão é para **dashboards de indicadores com ETL**. Não force se o projeto for outra coisa:
- App transacional com escrita/login de usuário → aí faz sentido auth, API e talvez ORM.
- Volume de dados muito grande / analytics pesado → avaliar colunar (DuckDB/ClickHouse) no lugar do Postgres.
- Precisa de tempo real → o modelo cron+warehouse não serve; pensar em streaming.

Em caso de dúvida, **comece com este padrão** e só adicione complexidade quando o problema exigir.
