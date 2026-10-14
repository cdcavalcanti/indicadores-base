import type { ReactNode } from 'react';
import { getFiliais } from '@/lib/queries';
import { Filtros } from './Filtros';
import { fmtData } from '@/lib/format';
import { IconStore, IconCalendar } from './Icons';
import type { Filtros as F } from '@/lib/filters';

export async function Topbar({
  titulo,
  filtros,
  comparativo,
  comparativoCustom = false,
  comparativoFilial = null,
  comFilial = true,
  icone,
}: {
  titulo: string;
  filtros: F;
  /** Período de comparação vigente (custom da URL ou padrão = período anterior). */
  comparativo: F;
  /** True quando o comparativo veio de cfrom/cto na URL. */
  comparativoCustom?: boolean;
  /** Filial de fallback do comparativo quando a loja atual não tem dados no período comparado. */
  comparativoFilial?: string | null;
  /** false nas páginas de marketing: as contas de anúncio são da empresa toda, não por filial. */
  comFilial?: boolean;
  /** Logo da plataforma exibida num badge ao lado do título (abas de marketing). */
  icone?: ReactNode;
}) {
  const filiais = comFilial ? await getFiliais() : [];
  return (
    <header className="sticky top-0 z-10 border-b border-[var(--color-border-soft)] bg-[var(--color-base)]/85 backdrop-blur-md px-7 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          {icone && (
            <div className="w-11 h-11 shrink-0 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border-soft)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] flex items-center justify-center">
              {icone}
            </div>
          )}
          <div>
            <h1 className="titulo">
              {titulo}
            </h1>
            <div className="flex items-center gap-3 mt-1.5 text-[11.5px] text-[var(--color-subtle)]">
              {comFilial && (
                <span className="inline-flex items-center gap-1.5">
                  <IconStore className="w-[13px] h-[13px] text-[var(--color-muted)]" />
                  {filtros.filial}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <IconCalendar className="w-[13px] h-[13px] text-[var(--color-muted)]" />
                {fmtData(filtros.from)} – {fmtData(filtros.to)}
              </span>
              <span
                className="inline-flex items-center gap-1.5 text-[var(--color-muted)]"
                title={
                  comparativoFilial
                    ? `Comparando com a loja ${comparativoFilial} no mesmo período (a loja atual não tem dados no período comparado).`
                    : 'Período de comparação dos indicadores (variação ▲/▼). Padrão: janela imediatamente anterior de mesma duração.'
                }
              >
                <span className="opacity-60">vs</span>
                {comparativoFilial && <span className="text-[var(--color-text)]">{comparativoFilial} ·</span>}
                {fmtData(comparativo.from)} – {fmtData(comparativo.to)}
              </span>
            </div>
          </div>
        </div>
        <Filtros
          filiais={comFilial ? filiais.map((f) => f.nome) : null}
          filial={filtros.filial}
          from={filtros.from}
          to={filtros.to}
          cfrom={comparativo.from}
          cto={comparativo.to}
          comparativoCustom={comparativoCustom}
        />
      </div>
    </header>
  );
}
