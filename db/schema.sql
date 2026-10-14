-- =====================================================================
-- Vortex Insights — Warehouse (Postgres)
-- Idempotente: pode rodar várias vezes (CREATE ... IF NOT EXISTS / ON CONFLICT).
-- Executado pelo worker no startup e/ou pelo initdb do Postgres.
-- O seed abaixo é um exemplo fictício. Não leva nome de cliente.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS warehouse;
SET search_path TO warehouse;

-- ---------- Dimensão: filiais ----------
CREATE TABLE IF NOT EXISTS dim_filial (
  id           SERIAL PRIMARY KEY,
  nome         TEXT NOT NULL UNIQUE,
  banco_mysql  TEXT NOT NULL,
  ordem        INT  NOT NULL DEFAULT 0
);

INSERT INTO dim_filial (nome, banco_mysql, ordem) VALUES
  ('Loja Centro', 'demo_centro',   1),
  ('Loja Norte',  'demo_norte',    2),
  ('Loja Sul',    'demo_sul',      3),
  ('Loja Leste',  'demo_leste',    4),
  ('Loja Jardim', 'demo_jardim',   5),
  ('Loja Serra',  'demo_serra',    6),
  ('Depósito',    'demo_deposito', 7)
ON CONFLICT (nome) DO UPDATE
  SET banco_mysql = EXCLUDED.banco_mysql, ordem = EXCLUDED.ordem;

-- ---------- Dimensão: metas mensais de faturamento por filial ----------
-- Editável pela UI (/metas). `filial` casa com dim_filial.nome. Grão (filial, ano, mês).
CREATE TABLE IF NOT EXISTS dim_meta (
  filial     TEXT NOT NULL,
  ano        INT  NOT NULL,
  mes        INT  NOT NULL CHECK (mes BETWEEN 1 AND 12),
  valor      NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
  PRIMARY KEY (filial, ano, mes)
);

-- Exemplo de junho. DO NOTHING preserva edição feita pela tela.
INSERT INTO dim_meta (filial, ano, mes, valor) VALUES
  ('Loja Centro', 2026, 6, 800000),
  ('Loja Norte',  2026, 6, 400000),
  ('Loja Sul',    2026, 6, 380000),
  ('Loja Leste',  2026, 6, 260000),
  ('Loja Jardim', 2026, 6, 240000),
  ('Loja Serra',  2026, 6, 180000),
  ('Depósito',    2026, 6, 0)
ON CONFLICT (filial, ano, mes) DO NOTHING;

-- ---------- Fatos de vendas (grão diário, alimentado pelo ETL MySQL) ----------
CREATE TABLE IF NOT EXISTS fact_vendas_dia (
  filial               TEXT NOT NULL,
  dia                  DATE NOT NULL,
  qtd_vendas           INT             NOT NULL DEFAULT 0,
  qtd_devolucoes       INT             NOT NULL DEFAULT 0,
  faturamento_bruto    NUMERIC(14,2)   NOT NULL DEFAULT 0,
  valor_devolucoes     NUMERIC(14,2)   NOT NULL DEFAULT 0,
  faturamento_liquido  NUMERIC(14,2)   NOT NULL DEFAULT 0,
  faturamento_previsto NUMERIC(14,2)   NOT NULL DEFAULT 0,
  updated_at           TIMESTAMPTZ     NOT NULL DEFAULT now(),
  PRIMARY KEY (filial, dia)
);
CREATE INDEX IF NOT EXISTS idx_fvd_dia ON fact_vendas_dia (dia);

CREATE TABLE IF NOT EXISTS fact_vendas_vendedor_dia (
  filial               TEXT NOT NULL,
  dia                  DATE NOT NULL,
  codigo_vendedor      TEXT NOT NULL,
  nome_vendedor        TEXT,
  qtd_vendas           INT             NOT NULL DEFAULT 0,
  faturamento_bruto    NUMERIC(14,2)   NOT NULL DEFAULT 0,
  valor_devolucoes     NUMERIC(14,2)   NOT NULL DEFAULT 0,
  faturamento_liquido  NUMERIC(14,2)   NOT NULL DEFAULT 0,
  faturamento_previsto NUMERIC(14,2)   NOT NULL DEFAULT 0,
  updated_at           TIMESTAMPTZ     NOT NULL DEFAULT now(),
  PRIMARY KEY (filial, dia, codigo_vendedor)
);
CREATE INDEX IF NOT EXISTS idx_fvvd_dia ON fact_vendas_vendedor_dia (dia);

