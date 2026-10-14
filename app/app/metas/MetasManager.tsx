'use client';

import { useState, useTransition, useRef } from 'react';
import { salvarMeta } from '@/lib/actions';
import { Section } from '@/components/Section';
import { fmtBRL } from '@/lib/format';
import type { MetaRow } from '@/lib/queries';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** Parse "1.234,56" (pt-BR) -> number. */
function parseValor(s: string): number {
  const limpo = s.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
}

export function MetasManager({
  filiais,
  metas,
  anoAtual,
  mesAtual,
}: {
  filiais: string[];
  metas: MetaRow[];
  anoAtual: number;
  mesAtual: number;
}) {
  const [filial, setFilial] = useState(filiais[0] ?? '');
  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState(mesAtual);
  const [valor, setValor] = useState('');
  // Chave da meta que está sendo editada (p/ destacar a linha); null = cadastro novo.
  const [editando, setEditando] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const anos = Array.from({ length: 6 }, (_, i) => anoAtual - 2 + i);
  const chave = (m: { filial: string; ano: number; mes: number }) => `${m.filial}-${m.ano}-${m.mes}`;

  function editar(m: MetaRow) {
    setFilial(m.filial);
    setAno(m.ano);
    setMes(m.mes);
    setValor(m.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setEditando(chave(m));
    setMsg(null);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelarEdicao() {
    setEditando(null);
    setValor('');
    setFilial(filiais[0] ?? '');
    setAno(anoAtual);
    setMes(mesAtual);
    setMsg(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const v = parseValor(valor);
    if (!filial) return setMsg({ tipo: 'erro', texto: 'Selecione uma loja.' });
    if (v <= 0) return setMsg({ tipo: 'erro', texto: 'Informe um valor maior que zero.' });
    startTransition(async () => {
      const r = await salvarMeta(filial, ano, mes, v);
      if (r.ok) {
        const acao = editando ? 'atualizada' : 'salva';
        setMsg({ tipo: 'ok', texto: `Meta ${acao}: ${filial} · ${MESES[mes - 1]}/${ano} = ${v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` });
        setValor('');
        setEditando(null);
        // A Server Action revalida a página; a lista chega atualizada no próximo render.
      } else {
        setMsg({ tipo: 'erro', texto: r.erro });
      }
    });
  }

  const inputCls =
    'w-full rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-soft)] px-3 py-2.5 text-[14px] text-[var(--color-text)] outline-none focus:border-[var(--color-action)] transition-colors';
  const labelCls = 'block text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)] font-semibold mb-1.5';

  return (
    <>
      <Section
        title={editando ? 'Editar meta' : 'Nova meta'}
        sub={editando ? 'ajuste o valor e salve — sobrescreve a meta selecionada' : 'selecione a loja e o mês, digite o valor e salve'}
      >
        <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Loja</label>
              <select className={inputCls} value={filial} onChange={(e) => setFilial(e.target.value)}>
                {filiais.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Valor da meta (R$)</label>
              <input
                className={inputCls}
                inputMode="decimal"
                placeholder="ex: 900.000,00"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Mês</label>
              <select className={inputCls} value={mes} onChange={(e) => setMes(Number(e.target.value))}>
                {MESES.map((nome, i) => (
                  <option key={i} value={i + 1}>{nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Ano</label>
              <select className={inputCls} value={ano} onChange={(e) => setAno(Number(e.target.value))}>
                {anos.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-[var(--color-action)] px-5 py-2.5 text-[13.5px] font-medium text-[#F4F1EA] shadow-[0_2px_10px_rgba(109,76,255,0.35)] hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              {pending ? 'Salvando…' : editando ? 'Atualizar meta' : 'Salvar meta'}
            </button>
            {editando && (
              <button
                type="button"
                onClick={cancelarEdicao}
                className="rounded-lg border border-[var(--color-border-soft)] px-4 py-2.5 text-[13.5px] text-[var(--color-subtle)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-2)] transition-colors"
              >
                Cancelar
              </button>
            )}
            {msg && (
              <span className={`text-[13px] ${msg.tipo === 'ok' ? 'text-[var(--color-green,#3ecf8e)]' : 'text-[var(--color-red,#ff6b6b)]'}`}>
                {msg.texto}
              </span>
            )}
          </div>
        </form>
      </Section>

      <Section title="Metas cadastradas" sub={`${metas.length} ${metas.length === 1 ? 'registro' : 'registros'}`}>
        {metas.length === 0 ? (
          <p className="text-[13px] text-[var(--color-muted)] py-2">Nenhuma meta cadastrada ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-muted)]">
                  <th className="text-left font-semibold pb-2.5 pr-4">Loja</th>
                  <th className="text-left font-semibold pb-2.5 pr-4">Mês</th>
                  <th className="text-right font-semibold pb-2.5 pr-4">Meta</th>
                  <th className="pb-2.5 w-[1%]"></th>
                </tr>
              </thead>
              <tbody>
                {metas.map((m) => {
                  const emEdicao = editando === chave(m);
                  return (
                    <tr
                      key={chave(m)}
                      className={`border-t border-[var(--color-border-soft)] ${emEdicao ? 'bg-[rgba(109,76,255,0.08)]' : ''}`}
                    >
                      <td className="py-2.5 pr-4 text-[var(--color-text)]">{m.filial}</td>
                      <td className="py-2.5 pr-4 text-[var(--color-subtle)]">{MESES[m.mes - 1]}/{m.ano}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-[var(--color-text)]">{fmtBRL(m.valor)}</td>
                      <td className="py-2.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => editar(m)}
                          className="rounded-md border border-[var(--color-border-soft)] px-3 py-1 text-[12px] text-[var(--color-subtle)] hover:text-[var(--color-action)] hover:border-[var(--color-action)] transition-colors"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
