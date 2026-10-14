import { Topbar } from '@/components/Topbar';
import { IconCobranca } from '@/components/Icons';
import { KpiCard } from '@/components/KpiCard';
import { Section } from '@/components/Section';
import { SerieArea } from '@/components/charts/SerieArea';
import { BarCobrancaFilial } from '@/components/charts/BarCobrancaFilial';
import { TabelaSimples } from '@/components/TabelaSimples';
import { parseFiltros, parseComparativo, temComparativoCustom, filialComparativa, CONSOLIDADO } from '@/lib/filters';
import {
  getCobrancaKpis,
  getCobrancaSerie,
  getCobrancaPorTipo,
  getCobrancaPorFilial,
} from '@/lib/queries-cobranca';
import { fmtBRL, fmtBRLc, fmtInt, fmtPct, variacao } from '@/lib/format';

export const dynamic = 'force-dynamic';

const TIPO_LABEL: Record<string, string> = {
  vence_em_3_dias: 'Vence em 3 dias',
  vence_hoje: 'Vence hoje',
  vencido_ha_3_dias: 'Vencido há 3 dias',
};

// Ressalva (snapshot, não atribuição causal) reaproveitada nos modais dos cards financeiros.
const NOTA_SNAPSHOT =
  'O status do título é uma fotografia (snapshot) do momento do aviso, não atribuição causal — não significa "pagou por causa do aviso". Valores deduplicados por título (1 linha por título, status mais recente).';

