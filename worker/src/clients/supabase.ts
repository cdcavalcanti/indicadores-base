import { config } from '../config.ts';
import { fetchJson } from './http.ts';

export function assertSupabase() {
  if (!config.supabase.url || !config.supabase.serviceRoleKey) {
    throw new Error('Supabase não configurado: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');
  }
}

/** Pagina uma tabela do Supabase (PostgREST) por Range, em ordem estável. */
export async function* supabasePages<T = Record<string, any>>(
  table: string,
  params: string,
  orderCol: string,
  pageSize = 1000,
): AsyncGenerator<T[]> {
  assertSupabase();
  const { url, serviceRoleKey } = config.supabase;
  for (let from = 0; ; from += pageSize) {
    const rows = await fetchJson<T[]>(
      `${url}/rest/v1/${table}?${params}&order=${orderCol}.asc`,
      {
        headers: {
          apikey: serviceRoleKey!,
          Authorization: `Bearer ${serviceRoleKey}`,
          Range: `${from}-${from + pageSize - 1}`,
        },
      },
      { label: `supabase/${table}` },
    );
    if (!Array.isArray(rows)) throw new Error(`supabase/${table}: resposta inesperada ${JSON.stringify(rows).slice(0, 200)}`);
    if (!rows.length) return;
    yield rows;
    if (rows.length < pageSize) return;
  }
}
