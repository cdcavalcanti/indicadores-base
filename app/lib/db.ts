import pg from 'pg';

// NUMERIC -> number (em vez de string)
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// DATE -> string 'YYYY-MM-DD' (sem timezone)
pg.types.setTypeParser(1082, (v) => v);

declare global {
  // eslint-disable-next-line no-var
  var _pgPool: pg.Pool | undefined;
}

export const pool =
  global._pgPool ??
  new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    options: '-c search_path=warehouse',
    max: 8,
  });

if (process.env.NODE_ENV !== 'production') global._pgPool = pool;

export async function q<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const res = await pool.query<T>(text, params as never);
  return res.rows;
}
