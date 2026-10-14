import { q } from './db';
import { CONSOLIDADO, type Filtros } from './filters';

export type Kpis = {
  qtd_vendas: number;          // bruto: notas Venda='S' no período
  qtd_devolucoes: number;      // bruto: notas Devolucao='S'
  qtd_vendas_liquida: number;  // qtd_vendas − qtd_devolucoes (espelha o "Qtd de Vendas" do ERP)
  faturamento_bruto: number;
  valor_devolucoes: number;
  faturamento_liquido: number;  // JÁ LÍQUIDO de transferência entre lojas (venda ao cliente final)
  faturamento_previsto: number;
  valor_transferencias: number; // transferência entre lojas (nome_vendedor 'TRANSFER'), destacada do total
  qtd_transferencias: number;   // qtd de notas de transferência entre lojas (t_qtd), destacada do total
  ticket_medio: number;
  taxa_devolucao: number;
};

/**
 * Deriva ticket e taxa a partir das contagens BRUTAS gravadas na fact (qtd_vendas conta as notas
 * Venda='S'; qtd_devolucoes conta as Devolucao='S', separadas).
 *
 * O ERP mostra o "Qtd de Vendas" líquido de devoluções e calcula o ticket sobre essa
 * base. Por isso `qtd_vendas_liquida` =
 * qtd_vendas − qtd_devolucoes é a quantidade que espelha o ERP; o card e o ticket usam ela.
 * As colunas brutas ficam preservadas (taxa_devolucao ainda precisa de vendas+dev). Ver
 * memória [[pendencia-qtd-vendas-tela]].
 */
function derivar(r: Omit<Kpis, 'ticket_medio' | 'taxa_devolucao' | 'qtd_vendas_liquida'>): Kpis {
  const qtd_vendas_liquida = r.qtd_vendas - r.qtd_devolucoes;
  const ticket_medio = qtd_vendas_liquida > 0 ? r.faturamento_liquido / qtd_vendas_liquida : 0;
  const taxa_devolucao =
    r.qtd_vendas + r.qtd_devolucoes > 0 ? r.qtd_devolucoes / (r.qtd_vendas + r.qtd_devolucoes) : 0;
  return { ...r, qtd_vendas_liquida, ticket_medio, taxa_devolucao };
}

/** Cláusula de filial: vazia para Consolidado. Retorna [sqlExtra, params].
 *  `col` permite qualificar a coluna (ex.: 'd.filial') quando há JOIN com ambiguidade. */
function filialClause(f: Filtros, startIdx: number, col = 'filial'): [string, unknown[]] {
  if (f.filial === CONSOLIDADO) return ['', []];
  return [` AND ${col} = $${startIdx}`, [f.filial]];
}

/**
 * LEFT JOIN que isola a TRANSFERÊNCIA entre lojas por (filial, dia). Identificável só aqui
 * (nome_vendedor 'TRANSFERENCIA'); em fact_vendas_dia ela vem somada dentro do total. Não usa
 * parâmetros → não interfere na numeração de $N. `alias` é a tabela base à qual o join se liga.
 *
 * DECISÃO (08/07/2026): a transferência entre lojas NÃO é venda ao cliente final e foi
 * REMOVIDA do "Valor vendido" e dos demais KPIs de venda (a pedido do Gabriel). Os KPIs
 * subtraem t_liq/t_bruto/t_qtd deste join e destacam a transferência num card próprio.
 * (Isso reverte a decisão de 29/06 de INCLUIR a transferência p/ casar com o ERP; agora o
 * "Valor vendido" reflete venda ao cliente, então NÃO bate mais com a coluna "Venda R$" do ERP,
 * que inclui a transferência com NF.) getProjecaoMes já descontava a transferência e segue igual.
 */
function transferJoin(alias: string): string {
  return `
  LEFT JOIN (
    SELECT filial, dia,
           SUM(faturamento_bruto)   AS t_bruto,
           SUM(faturamento_liquido) AS t_liq,
           SUM(valor_devolucoes)    AS t_dev,
           SUM(qtd_vendas)          AS t_qtd
    FROM fact_vendas_vendedor_dia
    WHERE nome_vendedor ILIKE '%TRANSFER%'
    GROUP BY filial, dia
  ) t ON t.filial = ${alias}.filial AND t.dia = ${alias}.dia`;
}

export async function getFiliais(): Promise<{ nome: string; ordem: number }[]> {
  return q(`SELECT nome, ordem FROM dim_filial ORDER BY ordem`);
}

