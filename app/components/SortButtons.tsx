'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

export type SortOption = { key: string; label: string };

/**
 * Pílulas de ordenação que dirigem a query pela URL (mesmo padrão do Filtros):
 * clica numa métrica → ordena desc por ela; clica na já ativa → inverte p/ asc.
 * A direção mora em `${param}Dir` (ausente = desc). Preserva os demais params.
 */
export function SortButtons({
  param,
  options,
  active,
  dir,
}: {
  param: string;
  options: SortOption[];
  active: string;
  dir: 'asc' | 'desc';
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const go = useCallback(
    (key: string) => {
      const p = new URLSearchParams(sp.toString());
      const nextDir = key === active && dir === 'desc' ? 'asc' : 'desc';
      p.set(param, key);
      if (nextDir === 'asc') p.set(`${param}Dir`, 'asc');
      else p.delete(`${param}Dir`);
      router.push(`${pathname}?${p.toString()}`);
    },
    [router, pathname, sp, param, active, dir],
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((o) => {
        const ativo = o.key === active;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => go(o.key)}
            className={[
              'num h-7 px-2.5 rounded-lg text-[11.5px] border transition-colors',
              ativo
                ? 'text-[var(--color-action)] border-[var(--color-action)]/40 bg-[var(--color-action)]/10'
                : 'text-[var(--color-muted)] border-[var(--color-border-soft)] bg-[var(--color-surface-2)] hover:border-[var(--color-border)] hover:text-[var(--color-subtle)]',
            ].join(' ')}
          >
            {o.label}
            {ativo && <span className="ml-1">{dir === 'desc' ? '▼' : '▲'}</span>}
          </button>
        );
      })}
    </div>
  );
}
