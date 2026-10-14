import { query } from './db.ts';
import { runWithLog, info } from './log.ts';
import { syncSalesSupabase } from './jobs/salesSupabase.ts';

/**
 * Gatilhos de backfill que rodam UMA ÚNICA VEZ no boot, logo após o deploy.
 *
 * Cada entrada tem uma `key` única gravada em warehouse.etl_run_once ao concluir; em
 * restarts posteriores o gatilho é pulado. Para forçar a re-execução, basta usar uma
 * `key` nova (ex.: incrementar o sufixo) numa próxima mudança de regra.
 *
 * Este aqui APAGA os últimos 90 dias (≈3 meses) do Postgres e os RECONSTRÓI do zero a
 * partir do Supabase com a regra vigente de classificação de venda, para casar com a
 * "Consulta Vendas Geral" do ERP inclusive em meses já gravados (ex.: Maio/2026), que ficam
 * fora da janela rolante de 30 dias e não seriam tocados por um sync normal. O histórico
 * anterior a 90 dias é preservado intacto.
 *
 * Regra vigente (02/07/2026): a QTD de vendas segue a coluna `Venda` do feed (venda = Venda='S'
 * e Devolucao='N', menos devoluções — reproduz o "Qtd de Vendas" do ERP). A key foi renovada
 * para forçar a re-execução deste backfill com a regra nova (a anterior classificava por nome
 * de vendedor/transferência). Ver [[pendencia-qtd-vendas-tela]].
 */
const BACKFILL_DIAS = 90;
const BACKFILLS: { key: string; descricao: string; run: () => Promise<number> }[] = [
  {
    key: 'sales_refresh_90d_erp_venda_flag_2026-07',
    descricao: `backfill dos últimos ${BACKFILL_DIAS} dias de vendas (regra Venda='S' — casa com ERP)`,
    // Apaga e regrava a janela de 90 dias. UPSERT por janela continua idempotente.
    run: () => syncSalesSupabase(BACKFILL_DIAS),
  },
];

async function jaRodou(key: string): Promise<boolean> {
  const r = await query<{ key: string }>('SELECT key FROM etl_run_once WHERE key = $1', [key]);
  return r.rowCount! > 0;
}

async function marcarRodado(key: string): Promise<void> {
  await query('INSERT INTO etl_run_once (key) VALUES ($1) ON CONFLICT (key) DO NOTHING', [key]);
}

/**
 * Executa os backfills pendentes (os que ainda não rodaram). Chamado no boot do worker,
 * depois do migrate() e antes de agendar os crons. Um erro aqui é logado em etl_sync_log
 * mas NÃO derruba o worker — o cron normal de vendas assume a partir daí.
 */
export async function runBootBackfills(): Promise<void> {
  for (const b of BACKFILLS) {
    if (await jaRodou(b.key)) {
      info(`Backfill "${b.key}" já executado — pulando.`);
      continue;
    }
    info(`Backfill "${b.key}" pendente — executando: ${b.descricao}`);
    try {
      await runWithLog(`boot_backfill:${b.key}`, b.run);
      await marcarRodado(b.key);
      info(`Backfill "${b.key}" concluído e marcado como feito.`);
    } catch {
      // já logado em etl_sync_log; deixa pendente p/ tentar de novo no próximo boot.
      info(`Backfill "${b.key}" falhou — fica pendente p/ o próximo boot.`);
    }
  }
}