export async function getKpis(f: Filtros): Promise<Kpis> {
  const [fc, fp] = filialClause(f, 3, 'd.filial');
  // Desconta a transferência entre lojas (t.*) do total: o "Valor vendido" passa a ser venda
  // ao cliente final. valor_transferencias é destacado (t_liq) para o card próprio.
  const rows = await q<Omit<Kpis, 'ticket_medio' | 'taxa_devolucao'>>(
    `SELECT
       COALESCE(SUM(d.qtd_vendas - COALESCE(t.t_qtd,0)),0)::int         AS qtd_vendas,
       COALESCE(SUM(d.qtd_devolucoes),0)::int                           AS qtd_devolucoes,
       COALESCE(SUM(d.faturamento_bruto - COALESCE(t.t_bruto,0)),0)     AS faturamento_bruto,
       COALESCE(SUM(d.valor_devolucoes),0)                             AS valor_devolucoes,
       COALESCE(SUM(d.faturamento_liquido - COALESCE(t.t_liq,0)),0)     AS faturamento_liquido,
       COALESCE(SUM(d.faturamento_previsto),0)                         AS faturamento_previsto,
       COALESCE(SUM(COALESCE(t.t_liq,0)),0)                            AS valor_transferencias,
       COALESCE(SUM(COALESCE(t.t_qtd,0)),0)::int                       AS qtd_transferencias
     FROM fact_vendas_dia d${transferJoin('d')}
     WHERE d.dia >= $1 AND d.dia <= $2${fc}`,
    [f.from, f.to, ...fp],
  );
  return derivar(rows[0]);
}

export type PontoDia = {
  dia: string;
  faturamento_liquido: number;
  faturamento_bruto: number;
  qtd_vendas: number;
  qtd_devolucoes: number;
  valor_devolucoes: number;
  valor_transferencias: number;
};

export async function getSerieDia(f: Filtros): Promise<PontoDia[]> {
  const [fc, fp] = filialClause(f, 3, 'd.filial');
  // Mesmo desconto de transferência do getKpis, por dia (série do gráfico e dos sparks/modais).
  return q<PontoDia>(
    `SELECT d.dia::text AS dia,
       SUM(d.faturamento_liquido - COALESCE(t.t_liq,0))   AS faturamento_liquido,
       SUM(d.faturamento_bruto - COALESCE(t.t_bruto,0))   AS faturamento_bruto,
       SUM(d.qtd_vendas - COALESCE(t.t_qtd,0))::int        AS qtd_vendas,
       SUM(d.qtd_devolucoes)::int                          AS qtd_devolucoes,
       SUM(d.valor_devolucoes)                             AS valor_devolucoes,
       SUM(COALESCE(t.t_liq,0))                            AS valor_transferencias
     FROM fact_vendas_dia d${transferJoin('d')}
     WHERE d.dia >= $1 AND d.dia <= $2${fc}
     GROUP BY d.dia ORDER BY d.dia`,
    [f.from, f.to, ...fp],
  );
}

export type FilialKpi = {
  filial: string;
  faturamento_liquido: number;
  faturamento_bruto: number;
  qtd_vendas: number;      // bruto (notas de venda)
  qtd_devolucoes: number;  // bruto (notas de devolução) — p/ derivar a qtd líquida do ERP
  valor_transferencias: number;
};

export async function getKpisPorFilial(f: Filtros): Promise<FilialKpi[]> {
  // Desconta a transferência por filial (mesmo critério do getKpis) e a destaca em valor_transferencias.
  return q<FilialKpi>(
    `SELECT d.nome AS filial,
       COALESCE(SUM(v.faturamento_liquido - COALESCE(t.t_liq,0)),0)   AS faturamento_liquido,
       COALESCE(SUM(v.faturamento_bruto - COALESCE(t.t_bruto,0)),0)   AS faturamento_bruto,
       COALESCE(SUM(v.qtd_vendas - COALESCE(t.t_qtd,0)),0)::int        AS qtd_vendas,
       COALESCE(SUM(v.qtd_devolucoes),0)::int                          AS qtd_devolucoes,
       COALESCE(SUM(COALESCE(t.t_liq,0)),0)                            AS valor_transferencias
     FROM dim_filial d
     LEFT JOIN fact_vendas_dia v ON v.filial = d.nome AND v.dia >= $1 AND v.dia <= $2${transferJoin('v')}
     GROUP BY d.nome, d.ordem ORDER BY faturamento_liquido DESC, d.ordem`,
    [f.from, f.to],
  );
}