CREATE TABLE IF NOT EXISTS fact_vendas_produto_dia (
  filial             TEXT NOT NULL,
  dia                DATE NOT NULL,
  codigo_produto     TEXT NOT NULL,
  nome_produto       TEXT,
  quantidade_vendida NUMERIC(14,3)  NOT NULL DEFAULT 0,
  faturamento_bruto  NUMERIC(14,2)  NOT NULL DEFAULT 0,  -- valor de tabela: SUM(PrecoTabela*Qtd)
  custo_total        NUMERIC(14,2)  NOT NULL DEFAULT 0,  -- SUM(Custo*Qtd) — base da margem de lucro
  receita_liquida    NUMERIC(14,2)  NOT NULL DEFAULT 0,  -- SUM(Total) = receita real, líquida de desconto
  updated_at         TIMESTAMPTZ    NOT NULL DEFAULT now(),
  PRIMARY KEY (filial, dia, codigo_produto)
);
CREATE INDEX IF NOT EXISTS idx_fvpd_dia ON fact_vendas_produto_dia (dia);
-- colunas de rentabilidade adicionadas após o schema inicial (idempotente p/ bancos já criados)
ALTER TABLE fact_vendas_produto_dia ADD COLUMN IF NOT EXISTS custo_total     NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE fact_vendas_produto_dia ADD COLUMN IF NOT EXISTS receita_liquida NUMERIC(14,2) NOT NULL DEFAULT 0;

