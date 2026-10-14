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
import { fmtBRL, fmtBRLc, fmtDiaCurto } from '@/lib/format';
import { AZUL, GRID, PONTA, TICK, TOOLTIP_STYLE, TOOLTIP_LABEL_STYLE, glow } from './tema';

type Ponto = {
  dia: string;
  faturamento_liquido: number;
  faturamento_bruto: number;
};

function TooltipConteudo(props: {
  active?: boolean;
  label?: string | number;
  payload?: { payload: Ponto }[];
}) {
  const { active, label, payload } = props;
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={TOOLTIP_LABEL_STYLE}>{fmtDiaCurto(String(label))}</div>
      <div>
        Líquido: <b>{fmtBRL(Number(p.faturamento_liquido))}</b>
      </div>
    </div>
  );
}

export function AreaFaturamento({ data }: { data: Ponto[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="gradLiq" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={AZUL} stopOpacity={0.38} />
            <stop offset="100%" stopColor={AZUL} stopOpacity={0} />
          </linearGradient>
        </defs>
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
          tickFormatter={(v) => fmtBRLc(Number(v))}
          tick={TICK}
          axisLine={false}
          tickLine={false}
          width={64}
        />
        <Tooltip
          content={<TooltipConteudo />}
          cursor={{ stroke: GRID, strokeDasharray: '3 3' }}
        />
        <Area
          type="monotone"
          dataKey="faturamento_liquido"
          name="Líquido"
          stroke={AZUL}
          strokeWidth={2.2}
          fill="url(#gradLiq)"
          isAnimationActive={false}
          style={glow(AZUL)}
          activeDot={{ r: 4, strokeWidth: 0, fill: PONTA }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
