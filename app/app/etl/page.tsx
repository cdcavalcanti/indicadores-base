import { q } from '@/lib/db';
import { Section } from '@/components/Section';

export const dynamic = 'force-dynamic';

type LogRow = {
  id: string;
  source: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  rows: number | null;
  error: string | null;
};

const SOURCES = [
  { key: 'sales', label: 'Vendas (MySQL)' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'meta', label: 'Meta Ads' },
  { key: 'google_ads', label: 'Google Ads' },
];

const STATUS_LABEL: Record<string, string> = {
  ok: 'Operacional',
  running: 'Executando',
  error: 'Falha',
};

function corStatus(status?: string): string {
  if (!status) return 'var(--color-muted)';
  if (status === 'ok') return 'var(--color-pos)';
  if (status === 'running') return 'var(--color-amber)';
  return 'var(--color-neg)';
}

export default async function EtlPage() {
  // Armazenamento em UTC; exibição no fuso de Brasília, formato brasileiro.
  const tsBR = (col: string) =>
    `to_char(${col} AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS') AS ${col}`;
  // (ORDER BY qualificado: o alias started_at vira texto DD/MM, que ordenaria errado)
  const recentes = await q<LogRow>(
    `SELECT id, source, ${tsBR('started_at')}, ${tsBR('finished_at')}, status, rows, error
     FROM etl_sync_log ORDER BY etl_sync_log.started_at DESC LIMIT 50`,
  );
  const ultima = await q<LogRow>(
    `SELECT DISTINCT ON (source) id, source, ${tsBR('started_at')}, ${tsBR('finished_at')}, status, rows, error
     FROM etl_sync_log ORDER BY source, etl_sync_log.started_at DESC`,
  );
  const ultimaPorFonte = new Map(ultima.map((r) => [r.source, r]));

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-[var(--color-border-soft)] bg-[var(--color-base)]/85 backdrop-blur-md px-7 py-4">
        <h1 className="titulo">
          Saúde do ETL
        </h1>
        <p className="text-[11.5px] text-[var(--color-subtle)] mt-1.5">
          monitoramento das sincronizações de vendas e marketing
        </p>
      </header>

      <div className="p-7 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {SOURCES.map((s) => {
            const u = ultimaPorFonte.get(s.key);
            const cor = corStatus(u?.status);
            return (
              <div key={s.key} className="card card-hover p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-[var(--color-text)]">{s.label}</span>
                  <span className="relative flex w-2.5 h-2.5">
                    {u?.status === 'running' && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: cor }} />
                    )}
                    <span className="relative inline-flex rounded-full w-2.5 h-2.5" style={{ background: cor, boxShadow: `0 0 8px ${cor}` }} />
                  </span>
                </div>
                <div className="mt-3">
                  <span
                    className="text-[11px] font-medium px-2 py-0.5 rounded-md"
                    style={{ color: cor, background: `color-mix(in srgb, ${cor} 12%, transparent)` }}
                  >
                    {u ? (STATUS_LABEL[u.status] ?? u.status) : 'sem execuções'}
                  </span>
                  {u && <span className="num text-[11.5px] text-[var(--color-muted)] ml-2">{u.rows ?? 0} linhas</span>}
                </div>
                <div className="num text-[11px] text-[var(--color-muted)] mt-2">
                  {u?.finished_at ?? u?.started_at ?? '—'}
                </div>
              </div>
            );
          })}
        </div>

        <Section title="Execuções recentes" sub="últimas 50 sincronizações registradas">
          <div className="max-h-[520px] overflow-y-auto">
            <table className="w-full text-[12.5px]">
              <thead className="sticky top-0 z-[1]">
                <tr className="bg-[var(--color-surface-2)] text-[var(--color-muted)] text-[10.5px] uppercase tracking-[0.12em]">
                  <th className="py-2.5 pl-3 px-2 text-left font-semibold rounded-l-lg">Fonte</th>
                  <th className="py-2.5 px-2 text-left font-semibold">Início</th>
                  <th className="py-2.5 px-2 text-left font-semibold">Fim</th>
                  <th className="py-2.5 px-2 text-left font-semibold">Status</th>
                  <th className="py-2.5 pr-3 px-2 text-right font-semibold rounded-r-lg">Linhas</th>
                </tr>
              </thead>
              <tbody>
                {recentes.map((r) => {
                  const cor = corStatus(r.status);
                  return (
                    <tr key={r.id} className="border-b border-[var(--color-border-soft)] last:border-0 hover:bg-white/[0.025] transition-colors">
                      <td className="py-2.5 pl-3 px-2 text-[var(--color-text)]">{r.source}</td>
                      <td className="py-2.5 px-2 text-[var(--color-muted)] num">{r.started_at}</td>
                      <td className="py-2.5 px-2 text-[var(--color-muted)] num">{r.finished_at ?? '—'}</td>
                      <td className="py-2.5 px-2">
                        <span
                          className="text-[11px] font-medium px-2 py-0.5 rounded-md"
                          style={{ color: cor, background: `color-mix(in srgb, ${cor} 12%, transparent)` }}
                        >
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 px-2 text-right num text-[var(--color-text)] font-medium">{r.rows ?? '—'}</td>
                    </tr>
                  );
                })}
                {!recentes.length && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-[var(--color-muted)]">
                      Nenhuma execução registrada ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </>
  );
}