export type MetaRow = { filial: string; ano: number; mes: number; valor: number };

/** Todas as metas cadastradas (opcionalmente de um ano), p/ listar na tela /metas. */
export async function getMetas(ano?: number): Promise<MetaRow[]> {
  const where = ano == null ? '' : ' WHERE ano = $1';
  const params = ano == null ? [] : [ano];
  return q<MetaRow>(
    `SELECT filial, ano, mes, valor FROM dim_meta${where} ORDER BY ano DESC, mes DESC, valor DESC`,
    params,
  );
}

/**
 * Meta PROPORCIONAL ao período filtrado (from..to). Cada dia do intervalo vale
 * (meta_do_mês ÷ nº de dias daquele mês); somam-se todos os dias. Assim a meta acompanha
 * o mês do FILTRO — um mês inteiro → a meta cheia; meio mês → metade; um intervalo que
 * cruza meses → a fração de cada mês. Dias em meses SEM meta cadastrada contam 0. Se
 * nenhum dia do período tiver meta, retorna 0 (o card exibe "sem meta").
 *
 * Consolidado soma as metas de todas as filiais; filial específica usa só a dela.
 * generate_series gera 1 linha por dia; junta com dim_meta por (ano, mês) e divide o valor
 * mensal pelo total de dias daquele mês (date_trunc + interval, robusto a meses de 28-31).
 */
export async function getMetaPeriodo(f: Filtros): Promise<number> {
  const [fc, fp] = filialClause(f, 3, 'm.filial');
  const rows = await q<{ meta: number }>(
    `SELECT COALESCE(SUM(m.valor / dm.dias_no_mes), 0) AS meta
     FROM generate_series($1::date, $2::date, interval '1 day') AS g(dia)
     CROSS JOIN LATERAL (
       SELECT EXTRACT(DAY FROM (date_trunc('month', g.dia) + interval '1 month - 1 day'))::int AS dias_no_mes
     ) dm
     JOIN dim_meta m
       ON m.ano = EXTRACT(YEAR FROM g.dia)::int
      AND m.mes = EXTRACT(MONTH FROM g.dia)::int${fc}`,
    [f.from, f.to, ...fp],
  );
  return Number(rows[0]?.meta) || 0;
}

export type ProjecaoMes = {
  /** Projeção de fechamento do mês corrente para o recorte atual. */
  projecao: number;
  /** Vendido (bruto) no mês corrente até hoje, no recorte atual. */
  vendidoMes: number;
  /** Maior dia do mês com venda (denominador da projeção linear). */
  diaBase: number;
  /** Nº de dias do mês corrente (28-31). */
  diasNoMes: number;
  /** Mês corrente (1-12) ao qual a projeção se refere. */
  mes: number;
};

/**
 * "Faturamento previsto" — projeção LINEAR do mês corrente (réplica da fórmula do
 * relatório de referência): SUM(TotalNota) ÷ MAX(dia com venda) × dias do mês.
 * Ancorada no mês corrente (não no filtro de período) para casar com a meta mensal.
 * Respeita o filtro de filial; Consolidado soma todas via ausência de cláusula.
 */
export async function getProjecaoMes(f: Filtros): Promise<ProjecaoMes> {
  const [fc, fp] = filialClause(f, 1, 'd.filial');
  const rows = await q<{ vendido: number | string; dia_base: number; dias_no_mes: number; mes: number }>(
    `SELECT
       COALESCE(SUM(d.faturamento_bruto - COALESCE(t.t_bruto,0)), 0)                    AS vendido,
       COALESCE(MAX(EXTRACT(DAY FROM d.dia)) FILTER (WHERE (d.faturamento_bruto - COALESCE(t.t_bruto,0)) > 0), 0)::int AS dia_base,
       EXTRACT(DAY FROM (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day'))::int AS dias_no_mes,
       EXTRACT(MONTH FROM CURRENT_DATE)::int                                            AS mes
     FROM fact_vendas_dia d${transferJoin('d')}
     WHERE d.dia >= date_trunc('month', CURRENT_DATE)::date AND d.dia <= CURRENT_DATE${fc}`,
    [...fp],
  );
  const r = rows[0];
  const vendidoMes = Number(r?.vendido) || 0;
  const diaBase = r?.dia_base || 0;
  const diasNoMes = r?.dias_no_mes || 30;
  const mes = r?.mes || 1;
  const projecao = diaBase > 0 ? (vendidoMes / diaBase) * diasNoMes : vendidoMes;
  return { projecao, vendidoMes, diaBase, diasNoMes, mes };
}

