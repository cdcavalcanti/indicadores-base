'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtPct } from '@/lib/format';
import { AZUL, AZUL_DEEP, GRID, TICK, TICK_CAT, TOOLTIP_STYLE, TOOLTIP_LABEL_STYLE } from './tema';

type Row = { filial: string; margem_lucro: number };

/** Margem de lucro por filial (barras horizontais, ordenadas pela página). */
export function BarMargemFiliais({ data }: { data: Row[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <defs>
          <linearGradient id="gradBarMargem" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={AZUL_DEEP} stopOpacity={0.9} />
            <stop offset="100%" stopColor={AZUL} stopOpacity={1} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 6" stroke={GRID} horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={(v) => fmtPct(Number(v))}
          tick={TICK}
          axisLine={false}
          tickLine={false}
        />
        <YAxis type="category" dataKey="filial" tick={TICK_CAT} axisLine={false} tickLine={false} width={110} />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.03)' }}
          contentStyle={TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          formatter={(v: number) => [fmtPct(Number(v)), 'Margem de lucro']}
        />
        <Bar
          dataKey="margem_lucro"
          fill="url(#gradBarMargem)"
          isAnimationActive={false}
          radius={[0, 7, 7, 0]}
          barSize={20}
          background={{ fill: 'rgba(255,255,255,0.025)', radius: 7 }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
