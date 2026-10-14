import { fmtBRL, fmtBRLc, fmtInt, fmtPct } from '@/lib/format';
import type { CurvaABCResult, ClasseABC } from '@/lib/abc';
import { ParetoVendedores } from './charts/ParetoVendedores';

const CORES: Record<ClasseABC, string> = {
  A: 'var(--color-pos)',
  B: 'var(--color-amber)',
  C: 'var(--color-subtle)',
};

function Badge({ c }: { c: ClasseABC }) {
  const cor = CORES[c];
  return (
    <span
      className="num inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-bold"
      style={{ color: cor, background: `color-mix(in srgb, ${cor} 16%, transparent)` }}
    >
      {c}
    </span>
  );
}

export function CurvaABCVendedores({ abc }: { abc: CurvaABCResult }) {
  const { linhas, resumo } = abc;
  if (!linhas.length) return <p className="text-sm text-[var(--color-muted)]">Sem vendedores no período.</p>;

  const pareto = linhas.map((l) => ({
    nome: l.nome,
    liquido: l.faturamento_liquido,
    acumulado: Number((l.acumulado * 100).toFixed(2)),
    classe: l.classe,
  }));

  return (
    <div className="space-y-5">
      {/* Resumo A/B/C */}
      <div className="grid grid-cols-3 gap-4">
        {resumo.map((r) => (
          <div key={r.classe} className="card p-4">
            <div className="flex items-center justify-between">
              <span className="label-caps">Classe {r.classe}</span>
              <Badge c={r.classe} />
            </div>
            <div className="num mt-2.5 text-[19px] font-semibold text-[var(--color-text)] leading-none">
              {fmtInt(r.vendedores)} <span className="text-[12px] text-[var(--color-muted)] font-normal">vend.</span>
            </div>
            <div className="text-[11.5px] text-[var(--color-muted)] mt-2">
              {fmtPct(r.partFaturamento)} do líquido · {fmtBRLc(r.faturamento)}
            </div>
          </div>
        ))}
      </div>

      {/* Curva de Pareto */}
      <ParetoVendedores data={pareto} />

      {/* Tabela detalhada */}
      <div className="max-h-[460px] overflow-y-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 z-[1]">
            <tr className="bg-[var(--color-surface-2)] text-[var(--color-muted)] text-[10.5px] uppercase tracking-[0.12em]">
              <th className="py-2.5 px-2 pl-3 text-left rounded-l-lg">#</th>
              <th className="py-2.5 px-2 text-left">Vendedor</th>
              <th className="py-2.5 px-2 text-center">Classe</th>
              <th className="py-2.5 px-2 text-right">Líquido</th>
              <th className="py-2.5 px-2 text-right">Part.</th>
              <th className="py-2.5 px-2 text-right">Acum.</th>
              <th className="py-2.5 px-2 text-right">Vendas</th>
              <th className="py-2.5 px-2 pr-3 text-right rounded-r-lg">Ticket</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr
                key={l.nome}
                className="border-b border-[var(--color-border-soft)] last:border-0 hover:bg-white/[0.025] transition-colors"
              >
                <td className="py-2.5 px-2 pl-3 num text-[var(--color-muted)]">{i + 1}</td>
                <td className="py-2.5 px-2 text-[var(--color-subtle)]">{l.nome}</td>
                <td className="py-2.5 px-2 text-center">
                  <Badge c={l.classe} />
                </td>
                <td className="py-2.5 px-2 text-right num text-[var(--color-text)] font-medium">{fmtBRL(l.faturamento_liquido)}</td>
                <td className="py-2.5 px-2 text-right num text-[var(--color-subtle)]">{fmtPct(l.participacao)}</td>
                <td className="py-2.5 px-2 text-right num text-[var(--color-subtle)]">{fmtPct(l.acumulado)}</td>
                <td className="py-2.5 px-2 text-right num text-[var(--color-subtle)]">{fmtInt(l.qtd_vendas)}</td>
                <td className="py-2.5 px-2 pr-3 text-right num text-[var(--color-subtle)]">{fmtBRL(l.ticket_medio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
