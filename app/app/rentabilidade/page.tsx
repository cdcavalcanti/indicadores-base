import { Topbar } from '@/components/Topbar';
import { KpiCard } from '@/components/KpiCard';
import { Section } from '@/components/Section';
import { TabelaSimples } from '@/components/TabelaSimples';
import { SortButtons } from '@/components/SortButtons';
import { MargemSerie } from '@/components/charts/MargemSerie';
import { BarMargemFiliais } from '@/components/charts/BarMargemFiliais';
import { parseFiltros, parseComparativo, temComparativoCustom, filialComparativa, CONSOLIDADO } from '@/lib/filters';
import {
  getRentabilidade,
  getRentabilidadePorFilial,
  getRentabilidadeSerieDia,
  getProdutosRentabilidade,
  type ProdutoOrd,
} from '@/lib/queries';
import { fmtBRL, fmtInt, fmtPct, variacao } from '@/lib/format';

export const dynamic = 'force-dynamic';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Ordenação "Rentabilidade por filial" (key -> rótulo do botão e campo do array).
const ORD_FIL = {
  receita: 'Receita',
  custo: 'Custo',
  lucro: 'Lucro',
  margem_lucro: 'Margem lucro',
  desconto: 'Desconto',
  margem_desconto: 'Margem desc.',
} as const;
type OrdFil = keyof typeof ORD_FIL;

// Ordenação "Top produtos" (key -> rótulo do botão).
const ORD_PROD: Record<ProdutoOrd, string> = { qtd: 'Qtd', receita: 'Receita', margem: 'Margem', lucro: 'Lucro' };
const ORD_PROD_SUB: Record<ProdutoOrd, string> = { qtd: 'quantidade', receita: 'receita', margem: 'margem', lucro: 'lucro' };

