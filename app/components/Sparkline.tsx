/**
 * Sparkline em SVG puro (renderiza no servidor, sem Recharts).
 * Usada dentro dos cards de KPI para mostrar a tendência do período.
 */
export function Sparkline({
  data,
  cor = 'var(--color-blue)',
  w = 76,
  h = 28,
}: {
  data: number[];
  cor?: string;
  w?: number;
  h?: number;
}) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * w,
    h - 2.5 - ((v - min) / range) * (h - 6),
  ]);
  const linha = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${linha} L${w},${h} L0,${h} Z`;
  const [fimX, fimY] = pts[pts.length - 1];

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0">
      <path d={area} fill={cor} fillOpacity={0.1} />
      <path d={linha} fill="none" stroke={cor} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={fimX} cy={fimY} r={2.2} fill={cor} />
    </svg>
  );
}
