export const CONSOLIDADO = 'Consolidado';

export type Filtros = {
  filial: string; // 'Consolidado' ou nome da filial
  from: string; // 'YYYY-MM-DD' (inclusivo)
  to: string; // 'YYYY-MM-DD' (inclusivo)
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Intervalo padrão: últimos 30 dias até hoje. */
export function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return { from: ymd(from), to: ymd(to) };
}

type SP = Record<string, string | string[] | undefined>;
function pick(sp: SP, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Valida uma data vinda da URL: precisa ser 'YYYY-MM-DD' real e num ano sensato.
 * Datas inválidas (ex.: o seletor nativo manda '-116-04-13' enquanto o ano é
 * digitado) retornam undefined p/ cair no padrão, em vez de derrubar a página.
 */
function parseDateParam(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return undefined;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 2000 || year > 2100) return undefined;
  const d = new Date(year, month - 1, day);
  // rejeita datas impossíveis (ex.: 2026-02-31, que o Date "rola" pra março)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return undefined;
  return s;
}

export function parseFiltros(sp: SP): Filtros {
  const def = defaultRange();
  const filial = pick(sp, 'filial') || CONSOLIDADO;
  let from = parseDateParam(pick(sp, 'from')) || def.from;
  let to = parseDateParam(pick(sp, 'to')) || def.to;
  if (from > to) [from, to] = [to, from]; // garante from <= to (comparação lexicográfica funciona p/ 'YYYY-MM-DD')
  return { filial, from, to };
}

/** Nº de dias (inclusivo) do período filtrado — usado na projeção do mês. */
export function diasPeriodo(f: Filtros): number {
  const ms = Date.parse(f.to) - Date.parse(f.from);
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Período imediatamente anterior com a mesma duração (para variação dos KPIs). */
export function periodoAnterior(f: Filtros): Filtros {
  const dias = diasPeriodo(f);
  const ini = parseYmd(f.from);
  const fimAnt = new Date(ini);
  fimAnt.setDate(ini.getDate() - 1);
  const iniAnt = new Date(ini);
  iniAnt.setDate(ini.getDate() - dias);
  return { ...f, from: ymd(iniAnt), to: ymd(fimAnt) };
}

/**
 * Período de comparação dos KPIs. Se a URL trouxer `cfrom`/`cto` válidos, usa esse
 * intervalo escolhido pelo usuário; senão cai no padrão = `periodoAnterior(f)`.
 * Mantém a mesma filial do período principal.
 */
export function parseComparativo(sp: SP, f: Filtros): Filtros {
  const cfrom = parseDateParam(pick(sp, 'cfrom'));
  const cto = parseDateParam(pick(sp, 'cto'));
  if (!cfrom || !cto) return periodoAnterior(f);
  const [from, to] = cfrom <= cto ? [cfrom, cto] : [cto, cfrom];
  return { filial: f.filial, from, to };
}

/** True quando há um comparativo custom na URL (usado p/ estilizar o botão "Padrão"). */
export function temComparativoCustom(sp: SP): boolean {
  return !!parseDateParam(pick(sp, 'cfrom')) && !!parseDateParam(pick(sp, 'cto'));
}

/** Loja nova sem histórico: o comparativo cai p/ uma loja de referência quando não tem dados. */
export const COMPARATIVO_FALLBACK = { de: 'Loja Serra', para: 'Loja Jardim' } as const;

/**
 * Filial a usar como base do comparativo. A loja nova compara consigo mesma
 * quando tem dados no período; quando NÃO tem (`semDados`), cai para a loja de referência.
 * Retorna a filial de fallback, ou null quando deve manter a filial atual.
 */
export function filialComparativa(filialAtual: string, semDados: boolean): string | null {
  return filialAtual === COMPARATIVO_FALLBACK.de && semDados ? COMPARATIVO_FALLBACK.para : null;
}
