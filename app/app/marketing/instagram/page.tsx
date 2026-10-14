import { Topbar } from '@/components/Topbar';
import { LogoInstagram } from '@/components/Icons';
import { KpiCard } from '@/components/KpiCard';
import { Section } from '@/components/Section';
import { SerieArea } from '@/components/charts/SerieArea';
import { TabelaSimples } from '@/components/TabelaSimples';
import { SortButtons } from '@/components/SortButtons';
import { parseFiltros, parseComparativo, temComparativoCustom } from '@/lib/filters';
import { getIgKpis, getIgSerie, getIgTopPosts, getIgPorTipo, getIgSeguidores, type IgPostOrd } from '@/lib/queries-marketing';
import { fmtInt, fmtData, variacao } from '@/lib/format';

export const dynamic = 'force-dynamic';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function InstagramPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const f = parseFiltros(sp);
  const ant = parseComparativo(sp, f);

  // Ordenação dos "Melhores posts" por URL (mantém os filtros). Whitelist; default = engajamento.
  const ordPostKey = one(sp.ordPost);
  const ordPost: IgPostOrd = ordPostKey === 'recentes' ? 'recentes' : 'engajamento';

  const [kpis, kpisAnt, serie, top, porTipo, seguidores] = await Promise.all([
    getIgKpis(f),
    getIgKpis(ant),
    getIgSerie(f),
    getIgTopPosts(f, 12, ordPost),
    getIgPorTipo(f),
    getIgSeguidores(f),
  ]);

  return (
    <>
      <Topbar titulo="Instagram" filtros={f} comparativo={ant} comparativoCustom={temComparativoCustom(sp)} comFilial={false} icone={<LogoInstagram className="w-[24px] h-[24px]" />} />
      <div className="p-7 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <KpiCard
            label="Posts"
            accent="purple"
            value={fmtInt(kpis.posts)}
            delta={variacao(kpis.posts, kpisAnt.posts)}
            detalhe={{
              serie: serie.map((p) => ({ dia: p.dia, valor: p.posts })),
              formato: 'inteiro',
              descricao: 'Posts publicados no período. A série é agrupada por semana (data de início da semana).',
            }}
          />
          <KpiCard
            label="Curtidas"
            accent="pink"
            value={fmtInt(kpis.likes)}
            delta={variacao(kpis.likes, kpisAnt.likes)}
            detalhe={{
              serie: serie.map((p) => ({ dia: p.dia, valor: p.likes })),
              formato: 'inteiro',
              descricao: 'Curtidas acumuladas dos posts publicados no período. A série é agrupada por semana.',
            }}
          />
          <KpiCard
            label="Comentários"
            accent="blue"
            value={fmtInt(kpis.comments)}
            delta={variacao(kpis.comments, kpisAnt.comments)}
            detalhe={{
              serie: serie.map((p) => ({ dia: p.dia, valor: p.comments })),
              formato: 'inteiro',
              descricao: 'Comentários acumulados dos posts publicados no período. A série é agrupada por semana.',
            }}
          />
          <KpiCard
            label="Alcance"
            accent="green"
            value={kpis.reach > 0 ? fmtInt(kpis.reach) : '—'}
            sub={kpis.reach === 0 ? 'requer insights da API' : undefined}
            detalhe={{
              descricao: 'Contas únicas alcançadas pelos posts do período (insights da API do Instagram). Posts antigos podem não ter o dado.',
            }}
          />
          <KpiCard
            label="Salvos"
            accent="amber"
            value={kpis.saved > 0 ? fmtInt(kpis.saved) : '—'}
            detalhe={{
              descricao: 'Quantas vezes os posts do período foram salvos (insights da API do Instagram).',
            }}
          />
          <KpiCard
            label="Seguidores ganhos"
            accent="green"
            value={fmtInt(seguidores.ganhos_periodo)}
            sub={seguidores.total_atual != null ? `total atual: ${fmtInt(seguidores.total_atual)}` : 'no período'}
            detalhe={{
              serie: seguidores.serie.map((p) => ({ dia: p.dia, valor: p.ganhos })),
              formato: 'inteiro',
              descricao: 'Novos seguidores por dia (follower_count da API). O histórico acumula a partir de mai/2026 — limite de 30 dias retroativos da API.',
            }}
          />
        </div>

        {/* Storytelling: primeiro o pulso diário (crescimento de audiência)... */}
        <Section
          title="Seguidores ganhos por dia"
          right={<span className="text-[11px] text-[var(--color-muted)]">histórico acumula a partir de mai/2026 (limite da API: 30 dias retroativos)</span>}
        >
          <SerieArea data={seguidores.serie} dataKey="ganhos" nome="Seguidores" cor="#D5D5DD" height={220} />
        </Section>

        {/* ...depois a leitura semanal de engajamento + composição por tipo de conteúdo */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <Section title="Curtidas por semana" className="xl:col-span-2">
            <SerieArea data={serie} dataKey="likes" nome="Curtidas" cor="#F4F1EA" />
          </Section>
          <Section title="Por tipo de conteúdo">
            <TabelaSimples
              head={['Tipo', 'Posts', 'Curtidas']}
              rows={porTipo.map((t) => [t.tipo, fmtInt(t.posts), fmtInt(t.likes)])}
            />
          </Section>
        </div>

        <Section
          title="Melhores posts do período"
          right={
            <SortButtons
              param="ordPost"
              active={ordPost}
              dir="desc"
              options={[
                { key: 'engajamento', label: 'Engajamento' },
                { key: 'recentes', label: 'Mais recentes' },
              ]}
            />
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {top.map((p) => (
              <a
                key={p.id}
                href={p.permalink ?? '#'}
                target="_blank"
                rel="noreferrer"
                className="card card-hover overflow-hidden block"
              >
                <div className="relative h-[180px] bg-[var(--color-surface-3)]">
                  {p.tem_imagem || p.imagem ? (
                    // Prefere a imagem guardada no banco (nunca expira); cai na URL do CDN se
                    // ainda não baixamos (posts recentes). eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.tem_imagem ? `/api/ig-image/${p.id}` : p.imagem!}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[var(--color-muted)] text-2xl">
                      ◎
                    </div>
                  )}
                  <span className="absolute top-2 left-2 text-[10px] uppercase tracking-[0.14em] bg-black/60 backdrop-blur px-2 py-0.5 rounded-full text-white">
                    {p.media_product_type ?? p.media_type ?? 'POST'}
                  </span>
                  <span className="absolute top-2 right-2 text-[10.5px] bg-black/60 backdrop-blur px-2 py-0.5 rounded-full text-white/80">
                    {fmtData(p.timestamp.slice(0, 10))}
                  </span>
                </div>
                <div className="p-4">
                  <p className="text-[12.5px] text-[var(--color-subtle)] line-clamp-2 min-h-[2.4em]">
                    {p.caption ?? '(sem legenda)'}
                  </p>
                  <div className="flex gap-4 mt-3 text-[12px]">
                    <span className="num text-[var(--color-pink)]">♥ {fmtInt(p.like_count ?? 0)}</span>
                    <span className="num text-[var(--color-blue)]">💬 {fmtInt(p.comments_count ?? 0)}</span>
                    {p.reach != null && <span className="num text-[var(--color-pos)]">⊙ {fmtInt(p.reach)}</span>}
                    {p.saved != null && <span className="num text-[var(--color-amber)]">⚑ {fmtInt(p.saved)}</span>}
                  </div>
                </div>
              </a>
            ))}
            {!top.length && <p className="text-sm text-[var(--color-muted)]">Sem posts no período.</p>}
          </div>
        </Section>
      </div>
    </>
  );
}
