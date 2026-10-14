'use client';

import { useEffect, type ReactNode } from 'react';
import { TabelaSimples } from './TabelaSimples';
import { SerieArea, type FormatoSerie } from './charts/SerieArea';
import { fmtBRL, fmtInt, fmtPct, fmtDec, fmtDiaCurto } from '@/lib/format';

const FMT: Record<FormatoSerie, (n: number) => string> = {
  moeda: fmtBRL,
  inteiro: fmtInt,
  percentual: fmtPct,
  decimal: fmtDec,
};

export type DetalheKpi = {
  /** Série diária (ou semanal) do indicador para o gráfico e as estatísticas. */
  serie?: { dia: string; valor: number }[];
  formato?: FormatoSerie;
  /** 'soma' (volumes: R$, contagens) ou 'media' (razões: ticket, CTR, taxa). */
  agregacao?: 'soma' | 'media';
  /** Tabela de quebra (por filial, por campanha...). */
  breakdown?: { titulo: string; head: string[]; rows: (string | number)[][]; alignRightFrom?: number };
  /** Como o indicador é calculado (exibido no rodapé do modal). */
  descricao?: string;
  /**
   * Usa rótulos neutros "Maior valor"/"Menor valor" em vez de "Melhor dia"/"Pior dia".
   * Para métricas sem juízo de valor (ex.: Transferências entre lojas).
   */
  extremosNeutros?: boolean;
  /** Oculta os blocos "Melhor dia"/"Pior dia" (mantém Total e Média). */
  ocultarExtremos?: boolean;
};

export function ModalDetalhe({
  label,
  value,
  badge,
  cor,
  corHex,
  detalhe,
  menorMelhor,
  onClose,
}: {
  label: string;
  value: ReactNode;
  badge: ReactNode;
  cor: string;
  corHex: string;
  detalhe: DetalheKpi;
  /** Métrica em que valor menor é desejável (taxa de devolução, CPC...). */
  menorMelhor: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', h);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const formato = detalhe.formato ?? 'inteiro';
  const agregacao = detalhe.agregacao ?? 'soma';
  const fmt = FMT[formato];

  const serie = (detalhe.serie ?? []).map((p) => ({ dia: p.dia, valor: Number(p.valor) || 0 }));
  const valores = serie.map((p) => p.valor);
  const total = valores.reduce((s, v) => s + v, 0);
  const media = valores.length ? total / valores.length : 0;
  const maior = serie.length ? serie.reduce((a, b) => (b.valor > a.valor ? b : a)) : null;
  const menor = serie.length ? serie.reduce((a, b) => (b.valor < a.valor ? b : a)) : null;
  // Em métricas de custo/taxa, o "melhor dia" é o de MENOR valor
  const melhor = menorMelhor ? menor : maior;
  const pior = menorMelhor ? maior : menor;

  const stats: { rotulo: string; valor: string; sub?: string }[] = [];
  if (serie.length) {
    if (agregacao === 'soma') stats.push({ rotulo: 'Total do período', valor: fmt(total) });
    stats.push({ rotulo: agregacao === 'soma' ? 'Média por dia' : 'Média do período', valor: fmt(media) });
    if (detalhe.ocultarExtremos) {
      // não exibe melhor/pior dia
    } else if (detalhe.extremosNeutros) {
      // Rótulos neutros: mapeiam direto pro maior/menor valor (sem juízo de valor)
      if (maior) stats.push({ rotulo: 'Maior valor', valor: fmt(maior.valor), sub: fmtDiaCurto(maior.dia) });
      if (menor) stats.push({ rotulo: 'Menor valor', valor: fmt(menor.valor), sub: fmtDiaCurto(menor.dia) });
    } else {
      if (melhor) stats.push({ rotulo: 'Melhor dia', valor: fmt(melhor.valor), sub: fmtDiaCurto(melhor.dia) });
      if (pior) stats.push({ rotulo: 'Pior dia', valor: fmt(pior.valor), sub: fmtDiaCurto(pior.dia) });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card w-full max-w-[760px] max-h-[88vh] overflow-y-auto p-6">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: cor, boxShadow: `0 0 8px ${cor}` }} />
              <span className="label-caps">{label}</span>
            </div>
            <div className="flex items-end gap-3 mt-2">
              <span className="num text-[28px] font-semibold leading-none text-[var(--color-text)]">{value}</span>
              {badge}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="shrink-0 w-8 h-8 rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-surface-2)] text-[var(--color-subtle)] hover:text-[var(--color-text)] hover:border-[var(--color-border)] transition-colors flex items-center justify-center"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Estatísticas do período */}
        {stats.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
            {stats.map((s) => (
              <div key={s.rotulo} className="rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-surface-2)] p-3">
                <div className="label-caps text-[9.5px]">{s.rotulo}</div>
                <div className="num text-[15px] text-[var(--color-text)] mt-1">{s.valor}</div>
                {s.sub && <div className="text-[10.5px] text-[var(--color-muted)] mt-0.5">{s.sub}</div>}
              </div>
            ))}
          </div>
        )}

        {/* Evolução no período */}
        {serie.length > 1 && (
          <div className="mt-5">
            <div className="label-caps mb-2">Evolução no período</div>
            <SerieArea data={serie} dataKey="valor" nome={label} cor={corHex} formato={formato} height={240} />
          </div>
        )}

        {/* Quebra (por filial / campanha / ...) */}
        {detalhe.breakdown && detalhe.breakdown.rows.length > 0 && (
          <div className="mt-5">
            <div className="label-caps mb-2">{detalhe.breakdown.titulo}</div>
            <TabelaSimples
              head={detalhe.breakdown.head}
              rows={detalhe.breakdown.rows}
              alignRightFrom={detalhe.breakdown.alignRightFrom ?? 1}
            />
          </div>
        )}

        {/* Como é calculado */}
        {detalhe.descricao && (
          <p className="mt-5 text-[12px] leading-relaxed text-[var(--color-muted)] border-t border-[var(--color-border-soft)] pt-4">
            {detalhe.descricao}
          </p>
        )}
      </div>
    </div>
  );
}
