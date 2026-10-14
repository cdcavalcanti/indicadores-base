/** Tema compartilhado dos gráficos Recharts (espelha o design system do globals.css). */

export const AZUL = '#D5D5DD';
export const AZUL_DEEP = '#8C8C99';
export const AMBAR = '#C6A15A';
export const VERDE = '#3CBF86';
export const VERMELHO = '#E15B58';
export const PONTA = '#6D4CFF';
export const GRID = '#2A2A34';

export const TICK = { fill: '#8C8C99', fontSize: 11 } as const;
export const TICK_CAT = { fill: '#B4B4BE', fontSize: 12 } as const;

export const TOOLTIP_STYLE = {
  background: '#15151B',
  border: '1px solid #2A2A34',
  borderRadius: 12,
  boxShadow: '0 16px 40px rgba(0, 0, 0, 0.55)',
  color: '#D5D5DD',
  fontSize: 12,
  padding: '10px 12px',
} as const;

export const TOOLTIP_LABEL_STYLE = { color: '#8C8C99', marginBottom: 4 } as const;

/** Brilho sutil na linha do gráfico (aplicado via style do <Area>). */
export const glow = (cor: string) => ({ filter: `drop-shadow(0 0 6px ${cor}59)` });
