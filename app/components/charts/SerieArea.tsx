'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fmtBRL, fmtBRLc, fmtInt, fmtPct, fmtDec, fmtDiaCurto } from '@/lib/format';
import { AZUL, GRID, TICK, TOOLTIP_STYLE, TOOLTIP_LABEL_STYLE, glow } from './tema';

export type FormatoSerie = 'moeda' | 'inteiro' | 'percentual' | 'decimal';

const FMT_EIXO: Record<FormatoSerie, (v: number) => string> = {
  moeda: fmtBRLc,
  inteiro: fmtInt,
  percentual: fmtPct,
  decimal: fmtDec,
};
const FMT_TOOLTIP: Record<FormatoSerie, (v: number) => string> = {
  moeda: fmtBRL,
  inteiro: fmtInt,
  percentual: fmtPct,
  decimal: fmtDec,
};

/** Série temporal genérica (uma métrica) no estilo do design system. */
export function SerieArea({
  data,
  dataKey,
  nome,
  cor = AZUL,
  moeda = false,
  formato,
  height = 260,
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  nome: string;
  cor?: string;
  /** Atalho legado: equivale a formato="moeda". */
  moeda?: boolean;
  formato?: FormatoSerie;
  height?: number;
}) {
  const fmt: FormatoSerie = formato ?? (moeda ? 'moeda' : 'inteiro');
  // id inclui a cor: a mesma página pode ter dois gráficos com o mesmo dataKey
  const gid = `grad-${dataKey}-${cor.replace('#', '')}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cor} stopOpacity={0.34} />
            <stop offset="100%" stopColor={cor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 6" stroke={GRID} vertical={false} />
        <XAxis
          dataKey="dia"
          tickFormatter={(v) => fmtDiaCurto(String(v))}
          tick={TICK}
          axisLine={{ stroke: GRID }}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          tickFormatter={(v) => FMT_EIXO[fmt](Number(v))}
          tick={TICK}
          axisLine={false}
          tickLine={false}
          width={fmt === 'percentual' ? 52 : 60}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          cursor={{ stroke: GRID, strokeDasharray: '3 3' }}
          labelFormatter={(l) => fmtDiaCurto(String(l))}
          formatter={(v: number) => [FMT_TOOLTIP[fmt](Number(v)), nome]}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={cor}
          strokeWidth={2.2}
          fill={`url(#${gid})`}
          isAnimationActive={false}
          style={glow(cor)}
          activeDot={{ r: 4, strokeWidth: 0, fill: cor }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
