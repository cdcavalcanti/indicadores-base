import { Topbar } from '@/components/Topbar';
import { LogoGoogleAds } from '@/components/Icons';
import { KpiCard } from '@/components/KpiCard';
import { Section } from '@/components/Section';
import { SerieArea } from '@/components/charts/SerieArea';
import { TabelaSimples } from '@/components/TabelaSimples';
import { parseFiltros, parseComparativo, temComparativoCustom } from '@/lib/filters';
import {
  getGadsKpis,
  getGadsSerie,
  getGadsCampanhas,
  getGadsKeywords,
  getGadsTermos,
} from '@/lib/queries-marketing';
import { fmtBRL, fmtInt, fmtPct, fmtDec, variacao } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function GoogleAdsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const f = parseFiltros(sp);
  const ant = parseComparativo(sp, f);
  const [kpis, kpisAnt, serie, campanhas, keywords, termos] = await Promise.all([
    getGadsKpis(f),
    getGadsKpis(ant),
    getGadsSerie(f),
    getGadsCampanhas(f),
    getGadsKeywords(f, 25),
    getGadsTermos(f, 25),
  ]);

  return (
    <>
      <Topbar titulo="Google Ads" filtros={f} comparativo={ant} comparativoCustom={temComparativoCustom(sp)} comFilial={false} icone={<LogoGoogleAds className="w-[24px] h-[24px]" />} />
      <div className="p-7 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <KpiCard
            label="Investimento"
            accent="blue"
            value={fmtBRL(kpis.spend)}
            delta={variacao(kpis.spend, kpisAnt.spend)}
            deltaBom="neutro"
            spark={serie.map((p) => Number(p.spend))}
            detalhe={{
              serie: serie.map((p) => ({ dia: p.dia, valor: Number(p.spend) })),
              formato: 'moeda',
              breakdown: {
                titulo: 'Por campanha',
                head: ['Campanha', 'Investimento'],
                rows: campanhas.slice(0, 8).map((c) => [c.campaign_name, fmtBRL(c.spend)]),
              },
              descricao: 'Total investido na conta do Google Ads no período.',
            }}
          />
          <KpiCard
            label="Impressões"
            accent="purple"
            value={fmtInt(kpis.impressions)}
            delta={variacao(kpis.impressions, kpisAnt.impressions)}
            detalhe={{
              serie: serie.map((p) => ({ dia: p.dia, valor: Number(p.impressions) })),
              formato: 'inteiro',
              descricao: 'Quantas vezes os anúncios foram exibidos nas redes do Google.',
            }}
          />
          <KpiCard
            label="Cliques"
            accent="green"
            value={fmtInt(kpis.clicks)}
            delta={variacao(kpis.clicks, kpisAnt.clicks)}
            spark={serie.map((p) => Number(p.clicks))}
            detalhe={{
              serie: serie.map((p) => ({ dia: p.dia, valor: Number(p.clicks) })),
              formato: 'inteiro',
              descricao: 'Cliques nos anúncios no período.',
            }}
          />
          <KpiCard
            label="CTR"
            accent="amber"
            value={fmtPct(kpis.ctr)}
            delta={variacao(kpis.ctr, kpisAnt.ctr)}
            detalhe={{
              serie: serie.map((p) => ({
                dia: p.dia,
                valor: Number(p.impressions) > 0 ? Number(p.clicks) / Number(p.impressions) : 0,
              })),
              formato: 'percentual',
              agregacao: 'media',
              descricao: 'Taxa de cliques: cliques ÷ impressões. No gráfico, calculada dia a dia.',
            }}
          />
          <KpiCard
            label="CPC"
            accent="pink"
            value={fmtBRL(kpis.cpc)}
            delta={variacao(kpis.cpc, kpisAnt.cpc)}
            deltaBom="desce"
            detalhe={{
              serie: serie.map((p) => ({
                dia: p.dia,
                valor: Number(p.clicks) > 0 ? Number(p.spend) / Number(p.clicks) : 0,
              })),
              formato: 'moeda',
              agregacao: 'media',
              descricao: 'Custo por clique: investimento ÷ cliques. Quanto menor, melhor. No gráfico, calculado dia a dia.',
            }}
          />
          <KpiCard
            label="Conversões"
            accent="green"
            value={fmtDec(kpis.conversions)}
            sub={kpis.conversionsValue > 0 ? fmtBRL(kpis.conversionsValue) : undefined}
            delta={variacao(kpis.conversions, kpisAnt.conversions)}
            detalhe={{
              serie: serie.map((p) => ({ dia: p.dia, valor: Number(p.conversions ?? 0) })),
              formato: 'decimal',
              breakdown: {
                titulo: 'Por campanha',
                head: ['Campanha', 'Conversões'],
                rows: campanhas.slice(0, 8).map((c) => [c.campaign_name, fmtDec(c.conversions)]),
              },
              descricao: 'Conversões registradas pelo Google Ads (podem ser fracionárias por causa da atribuição entre campanhas).',
            }}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Section title="Investimento por dia">
            <SerieArea data={serie} dataKey="spend" nome="Investimento" cor="#D5D5DD" moeda />
          </Section>
          <Section title="Cliques por dia">
            <SerieArea data={serie} dataKey="clicks" nome="Cliques" cor="#F4F1EA" />
          </Section>
        </div>

        <Section title={`Campanhas (${campanhas.length})`}>
          <TabelaSimples
            head={['Campanha', 'Canal', 'Investimento', 'Impressões', 'Cliques', 'Conversões']}
            rows={campanhas.map((c) => [
              c.campaign_name,
              c.channel_type ?? '—',
              fmtBRL(c.spend),
              fmtInt(c.impressions),
              fmtInt(c.clicks),
              fmtDec(c.conversions),
            ])}
            alignRightFrom={2}
            maxH
          />
        </Section>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Section title="Palavras-chave (top por cliques)">
            <TabelaSimples
              head={['Palavra-chave', 'Impressões', 'Cliques', 'Custo']}
              rows={keywords.map((k) => [k.keyword_text, fmtInt(k.impressions), fmtInt(k.clicks), fmtBRL(k.cost)])}
              maxH
            />
          </Section>
          <Section title="Termos de busca (top por cliques)">
            <TabelaSimples
              head={['Termo buscado', 'Impressões', 'Cliques', 'Custo']}
              rows={termos.map((t) => [t.search_term, fmtInt(t.impressions), fmtInt(t.clicks), fmtBRL(t.cost)])}
              maxH
            />
          </Section>
        </div>
      </div>
    </>
  );
}