export type VendedorRow = {
  nome_vendedor: string;
  qtd_vendas: number;
  faturamento_bruto: number;
  faturamento_liquido: number;
  valor_devolucoes: number;
  faturamento_previsto: number;
  ticket_medio: number;
};

export async function getVendedores(f: Filtros): Promise<VendedorRow[]> {
  const [fc, fp] = filialClause(f, 3);
  return q<VendedorRow>(
    `SELECT
       COALESCE(nome_vendedor, 'SEM VENDEDOR') AS nome_vendedor,
       SUM(qtd_vendas)::int          AS qtd_vendas,
       SUM(faturamento_bruto)        AS faturamento_bruto,
       SUM(faturamento_liquido)      AS faturamento_liquido,
       SUM(valor_devolucoes)         AS valor_devolucoes,
       SUM(faturamento_previsto)     AS faturamento_previsto,
       CASE WHEN SUM(qtd_vendas) > 0 THEN SUM(faturamento_bruto) / SUM(qtd_vendas) ELSE 0 END AS ticket_medio
     FROM fact_vendas_vendedor_dia
     WHERE dia >= $1 AND dia <= $2${fc}
       AND (nome_vendedor IS NULL OR nome_vendedor NOT ILIKE '%TRANSFER%')
     GROUP BY nome_vendedor
     HAVING SUM(qtd_vendas) > 0 OR SUM(faturamento_bruto) <> 0
     ORDER BY faturamento_liquido DESC`,
    [f.from, f.to, ...fp],
  );
}

/** Série diária do líquido de cada vendedor no período → Map<nome, pontos[]>. */
export async function getVendedorSeries(f: Filtros): Promise<Map<string, { dia: string; valor: number }[]>> {
  const [fc, fp] = filialClause(f, 3);
  const rows = await q<{ nome_vendedor: string; dia: string; valor: number | string }>(
    `SELECT COALESCE(nome_vendedor, 'SEM VENDEDOR') AS nome_vendedor,
       dia::text AS dia,
       SUM(faturamento_liquido) AS valor
     FROM fact_vendas_vendedor_dia
     WHERE dia >= $1 AND dia <= $2${fc}
       AND (nome_vendedor IS NULL OR nome_vendedor NOT ILIKE '%TRANSFER%')
     GROUP BY nome_vendedor, dia
     ORDER BY dia`,
    [f.from, f.to, ...fp],
  );
  const m = new Map<string, { dia: string; valor: number }[]>();
  for (const r of rows) {
    const arr = m.get(r.nome_vendedor) ?? [];
    arr.push({ dia: r.dia, valor: Number(r.valor) || 0 });
    m.set(r.nome_vendedor, arr);
  }
  return m;
}

/** Líquido de cada vendedor por filial no período → Map<nome, {filial, valor}[]> (p/ quebra no Consolidado). */
export async function getVendedorPorFilial(f: Filtros): Promise<Map<string, { filial: string; valor: number }[]>> {
  const [fc, fp] = filialClause(f, 3);
  const rows = await q<{ nome_vendedor: string; filial: string; valor: number | string }>(
    `SELECT COALESCE(nome_vendedor, 'SEM VENDEDOR') AS nome_vendedor,
       filial,
       SUM(faturamento_liquido) AS valor
     FROM fact_vendas_vendedor_dia
     WHERE dia >= $1 AND dia <= $2${fc}
       AND (nome_vendedor IS NULL OR nome_vendedor NOT ILIKE '%TRANSFER%')
     GROUP BY nome_vendedor, filial
     HAVING SUM(faturamento_liquido) <> 0
     ORDER BY valor DESC`,
    [f.from, f.to, ...fp],
  );
  const m = new Map<string, { filial: string; valor: number }[]>();
  for (const r of rows) {
    const arr = m.get(r.nome_vendedor) ?? [];
    arr.push({ filial: r.filial, valor: Number(r.valor) || 0 });
    m.set(r.nome_vendedor, arr);
  }
  return m;
}

export type ProdutoRow = {
  codigo_produto: string;
  nome_produto: string;
  quantidade_vendida: number;
  faturamento_bruto: number;
};

