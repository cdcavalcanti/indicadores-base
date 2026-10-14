import { migrate } from './migrate.ts';
import { runWithLog, info, errorLog } from './log.ts';
import { closePool } from './db.ts';
import { syncSalesSupabase } from './jobs/salesSupabase.ts';
import { syncInstagram, backfillIgInsights, backfillIgImages, syncIgAccountDaily } from './jobs/instagram.ts';
import { syncMeta } from './jobs/meta.ts';
import { syncGoogleAds } from './jobs/googleAds.ts';
import { syncCobranca } from './jobs/cobranca.ts';

// Parse simples de flags --from=YYYY-MM-DD --to=YYYY-MM-DD
function flags(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of process.argv.slice(3)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function main() {
  const cmd = process.argv[2];
  const f = flags();
  await migrate();

  switch (cmd) {
    case 'sales':
      // Vendas via Supabase (alimentado pelo n8n/MySQL).
      await runWithLog('sales', () => syncSalesSupabase());
      break;
    case 'instagram':
      await runWithLog('instagram', () => syncInstagram());
      break;
    case 'ig-insights':
      await runWithLog('ig_insights_backfill', () => backfillIgInsights());
      break;
    case 'ig-images':
      // Baixa e persiste as imagens dos posts (URLs do CDN expiram). --limit=N opcional.
      await runWithLog('ig_images_backfill', () => backfillIgImages(f.limit ? Number(f.limit) : undefined));
      break;
    case 'ig-account':
      await runWithLog('ig_account', () => syncIgAccountDaily());
      break;
    case 'meta':
      await runWithLog('meta', () => syncMeta());
      break;
    case 'google':
      await runWithLog('google_ads', () => syncGoogleAds({ from: f.from, to: f.to }));
      break;
    case 'cobranca':
      await runWithLog('cobranca', () => syncCobranca());
      break;
    default:
      errorLog(`Uso: tsx src/cli.ts <sales|instagram|ig-insights|ig-images|ig-account|meta|google|cobranca> [--from=YYYY-MM-DD --to=YYYY-MM-DD --limit=N]`);
      process.exit(2);
  }
}

main()
  .then(async () => {
    await closePool();
    info('Concluído.');
    process.exit(0);
  })
  .catch(async (e) => {
    errorLog(e);
    await closePool().catch(() => {});
    process.exit(1);
  });