export default async function Rentabilidade({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const f = parseFiltros(sp);
  const ant = parseComparativo(sp, f);

  // Ordenação por URL (mantém os filtros). Validada contra a whitelist; default = padrão atual.
  const ordFilKey = one(sp.ordFil);
  const ordFil: OrdFil = ordFilKey && ordFilKey in ORD_FIL ? (ordFilKey as OrdFil) : 'receita';
  const dirFil: 'asc' | 'desc' = one(sp.ordFilDir) === 'asc' ? 'asc' : 'desc';
  const ordProdKey = one(sp.ordProd);
  const ordProd: ProdutoOrd = ordProdKey && ordProdKey in ORD_PROD ? (ordProdKey as ProdutoOrd) : 'lucro';
  const dirProd: 'asc' | 'desc' = one(sp.ordProdDir) === 'asc' ? 'asc' : 'desc';

  const [rent, rentAntRaw, serie, porFilial, produtos] = await Promise.all([
    getRentabilidade(f),
    getRentabilidade(ant),
    getRentabilidadeSerieDia(f),
    getRentabilidadePorFilial(f),
    getProdutosRentabilidade(f, 10, ordProd, dirProd),
  ]);

  // Loja nova sem histórico no período comparado usa a loja de referência.
  const filComp = filialComparativa(f.filial, rentAntRaw.receita === 0);
  const rentAnt = filComp ? await getRentabilidade({ ...ant, filial: filComp }) : rentAntRaw;

  const consolidado = f.filial === CONSOLIDADO;
  // Quebra por filial nos modais só faz sentido no Consolidado (e só filiais com receita)
  const comReceita = porFilial.filter((r) => r.receita > 0);
  // Cópia ordenada só para a tabela (gráfico e modais seguem sua própria ordem).
  const comReceitaOrd = [...comReceita].sort((a, b) => {
    const d = a[ordFil] - b[ordFil];
    return dirFil === 'asc' ? d : -d;
  });
  // Com `num` (métrica somável), adiciona coluna "%" de participação de cada filial no total.
  const quebra = (
    head: string,
    val: (r: (typeof porFilial)[number]) => string,
    num?: (r: (typeof porFilial)[number]) => number,
  ) => {
    if (!consolidado) return undefined;
    if (!num) return { titulo: 'Por filial', head: ['Filial', head], rows: comReceita.map((r) => [r.filial, val(r)]) };
    const total = comReceita.reduce((s, r) => s + num(r), 0);
    return {
      titulo: 'Por filial',
      head: ['Filial', head, '%'],
      alignRightFrom: 1,
      rows: comReceita.map((r) => [r.filial, val(r), total > 0 ? fmtPct(num(r) / total) : '—']),
    };
  };

  return (
    <>
      <Topbar titulo="Rentabilidade" filtros={f} comparativo={ant} comparativoCustom={temComparativoCustom(sp)} comparativoFilial={filComp} />
      <div className="p-7 space-y-6">
        {/* KPIs com variação vs período anterior */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <KpiCard
            label="Receita líquida"
            accent="green"
            value={fmtBRL(rent.receita)}
            delta={variacao(rent.receita, rentAnt.receita)}
            spark={serie.map((p) => p.receita)}
            detalhe={{
              serie: serie.map((p) => ({ dia: p.dia, valor: p.receita })),
              formato: 'moeda',
              breakdown: quebra('Receita', (r) => fmtBRL(r.receita), (r) => r.receita),
              descricao: 'Faturamento líquido das notas (mesma base da tela Vendas e do ERP): vendas − devoluções no período.',
            }}
          />
          <KpiCard
            label="Custo das vendas"
            accent="amber"
            deltaBom="neutro"
            value={fmtBRL(rent.custo)}
            delta={variacao(rent.custo, rentAnt.custo)}
            spark={serie.map((p) => p.custo)}
            detalhe={{
              serie: serie.map((p) => ({ dia: p.dia, valor: p.custo })),
              formato: 'moeda',
              breakdown: quebra('Custo', (r) => fmtBRL(r.custo), (r) => r.custo),
              descricao: 'Soma do Custo × Quantidade dos itens (custo de mercadoria), líquido das devoluções. Base para a margem de lucro.',
            }}
          />
          <KpiCard
            label="Lucro bruto"
            accent="green"
            value={fmtBRL(rent.lucro)}
            delta={variacao(rent.lucro, rentAnt.lucro)}
            spark={serie.map((p) => p.lucro)}
            detalhe={{
              serie: serie.map((p) => ({ dia: p.dia, valor: p.lucro })),
              formato: 'moeda',
              breakdown: quebra('Lucro', (r) => fmtBRL(r.lucro), (r) => r.lucro),
              descricao: 'Receita líquida − custo das vendas.',
            }}
          />
          <KpiCard
            label="Margem de lucro"
            accent="blue"
            valorAccent
            value={fmtPct(rent.margem_lucro)}
            delta={variacao(rent.margem_lucro, rentAnt.margem_lucro)}
            spark={serie.map((p) => p.margem_lucro)}
            detalhe={{
              serie: serie.map((p) => ({ dia: p.dia, valor: p.margem_lucro })),
              formato: 'percentual',
              agregacao: 'media',
              breakdown: quebra('Margem', (r) => fmtPct(r.margem_lucro)),
              descricao: 'Lucro bruto ÷ receita líquida. Quanto de cada real vendido sobra após o custo da mercadoria.',
            }}
          />
          <KpiCard
            label="Desconto concedido"
            accent="pink"
            deltaBom="desce"
            value={fmtBRL(rent.desconto)}
            delta={variacao(rent.desconto, rentAnt.desconto)}
            detalhe={{
              breakdown: quebra('Desconto', (r) => fmtBRL(r.desconto), (r) => r.desconto),
              descricao:
                `Valor de tabela (${fmtBRL(rent.valor_tabela)}) − receita líquida (${fmtBRL(rent.receita)}). ` +
                'Quanto foi abatido do preço de tabela nas vendas do período.',
            }}
          />
          <KpiCard
            label="Margem de desconto"
            accent="amber"
            deltaBom="desce"
            value={fmtPct(rent.margem_desconto)}
            delta={variacao(rent.margem_desconto, rentAnt.margem_desconto)}
            spark={serie.map((p) => p.margem_desconto)}
            detalhe={{
              serie: serie.map((p) => ({ dia: p.dia, valor: p.margem_desconto })),
              formato: 'percentual',
              agregacao: 'media',
              breakdown: quebra('Margem desc.', (r) => fmtPct(r.margem_desconto)),
              descricao: 'Desconto concedido ÷ valor de tabela. O quanto, em média, se desconta sobre a tabela. Menor é melhor.',
            }}
          />
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <Section title="Margem ao longo do período" sub="lucro × desconto, por dia" className="xl:col-span-2">
            <MargemSerie data={serie} />
          </Section>
          <Section title="Margem de lucro por filial">
            <BarMargemFiliais
              data={[...comReceita]
                .sort((a, b) => b.margem_lucro - a.margem_lucro)
                .map((r) => ({ filial: r.filial, margem_lucro: r.margem_lucro }))}
            />
          </Section>
        </div>

        {/* Tabela por filial */}
        <Section
          title="Rentabilidade por filial"
          sub="receita, custo, lucro e margens no período"
          right={
            <SortButtons
              param="ordFil"
              active={ordFil}
              dir={dirFil}
              options={Object.entries(ORD_FIL).map(([key, label]) => ({ key, label }))}
            />
          }
        >
          <TabelaSimples
            head={['Filial', 'Receita', 'Custo', 'Lucro', 'Margem lucro', 'Desconto', 'Margem desc.']}
            alignRightFrom={1}
            rows={comReceitaOrd.map((r) => [
              r.filial,
              fmtBRL(r.receita),
              fmtBRL(r.custo),
              fmtBRL(r.lucro),
              fmtPct(r.margem_lucro),
              fmtBRL(r.desconto),
              fmtPct(r.margem_desconto),
            ])}
          />
        </Section>

        {/* Top produtos */}
        <Section
          title="Top produtos"
          sub={`top ${produtos.length} por ${ORD_PROD_SUB[ordProd]} no período`}
          right={
            <SortButtons
              param="ordProd"
              active={ordProd}
              dir={dirProd}
              options={(Object.entries(ORD_PROD) as [ProdutoOrd, string][]).map(([key, label]) => ({ key, label }))}
            />
          }
        >
          <TabelaSimples
            head={['Produto', 'Qtd', 'Receita', 'Margem', 'Lucro']}
            alignRightFrom={1}
            rows={produtos.map((p) => [
              p.nome_produto ?? p.codigo_produto,
              fmtInt(p.quantidade_vendida),
              fmtBRL(p.receita),
              fmtPct(p.margem_lucro),
              fmtBRL(p.lucro),
            ])}
          />
        </Section>
      </div>
    </>
  );
}