-- ---------- Cobrança: régua de WhatsApp (grão = evento, alimentado pela planilha) ----------
-- Cada disparo da régua (vence_em_3_dias / vence_hoje / vencido_ha_3_dias) é um evento.
-- id_evento = {titulo}_{tipo_aviso}_{data} -> um mesmo título aparece em até 3 eventos:
-- KPIs de cadência contam eventos; KPIs financeiros deduplicam pelo último evento por titulo_id.
-- status_pagamento/status_evento são SNAPSHOT (não atribuição causal de pagamento).
CREATE TABLE IF NOT EXISTS fact_cobranca_evento (
  id_evento        TEXT PRIMARY KEY,
  data_evento      TIMESTAMPTZ,
  dia              DATE,                              -- data_evento (Brasília) p/ filtro/série
  tipo_aviso       TEXT,
  template         TEXT,
  status_evento    TEXT,                              -- enviado_ok | pago_antes_envio | falha_meta
  is_whatsapp      BOOLEAN,
  meta_message_id  TEXT,
  meta_error_code  TEXT,
  meta_error_msg   TEXT,
  cliente_id       TEXT,
  cliente_nome     TEXT,
  cliente_cpf_cnpj TEXT,
  telefone         TEXT,
  titulo_id        TEXT,
  nro_doc          TEXT,
  valor            NUMERIC(14,2) NOT NULL DEFAULT 0,
  vencimento       DATE,
  filial           TEXT,                              -- casa com dim_filial.nome
  banco            TEXT,
  status_pagamento TEXT,                              -- em_aberto | pago
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cobr_dia    ON fact_cobranca_evento (dia);
CREATE INDEX IF NOT EXISTS idx_cobr_filial ON fact_cobranca_evento (filial, dia);
CREATE INDEX IF NOT EXISTS idx_cobr_titulo ON fact_cobranca_evento (titulo_id, data_evento DESC);

-- ---------- Marketing: Instagram (mídia + insights lifetime pivotados) ----------
CREATE TABLE IF NOT EXISTS ig_media (
  id                 TEXT PRIMARY KEY,
  media_type         TEXT,
  media_product_type TEXT,
  comments_count     INT,
  like_count         INT,
  media_url          TEXT,
  thumbnail_url      TEXT,
  permalink          TEXT,
  caption            TEXT,
  timestamp          TIMESTAMPTZ,
  -- insights (período lifetime; nem toda métrica existe p/ todo tipo de mídia)
  reach              BIGINT,
  saved              BIGINT,
  profile_visits     BIGINT,
  follows            BIGINT,
  shares             BIGINT,
  reposts            BIGINT,
  insights_at        TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ig_ts ON ig_media (timestamp);
-- coluna adicionada depois do schema inicial (idempotente p/ bancos já criados)
ALTER TABLE ig_media ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
-- Imagem baixada e guardada localmente: as URLs do CDN do Instagram expiram em horas/dias,
-- então persistimos os bytes para servir do próprio dashboard (rota /api/ig-image/[id]).
ALTER TABLE ig_media ADD COLUMN IF NOT EXISTS image_data  BYTEA;
ALTER TABLE ig_media ADD COLUMN IF NOT EXISTS image_mime  TEXT;
ALTER TABLE ig_media ADD COLUMN IF NOT EXISTS image_at    TIMESTAMPTZ;

-- ---------- Marketing: Instagram (métricas diárias da CONTA) ----------
CREATE TABLE IF NOT EXISTS ig_account_daily (
  date            DATE PRIMARY KEY,
  follower_count  INT,            -- seguidores GANHOS no dia (API: follower_count, period=day)
  followers_total BIGINT,         -- snapshot do total de seguidores (no dia da coleta)
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Marketing: Meta Ads (insights diários por ANÚNCIO, como no n8n) ----------
CREATE TABLE IF NOT EXISTS meta_ads_insights (
  ad_account_id      TEXT,
  date               DATE NOT NULL,
  campaign_id        TEXT,
  campaign_name      TEXT,
  adset_id           TEXT,
  adset_name         TEXT,
  ad_id              TEXT NOT NULL,
  ad_name            TEXT,
  objective          TEXT,
  optimization_goal  TEXT,
  spend              NUMERIC(14,2)  NOT NULL DEFAULT 0,
  impressions        BIGINT         NOT NULL DEFAULT 0,
  reach              BIGINT         NOT NULL DEFAULT 0,
  frequency          NUMERIC(10,4),
  clicks             BIGINT         NOT NULL DEFAULT 0,
  inline_link_clicks BIGINT,
  cpm                NUMERIC(14,4),
  cpc                NUMERIC(14,4),
  ctr                NUMERIC(10,4),
  conversions        JSONB,
  actions            JSONB,
  action_values      JSONB,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ad_id, date)
);
CREATE INDEX IF NOT EXISTS idx_meta_date ON meta_ads_insights (date);
CREATE INDEX IF NOT EXISTS idx_meta_campaign ON meta_ads_insights (campaign_id, date);

-- Criativos dos anúncios (thumbnail p/ cards no painel). URLs são CDN assinada
-- da Meta e expiram; o sync diário renova.
CREATE TABLE IF NOT EXISTS meta_ad_creatives (
  ad_id         TEXT PRIMARY KEY,
  ad_name       TEXT,
  thumbnail_url TEXT,
  image_url     TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Marketing: Google Ads ----------
CREATE TABLE IF NOT EXISTS gads_campaigns_daily (
  customer_id       TEXT NOT NULL,
  campaign_id       TEXT NOT NULL,
  date              DATE NOT NULL,
  campaign_name     TEXT,
  status            TEXT,
  channel_type      TEXT,
  impressions       BIGINT        NOT NULL DEFAULT 0,
  clicks            BIGINT        NOT NULL DEFAULT 0,
  cost              NUMERIC(14,2) NOT NULL DEFAULT 0,
  conversions       NUMERIC(14,2) NOT NULL DEFAULT 0,
  conversions_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, campaign_id, date)
);
CREATE INDEX IF NOT EXISTS idx_gads_camp_date ON gads_campaigns_daily (date);

CREATE TABLE IF NOT EXISTS gads_adgroups_daily (
  customer_id   TEXT NOT NULL,
  campaign_id   TEXT NOT NULL,
  ad_group_id   TEXT NOT NULL,
  date          DATE NOT NULL,
  ad_group_name TEXT,
  status        TEXT,
  impressions   BIGINT        NOT NULL DEFAULT 0,
  clicks        BIGINT        NOT NULL DEFAULT 0,
  cost          NUMERIC(14,2) NOT NULL DEFAULT 0,
  conversions   NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, ad_group_id, date)
);

CREATE TABLE IF NOT EXISTS gads_keywords_daily (
  customer_id  TEXT NOT NULL,
  ad_group_id  TEXT NOT NULL,
  criterion_id TEXT NOT NULL,
  date         DATE NOT NULL,
  keyword_text TEXT,
  match_type   TEXT,
  impressions  BIGINT        NOT NULL DEFAULT 0,
  clicks       BIGINT        NOT NULL DEFAULT 0,
  cost         NUMERIC(14,2) NOT NULL DEFAULT 0,
  conversions  NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, criterion_id, ad_group_id, date)
);

CREATE TABLE IF NOT EXISTS gads_search_terms_daily (
  customer_id  TEXT NOT NULL,
  ad_group_id  TEXT NOT NULL,
  date         DATE NOT NULL,
  search_term  TEXT NOT NULL,
  impressions  BIGINT        NOT NULL DEFAULT 0,
  clicks       BIGINT        NOT NULL DEFAULT 0,
  cost         NUMERIC(14,2) NOT NULL DEFAULT 0,
  conversions  NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, ad_group_id, date, search_term)
);

-- ---------- Observabilidade do ETL ----------
CREATE TABLE IF NOT EXISTS etl_sync_log (
  id          BIGSERIAL PRIMARY KEY,
  source      TEXT NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status      TEXT NOT NULL DEFAULT 'running',
  rows        INT,
  error       TEXT
);
CREATE INDEX IF NOT EXISTS idx_etl_source ON etl_sync_log (source, started_at DESC);

-- Gatilhos que devem rodar UMA ÚNICA VEZ (ex.: backfill após mudança de regra de cálculo).
-- O worker grava a chave aqui ao concluir; em restarts posteriores o gatilho é pulado.
CREATE TABLE IF NOT EXISTS etl_run_once (
  key     TEXT PRIMARY KEY,
  ran_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
