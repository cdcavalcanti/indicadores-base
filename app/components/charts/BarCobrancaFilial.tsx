'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtBRL, fmtBRLc } from '@/lib/format';
import { AMBAR, VERDE, VERMELHO, GRID, TICK, TICK_CAT, TOOLTIP_STYLE, TOOLTIP_LABEL_STYLE } from './tema';

type Row = {
  filial: string;
  valor_aberto_vence3d: number;
  valor_aberto_vencehoje: number;
  valor_aberto_vencido: number;
};

/**
 * Carteira EM ABERTO por filial, empilhada em 3 faixas pelo estágio da régua (snapshot):
 * "Vence em 3 dias" (verde) × "Vence hoje" (âmbar) × "Vencido" (vermelho). Títulos já pagos
 * não entram — somam apenas os que seguem em aberto.
 */
export function BarCobrancaFilial({ data }: { data: Row[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 46 + 48)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 6" stroke={GRID} horizontal={false} />
        <XAxis type="number" tickFormatter={(v) => fmtBRLc(Number(v))} tick={TICK} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="filial" tick={TICK_CAT} axisLine={false} tickLine={false} width={110} />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.03)' }}
          contentStyle={TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          formatter={(v: number, n: string) => [fmtBRL(Number(v)), n]}
        />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} iconType="circle" iconSize={8} />
        <Bar dataKey="valor_aberto_vence3d" stackId="a" name="Vence em 3 dias" fill={VERDE} isAnimationActive={false} barSize={20} />
        <Bar dataKey="valor_aberto_vencehoje" stackId="a" name="Vence hoje" fill={AMBAR} isAnimationActive={false} barSize={20} />
        <Bar dataKey="valor_aberto_vencido" stackId="a" name="Vencido" fill={VERMELHO} isAnimationActive={false} barSize={20} radius={[0, 7, 7, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
