'use client';

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtBRL, fmtBRLc, fmtPct } from '@/lib/format';
import { AZUL, AZUL_DEEP, GRID, TICK, TICK_CAT, TOOLTIP_STYLE, TOOLTIP_LABEL_STYLE } from './tema';

type Row = { filial: string; faturamento_liquido: number; pct?: number };

export function BarFiliais({ data }: { data: Row[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 4 }}>
        <defs>
          <linearGradient id="gradBarFilial" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={AZUL_DEEP} stopOpacity={0.9} />
            <stop offset="100%" stopColor={AZUL} stopOpacity={1} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 6" stroke={GRID} horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={(v) => fmtBRLc(Number(v))}
          tick={TICK}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="filial"
          tick={TICK_CAT}
          axisLine={false}
          tickLine={false}
          width={110}
        />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.03)' }}
          contentStyle={TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          formatter={(v: number, _n, item) => {
            const pct = (item?.payload as Row | undefined)?.pct;
            const sufixo = pct != null ? ` · ${fmtPct(pct)}` : '';
            return [`${fmtBRL(Number(v))}${sufixo}`, 'Líquido'];
          }}
        />
        <Bar
          dataKey="faturamento_liquido"
          fill="url(#gradBarFilial)"
          isAnimationActive={false}
          radius={[0, 7, 7, 0]}
          barSize={20}
          background={{ fill: 'rgba(255,255,255,0.025)', radius: 7 }}
        >
          <LabelList
            dataKey="pct"
            position="right"
            formatter={(v: number) => (v != null ? fmtPct(Number(v)) : '')}
            style={{ fill: 'var(--color-muted)', fontSize: 11 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
