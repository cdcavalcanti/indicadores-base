import { Topbar } from '@/components/Topbar';
import { KpiCard } from '@/components/KpiCard';
import { Section } from '@/components/Section';
import { AreaFaturamento } from '@/components/charts/AreaFaturamento';
import { BarFiliais } from '@/components/charts/BarFiliais';
import { parseFiltros, parseComparativo, temComparativoCustom, filialComparativa, CONSOLIDADO } from '@/lib/filters';
import { getKpis, getSerieDia, getKpisPorFilial, getVendedores, getProdutos, getMetaPeriodo, getProjecaoMes, getRentabilidade } from '@/lib/queries';
import { fmtBRL, fmtBRLc, fmtInt, fmtPct, variacao, nomeMes } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function VisaoGeral({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const f = parseFiltros(sp);
  const ant = parseComparativo(sp, f);
  const [kpis, kpisAntRaw, rent, rentAntRaw, serie, porFilial, vendedores, produtos, metaMes, proj] = await Promise.all([
    getKpis(f),
    getKpis(ant),
    getRentabilidade(f),
    getRentabilidade(ant),
    getSerieDia(f),
    getKpisPorFilial(f),
    getVendedores(f),
    getProdutos(f, 5),
    getMetaPeriodo(f),
    getProjecaoMes(f),
  ]);

  // Loja nova sem histórico no período comparado usa a loja de referência.
  const filComp = filialComparativa(f.filial, kpisAntRaw.faturamento_liquido === 0 && kpisAntRaw.qtd_vendas === 0);
  const [kpisAnt, rentAnt] = filComp
    ? await Promise.all([getKpis({ ...ant, filial: filComp }), getRentabilidade({ ...ant, filial: filComp })])
    : [kpisAntRaw, rentAntRaw];

  const topVend = vendedores.slice(0, 5);

  // % de cada filial sobre o total (para o gráfico "Faturamento por filial").
  const totalFilial = porFilial.reduce((s, r) => s + Number(r.faturamento_liquido), 0);
  const porFilialPct = porFilial.map((r) => ({
    ...r,
    pct: totalFilial > 0 ? Number(r.faturamento_liquido) / totalFilial : 0,
  }));

  // Quebra por filial nos modais só faz sentido no Consolidado. Quando `num` é informado (métrica
  // somável), adiciona uma coluna "%" com a participação de cada filial no total.
  const consolidado = f.filial === CONSOLIDADO;
  const quebraFilial = (
    head: string,
    val: (r: (typeof porFilial)[number]) => string,
    num?: (r: (typeof porFilial)[number]) => number,
  ) => {
    if (!consolidado) return undefined;
    if (!num) return { titulo: 'Por filial', head: ['Filial', head], rows: porFilial.map((r) => [r.filial, val(r)]) };
    const total = porFilial.reduce((s, r) => s + num(r), 0);
    return {
      titulo: 'Por filial',
      head: ['Filial', head, '%'],
      alignRightFrom: 1,
      rows: porFilial.map((r) => [r.filial, val(r), total > 0 ? fmtPct(num(r) / total) : '—']),
    };
  };

  // Atingimento da meta = realizado NO PERÍODO FILTRADO ÷ meta proporcional aos dias do
  // período (getMetaPeriodo). A meta acompanha o mês do filtro; projecaoMes (projeção linear
  // do mês corrente) alimenta só o card "Faturamento Projetado".
  const realizado = kpis.faturamento_liquido;
  const projecaoMes = proj.projecao;
  const ratioMeta = metaMes > 0 ? realizado / metaMes : 0;
  const acentoProj = metaMes > 0 ? (ratioMeta >= 1 ? 'green' : ratioMeta >= 0.7 ? 'amber' : 'red') : 'blue';

  return (
    <>
      <Topbar titulo="Visão Geral" filtros={f} comparativo={ant} comparativoCustom={temComparativoCustom(sp)} comparativoFilial={filComp} />
      <div className="p-7 space-y-6">
        {/* KPIs com variação vs período anterior e tendência do período */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          <KpiCard
            label="Valor vendido"
            accent="green"
            value={fmtBRL(kpis.faturamento_liquido)}
            delta={variacao(kpis.faturamento_liquido, kpisAnt.faturamento_liquido)}
            spark={serie.map((p) => p.faturamento_liquido)}
            detalhe={{
              serie: serie.map((p) => ({ dia: p.dia, valor: Number(p.faturamento_liquido) })),
              formato: 'moeda',
              breakdown: quebraFilial('Valor vendido', (r) => fmtBRL(r.faturamento_liquido), (r) => r.faturamento_liquido),
              descricao: 'Venda ao cliente final no período: TotalNota das vendas menos devoluções, DESCONTADA a transferência entre lojas. Por isso fica ABAIXO da coluna "Venda R$" do ERP, que soma a transferência com NF.',
            }}
          />
          <KpiCard
            label="Receita Líquida"
            accent="green"
            value={fmtBRL(rent.receita)}
            delta={variacao(rent.receita, rentAnt.receita)}
            detalhe={{
              descricao: 'Faturamento líquido das notas (vendas − devoluções), a mesma base da aba Rentabilidade e do ERP. Inclui a transferência entre lojas, então é maior que o "Valor vendido" pela diferença do card "Transferências".',
            }}
          />
          <KpiCard
            label="Custo das vendas"
            accent="amber"
            deltaBom="neutro"
            value={fmtBRL(rent.custo)}
            delta={variacao(rent.custo, rentAnt.custo)}
            detalhe={{
              descricao: 'Soma do Custo × Quantidade dos itens (custo de mercadoria), líquido das devoluções. Base para a margem de lucro (ver aba Rentabilidade).',
            }}
          />
          <KpiCard
            label="Quantidade de Vendas"
            accent="purple"
            value={fmtInt(kpis.qtd_vendas_liquida)}
            sub={`${fmtInt(kpis.qtd_devolucoes)} devoluções`}
            delta={variacao(kpis.qtd_vendas_liquida, kpisAnt.qtd_vendas_liquida)}
            detalhe={{
              serie: serie.map((p) => ({ dia: p.dia, valor: p.qtd_vendas - p.qtd_devolucoes })),
              formato: 'inteiro',
              breakdown: quebraFilial('Vendas', (r) => fmtInt(r.qtd_vendas - r.qtd_devolucoes), (r) => r.qtd_vendas - r.qtd_devolucoes),
              descricao: 'Quantidade de vendas líquida de devoluções, como o "Qtd de Vendas" do ERP (vendas − devoluções no período).',
            }}
          />
          <KpiCard
            label="Ticket médio"
            accent="amber"
            value={fmtBRL(kpis.ticket_medio)}
            delta={variacao(kpis.ticket_medio, kpisAnt.ticket_medio)}
            detalhe={{
              serie: serie.map((p) => {
                const qLiq = p.qtd_vendas - p.qtd_devolucoes;
                return { dia: p.dia, valor: qLiq > 0 ? Number(p.faturamento_liquido) / qLiq : 0 };
              }),
              formato: 'moeda',
              agregacao: 'media',
              descricao: 'Valor vendido (líquido) ÷ quantidade de vendas. No gráfico, calculado dia a dia.',
            }}
          />
          <KpiCard
            label="Devoluções"
            accent="red"
            value={fmtBRL(kpis.valor_devolucoes)}
            sub={`${fmtInt(kpis.qtd_devolucoes)} un`}
            delta={variacao(kpis.valor_devolucoes, kpisAnt.valor_devolucoes)}
            deltaBom="desce"
            detalhe={{
              serie: serie.map((p) => ({ dia: p.dia, valor: Number(p.valor_devolucoes) })),
              formato: 'moeda',
              descricao: 'Valor das notas de devolução (Devolucao=S) no período. Quanto menor, melhor.',
            }}
          />
          <KpiCard
            label="Transferências"
            accent="blue"
            value={fmtBRL(kpis.valor_transferencias)}
            sub={`${fmtInt(kpis.qtd_transferencias)} un`}
            delta={variacao(kpis.valor_transferencias, kpisAnt.valor_transferencias)}
            deltaBom="neutro"
            spark={serie.map((p) => p.valor_transferencias)}
            detalhe={{
              serie: serie.map((p) => ({ dia: p.dia, valor: Number(p.valor_transferencias) })),
              formato: 'moeda',
              extremosNeutros: true,
              breakdown: quebraFilial('Transferências', (r) => fmtBRL(r.valor_transferencias), (r) => r.valor_transferencias),
              descricao: 'Transferências entre lojas do grupo (identificadas pelo "vendedor" TRANSFERENCIA). Foram REMOVIDAS do "Valor vendido" — o total reflete só a venda ao cliente final.',
            }}
          />
          <KpiCard
            label="Taxa de devolução"
            accent="pink"
            value={fmtPct(kpis.taxa_devolucao)}
            delta={variacao(kpis.taxa_devolucao, kpisAnt.taxa_devolucao)}
            deltaBom="desce"
            detalhe={{
              serie: serie.map((p) => ({
                dia: p.dia,
                valor: p.qtd_vendas + p.qtd_devolucoes > 0 ? p.qtd_devolucoes / (p.qtd_vendas + p.qtd_devolucoes) : 0,
              })),
              formato: 'percentual',
              agregacao: 'media',
              descricao: 'Devoluções ÷ (vendas + devoluções), em quantidade de notas. Quanto menor, melhor.',
            }}
          />
          <KpiCard
            label="Faturamento Projetado"
            accent="blue"
            value={fmtBRL(projecaoMes)}
            sub={nomeMes(proj.mes)}
            detalhe={{
              descricao: `Projeção linear: vendido no mês até hoje (${fmtBRL(proj.vendidoMes)}) ÷ ${proj.diaBase} dia(s) com venda × ${proj.diasNoMes} dias do mês.`,
            }}
          />
          <KpiCard
            label="Meta"
            accent={acentoProj}
            valorAccent={metaMes > 0}
            value={metaMes > 0 ? fmtPct(ratioMeta) : '—'}
            sub={metaMes > 0 ? `meta ${fmtBRLc(metaMes)} no período` : 'sem meta cadastrada'}
            progresso={metaMes > 0 ? ratioMeta : undefined}
            detalhe={{
              descricao:
                metaMes > 0
                  ? `Atingimento = faturado no período (${fmtBRL(realizado)}) ÷ meta do período (${fmtBRL(metaMes)}) = ${fmtPct(ratioMeta)}.\n\nA meta acompanha o período filtrado: cada dia vale a meta mensal ÷ dias do mês, somando os dias do filtro${consolidado ? ' (soma das filiais)' : ` (filial ${f.filial})`}. Mês inteiro → meta cheia; meio mês → metade. Verde ao alcançar 100%, âmbar de 70% a 99%, vermelho abaixo de 70%.`
                  : 'Sem meta cadastrada para o período filtrado.',
            }}
          />
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <Section title="Faturamento líquido por dia" className="xl:col-span-2">
            <AreaFaturamento data={serie} />
          </Section>
          <Section title="Faturamento por filial">
            <BarFiliais data={porFilialPct} />
          </Section>
        </div>

        {/* Rankings */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Section title="Top vendedores" sub="por faturamento líquido no período">
            <RankList
              rows={topVend.map((v) => ({
                nome: v.nome_vendedor,
                valorNum: v.faturamento_liquido,
                valor: fmtBRL(v.faturamento_liquido),
                meta: `${fmtInt(v.qtd_vendas)} vendas`,
              }))}
            />
          </Section>
          <Section title="Top produtos" sub="por faturamento bruto no período">
            <RankList
              rows={produtos.map((p) => ({
                nome: p.nome_produto,
                valorNum: p.faturamento_bruto,
                valor: fmtBRL(p.faturamento_bruto),
                meta: `${fmtInt(p.quantidade_vendida)} un`,
              }))}
            />
          </Section>
        </div>
      </div>
    </>
  );
}

function RankList({ rows }: { rows: { nome: string; valorNum: number; valor: string; meta: string }[] }) {
  if (!rows.length) return <p className="text-sm text-[var(--color-muted)]">Sem dados no período.</p>;
  const max = Math.max(...rows.map((r) => r.valorNum), 1);
  return (
    <ol className="space-y-1">
      {rows.map((r, i) => (
        <li key={i} className="flex items-center gap-3 rounded-lg px-2 py-2 -mx-2 hover:bg-white/[0.025] transition-colors">
          <span
            className={[
              'num w-6 h-6 shrink-0 rounded-md flex items-center justify-center text-[11px] border',
              i === 0
                ? 'text-[var(--color-action)] border-[var(--color-action)]/40 bg-[var(--color-action)]/10'
                : 'text-[var(--color-muted)] border-[var(--color-border-soft)] bg-[var(--color-surface-2)]',
            ].join(' ')}
          >
            {String(i + 1).padStart(2, '0')}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] text-[var(--color-text)] truncate">{r.nome}</div>
            <div className="h-1.5 mt-1.5 rounded-full bg-white/[0.04] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--color-blue-deep)] to-[var(--color-blue)]"
                style={{ width: `${Math.max(4, (r.valorNum / max) * 100)}%` }}
              />
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="num text-[13px] text-[var(--color-text)] font-medium">{r.valor}</div>
            <div className="text-[11px] text-[var(--color-muted)]">{r.meta}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
