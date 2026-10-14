const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCompact = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const int = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });

export const fmtBRL = (n: number) => brl.format(n || 0);
export const fmtBRLc = (n: number) => brlCompact.format(n || 0);
export const fmtInt = (n: number) => int.format(n || 0);
export const fmtDec = (n: number) => dec.format(n || 0);
export const fmtPct = (n: number) => pct.format(n || 0);
/** Variação com sinal explícito: 0.124 -> '+12,4%'. */
export const fmtPctDelta = (n: number) => `${n >= 0 ? '+' : ''}${pct.format(n)}`;

/** Variação relativa entre períodos; null quando não há base de comparação. */
export function variacao(atual: number, anterior: number): number | null {
  return anterior > 0 ? atual / anterior - 1 : null;
}

/** '2026-06-01' -> '01/jun' */
export function fmtDiaCurto(iso: string): string {
  const [, m, d] = iso.split('-');
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${d}/${meses[Number(m) - 1]}`;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** 6 -> 'junho' */
export const nomeMes = (m: number) => MESES[m - 1] ?? '';

/** '2026-06-01' -> '01/06/2026' */
export function fmtData(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
