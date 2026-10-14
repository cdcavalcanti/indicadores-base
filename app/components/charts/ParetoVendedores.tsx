'use client';

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fmtBRL, fmtBRLc } from '@/lib/format';
import { GRID, TICK, TOOLTIP_STYLE } from './tema';

export type PontoPareto = {
  nome: string;
  liquido: number;
  /** % acumulado já em escala 0–100. */
  acumulado: number;
  classe: 'A' | 'B' | 'C';
};

// A = verde, B = âmbar, C = cinza (cauda) — só tiers, C não é "ruim".
const COR: Record<string, string> = { A: '#3CBF86', B: '#C6A15A', C: '#8C8C99' };

/** Tooltip próprio: nome legível + badge de classe + valores em alto contraste. */
function TooltipPareto({ active, payload }: { active?: boolean; payload?: { payload: PontoPareto }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const cor = COR[p.classe];
  return (
    <div style={{ ...TOOLTIP_STYLE, maxWidth: 260 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: cor, flexShrink: 0 }} />
        <span style={{ color: '#D5D5DD', fontWeight: 600, lineHeight: 1.25 }}>{p.nome}</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: cor, border: `1px solid ${cor}66`, borderRadius: 5, padding: '1px 6px', whiteSpace: 'nowrap' }}>
          Classe {p.classe}
        </span>
      </div>
      <Linha rotulo="Líquido" valor={fmtBRL(p.liquido)} />
      <Linha rotulo="% acumulado" valor={`${p.acumulado.toFixed(1)}%`} />
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, marginTop: 2 }}>
      <span style={{ color: '#8C8C99' }}>{rotulo}</span>
      <span style={{ color: '#D5D5DD', fontVariantNumeric: 'tabular-nums' }}>{valor}</span>
    </div>
  );
}

export function ParetoVendedores({ data }: { data: PontoPareto[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 6" stroke={GRID} vertical={false} />
        {/* Muitos vendedores → rótulos individuais poluem; o nome aparece no tooltip. */}
        <XAxis dataKey="nome" tick={false} axisLine={false} tickLine={false} height={6} />
        <YAxis
          yAxisId="esq"
          tickFormatter={(v) => fmtBRLc(Number(v))}
          tick={TICK}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <YAxis
          yAxisId="dir"
          orientation="right"
          domain={[0, 100]}
          ticks={[0, 25, 50, 80, 95, 100]}
          tickFormatter={(v) => `${v}%`}
          tick={TICK}
          axisLine={false}
          tickLine={false}
          width={42}
        />
        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<TooltipPareto />} />
        {/* Faixas A/B/C */}
        <ReferenceLine yAxisId="dir" y={80} stroke={COR.A} strokeDasharray="4 4" strokeOpacity={0.6} />
        <ReferenceLine yAxisId="dir" y={95} stroke={COR.B} strokeDasharray="4 4" strokeOpacity={0.6} />
        <Bar yAxisId="esq" name="Líquido" dataKey="liquido" radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={COR[d.classe]} />
          ))}
        </Bar>
        <Line
          yAxisId="dir"
          name="% acumulado"
          type="monotone"
          dataKey="acumulado"
          stroke="#D5D5DD"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
