'use client';

import { useState, type ReactNode } from 'react';
import { Sparkline } from './Sparkline';
import { ModalDetalhe, type DetalheKpi } from './ModalDetalhe';
import { fmtPct, fmtPctDelta } from '@/lib/format';

const ACCENTS: Record<string, string> = {
  blue: 'var(--color-blue)',
  green: 'var(--color-pos)',
  purple: 'var(--color-purple)',
  amber: 'var(--color-amber)',
  pink: 'var(--color-pink)',
  red: 'var(--color-neg)',
};

// Cor hex p/ o gráfico do modal (Recharts não resolve var() em gradientes)
const ACCENTS_HEX: Record<string, string> = {
  blue: '#D5D5DD',
  green: '#3CBF86',
  purple: '#9A9AA6',
  amber: '#C6A15A',
  pink: '#C8C8D0',
  red: '#E15B58',
};

export type { DetalheKpi };

export function KpiCard({
  label,
  value,
  sub,
  accent = 'blue',
  valorAccent = false,
  delta,
  deltaBom = 'sobe',
  spark,
  progresso,
  detalhe,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: keyof typeof ACCENTS;
  /** Tinge o valor principal com a cor do accent (ex.: verde acima da meta, vermelho abaixo). */
  valorAccent?: boolean;
  /** Variação relativa vs período anterior (ex.: 0.124 = +12,4%). null/undefined oculta o badge. */
  delta?: number | null;
  /** Sentido desejável da métrica: 'desce' p/ custo (CPC), 'neutro' p/ investimento. */
  deltaBom?: 'sobe' | 'desce' | 'neutro';
  /** Série do período para a sparkline. */
  spark?: number[];
  /** Razão atingida (0..1+, ex.: 0.87 = 87%). Quando presente, mostra uma barra de progresso na base do card, na cor do accent. */
  progresso?: number;
  /** Quando presente, o card vira clicável e abre o modal de detalhamento. */
  detalhe?: DetalheKpi;
}) {
  const [aberto, setAberto] = useState(false);
  const cor = ACCENTS[accent] ?? ACCENTS.blue;
  const corHex = ACCENTS_HEX[accent] ?? ACCENTS_HEX.blue;
  const clicavel = detalhe != null;

  const badge = montaBadge(delta, deltaBom);

  return (
    <>
      <div
        className={`card card-hover p-4 relative overflow-hidden group ${clicavel ? 'cursor-pointer' : ''}`}
        role={clicavel ? 'button' : undefined}
        tabIndex={clicavel ? 0 : undefined}
        title={clicavel ? 'Clique para detalhar' : undefined}
        onClick={clicavel ? () => setAberto(true) : undefined}
        onKeyDown={clicavel ? (e) => (e.key === 'Enter' || e.key === ' ') && setAberto(true) : undefined}
      >
        {/* Sparkline como camada de fundo: não disputa espaço com o valor */}
        {spark && spark.length > 1 && (
          <div className="absolute right-3 bottom-2.5 opacity-35 pointer-events-none">
            <Sparkline data={spark} cor={cor} w={92} h={32} />
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <span className="label-caps leading-snug">{label}</span>
          <span className="flex items-center gap-1.5 shrink-0">
            {clicavel && (
              <svg
                viewBox="0 0 24 24"
                className="w-[12px] h-[12px] text-[var(--color-muted)] opacity-0 group-hover:opacity-100 transition-opacity"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
            )}
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: cor, boxShadow: `0 0 8px ${cor}` }} />
          </span>
        </div>

        <div
          className="relative num mt-2.5 text-[var(--color-text)] font-semibold leading-none whitespace-nowrap text-[clamp(15px,1.2vw,21px)]"
          style={valorAccent ? { color: cor } : undefined}
        >
          {value}
        </div>

        {(badge || sub != null) && (
          <div className="relative flex items-center gap-2 mt-2.5 min-h-[18px]">
            {badge}
            {sub != null && <span className="text-[11.5px] text-[var(--color-muted)] truncate">{sub}</span>}
          </div>
        )}

        {progresso != null && Number.isFinite(progresso) && (
          <div className="relative mt-3" title={`${fmtPct(progresso)} da meta`}>
            <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out"
                style={{
                  width: `${Math.min(100, Math.max(3, progresso * 100))}%`,
                  background: cor,
                  boxShadow: `0 0 8px ${cor}66`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {clicavel && aberto && (
        <ModalDetalhe
          label={label}
          value={value}
          badge={badge}
          cor={cor}
          corHex={corHex}
          detalhe={detalhe}
          menorMelhor={deltaBom === 'desce'}
          onClose={() => setAberto(false)}
        />
      )}
    </>
  );
}

function montaBadge(delta: number | null | undefined, deltaBom: 'sobe' | 'desce' | 'neutro'): ReactNode {
  if (delta == null || !Number.isFinite(delta)) return null;
  const subiu = delta >= 0;
  const corBadge =
    deltaBom === 'neutro'
      ? 'var(--color-subtle)'
      : (subiu && deltaBom === 'sobe') || (!subiu && deltaBom === 'desce')
        ? 'var(--color-pos)'
        : 'var(--color-neg)';
  return (
    <span
      title="vs período anterior"
      className="num inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-[2px] rounded-md"
      style={{ color: corBadge, background: `color-mix(in srgb, ${corBadge} 12%, transparent)` }}
    >
      <span className="text-[8px] leading-none">{subiu ? '▲' : '▼'}</span>
      {fmtPctDelta(delta)}
    </span>
  );
}
