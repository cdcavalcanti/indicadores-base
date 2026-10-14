// Vendas: Supabase (alimentado a partir do ERP) -> fatos diários no Postgres.
// Fonte: uma tabela de notas e uma de itens por loja. Os nomes abaixo são do exemplo.
// Classificação: Devolucao='S' -> Devolução; Venda='S' -> Pedido; Venda='N' -> Orçamento.
// valor_bruto = SUM(PrecoTabela*Quantidade) por nota.
import { pool } from '../db.ts';
import { supabasePages } from '../clients/supabase.ts';
import { info } from '../log.ts';
import { config } from '../config.ts';

type FilialTables = { nome: string; mov: string; itens: string };

// Exemplo. No cliente real, estes nomes vêm da configuração daquele tenant.
const FILIAIS_SB: FilialTables[] = [
  { nome: 'Loja Centro', mov: 'indicador_comercial_loja_centro', itens: 'indicador_comercial_movimento_itens_loja_centro' },
  { nome: 'Loja Norte',  mov: 'indicador_comercial_loja_norte',  itens: 'indicador_comercial_movimento_itens_loja_norte' },
  { nome: 'Loja Sul',    mov: 'indicador_comercial_loja_sul',    itens: 'indicador_comercial_movimento_itens_loja_sul' },
  { nome: 'Loja Leste',  mov: 'indicador_comercial_loja_leste',  itens: 'indicador_comercial_movimento_itens_loja_leste' },
  { nome: 'Loja Jardim', mov: 'indicador_comercial_loja_jardim', itens: 'indicador_comercial_movimento_itens_loja_jardim' },
  { nome: 'Loja Serra',  mov: 'indicador_comercial_loja_serra',  itens: 'indicador_comercial_movimento_itens_loja_serra' },
  { nome: 'Depósito',    mov: 'indicador_comercial_deposito',    itens: 'indicador_comercial_movimento_itens_deposito' },
];

type MovRow = {
  id: number | string;
  DataMovimento: string | null;
  DataEmissao: string | null;
  DataCancelamento: string | null;
  Devolucao: string | null;
  Venda: string | null;
  TotalNota: number | null;
  NumeroNF: number | string | null;
  Vendedor: number | string | null;
  NomeVendedor: string | null;
};

type ItemRow = {
  Id: number | string;
  IdMovimento: number | string | null;
  CodigoProduto: string | null;
  Descricao: string | null;
  Quantidade: number | null;
  PrecoTabela: number | null;
  Custo: number | null;
  Total: number | null;
  DataMovimento: string | null;
  DataEmissao: string | null;
};

// Classificação do movimento. Três destinos: VENDA, DEVOLUÇÃO ou DESCARTAR (transferência/remessa).
// Regra do ERP: Devolucao='S' é devolução; o restante não cancelado é venda. Valor = TotalNota.
// A quantidade de vendas do ERP conta notas com Venda='S' e Devolucao='N', menos as
// devoluções. As linhas Venda='N' e Devolucao='N' são transferências internas e o ERP
// NÃO as conta — nem com NF nem sem NF. O critério é a coluna `Venda`, não "NomeVendedor LIKE
// TRANSFER" (marcador que só acertava por acaso). O feed n8n passou a preencher `Venda` em 02/07.
//
// FALLBACK p/ histórico: linhas antigas (antes do reprocesso do n8n) têm Venda=null. Nesses casos
// caímos na regra anterior (Devolucao decide; transferência-sem-NF descartada por nome) para não
// zerar o passado. Assim que o n8n reprocessar o período, a coluna Venda assume e casa com o ERP.
// Valores continuam em TotalNota (a receita do card já vem da view por DataMovimento).
type TipoDoc = 'Pedido' | 'Devolucao' | 'Descartar';

function classificar(r: MovRow): TipoDoc {
  if (r.Devolucao === 'S') return 'Devolucao';
  if (r.Venda != null) {
    // Feed novo: a coluna Venda é a fonte-verdade. Venda='S' é venda; qualquer outra
    // (Venda='N' não-devolução = transferência/remessa) é descartada, como o ERP faz.
    return r.Venda === 'S' ? 'Pedido' : 'Descartar';
  }
  // Fallback (Venda=null, histórico não reprocessado): regra antiga por nome de vendedor.
  return isTransferenciaSemNF(r) ? 'Descartar' : 'Pedido';
}

