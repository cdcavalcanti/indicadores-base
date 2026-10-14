'use client';

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fmtPct, fmtDiaCurto } from '@/lib/format';
import { AMBAR, AZUL, GRID, PONTA, TICK, TOOLTIP_STYLE, TOOLTIP_LABEL_STYLE, glow } from './tema';

type Ponto = { dia: string; margem_lucro: number; margem_desconto: number };

/** Evolução diária da margem de lucro e da margem de desconto (em %). */
export function MargemSerie({ data }: { data: Ponto[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 6" stroke={GRID} vertical={false} />
        <XAxis
          dataKey="dia"
          tickFormatter={fmtDiaCurto}
          tick={TICK}
          axisLine={{ stroke: GRID }}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          tickFormatter={(v) => fmtPct(Number(v))}
          tick={TICK}
          axisLine={false}
          tickLine={false}
          width={48}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          cursor={{ stroke: GRID, strokeDasharray: '3 3' }}
          labelFormatter={(l) => fmtDiaCurto(String(l))}
          formatter={(v: number, n) => [fmtPct(Number(v)), n === 'margem_lucro' ? 'Margem de lucro' : 'Margem de desconto']}
        />
        <Legend
          verticalAlign="top"
          height={28}
          iconType="plainline"
          formatter={(n) => (
            <span style={{ color: '#8C8C99', fontSize: 11.5 }}>
              {n === 'margem_lucro' ? 'Margem de lucro' : 'Margem de desconto'}
            </span>
          )}
        />
        <Line
          type="monotone"
          dataKey="margem_lucro"
          stroke={AZUL}
          strokeWidth={2.2}
          dot={false}
          isAnimationActive={false}
          style={glow(AZUL)}
          activeDot={{ r: 4, strokeWidth: 0, fill: PONTA }}
        />
        <Line
          type="monotone"
          dataKey="margem_desconto"
          stroke={AMBAR}
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={false}
          isAnimationActive={false}
          activeDot={{ r: 4, strokeWidth: 0, fill: AMBAR }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
