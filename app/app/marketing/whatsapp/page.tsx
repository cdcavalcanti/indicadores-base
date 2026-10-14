import { Topbar } from '@/components/Topbar';
import { LogoWhatsApp } from '@/components/Icons';
import { KpiCard } from '@/components/KpiCard';
import { Section } from '@/components/Section';
import { SerieArea } from '@/components/charts/SerieArea';
import { TabelaSimples } from '@/components/TabelaSimples';
import { parseFiltros, parseComparativo, temComparativoCustom } from '@/lib/filters';
import { getMetaWhatsKpis, getMetaWhatsSerie, getMetaWhatsCampanhas, getMetaWhatsAnuncios } from '@/lib/queries-marketing';
import { fmtBRL, fmtInt, variacao } from '@/lib/format';

export const dynamic = 'force-dynamic';

const SERIE = '#D5D5DD';

export default async function WhatsAppPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const f = parseFiltros(sp);
  const ant = parseComparativo(sp, f);
  const [kpis, kpisAnt, serie, campanhas, anuncios] = await Promise.all([
    getMetaWhatsKpis(f),
    getMetaWhatsKpis(ant),
    getMetaWhatsSerie(f),
    getMetaWhatsCampanhas(f),
    getMetaWhatsAnuncios(f, 12),
  ]);

  return (
    <>
      <Topbar titulo="Campanhas WhatsApp" filtros={f} comparativo={ant} comparativoCustom={temComparativoCustom(sp)} comFilial={false} icone={<LogoWhatsApp className="w-[24px] h-[24px]" />} />
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
                rows: campanhas.map((c) => [c.campaign_name, fmtBRL(c.spend)]),
              },
              descricao: 'Investimento nas campanhas Meta Ads com prefixo [WHATS] no período.',
            }}
          />
          <KpiCard
            label="Conversas iniciadas"
            accent="green"
            value={fmtInt(kpis.acoes)}
            delta={variacao(kpis.acoes, kpisAnt.acoes)}
            spark={serie.map((p) => p.acoes)}
            detalhe={{
              serie: serie.map((p) => ({ dia: p.dia, valor: p.acoes })),
              formato: 'inteiro',
              breakdown: {
                titulo: 'Por campanha',
                head: ['Campanha', 'Conversas'],
                rows: campanhas.map((c) => [c.campaign_name, fmtInt(c.acoes)]),
              },
              descricao: 'Conversas de WhatsApp iniciadas atribuídas aos anúncios (janela de 7 dias da Meta — números de dias recentes ainda podem subir).',
            }}
          />
          <KpiCard
            label="Custo por conversa"
            accent="amber"
            value={fmtBRL(kpis.custo_acao)}
            delta={variacao(kpis.custo_acao, kpisAnt.custo_acao)}
            deltaBom="desce"
            detalhe={{
              serie: serie.map((p) => ({
                dia: p.dia,
                valor: p.acoes > 0 ? Number(p.spend) / p.acoes : 0,
              })),
              formato: 'moeda',
              agregacao: 'media',
              descricao: 'Investimento ÷ conversas iniciadas. Quanto menor, melhor. No gráfico, calculado dia a dia.',
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
              descricao: 'Exibições dos anúncios [WHATS] no período.',
            }}
          />
          <KpiCard
            label="Alcance"
            accent="pink"
            value={fmtInt(kpis.reach)}
            delta={variacao(kpis.reach, kpisAnt.reach)}
            detalhe={{
              serie: serie.map((p) => ({ dia: p.dia, valor: Number(p.reach) })),
              formato: 'inteiro',
              descricao: 'Contas únicas que viram os anúncios. A soma dos dias pode contar a mesma pessoa em dias diferentes.',
            }}
          />
          <KpiCard
            label="Cliques"
            accent="green"
            value={fmtInt(kpis.clicks)}
            delta={variacao(kpis.clicks, kpisAnt.clicks)}
            detalhe={{
              serie: serie.map((p) => ({ dia: p.dia, valor: Number(p.clicks) })),
              formato: 'inteiro',
              descricao: 'Cliques nos anúncios [WHATS] no período.',
            }}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Section title="Conversas iniciadas por dia" sub="janela de atribuição de 7 dias">
            <SerieArea data={serie} dataKey="acoes" nome="Conversas" cor={SERIE} />
          </Section>
          <Section title="Investimento por dia">
            <SerieArea data={serie} dataKey="spend" nome="Investimento" moeda />
          </Section>
        </div>

        <Section title={`Campanhas (${campanhas.length})`} sub="campanhas Meta Ads com prefixo [WHATS]">
          <TabelaSimples
            head={['Campanha', 'Anúncios', 'Investimento', 'Conversas', 'Custo/Conversa', 'Impressões', 'Alcance', 'Cliques']}
            rows={campanhas.map((c) => [
              c.campaign_name,
              fmtInt(c.anuncios),
              fmtBRL(c.spend),
              fmtInt(c.acoes),
              fmtBRL(c.custo_acao),
              fmtInt(c.impressions),
              fmtInt(c.reach),
              fmtInt(c.clicks),
            ])}
            maxH
          />
        </Section>

        <Section
          title="Melhores anúncios"
          sub="criativo, investimento e conversas por anúncio"
          right={<span className="text-[11px] text-[var(--color-muted)]">ordenado por conversas</span>}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {anuncios.map((a) => (
              <div key={a.ad_id} className="card card-hover overflow-hidden">
                <div className="relative h-[180px] bg-[var(--color-surface-3)]">
                  {a.imagem ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.imagem} alt="" loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[var(--color-muted)] text-[12px]">
                      sem imagem do criativo
                    </div>
                  )}
                  <span className="absolute top-2 left-2 max-w-[85%] truncate text-[10px] uppercase tracking-[0.1em] bg-black/60 backdrop-blur px-2 py-0.5 rounded-full text-white">
                    {a.campaign_name.replace('[WHATS]', '').trim()}
                  </span>
                </div>
                <div className="p-4">
                  <p className="text-[12.5px] text-[var(--color-subtle)] line-clamp-2 min-h-[2.4em]">{a.ad_name}</p>
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <div>
                      <div className="label-caps text-[9px]">Investimento</div>
                      <div className="num text-[13px] text-[var(--color-text)] mt-0.5">{fmtBRL(a.spend)}</div>
                    </div>
                    <div>
                      <div className="label-caps text-[9px]">Conversas</div>
                      <div className="num text-[13px] mt-0.5" style={{ color: SERIE }}>{fmtInt(a.acoes)}</div>
                    </div>
                    <div>
                      <div className="label-caps text-[9px]">Custo/Conv.</div>
                      <div className="num text-[13px] text-[var(--color-text)] mt-0.5">
                        {a.acoes > 0 ? fmtBRL(a.custo_acao) : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {!anuncios.length && <p className="text-sm text-[var(--color-muted)]">Sem anúncios no período.</p>}
          </div>
        </Section>
      </div>
    </>
  );
}
