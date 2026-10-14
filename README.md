# Vortex Insights

Painel de indicadores com a cara da Vortex. A base é a tela que já media vendas, rentabilidade,
metas, cobrança e marketing. O warehouse e o ETL continuam. A marca visível é a Vortex:
fundo void, superfície graphite, texto silver, título em Michroma, interface em Inter,
violeta só no ponto de ação. A logo oficial está em `app/public/marca/`.

Para ver o painel sem as credenciais de produção:

```bash
psql "$DATABASE_URL" -f db/schema.sql
node db/seed-demo.mjs
cd app && npm install && npm run dev
```

Os números do `seed-demo.mjs` são sintéticos, só para a tela não abrir vazia.

Dashboards próprios para substituir o **BI externo** e o **n8n**, com **ETL próprio** e
**data warehouse self-hosted (Postgres)**. Tudo em Docker, roda local agora e numa VPS depois.

## Estrutura do projeto

```
├── app/                    # Next.js (App Router, TS, Tailwind v4) — UI dos painéis
│   ├── app/                #   rotas: / · /vendas · /marketing/* · /etl
│   ├── components/         #   KpiCard, Section, Sidebar, Topbar, charts/ (Recharts)
│   └── lib/                #   acesso ao warehouse (pg), filtros, formatação
├── worker/                 # ETL (TS + node-cron)
│   └── src/
│       ├── jobs/           #   salesSupabase, instagram, meta, googleAds, backfill, seedDemo
│       └── clients/        #   http, mysql, supabase
├── db/                     # schema.sql do warehouse (idempotente) + seed das filiais
├── docs/                   # exports n8n + PDFs de referência (GITIGNORED — contém segredos;
│                           #   o backfill lê "Dados Instagram.json" daqui por caminho fixo)
├── .github/workflows/      # CI: build do app + typecheck do worker
└── docker-compose.yml      # db (Postgres), adminer, worker, app
```

## Arquitetura (vigente — decisão de 10/06/2026)

```
VENDAS:    MySQL ERP ──► n8n (1x/dia 8h) ──► Supabase ──► worker (15min) ──► Postgres ◄── app (Next.js)
MARKETING: Instagram / Meta Ads / Google Ads APIs ──────► worker (1x/dia 5h) ──► Postgres
```

- **Vendas**: mantemos n8n + Supabase como intermediários (decisão atual). O caminho MySQL
  direto está pronto (`npm run sync:sales-mysql`) mas estacionado — requer liberação de firewall.
  Frescor efetivo das vendas = 1x/dia (ciclo do n8n às 8h).
- **Marketing**: ETL próprio direto nas APIs, sem n8n — armazenamento 100% local.

Fontes de dados em `docs/` são **workflows n8n** (a especificação do ETL portado). **Não versionar** (contêm segredos).

## Pré-requisitos

- Docker + Docker Compose
- Node 20+ (para desenvolvimento local fora do Docker)

## Setup

```bash
cp .env.example .env          # preencha as credenciais (MySQL, APIs)
```

### Desenvolvimento local (rápido)

Sobe só o Postgres (+ Adminer) em Docker e roda app/worker localmente:

```bash
docker compose up -d db                      # warehouse
docker compose --profile dev up -d adminer   # opcional: http://localhost:8080

# worker
cd worker && npm install
npm run migrate          # aplica o schema (idempotente)
npm run seed-demo        # OPCIONAL: dados sintéticos p/ ver o painel sem o MySQL real
npm run sync:sales       # ETL real de vendas (precisa MYSQL_* no .env)

# app
cd ../app && npm install
npm run dev              # http://localhost:3000
```

### Tudo em Docker

```bash
docker compose --profile full up -d --build   # db + worker + app + adminer
# app:     http://localhost:3000
# adminer: http://localhost:8080  (server: db / user e senha do .env)
```

## ETL (worker)

| Comando | O quê |
|---|---|
| `npm run migrate` | Cria/atualiza o schema do warehouse |
| `npm run sync:sales` | Vendas via Supabase (alimentado pelo n8n) — caminho padrão |
| `npm run sync:sales-mysql -- --from=2026-01-01 --to=2026-06-10` | Vendas direto do MySQL ERP (estacionado: requer firewall liberado) |
| `npm run sync:instagram` | Instagram → `ig_media` (mídia + insights lifetime; precisa `IG_ACCESS_TOKEN`) |
| `npm run ig-insights` | Backfill de insights de mídias antigas do IG |
| `npm run ig-account` | Métricas diárias da conta IG (seguidores) |
| `npm run sync:meta` | Meta Ads → `meta_ads_insights` (nível anúncio, diário; precisa `META_ACCESS_TOKEN`) |
| `npm run sync:google` | Google Ads → `gads_*` (campanhas/grupos/keywords/termos; precisa `GADS_*`) |
| `npm run backfill` | Carga inicial (one-time, já executada): 813 posts IG do pinData + export Supabase |
| `npm run seed-demo` | Dados sintéticos de demonstração (dev) |
| `npm run typecheck` | Checagem de tipos (mesma do CI) |
| `npm start` | Scheduler (cron) com todos os jobs |

Toda execução é registrada em `warehouse.etl_sync_log` (visível em **/etl**).

## Páginas

Todas com variação vs período anterior nos KPIs e filtros de filial/data persistidos na URL.

- **/** Visão Geral — KPIs, faturamento/dia, ranking de filiais, top vendedores/produtos
- **/vendas** — KPIs, série, por filial, vendedores, produtos
- **/marketing/instagram** — posts, curtidas, alcance, seguidores, melhores posts
- **/marketing/meta-ads** — investimento, impressões, cliques, CTR/CPC, campanhas
- **/marketing/google-ads** — investimento, conversões, campanhas, palavras-chave, termos de busca
- **/etl** — saúde do ETL (últimas execuções por fonte)

## Segurança

- Segredos só em `.env` (gitignored).
- O exemplo não traz conta, token nem nome de cliente. Preencha o `.env` na implantação.
- App sem login. Antes de um cliente ver o painel, coloque autenticação.

## O que o exemplo já cobre

- Postgres, schema e seed fictício
- Telas de visão geral, vendas, rentabilidade, metas, cobrança, marketing e ETL
- Worker com jobs de vendas (Supabase), Instagram, Meta Ads, Google Ads e cobrança
- Os jobs de marketing sobem quando `META_*`, `GADS_*` e `IG_*` estão no `.env`
