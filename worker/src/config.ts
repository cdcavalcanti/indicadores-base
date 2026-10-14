import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Carrega .env tanto rodando da raiz do repo quanto de dentro de worker/.
const _here = dirname(fileURLToPath(import.meta.url)); // worker/src
for (const p of [resolve(process.cwd(), '.env'), resolve(_here, '../../.env')]) {
  if (existsSync(p)) {
    loadEnv({ path: p });
    break;
  }
}

function env(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (v === undefined) throw new Error(`Variável de ambiente ausente: ${key}`);
  return v;
}

function optional(key: string): string | undefined {
  const v = process.env[key];
  return v && v.trim() !== '' ? v : undefined;
}

export const config = {
  databaseUrl: env('DATABASE_URL'),

  instagram: {
    accessToken: optional('IG_ACCESS_TOKEN'),
    userId: optional('IG_USER_ID'),
    graphVersion: process.env.IG_GRAPH_VERSION ?? 'v24.0',
    /** Busca insights só de mídias publicadas nos últimos N dias (lifetime é caro). */
    insightsDays: Number(process.env.IG_INSIGHTS_DAYS ?? 90),
  },

  meta: {
    accessToken: optional('META_ACCESS_TOKEN'),
    adAccountId: optional('META_AD_ACCOUNT_ID'),
    graphVersion: process.env.META_GRAPH_VERSION ?? 'v24.0',
    lookbackDays: Number(process.env.META_LOOKBACK_DAYS ?? 30),
    chunkDays: Number(process.env.META_CHUNK_DAYS ?? 7),
  },

  googleAds: {
    developerToken: optional('GADS_DEVELOPER_TOKEN'),
    clientId: optional('GADS_CLIENT_ID'),
    clientSecret: optional('GADS_CLIENT_SECRET'),
    refreshToken: optional('GADS_REFRESH_TOKEN'),
    customerId: optional('GADS_CUSTOMER_ID'),
    loginCustomerId: optional('GADS_LOGIN_CUSTOMER_ID'),
    lookbackDays: Number(process.env.GADS_LOOKBACK_DAYS ?? 7),
  },

  supabase: {
    url: optional('SUPABASE_URL'),
    serviceRoleKey: optional('SUPABASE_SERVICE_ROLE_KEY'),
  },

  // Cobrança: planilha Google da régua de WhatsApp (worker lê -> Postgres local).
  cobranca: {
    sheetId: process.env.SHEETS_COBRANCA_ID ?? '',
    gid: process.env.SHEETS_COBRANCA_GID ?? '',
    range: optional('SHEETS_COBRANCA_RANGE'), // opcional: força um range A1 (senão resolve pelo gid)
    serviceAccountJson: optional('GOOGLE_SERVICE_ACCOUNT_JSON'), // JSON inline ou caminho; ausente = fallback CSV público
  },

  cron: {
    sales: process.env.CRON_SALES ?? '*/15 * * * *',
    marketing: process.env.CRON_MARKETING ?? '0 5 * * *',
    cobranca: process.env.CRON_COBRANCA ?? '0 * * * *', // de hora em hora (a régua roda de manhã)
    enabled: (process.env.ETL_SCHEDULE_ENABLED ?? 'true') === 'true',
  },

  /** Janela rolante (em dias) sincronizada a cada execução de vendas (cron e CLI).
   *  Lê só os últimos N dias do Supabase e faz UPSERT por janela, preservando o
   *  histórico anterior. Para reprocessar tudo (backfill), use SALES_SYNC_DAYS=9999. */
  salesSyncDays: Number(process.env.SALES_SYNC_DAYS ?? 30),
};