export async function getProdutos(f: Filtros, limit = 20): Promise<ProdutoRow[]> {
  const [fc, fp] = filialClause(f, 3);
  return q<ProdutoRow>(
    `SELECT codigo_produto,
       MAX(nome_produto) AS nome_produto,
       SUM(quantidade_vendida) AS quantidade_vendida,
       SUM(faturamento_bruto)  AS faturamento_bruto
     FROM fact_vendas_produto_dia
     WHERE dia >= $1 AND dia <= $2${fc}
     GROUP BY codigo_produto
     ORDER BY faturamento_bruto DESC
     LIMIT ${Number(limit)}`,
    [f.from, f.to, ...fp],
  );
}

// ---------- Rentabilidade ----------
// DECISÃO (01/07/2026): a RECEITA vem da NOTA (fact_vendas_dia.faturamento_liquido =
// Σ TotalNota), a MESMA base da tela Vendas — que CASA EXATO com o ERP ("Consulta Vendas
// Geral"). Custo e valor de tabela continuam vindo dos ITENS (fact_vendas_produto_dia),
// única fonte com Custo×Qtd e PreçoTabela×Qtd. Motivo: a soma dos itens (Σ Total) fica
// ~R$6k acima do TotalNota (frete/acréscimo/arredondamento que existem na nota mas não na
// linha do item), o que fazia a Receita da Rentabilidade (779k) não bater com o ERP (773k).
// Como receita(nota) e custo/tabela(itens) têm grãos distintos, são agregados em subqueries
// separadas e casados por (filial, dia). O ranking "Top produtos" (getProdutosRentabilidade)
// permanece 100% pelos itens — é o único nível com granularidade de produto.
export type Rentabilidade = {
  receita: number;         // fact_vendas_dia.faturamento_liquido (Σ TotalNota) — bate c/ ERP
  custo: number;           // itens: SUM(custo_total) = Custo × Qtd
  lucro: number;           // receita − custo
  margem_lucro: number;    // lucro ÷ receita
  valor_tabela: number;    // itens: SUM(faturamento_bruto) = PreçoTabela × Qtd
  desconto: number;        // valor_tabela − receita (inclui abatimentos de nota)
  margem_desconto: number; // desconto ÷ valor_tabela
};

type RentBruta = { receita: number | string; custo: number | string; valor_tabela: number | string };

/** Deriva lucro/desconto e suas margens. Coage strings do pg p/ number. */
function derivarRent(r: RentBruta): Rentabilidade {
  const receita = Number(r.receita) || 0;
  const custo = Number(r.custo) || 0;
  const valor_tabela = Number(r.valor_tabela) || 0;
  const lucro = receita - custo;
  const desconto = valor_tabela - receita;
  return {
    receita,
    custo,
    lucro,
    margem_lucro: receita > 0 ? lucro / receita : 0,
    valor_tabela,
    desconto,
    margem_desconto: valor_tabela > 0 ? desconto / valor_tabela : 0,
  };
}

export async function getRentabilidade(f: Filtros): Promise<Rentabilidade> {
  // receita da NOTA (fact_vendas_dia) + custo/tabela dos ITENS (fact_vendas_produto_dia),
  // cada um somado no seu próprio grão e combinado — evita produto cartesiano entre as tabelas.
  // As 3 subqueries compartilham o mesmo $3 de filial (mesmo recorte).
  const [fc, fp] = filialClause(f, 3);
  const rows = await q<RentBruta>(
    `SELECT
       (SELECT COALESCE(SUM(faturamento_liquido),0)
          FROM fact_vendas_dia WHERE dia >= $1 AND dia <= $2${fc}) AS receita,
       (SELECT COALESCE(SUM(custo_total),0)
          FROM fact_vendas_produto_dia WHERE dia >= $1 AND dia <= $2${fc}) AS custo,
       (SELECT COALESCE(SUM(faturamento_bruto),0)
          FROM fact_vendas_produto_dia WHERE dia >= $1 AND dia <= $2${fc}) AS valor_tabela`,
    [f.from, f.to, ...fp],
  );
  return derivarRent(rows[0]);
}

export type RentabilidadeFilial = Rentabilidade & { filial: string };

