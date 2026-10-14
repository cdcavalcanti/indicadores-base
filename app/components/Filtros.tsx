'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { CONSOLIDADO } from '@/lib/filters';
import { SeletorPeriodo } from './SeletorPeriodo';

export function Filtros({
  filiais,
  filial,
  from,
  to,
  cfrom,
  cto,
  comparativoCustom = false,
}: {
  /** null oculta o seletor de filial (páginas de marketing — conta única da empresa). */
  filiais: string[] | null;
  filial: string;
  from: string;
  to: string;
  /** Intervalo de comparação vigente (custom da URL ou padrão = período anterior). */
  cfrom: string;
  cto: string;
  /** True quando o comparativo veio de cfrom/cto na URL (habilita o botão "Padrão"). */
  comparativoCustom?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      const p = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') p.delete(k);
        else p.set(k, v);
      }
      router.push(`${pathname}?${p.toString()}`);
    },
    [router, pathname, sp],
  );

  const inputCls =
    'h-9 bg-[var(--color-surface-2)] border border-[var(--color-border-soft)] rounded-lg px-3 text-[13px] text-[var(--color-text)] outline-none transition-colors hover:border-[var(--color-border)] focus:border-[var(--color-action)] focus:ring-1 focus:ring-[var(--color-action)]/40';

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {filiais && (
        <select
          value={filial}
          onChange={(e) => update({ filial: e.target.value === CONSOLIDADO ? null : e.target.value })}
          className={inputCls}
        >
          <option value={CONSOLIDADO}>Consolidado</option>
          {filiais.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      )}

      <SeletorPeriodo from={from} to={to} onApply={(f, t) => update({ from: f, to: t })} />

      {/* Comparativo: período contra o qual os indicadores calculam a variação (▲/▼). */}
      <div className="flex items-center gap-2 pl-2.5 ml-0.5 border-l border-[var(--color-border-soft)]">
        <span className="text-[11.5px] text-[var(--color-muted)]" title="Período usado para calcular a variação dos indicadores">
          Comparativo
        </span>
        <SeletorPeriodo from={cfrom} to={cto} onApply={(f, t) => update({ cfrom: f, cto: t })} />
        <button
          type="button"
          onClick={() => update({ cfrom: null, cto: null })}
          disabled={!comparativoCustom}
          title="Voltar o comparativo ao período imediatamente anterior de mesma duração"
          className={`h-9 rounded-lg px-3 text-[12.5px] border transition-colors ${
            comparativoCustom
              ? 'border-[var(--color-border-soft)] bg-[var(--color-surface-2)] text-[var(--color-text)] hover:border-[var(--color-border)]'
              : 'border-transparent bg-[var(--color-surface-2)]/40 text-[var(--color-muted)] cursor-default'
          }`}
        >
          Padrão
        </button>
      </div>
    </div>
  );
}
