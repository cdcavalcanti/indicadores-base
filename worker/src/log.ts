import { query } from './db.ts';

export function info(...args: unknown[]) {
  console.log(new Date().toISOString(), ...args);
}

export function errorLog(...args: unknown[]) {
  console.error(new Date().toISOString(), ...args);
}

/**
 * Executa um job registrando início/fim/erro em warehouse.etl_sync_log.
 * Retorna o número de linhas processadas (o que o job devolver).
 */
export async function runWithLog(
  source: string,
  fn: () => Promise<number>,
): Promise<number> {
  const started = await query<{ id: string }>(
    `INSERT INTO etl_sync_log (source, status) VALUES ($1, 'running') RETURNING id`,
    [source],
  );
  const id = started.rows[0].id;
  info(`[${source}] iniciado (log #${id})`);
  try {
    const rows = await fn();
    await query(
      `UPDATE etl_sync_log SET finished_at = now(), status = 'ok', rows = $2 WHERE id = $1`,
      [id, rows],
    );
    info(`[${source}] ok — ${rows} linhas`);
    return rows;
  } catch (err) {
    const msg = err instanceof Error ? err.stack ?? err.message : String(err);
    await query(
      `UPDATE etl_sync_log SET finished_at = now(), status = 'error', error = $2 WHERE id = $1`,
      [id, msg.slice(0, 4000)],
    );
    errorLog(`[${source}] ERRO:`, msg);
    throw err;
  }
}
