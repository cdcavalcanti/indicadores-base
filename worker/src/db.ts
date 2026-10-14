import pg from 'pg';
import { config } from './config.ts';

// Garante que valores NUMERIC voltem como número (e não string) nas leituras do worker.
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  // Todas as tabelas vivem no schema "warehouse".
  options: '-c search_path=warehouse',
  max: 5,
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as never);
}

export async function closePool() {
  await pool.end();
}
