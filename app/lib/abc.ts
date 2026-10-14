import type { VendedorRow } from './queries';

export type ClasseABC = 'A' | 'B' | 'C';

export type LinhaABC = {
  nome: string;
  faturamento_liquido: number;
  qtd_vendas: number;
  ticket_medio: number;
  valor_devolucoes: number;
  /** Fração do total líquido que este vendedor representa. */
  participacao: number;
  /** Fração acumulada do total líquido até este vendedor (inclusive). */
  acumulado: number;
  /** Classe pela curva de faturamento líquido. */
  classe: ClasseABC;
};

export type ResumoABC = {
  classe: ClasseABC;
  vendedores: number;
  faturamento: number;
  partFaturamento: number;
};

export type CurvaABCResult = { linhas: LinhaABC[]; resumo: ResumoABC[] };

// Faixas clássicas da curva ABC: A até 80%, B até 95%, C o restante.
const FAIXA_A = 0.8;
const FAIXA_B = 0.95;

/**
 * Classifica itens já ordenados (desc) pela fração acumulada ANTERIOR ao item —
 * assim o item que cruza os 80% entra ainda na classe A (é parte do grupo que
 * soma 80%). Total <= 0 → tudo C (sem base para ranquear).
 */
function classificar(valoresDesc: number[], total: number): ClasseABC[] {
  let cum = 0;
  return valoresDesc.map((v) => {
    const antes = total > 0 ? cum / total : 1;
    cum += v;
    return antes < FAIXA_A ? 'A' : antes < FAIXA_B ? 'B' : 'C';
  });
}

/** Curva ABC de vendedores: ranking por faturamento líquido. */
export function curvaABCVendedores(vendedores: VendedorRow[]): CurvaABCResult {
  const totalLiq = vendedores.reduce((s, v) => s + v.faturamento_liquido, 0);

  // Ranking primário: faturamento líquido (desc).
  const porValor = [...vendedores].sort((a, b) => b.faturamento_liquido - a.faturamento_liquido);
  const classesValor = classificar(
    porValor.map((v) => v.faturamento_liquido),
    totalLiq,
  );

  let cum = 0;
  const linhas: LinhaABC[] = porValor.map((v, i) => {
    cum += v.faturamento_liquido;
    return {
      nome: v.nome_vendedor,
      faturamento_liquido: v.faturamento_liquido,
      qtd_vendas: v.qtd_vendas,
      ticket_medio: v.ticket_medio,
      valor_devolucoes: v.valor_devolucoes,
      participacao: totalLiq > 0 ? v.faturamento_liquido / totalLiq : 0,
      acumulado: totalLiq > 0 ? cum / totalLiq : 0,
      classe: classesValor[i],
    };
  });

  const resumo: ResumoABC[] = (['A', 'B', 'C'] as ClasseABC[]).map((c) => {
    const grupo = linhas.filter((l) => l.classe === c);
    const faturamento = grupo.reduce((s, l) => s + l.faturamento_liquido, 0);
    return {
      classe: c,
      vendedores: grupo.length,
      faturamento,
      partFaturamento: totalLiq > 0 ? faturamento / totalLiq : 0,
    };
  });

  return { linhas, resumo };
}