export default async function CobrancaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const f = parseFiltros(sp);
  const ant = parseComparativo(sp, f);
  const [kpis, kpisAntRaw, serie, porTipo, porFilial] = await Promise.all([
    getCobrancaKpis(f),
    getCobrancaKpis(ant),
    getCobrancaSerie(f),
    getCobrancaPorTipo(f),
    getCobrancaPorFilial(f),
  ]);

  // Loja nova sem histórico no período comparado usa a loja de referência.
  const filComp = filialComparativa(f.filial, kpisAntRaw.titulos === 0 && kpisAntRaw.valor_avisado === 0);
  const kpisAnt = filComp ? await getCobrancaKpis({ ...ant, filial: filComp }) : kpisAntRaw;

  const consolidado = f.filial === CONSOLIDADO;
  const comValor = porFilial.filter((r) => r.valor_avisado > 0 || r.avisos > 0);
  // Quebra por filial nos modais só faz sentido no Consolidado. Com `num` (métrica somável),
  // adiciona coluna "%" de participação de cada filial no total.
  const quebra = (
    head: string,
    val: (r: (typeof porFilial)[number]) => string,
    num?: (r: (typeof porFilial)[number]) => number,
  ) => {
    if (!consolidado) return undefined;
    if (!num) return { titulo: 'Por filial', head: ['Filial', head], rows: comValor.map((r) => [r.filial, val(r)]) };
    const total = comValor.reduce((s, r) => s + num(r), 0);
    return {
      titulo: 'Por filial',
      head: ['Filial', head, '%'],
      alignRightFrom: 1,
      rows: comValor.map((r) => [r.filial, val(r), total > 0 ? fmtPct(num(r) / total) : '—']),
    };
  };

  const pctAvisado = (v: number) => (kpis.valor_avisado > 0 ? fmtPct(v / kpis.valor_avisado) : '—');
  /** % sobre um total (helper p/ as quebras "Por situação"/"Por estágio"). */
  const pctDe = (v: number, tot: number) => (tot > 0 ? fmtPct(v / tot) : '—');

  return (
    <>
      <Topbar titulo="Cobrança" filtros={f} comparativo={ant} comparativoCustom={temComparativoCustom(sp)} comparativoFilial={filComp} icone={<IconCobranca className="w-[22px] h-[22px] text-[var(--color-blue)]" />} />
      <div className="p-7 space-y-6">
        {/* KPIs: operação + eficácia financeira */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          <KpiCard
            label="N° de Títulos"
            accent="purple"
            value={fmtInt(kpis.titulos)}
            delta={variacao(kpis.titulos, kpisAnt.titulos)}
            deltaBom="neutro"
            sub="títulos únicos na régua"
            detalhe={{
              breakdown: {
                titulo: 'Por situação',
                head: ['Situação', 'Títulos', '%'],
                alignRightFrom: 1,
                rows: [
                  ['Em aberto', fmtInt(kpis.qtd_aberto), pctDe(kpis.qtd_aberto, kpis.titulos)],
                  ['Boletos pagos', fmtInt(kpis.qtd_pago), pctDe(kpis.qtd_pago, kpis.titulos)],
                  ['— dos quais pagos antes do envio', fmtInt(kpis.qtd_pago_antes), pctDe(kpis.qtd_pago_antes, kpis.titulos)],
                ],
              },
              descricao:
                'Títulos distintos que receberam ao menos um aviso no período, pela situação atual (snapshot). "Boletos pagos" inclui os pagos antes do envio.',
            }}
          />
          <KpiCard
            label="Avisos disparados"
            accent="blue"
            value={fmtInt(kpis.total_avisos)}
            delta={variacao(kpis.total_avisos, kpisAnt.total_avisos)}
            deltaBom="neutro"
            sub={`${fmtInt(kpis.enviados)} enviados · ${fmtInt(kpis.falhas)} falhas`}
            spark={serie.map((p) => p.avisos)}
            detalhe={{
              serie: serie.map((p) => ({ dia: p.dia, valor: p.avisos })),
              formato: 'inteiro',
              ocultarExtremos: true,
              descricao: 'Eventos da régua no período (cada disparo conta 1, mesmo título pode aparecer em mais de um marco).',
            }}
          />
          <KpiCard
            label="Taxa de entrega"
            accent="green"
            valorAccent
            value={fmtPct(kpis.taxa_entrega)}
            delta={variacao(kpis.taxa_entrega, kpisAnt.taxa_entrega)}
            sub="enviados ÷ tentativas"
            detalhe={{
              descricao: 'Avisos com envio confirmado (enviado_ok) ÷ tentativas de envio (enviado_ok + falha_meta). Ignora os "pago antes do envio".',
            }}
          />
          <KpiCard
            label="Ticket médio"
            accent="purple"
            value={fmtBRL(kpis.ticket_medio)}
            delta={variacao(kpis.ticket_medio, kpisAnt.ticket_medio)}
            deltaBom="neutro"
            sub="valor avisado ÷ títulos"
            detalhe={{ descricao: 'Valor avisado ÷ títulos únicos. ' + NOTA_SNAPSHOT }}
          />

          <KpiCard
            label="Vlr. boletos avisados"
            accent="blue"
            value={fmtBRL(kpis.valor_avisado)}
            delta={variacao(kpis.valor_avisado, kpisAnt.valor_avisado)}
            deltaBom="neutro"
            sub="carteira na régua"
            detalhe={{
              breakdown: {
                titulo: 'Por situação',
                head: ['Situação', 'Valor', '%'],
                alignRightFrom: 1,
                rows: [
                  ['Em aberto', fmtBRL(kpis.valor_aberto), pctAvisado(kpis.valor_aberto)],
                  ['Boletos pagos', fmtBRL(kpis.valor_pago), pctAvisado(kpis.valor_pago)],
                  ['— dos quais pagos antes do envio', fmtBRL(kpis.valor_pago_antes), pctAvisado(kpis.valor_pago_antes)],
                ],
              },
              descricao: 'Soma do valor dos títulos avisados (1 linha por título, status mais recente). ' + NOTA_SNAPSHOT,
            }}
          />
          <KpiCard
            label="Boletos em aberto"
            accent="amber"
            value={fmtBRL(kpis.valor_aberto)}
            delta={variacao(kpis.valor_aberto, kpisAnt.valor_aberto)}
            deltaBom="neutro"
            sub={`${fmtBRLc(kpis.valor_aberto_vencido)} vencido · ${fmtBRLc(kpis.valor_aberto_vence3d + kpis.valor_aberto_vencehoje)} a vencer`}
            detalhe={{
              breakdown: {
                titulo: 'Por estágio da régua',
                head: ['Estágio', 'Valor', '%', 'Títulos'],
                alignRightFrom: 1,
                rows: (() => {
                  const totalAberto = kpis.valor_aberto_vence3d + kpis.valor_aberto_vencehoje + kpis.valor_aberto_vencido;
                  return [
                    ['Vence em 3 dias', fmtBRL(kpis.valor_aberto_vence3d), pctDe(kpis.valor_aberto_vence3d, totalAberto), fmtInt(kpis.qtd_aberto_vence3d)],
                    ['Vence hoje', fmtBRL(kpis.valor_aberto_vencehoje), pctDe(kpis.valor_aberto_vencehoje, totalAberto), fmtInt(kpis.qtd_aberto_vencehoje)],
                    ['Vencido há 3 dias', fmtBRL(kpis.valor_aberto_vencido), pctDe(kpis.valor_aberto_vencido, totalAberto), fmtInt(kpis.qtd_aberto_vencido)],
                  ];
                })(),
              },
              descricao:
                'Valor dos títulos avisados que seguem em aberto (snapshot), separados pelo estágio da régua. "Vencido" = apenas os no aviso "vencido há 3 dias"; "vence em 3 dias" e "vence hoje" contam como a vencer. ' +
                NOTA_SNAPSHOT,
            }}
          />
          <KpiCard
            label="Boletos vencidos"
            accent="red"
            value={fmtBRL(kpis.valor_aberto_vencido)}
            delta={variacao(kpis.valor_aberto_vencido, kpisAnt.valor_aberto_vencido)}
            deltaBom="desce"
            sub={`${fmtInt(kpis.qtd_aberto_vencido)} título(s) · ${pctAvisado(kpis.valor_aberto_vencido)} do avisado`}
            detalhe={{
              descricao:
                'Valor dos títulos avisados que seguem EM ABERTO e já estão vencidos (aviso "vencido há 3 dias", snapshot). ' +
                NOTA_SNAPSHOT,
            }}
          />
          <KpiCard
            label="Boletos pagos"
            accent="green"
            value={fmtBRL(kpis.valor_pago)}
            delta={variacao(kpis.valor_pago, kpisAnt.valor_pago)}
            sub={`${pctAvisado(kpis.valor_pago)} do avisado`}
            detalhe={{
              breakdown: quebra('Boletos pagos', (r) => fmtBRL(r.valor_pago), (r) => r.valor_pago),
              descricao: 'Valor dos títulos avisados marcados como pagos (snapshot). ' + NOTA_SNAPSHOT,
            }}
          />
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Section title="Avisos por dia" sub="eventos da régua disparados no período">
            <SerieArea data={serie} dataKey="avisos" nome="Avisos" />
          </Section>
          <Section title="Carteira avisada por filial" sub="em aberto por estágio: vence em 3 dias × vence hoje × vencido (snapshot, dedup por título)">
            {comValor.length ? (
              <BarCobrancaFilial
                data={comValor.map((r) => ({
                  filial: r.filial,
                  valor_aberto_vence3d: r.valor_aberto_vence3d,
                  valor_aberto_vencehoje: r.valor_aberto_vencehoje,
                  valor_aberto_vencido: r.valor_aberto_vencido,
                }))}
              />
            ) : (
              <p className="text-sm text-[var(--color-muted)]">Sem dados no período.</p>
            )}
          </Section>
        </div>

        {/* Por tipo de aviso */}
        <Section title="Por tipo de aviso" sub="cadência e entrega por marco da régua">
          <TabelaSimples
            head={['Tipo de aviso', 'Avisos', 'Enviados', 'Não recebido', 'Pago antes']}
            alignRightFrom={1}
            rows={porTipo.map((t) => [
              TIPO_LABEL[t.tipo] ?? t.tipo,
              fmtInt(t.avisos),
              fmtInt(t.enviados),
              fmtInt(t.falhas),
              fmtInt(t.pago_antes),
            ])}
          />
        </Section>

        {/* Por filial */}
        <Section title="Por filial" sub="avisos e carteira (valores deduplicados por título)">
          <TabelaSimples
            head={['Filial', 'Avisos', 'Títulos', 'Valor avisado', 'Em aberto', 'Boletos pagos']}
            alignRightFrom={1}
            rows={comValor.map((r) => [
              r.filial,
              fmtInt(r.avisos),
              fmtInt(r.titulos),
              fmtBRL(r.valor_avisado),
              fmtBRL(r.valor_aberto),
              fmtBRL(r.valor_pago),
            ])}
          />
        </Section>
      </div>
    </>
  );
}