export async function getRentabilidadePorFilial(f: Filtros): Promise<RentabilidadeFilial[]> {
  // receita da NOTA e custo/tabela dos ITENS, cada fonte pré-agregada por filial e casada
  // em dim_filial — assim os grãos distintos não se multiplicam no JOIN.
  const rows = await q<RentBruta & { filial: string }>(
    `SELECT d.nome AS filial,
       COALESCE(n.receita, 0)      AS receita,
       COALESCE(p.custo, 0)        AS custo,
       COALESCE(p.valor_tabela, 0) AS valor_tabela
     FROM dim_filial d
     LEFT JOIN (
       SELECT filial, SUM(faturamento_liquido) AS receita
       FROM fact_vendas_dia WHERE dia >= $1 AND dia <= $2 GROUP BY filial
     ) n ON n.filial = d.nome
     LEFT JOIN (
       SELECT filial, SUM(custo_total) AS custo, SUM(faturamento_bruto) AS valor_tabela
       FROM fact_vendas_produto_dia WHERE dia >= $1 AND dia <= $2 GROUP BY filial
     ) p ON p.filial = d.nome
     GROUP BY d.nome, d.ordem, n.receita, p.custo, p.valor_tabela
     ORDER BY receita DESC, d.ordem`,
    [f.from, f.to],
  );
  return rows.map((r) => ({ filial: r.filial, ...derivarRent(r) }));
}

export type PontoRent = {
  dia: string;
  receita: number;
  custo: number;
  lucro: number;
  margem_lucro: number;
  margem_desconto: number;
};

export async function getRentabilidadeSerieDia(f: Filtros): Promise<PontoRent[]> {
  // receita (nota) e custo/tabela (itens) por dia, casados por FULL JOIN — um dia pode ter
  // nota sem item ou item sem nota; COALESCE(dia) garante a chave em qualquer dos lados.
  const [fc, fp] = filialClause(f, 3);
  const rows = await q<RentBruta & { dia: string }>(
    `SELECT COALESCE(n.dia, p.dia)::text AS dia,
       COALESCE(n.receita, 0)      AS receita,
       COALESCE(p.custo, 0)        AS custo,
       COALESCE(p.valor_tabela, 0) AS valor_tabela
     FROM (
       SELECT dia, SUM(faturamento_liquido) AS receita
       FROM fact_vendas_dia WHERE dia >= $1 AND dia <= $2${fc} GROUP BY dia
     ) n
     FULL JOIN (
       SELECT dia, SUM(custo_total) AS custo, SUM(faturamento_bruto) AS valor_tabela
       FROM fact_vendas_produto_dia WHERE dia >= $1 AND dia <= $2${fc} GROUP BY dia
     ) p ON p.dia = n.dia
     ORDER BY dia`,
    [f.from, f.to, ...fp],
  );
  return rows.map((r) => {
    const d = derivarRent(r);
    return { dia: r.dia, receita: d.receita, custo: d.custo, lucro: d.lucro, margem_lucro: d.margem_lucro, margem_desconto: d.margem_desconto };
  });
}

export type ProdutoRent = {
  codigo_produto: string;
  nome_produto: string;
  quantidade_vendida: number;
  receita: number;
  lucro: number;
  margem_lucro: number;
};

export type ProdutoOrd = 'qtd' | 'receita' | 'margem' | 'lucro';
// Whitelist key->coluna p/ o ORDER BY (nunca interpolar input cru no SQL).
const PRODUTO_ORD: Record<ProdutoOrd, string> = {
  qtd: 'quantidade_vendida',
  receita: 'receita',
  margem: 'margem_lucro',
  lucro: 'lucro',
};

/** Top produtos no período (só com receita > 0), ordenado pela métrica escolhida. */
export async function getProdutosRentabilidade(
  f: Filtros,
  limit = 8,
  orderBy: ProdutoOrd = 'lucro',
  dir: 'asc' | 'desc' = 'desc',
): Promise<ProdutoRent[]> {
  const [fc, fp] = filialClause(f, 3);
  const col = PRODUTO_ORD[orderBy] ?? PRODUTO_ORD.lucro;
  const ordem = dir === 'asc' ? 'ASC' : 'DESC';
  return q<ProdutoRent>(
    `SELECT codigo_produto,
       MAX(nome_produto) AS nome_produto,
       SUM(quantidade_vendida) AS quantidade_vendida,
       SUM(receita_liquida)::float8 AS receita,
       (SUM(receita_liquida) - SUM(custo_total))::float8 AS lucro,
       CASE WHEN SUM(receita_liquida) > 0
            THEN (SUM(receita_liquida) - SUM(custo_total)) / SUM(receita_liquida)
            ELSE 0 END::float8 AS margem_lucro
     FROM fact_vendas_produto_dia
     WHERE dia >= $1 AND dia <= $2${fc}
     GROUP BY codigo_produto
     HAVING SUM(receita_liquida) > 0
     ORDER BY ${col} ${ordem}
     LIMIT ${Number(limit)}`,
    [f.from, f.to, ...fp],
  );
}
