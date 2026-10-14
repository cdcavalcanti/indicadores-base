import { Topbar } from '@/components/Topbar';
import { LogoMeta } from '@/components/Icons';
import { KpiCard } from '@/components/KpiCard';
import { Section } from '@/components/Section';
import { SerieArea } from '@/components/charts/SerieArea';
import { TabelaSimples } from '@/components/TabelaSimples';
import { parseFiltros, parseComparativo, temComparativoCustom } from '@/lib/filters';
import {
  getMetaKpis,
  getMetaSerie,
  getMetaCampanhas,
  getMetaMsgKpis,
  getMetaMsgSerie,
  getMetaEngKpis,
  getMetaEngSerie,
  getMetaEngCampanhas,
} from '@/lib/queries-marketing';
import { fmtBRL, fmtInt, fmtPct, variacao } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** Separador de bloco temático dentro da página. */
function GrupoTitulo({ titulo, sub }: { titulo: string; sub?: string }) {
  return (
    <div className="flex items-baseline gap-3 pt-3">
      <h2 className="text-[15px] font-semibold text-[var(--color-text)] whitespace-nowrap">{titulo}</h2>
      {sub && <span className="text-[11.5px] text-[var(--color-muted)] whitespace-nowrap">{sub}</span>}
      <span className="h-px flex-1 self-center bg-[var(--color-border-soft)]" />
    </div>
  );
}

export default async function MetaAdsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const f = parseFiltros(sp);
  const ant = parseComparativo(sp, f);
  const [kpis, kpisAnt, serie, campanhas, msg, msgAnt, msgSerie, eng, engAnt, engSerie, engCampanhas] = await Promise.all([
    getMetaKpis(f),
    getMetaKpis(ant),
    getMetaSerie(f),
    getMetaCampanhas(f),
    getMetaMsgKpis(f),
    getMetaMsgKpis(ant),
    getMetaMsgSerie(f),
    getMetaEngKpis(f),
    getMetaEngKpis(ant),
    getMetaEngSerie(f),
    getMetaEngCampanhas(f),
  ]);

  return (
    <>
      <Topbar titulo="Meta Ads" filtros={f} comparativo={ant} comparativoCustom={temComparativoCustom(sp)} comFilial={false} icone={<LogoMeta className="w-[24px] h-[24px]" />} />
      <div className="p-7 space-y-6">
        {/* ---------- Visão geral da conta ---------- */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
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
              descricao: 'Total investido na conta de anúncios da Meta (Facebook + Instagram) no período.',
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
              descricao: 'Quantas vezes os anúncios foram exibidos (a mesma pessoa pode ver mais de uma vez).',
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
              descricao: 'Cliques nos anúncios (todos os tipos de clique contados pela Meta).',
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
            label="Custo por mensagem"
            accent="green"
            value={fmtBRL(msg.custo_msg)}
            delta={variacao(msg.custo_msg, msgAnt.custo_msg)}
            deltaBom="desce"
            spark={msgSerie.map((p) => p.custo_msg)}
            detalhe={{
              serie: msgSerie.map((p) => ({ dia: p.dia, valor: p.custo_msg })),
              formato: 'moeda',
              agregacao: 'media',
              descricao: `Investimento total da conta ÷ conversas de mensagem iniciadas (${fmtInt(msg.mensagens)} no período). Base misturada da conta toda; quanto menor, melhor. No gráfico, calculado dia a dia.`,
            }}
          />
          <KpiCard
            label="Alcance"
            accent="blue"
            value={fmtInt(kpis.reach)}
            delta={variacao(kpis.reach, kpisAnt.reach)}
            detalhe={{
              serie: serie.map((p) => ({ dia: p.dia, valor: Number(p.reach ?? 0) })),
              formato: 'inteiro',
              descricao: 'Contas únicas que viram os anúncios. A soma dos dias pode contar a mesma pessoa em dias diferentes.',
            }}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Section title="Investimento por dia">
            <SerieArea data={serie} dataKey="spend" nome="Investimento" moeda />
          </Section>
          <Section title="Cliques por dia">
            <SerieArea data={serie} dataKey="clicks" nome="Cliques" cor="#D5D5DD" />
          </Section>
        </div>

        <Section title={`Campanhas (${campanhas.length})`}>
          <TabelaSimples
            head={['Campanha', 'Investimento', 'Impressões', 'Cliques', 'CTR', 'CPC']}
            rows={campanhas.map((c) => [
              c.campaign_name,
              fmtBRL(c.spend),
              fmtInt(c.impressions),
              fmtInt(c.clicks),
              fmtPct(c.ctr),
              fmtBRL(c.cpc),
            ])}
            maxH
          />
        </Section>

        {/* Campanhas WhatsApp têm aba própria: /marketing/whatsapp */}

        {/* ---------- Engajamento de perfil ---------- */}
        <GrupoTitulo titulo="Engajamento de perfil" sub="campanhas [PERFIL] · post engagement" />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="Investimento perfil"
            accent="purple"
            value={fmtBRL(eng.spend)}
            delta={variacao(eng.spend, engAnt.spend)}
            deltaBom="neutro"
            detalhe={{
              serie: engSerie.map((p) => ({ dia: p.dia, valor: Number(p.spend) })),
              formato: 'moeda',
              descricao: 'Investimento nas campanhas de engajamento de perfil (prefixo [PERFIL]).',
            }}
          />
          <KpiCard
            label="Engajamento"
            accent="purple"
            value={fmtInt(eng.acoes)}
            delta={variacao(eng.acoes, engAnt.acoes)}
            spark={engSerie.map((p) => p.acoes)}
            detalhe={{
              serie: engSerie.map((p) => ({ dia: p.dia, valor: p.acoes })),
              formato: 'inteiro',
              descricao: 'Ações de engajamento nos posts (post_engagement da Meta): reações, comentários, compartilhamentos, cliques.',
            }}
          />
          <KpiCard
            label="Custo por engajamento"
            accent="amber"
            value={fmtBRL(eng.custo_acao)}
            delta={variacao(eng.custo_acao, engAnt.custo_acao)}
            deltaBom="desce"
            detalhe={{
              serie: engSerie.map((p) => ({
                dia: p.dia,
                valor: p.acoes > 0 ? Number(p.spend) / p.acoes : 0,
              })),
              formato: 'moeda',
              agregacao: 'media',
              descricao: 'Investimento ÷ engajamentos. Quanto menor, melhor. No gráfico, calculado dia a dia.',
            }}
          />
          <KpiCard
            label="Impressões"
            accent="blue"
            value={fmtInt(eng.impressions)}
            delta={variacao(eng.impressions, engAnt.impressions)}
            detalhe={{
              serie: engSerie.map((p) => ({ dia: p.dia, valor: Number(p.impressions) })),
              formato: 'inteiro',
              descricao: 'Exibições dos anúncios das campanhas de perfil no período.',
            }}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Section title="Engajamento por dia">
            <SerieArea data={engSerie} dataKey="acoes" nome="Engajamento" cor="#F4F1EA" height={240} />
          </Section>
          <Section title={`Campanhas de perfil (${engCampanhas.length})`}>
            <TabelaSimples
              head={['Campanha', 'Anúncios', 'Investimento', 'Engajamento', 'Custo/Eng.']}
              rows={engCampanhas.map((c) => [
                c.campaign_name,
                fmtInt(c.anuncios),
                fmtBRL(c.spend),
                fmtInt(c.acoes),
                fmtBRL(c.custo_acao),
              ])}
              maxH
            />
          </Section>
        </div>
      </div>
    </>
  );
}
