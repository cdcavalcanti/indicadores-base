import { Topbar } from '@/components/Topbar';
import { KpiCard } from '@/components/KpiCard';
import { Section } from '@/components/Section';
import { TabelaSimples } from '@/components/TabelaSimples';
import { TabelaVendedores, type VendedorLinha } from '@/components/TabelaVendedores';
import { CurvaABCVendedores } from '@/components/CurvaABCVendedores';
import { AreaFaturamento } from '@/components/charts/AreaFaturamento';
import { curvaABCVendedores } from '@/lib/abc';
import { parseFiltros, parseComparativo, temComparativoCustom, filialComparativa, diasPeriodo, CONSOLIDADO } from '@/lib/filters';
import { getKpis, getSerieDia, getKpisPorFilial, getVendedores, getVendedorSeries, getVendedorPorFilial, getProdutos, getMetaPeriodo, getProjecaoMes } from '@/lib/queries';
import { fmtBRL, fmtBRLc, fmtInt, fmtPct, variacao, nomeMes } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function Vendas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const f = parseFiltros(sp);
  const ant = parseComparativo(sp, f);
  const [kpis, kpisAntRaw, serie, porFilial, vendedores, vendSeries, vendFilial, produtos, metaMes, proj] = await Promise.all([
    getKpis(f),
    getKpis(ant),
    getSerieDia(f),
    getKpisPorFilial(f),
    getVendedores(f),
    getVendedorSeries(f),
    getVendedorPorFilial(f),
    getProdutos(f, 30),
    getMetaPeriodo(f),
    getProjecaoMes(f),
  ]);

  // Loja nova sem histórico no período comparado usa a loja de referência.
  const filComp = filialComparativa(f.filial, kpisAntRaw.faturamento_liquido === 0 && kpisAntRaw.qtd_vendas === 0);
  const kpisAnt = filComp ? await getKpis({ ...ant, filial: filComp }) : kpisAntRaw;

  const consolidado = f.filial === CONSOLIDADO;

  // Linhas da tabela de vendedores, cada uma com o detalhamento (série + quebra por filial) p/ o modal
  const vendedorRows: VendedorLinha[] = vendedores.map((v) => {
    const filialArr = consolidado ? vendFilial.get(v.nome_vendedor) ?? [] : [];
    return {
      nome: v.nome_vendedor,
      vendas: fmtInt(v.qtd_vendas),
      ticket: fmtBRL(v.ticket_medio),
      liquido: fmtBRL(v.faturamento_liquido),
      detalhe: {
        serie: vendSeries.get(v.nome_vendedor) ?? [],
        formato: 'moeda',
        agregacao: 'soma',
        breakdown:
          consolidado && filialArr.length
            ? { titulo: 'Por filial', head: ['Filial', 'Líquido'], rows: filialArr.map((x) => [x.filial, fmtBRL(x.valor)]) }
            : undefined,
        descricao: `${v.nome_vendedor}: ${fmtInt(v.qtd_vendas)} vendas · ticket ${fmtBRL(v.ticket_medio)} · devoluções ${fmtBRL(v.valor_devolucoes)} no período (líquido após devoluções).`,
      },
    };
  });

  // Quebra por filial nos modais só faz sentido no Consolidado. Com `num` (métrica somável),
  // adiciona coluna "%" de participação de cada filial no total.
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
  // período (getMetaPeriodo: soma meta_do_mês ÷ dias_do_mês por dia). Assim a meta acompanha
  // o mês do filtro — mês passado compara o realizado daquele mês; meio mês, meta pela metade.
  // projecaoMes (projeção linear do mês corrente) alimenta só o card "Faturamento Projetado".
  const realizado = kpis.faturamento_liquido;
  const projecaoMes = proj.projecao;
  const ratioMeta = metaMes > 0 ? realizado / metaMes : 0;
  const acentoProj = metaMes > 0 ? (ratioMeta >= 1 ? 'green' : ratioMeta >= 0.7 ? 'amber' : 'red') : 'blue';

  // Curva ABC dos vendedores (ranking por líquido + lente de quantidade)
  const abc = curvaABCVendedores(vendedores);

  // Devolução como % do total vendido em VALOR (faturamento_bruto = líquido + devoluções).
  const pctDevValor = kpis.faturamento_bruto > 0 ? kpis.valor_devolucoes / kpis.faturamento_bruto : 0;
  const pctDevValorAnt = kpisAnt.faturamento_bruto > 0 ? kpisAnt.valor_devolucoes / kpisAnt.faturamento_bruto : 0;

  return (
    <>
      <Topbar titulo="Vendas" filtros={f} comparativo={ant} comparativoCustom={temComparativoCustom(sp)} comparativoFilial={filComp} />
      <div className="p-7 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-4">
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
              descricao: 'Venda ao cliente final no período: TotalNota das vendas menos devoluções, DESCONTADA a transferência entre lojas (ver card "Transferências"). Por isso fica ABAIXO da coluna "Venda R$" do ERP, que soma a transferência com NF.',
            }}
          />
          <KpiCard
            label="Quantidade de Vendas"
            accent="purple"
            value={fmtInt(kpis.qtd_vendas_liquida)}
            delta={variacao(kpis.qtd_vendas_liquida, kpisAnt.qtd_vendas_liquida)}
            spark={serie.map((p) => p.qtd_vendas - p.qtd_devolucoes)}
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
            value={fmtPct(pctDevValor)}
            sub={`taxa ${fmtPct(kpis.taxa_devolucao)} · ${fmtBRL(kpis.valor_devolucoes)}`}
            delta={variacao(pctDevValor, pctDevValorAnt)}
            deltaBom="desce"
            detalhe={{
              serie: serie.map((p) => ({
                dia: p.dia,
                valor: Number(p.faturamento_bruto) > 0 ? Number(p.valor_devolucoes) / Number(p.faturamento_bruto) : 0,
              })),
              formato: 'percentual',
              agregacao: 'media',
              descricao:
                'Valor devolvido ÷ total vendido (com devoluções), em R$. O valor principal é o percentual; no subtítulo, a taxa por nota e o valor devolvido no período. Quanto menor, melhor.',
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
              descricao: `Transferências entre lojas do grupo (identificadas pelo "vendedor" TRANSFERENCIA): ${fmtInt(kpis.qtd_transferencias)} nota(s) no período. Foram REMOVIDAS do "Valor vendido" e dos demais KPIs — o total passa a refletir só a venda ao cliente final.`,
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

        <Section title="Faturamento líquido por dia">
          <AreaFaturamento data={serie} />
        </Section>

        {f.filial === CONSOLIDADO && (
          <Section title="Por filial">
            <TabelaSimples
              head={['Filial', 'Vendas', 'Bruto', 'Líquido']}
              rows={porFilial.map((r) => [r.filial, fmtInt(r.qtd_vendas - r.qtd_devolucoes), fmtBRL(r.faturamento_bruto), fmtBRL(r.faturamento_liquido)])}
              alignRightFrom={1}
            />
          </Section>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Section title={`Vendedores (${vendedores.length})`} sub="clique no nome para detalhar">
            <TabelaVendedores rows={vendedorRows} />
          </Section>
          <Section title={`Produtos (top ${produtos.length})`}>
            <TabelaSimples
              head={['Produto', 'Qtd', 'Faturamento']}
              rows={produtos.map((p) => [p.nome_produto, fmtInt(p.quantidade_vendida), fmtBRL(p.faturamento_bruto)])}
              alignRightFrom={1}
              maxH
            />
          </Section>
        </div>

        <Section
          title="Curva ABC de vendedores"
          right={
            <span className="text-[11px] text-[var(--color-muted)]">
              {diasPeriodo(f) < 14 ? '⚠ período curto pode distorcer · ' : ''}ranking por líquido · faixas 80/15/5
            </span>
          }
        >
          <CurvaABCVendedores abc={abc} />
        </Section>
      </div>
    </>
  );
}