/**
 * TRANSFERÊNCIA entre lojas SEM nota fiscal (NumeroNF=0) — usado APENAS no fallback, quando a
 * coluna `Venda` do feed vem nula (histórico antigo). Com `Venda` preenchida, a classificação é
 * feita direto por Venda='S' (ver classificar). Mantido para não regredir o passado ainda não
 * reprocessado. Com `Venda` preenchida, a classificação não usa o nome do vendedor.
 */
function isTransferenciaSemNF(r: MovRow): boolean {
  const ehTransfer = (r.NomeVendedor ?? '').toUpperCase().includes('TRANSFER');
  return ehTransfer && num(r.NumeroNF) === 0;
}

const dia = (s: string | null | undefined) => (s ? String(s).slice(0, 10) : null);
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Regrava os fatos de uma filial DENTRO da janela [desde, hoje], preservando o histórico
 * anterior a `desde`. Apaga só os dias da janela (DELETE WHERE dia >= desde) e reinsere com
 * UPSERT (ON CONFLICT DO UPDATE) — assim um dia que deixou de ter linhas na origem some, e os
 * demais são recalculados, sem tocar no que está antes da janela. `pk` são as colunas da
 * primary key da tabela (p/ o ON CONFLICT).
 */
async function upsertFilialJanela(
  table: string,
  filial: string,
  desde: string,
  columns: string[],
  pk: string[],
  rows: unknown[][],
): Promise<void> {
  const cols = ['filial', ...columns];
  const updatable = cols.filter((c) => !pk.includes(c));
  const setClause = updatable.map((c) => `${c} = EXCLUDED.${c}`).join(', ');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM ${table} WHERE filial = $1 AND dia >= $2`, [filial, desde]);
    for (let i = 0; i < rows.length; i += 400) {
      const batch = rows.slice(i, i + 400);
      const values: unknown[] = [];
      const tuples = batch.map((r, bi) => {
        const full = [filial, ...r];
        values.push(...full);
        return `(${full.map((_, ci) => `$${bi * cols.length + ci + 1}`).join(',')})`;
      });
      await client.query(
        `INSERT INTO ${table} (${cols.join(',')}) VALUES ${tuples.join(',')}
         ON CONFLICT (${pk.join(',')}) DO UPDATE SET ${setClause}`,
        values,
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Data de corte (YYYY-MM-DD, UTC) da janela rolante: hoje − N dias. */
function cutoffDesde(dias: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/**
 * True se o erro é "tabela/view não existe" (Postgres 42P01, que o PostgREST devolve como HTTP
 * 404). Só ISSO justifica cair no fallback por DataEmissao — a view ainda não foi criada no n8n.
 * Qualquer outro erro (timeout de rede que sobreviveu ao retry do fetchJson, 5xx, 401…) NÃO pode
 * virar fallback silencioso: mascararia dado errado. Nesses casos o chamador re-lança e ABORTA o
 * ETL — melhor não gravar do que gravar número que não espelha o ERP.
 */
function isViewAusente(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes('404') || msg.includes('42P01');
}

// Totais diários da NOTA por filial, agregados por DataMovimento (não DataEmissao).
type PorDiaNota = { qv: number; qd: number; fb: number; vd: number; fl: number };

type ViewPorDiaRow = {
  filial: string;
  dia: string;
  faturamento_liquido: number | null;
  qtd_vendas: number | null;
  qtd_devolucoes: number | null;
  valor_devolucoes_dia: number | null;
};

/**
 * Faturamento diário da NOTA a partir da view `dash_por_dia` (mantida pelo n8n do
 * outro dashboard, no MESMO Supabase). Esta view agrega por **DataMovimento** — a data que o
 * ERP usa —, então CASA EXATO com o "Consulta Vendas Geral" do ERP. As tabelas cruas do
 * Supabase só têm DataMovimento nula nas NOTAS, o que nos forçava a agregar por DataEmissao e
 * gerava divergência na borda do mês.
 *
 * Retorna Map<filial, Map<dia, PorDiaNota>>. Filiais ou dias fora da view caem no
 * cálculo próprio (por DataEmissao). bruto = líquido + devoluções (a view não separa bruto).
 */
async function fetchPorDiaViaView(desde: string): Promise<Map<string, Map<string, PorDiaNota>>> {
  const out = new Map<string, Map<string, PorDiaNota>>();
  const cols = 'filial,dia,faturamento_liquido,qtd_vendas,qtd_devolucoes,valor_devolucoes_dia';
  for await (const page of supabasePages<ViewPorDiaRow>(
    'dash_por_dia',
    `select=${cols}&dia=gte.${desde}`,
    'dia',
  )) {
    for (const r of page) {
      const d = dia(r.dia);
      if (!r.filial || !d) continue;
      const fl = num(r.faturamento_liquido);
      const vd = num(r.valor_devolucoes_dia);
      const porDia = out.get(r.filial) ?? new Map<string, PorDiaNota>();
      // bruto = líquido + devoluções (líquido = bruto − devoluções na convenção da view).
      porDia.set(d, { qv: num(r.qtd_vendas), qd: num(r.qtd_devolucoes), fb: r2(fl + vd), vd, fl });
      out.set(r.filial, porDia);
    }
  }
  return out;
}

type ViewVendDiaRow = {
  filial: string;
  dia: string;
  codigo_vendedor: number | string | null;
  nome_vendedor: string | null;
  faturamento_liquido_dia: number | null;
};

// Líquido + nome por (filial, dia, vendedor) vindos da view (chave "dia|codigo_vendedor").
type VendViewVal = { dia: string; cod: string; nome: string | null; fl: number };

/**
 * Líquido por (filial, dia, vendedor) da view `dash_acumulado_vendedor_dia` — mesma
 * origem MySQL/DataMovimento da `dash_por_dia`, então CASA COM O ERP. Quando a filial
 * é coberta, ESTA view vira a fonte-verdade das linhas de vendedor (garante que a soma feche
 * com o total-ERP); qtd/bruto vêm da agregação crua por chave, quando existir (a view só traz
 * o líquido). Retorna Map<filial, Map<"dia|codigo_vendedor", VendViewVal>>.
 */
async function fetchVendedorDiaViaView(desde: string): Promise<Map<string, Map<string, VendViewVal>>> {
  const out = new Map<string, Map<string, VendViewVal>>();
  const cols = 'filial,dia,codigo_vendedor,nome_vendedor,faturamento_liquido_dia';
  for await (const page of supabasePages<ViewVendDiaRow>(
    'dash_acumulado_vendedor_dia',
    `select=${cols}&dia=gte.${desde}`,
    'dia',
  )) {
    for (const r of page) {
      const d = dia(r.dia);
      if (!r.filial || !d || r.codigo_vendedor == null) continue;
      const m = out.get(r.filial) ?? new Map<string, VendViewVal>();
      const cod = String(r.codigo_vendedor);
      m.set(`${d}|${cod}`, { dia: d, cod, nome: r.nome_vendedor ?? null, fl: num(r.faturamento_liquido_dia) });
      out.set(r.filial, m);
    }
  }
  return out;
}

type ViewProdutoDiaRow = {
  filial: string;
  dia: string;
  codigo_produto: string | null;
  nome_produto: string | null;
  quantidade_vendida: number | null;
  faturamento_bruto: number | null;
  custo_total: number | null;
  receita_liquida: number | null;
};

// Produto x dia da view (chave "dia|codigo_produto"). Campos já no grão do fact table.
type ProdViewVal = { dia: string; cod: string; nome: string | null; qtd: number; fb: number; custo: number; receita: number };

/**
 * Produto/custo por (filial, dia, produto) da view `dash_produto_dia` — mesma origem
 * MySQL/DataMovimento das demais views, então CASA COM O ERP (inclusive o CUSTO, que não existe
 * em nenhuma tabela crua do Supabase). Quando a filial é coberta, esta view é a fonte-verdade de
 * fact_vendas_produto_dia (custo/margem/Top-produtos batem o ERP); senão, cai na agregação crua
 * por DataEmissao. Colunas mapeiam 1:1 no fact table. Ver docs/n8n-produto-dia.sql.
 * Retorna Map<filial, Map<"dia|codigo_produto", ProdViewVal>>.
 */
async function fetchProdutoDiaViaView(desde: string): Promise<Map<string, Map<string, ProdViewVal>>> {
  const out = new Map<string, Map<string, ProdViewVal>>();
  const cols = 'filial,dia,codigo_produto,nome_produto,quantidade_vendida,faturamento_bruto,custo_total,receita_liquida';
  for await (const page of supabasePages<ViewProdutoDiaRow>(
    'dash_produto_dia',
    `select=${cols}&dia=gte.${desde}`,
    'dia',
  )) {
    for (const r of page) {
      const d = dia(r.dia);
      if (!r.filial || !d || !r.codigo_produto) continue;
      const m = out.get(r.filial) ?? new Map<string, ProdViewVal>();
      const cod = String(r.codigo_produto);
      m.set(`${d}|${cod}`, {
        dia: d, cod, nome: r.nome_produto ?? null,
        qtd: num(r.quantidade_vendida), fb: num(r.faturamento_bruto),
        custo: num(r.custo_total), receita: num(r.receita_liquida),
      });
      out.set(r.filial, m);
    }
  }
  return out;
}

/**
 * Sincroniza vendas do Supabase para o warehouse. `syncDays` define a janela rolante
 * (default: config.salesSyncDays). Passe um valor grande (ex.: 9999) para backfill total —
 * é o que o gatilho de boot único usa para recalcular todo o histórico com a regra atual.
 */
export async function syncSalesSupabase(syncDays = config.salesSyncDays): Promise<number> {
  let totalFacts = 0;
  // Janela rolante: lê só os últimos N dias do Supabase e faz UPSERT por janela,
  // preservando o histórico anterior a `desde` no warehouse. A leitura crua filtra por
  // DataEmissao (DataMovimento vem nula nas NOTAS do Supabase); porém as fact tables gravam,
  // quando há view disponível, os totais por DataMovimento (views dash_*, casam com
  // o ERP) — dia, vendedor e produto. Filiais/dias sem view caem no cálculo por DataEmissao.
  // Backfill total: SALES_SYNC_DAYS=9999.
  const desde = cutoffDesde(syncDays);
  const janela = `DataEmissao=gte.${desde}`;
  info(`Vendas: janela rolante a partir de ${desde} (${syncDays} dias) — UPSERT, preserva histórico`);

  // Faturamento por DataMovimento (views do outro dashboard) — casam com o ERP. Usados no
  // lugar da nossa agregação por DataEmissao quando a filial está coberta. Total diário,
  // líquido por vendedor e produto/custo têm views (dash_*).
  let porDiaView: Map<string, Map<string, PorDiaNota>>;
  let vendDiaView: Map<string, Map<string, VendViewVal>>;
  let prodDiaView: Map<string, Map<string, ProdViewVal>>;
  // Carrega as 3 views. Só 404 (view não criada no n8n) vira fallback por DataEmissao; qualquer
  // outro erro (timeout de rede pós-retry, 5xx…) ABORTA o sync — não podemos gravar número que
  // não espelha o ERP por causa de falha transitória. is404 → Map vazio; resto → re-lança.
  try {
    porDiaView = await fetchPorDiaViaView(desde);
    const filiaisView = [...porDiaView.keys()].join(', ');
    info(`Vendas: view dash_por_dia carregada p/ filiais: ${filiaisView || '(nenhuma)'}`);
  } catch (e) {
    if (!isViewAusente(e)) throw e;
    porDiaView = new Map();
    info(`Vendas: view dash_por_dia ausente (404) — usando agregação por DataEmissao`);
  }
  try {
    vendDiaView = await fetchVendedorDiaViaView(desde);
  } catch (e) {
    if (!isViewAusente(e)) throw e;
    vendDiaView = new Map();
    info(`Vendas: view acumulado_vendedor_dia ausente (404) — vendedor por DataEmissao`);
  }
  try {
    prodDiaView = await fetchProdutoDiaViaView(desde);
  } catch (e) {
    if (!isViewAusente(e)) throw e;
    prodDiaView = new Map();
    info(`Vendas: view produto_dia ausente (404) — produto/custo por DataEmissao`);
  }

  for (const f of FILIAIS_SB) {
    // ---------- 1) Movimentos ----------
    const movCols = 'id,DataMovimento,DataEmissao,DataCancelamento,Devolucao,Venda,TotalNota,NumeroNF,Vendedor,NomeVendedor';
    const porDia = new Map<string, { qv: number; qd: number; fb: number; vd: number; fl: number }>();
    const porVendDia = new Map<string, { dia: string; cod: string; nome: string | null; qv: number; fb: number; vd: number; fl: number }>();
    // mapa p/ itens: id da nota -> sinal (+1 pedido, -1 devolução). Devoluções descontam da rentabilidade.
    const movSign = new Map<string, 1 | -1>();
    let movCount = 0;

    for await (const page of supabasePages<MovRow>(f.mov, `select=${movCols}&${janela}`, 'id')) {
      for (const m of page) {
        movCount++;
        if (m.DataCancelamento) continue; // cancelada
        const tipo = classificar(m);
        if (tipo === 'Descartar') continue; // transferência/remessa: o ERP não conta (Venda='N')
        const d = dia(m.DataMovimento) ?? dia(m.DataEmissao);
        if (!d) continue;
        const vb = num(m.TotalNota);

        const acc = porDia.get(d) ?? { qv: 0, qd: 0, fb: 0, vd: 0, fl: 0 };
        if (tipo === 'Pedido') { acc.qv++; acc.fb += vb; acc.fl += vb; }
        else { acc.qd++; acc.vd += vb; acc.fl -= vb; }
        porDia.set(d, acc);

        if (m.Vendedor != null) {
          const cod = String(m.Vendedor);
          const k = `${d}|${cod}`;
          const av = porVendDia.get(k) ?? { dia: d, cod, nome: m.NomeVendedor ?? null, qv: 0, fb: 0, vd: 0, fl: 0 };
          if (tipo === 'Pedido') { av.qv++; av.fb += vb; av.fl += vb; }
          else { av.vd += vb; av.fl -= vb; }
          if (!av.nome && m.NomeVendedor) av.nome = m.NomeVendedor;
          porVendDia.set(k, av);
        }

        movSign.set(String(m.id), tipo === 'Pedido' ? 1 : -1);
      }
    }

    // ---------- 2) Itens (pedidos somam, devoluções subtraem) ----------
    // fb = valor de tabela (PrecoTabela*Qtd); custo = Custo*Qtd; receita = Total (líquido de desconto).
    // Itens de devolução entram com sinal negativo -> rentabilidade líquida de devoluções.
    const itemCols = 'Id,IdMovimento,CodigoProduto,Descricao,Quantidade,PrecoTabela,Custo,Total,DataMovimento,DataEmissao';
    const porProdDia = new Map<string, { dia: string; cod: string; nome: string | null; qtd: number; fb: number; custo: number; receita: number }>();
    let itemCount = 0;

    for await (const page of supabasePages<ItemRow>(f.itens, `select=${itemCols}&${janela}`, 'Id')) {
      for (const it of page) {
        itemCount++;
        const sign = it.IdMovimento != null ? movSign.get(String(it.IdMovimento)) : undefined;
        if (!sign) continue; // nota cancelada ou inexistente
        const d = dia(it.DataMovimento) ?? dia(it.DataEmissao);
        if (!d || !it.CodigoProduto) continue;
        const k = `${d}|${it.CodigoProduto}`;
        const qtd = num(it.Quantidade);
        const acc = porProdDia.get(k) ?? { dia: d, cod: String(it.CodigoProduto), nome: it.Descricao ?? null, qtd: 0, fb: 0, custo: 0, receita: 0 };
        acc.qtd += sign * qtd;
        acc.fb += sign * num(it.PrecoTabela) * qtd;
        acc.custo += sign * num(it.Custo) * qtd;
        acc.receita += sign * num(it.Total);
        if (!acc.nome && it.Descricao) acc.nome = it.Descricao;
        porProdDia.set(k, acc);
      }
    }

    // ---------- 3) Gravar fatos (UPSERT por janela: preserva histórico < desde) ----------
    // fact_vendas_dia: os VALORES (faturamento/devolução) vêm da view por DataMovimento — casam
    // com o "Venda R$" do ERP. Mas a CONTAGEM (qtd_vendas/qtd_devolucoes) segue a nossa
    // agregação por DataEmissao, que reproduz a quantidade de vendas do ERP. As duas datas
    // caem em dias diferentes; como a coerência exigida é a do
    // CARD (total do período), fazemos o MERGE por dia — o SUM mensal de cada métrica bate com
    // sua fonte-ERP. Sem view (filial não coberta), tudo vem da agregação própria.
    const viewDia = porDiaView.get(f.nome);
    const usaView = !!(viewDia && viewDia.size > 0);
    const origemDia = usaView ? 'valor:view/ERP + qtd:DataEmissao' : 'DataEmissao (própria)';
    let diaRows: unknown[][];
    if (usaView) {
      // união dos dias das duas fontes; valor← view, contagem← porDia (0 quando o dia só existe do outro lado)
      const dias = new Set<string>([...viewDia!.keys(), ...porDia.keys()]);
      diaRows = [...dias].map((d) => {
        const v = viewDia!.get(d);
        const p = porDia.get(d);
        return [d, p?.qv ?? 0, p?.qd ?? 0, r2(v?.fb ?? 0), r2(v?.vd ?? 0), r2(v?.fl ?? 0), 0];
      });
    } else {
      diaRows = [...porDia.entries()].map(([d, a]) => [d, a.qv, a.qd, r2(a.fb), r2(a.vd), r2(a.fl), 0]);
    }
    await upsertFilialJanela(
      'fact_vendas_dia', f.nome, desde,
      ['dia', 'qtd_vendas', 'qtd_devolucoes', 'faturamento_bruto', 'valor_devolucoes', 'faturamento_liquido', 'faturamento_previsto'],
      ['filial', 'dia'],
      diaRows,
    );
    // fact_vendas_vendedor_dia: quando a filial é coberta pela view de vendedor, a VIEW é a
    // fonte-verdade do líquido (soma fecha com o total-ERP). qtd/bruto/devol vêm da agregação
    // crua pela mesma chave (dia|cod), quando existir; nome prioriza o da agregação crua.
    const viewVend = vendDiaView.get(f.nome);
    let vendRows: unknown[][];
    if (viewVend && viewVend.size > 0) {
      vendRows = [...viewVend.values()].map((v) => {
        const bruto = porVendDia.get(`${v.dia}|${v.cod}`);
        return [v.dia, v.cod, bruto?.nome ?? v.nome, bruto?.qv ?? 0, r2(bruto?.fb ?? 0), r2(bruto?.vd ?? 0), r2(v.fl), 0];
      });
    } else {
      vendRows = [...porVendDia.values()].map((a) => [a.dia, a.cod, a.nome, a.qv, r2(a.fb), r2(a.vd), r2(a.fl), 0]);
    }
    await upsertFilialJanela(
      'fact_vendas_vendedor_dia', f.nome, desde,
      ['dia', 'codigo_vendedor', 'nome_vendedor', 'qtd_vendas', 'faturamento_bruto', 'valor_devolucoes', 'faturamento_liquido', 'faturamento_previsto'],
      ['filial', 'dia', 'codigo_vendedor'],
      vendRows,
    );
    // fact_vendas_produto_dia: quando a filial é coberta pela view de produto, a VIEW é a
    // fonte-verdade (custo por DataMovimento, casa ERP). Senão, agregação crua por DataEmissao.
    const viewProd = prodDiaView.get(f.nome);
    let prodRows: unknown[][];
    if (viewProd && viewProd.size > 0) {
      prodRows = [...viewProd.values()].map((a) => [a.dia, a.cod, a.nome, a.qtd, r2(a.fb), r2(a.custo), r2(a.receita)]);
    } else {
      prodRows = [...porProdDia.values()].map((a) => [a.dia, a.cod, a.nome, a.qtd, r2(a.fb), r2(a.custo), r2(a.receita)]);
    }
    await upsertFilialJanela(
      'fact_vendas_produto_dia', f.nome, desde,
      ['dia', 'codigo_produto', 'nome_produto', 'quantidade_vendida', 'faturamento_bruto', 'custo_total', 'receita_liquida'],
      ['filial', 'dia', 'codigo_produto'],
      prodRows,
    );

    const origemVend = viewVend && viewVend.size > 0 ? 'view/ERP' : 'DataEmissao';
    const origemProd = viewProd && viewProd.size > 0 ? 'view/ERP' : 'DataEmissao';
    const facts = diaRows.length + vendRows.length + prodRows.length;
    totalFacts += facts;
    info(`  ${f.nome}: ${movCount} notas + ${itemCount} itens -> ${diaRows.length} dias [${origemDia}], ${vendRows.length} vend-dia [${origemVend}], ${prodRows.length} prod-dia [${origemProd}]`);
  }

  return totalFacts;
}
