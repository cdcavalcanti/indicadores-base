import cron from 'node-cron';
import { config } from './config.ts';
import { migrate } from './migrate.ts';
import { runBootBackfills } from './bootBackfill.ts';
import { runWithLog, info, errorLog } from './log.ts';
import { syncSalesSupabase } from './jobs/salesSupabase.ts';
import { syncInstagram } from './jobs/instagram.ts';
import { syncMeta } from './jobs/meta.ts';
import { syncGoogleAds } from './jobs/googleAds.ts';
import { syncCobranca } from './jobs/cobranca.ts';

async function safe(source: string, fn: () => Promise<number>) {
  try {
    await runWithLog(source, fn);
  } catch (e) {
    // já logado em etl_sync_log; não derruba o scheduler
    errorLog(`[${source}] capturado no scheduler`);
  }
}

async function main() {
  info('Worker ETL iniciando...');
  await migrate();

  // Backfills de boot (rodam uma única vez por deploy; idempotentes em restarts).
  await runBootBackfills();

  if (!config.cron.enabled) {
    info('ETL_SCHEDULE_ENABLED=false — scheduler desligado. Rode jobs via CLI.');
    // Mantém o processo vivo (sem isso o container reinicia em loop).
    setInterval(() => {}, 1 << 30);
    return;
  }

  // Vendas via Supabase (alimentado pelo n8n/MySQL): refresh completo, frequente.
  cron.schedule(config.cron.sales, () => void safe('sales', () => syncSalesSupabase()));
  info(`Agendado vendas: "${config.cron.sales}"`);

  // Marketing: diário.
  cron.schedule(config.cron.marketing, () => {
    void safe('instagram', () => syncInstagram());
    void safe('meta', () => syncMeta());
    void safe('google_ads', () => syncGoogleAds());
  });
  info(`Agendado marketing: "${config.cron.marketing}"`);

  // Cobrança: lê a planilha da régua de WhatsApp.
  cron.schedule(config.cron.cobranca, () => void safe('cobranca', () => syncCobranca()));
  info(`Agendado cobrança: "${config.cron.cobranca}"`);

  info('Scheduler ativo. Aguardando gatilhos...');
}

main().catch((e) => {
  errorLog('Falha fatal no worker:', e);
  process.exit(1);
});
