'use client';

import { useState } from 'react';
import { ModalDetalhe, type DetalheKpi } from './ModalDetalhe';

const AZUL = 'var(--color-blue)';
const AZUL_HEX = '#D5D5DD';

export type VendedorLinha = {
  nome: string;
  vendas: string;
  ticket: string;
  liquido: string; // exibido na coluna e como valor do modal
  detalhe: DetalheKpi;
};

/** Tabela de vendedores com nome clicável: abre o detalhamento do vendedor. */
export function TabelaVendedores({ rows }: { rows: VendedorLinha[] }) {
  const [sel, setSel] = useState<VendedorLinha | null>(null);
  if (!rows.length) return <p className="text-sm text-[var(--color-muted)]">Sem dados no período.</p>;

  return (
    <>
      <div className="max-h-[420px] overflow-y-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 z-[1]">
            <tr className="bg-[var(--color-surface-2)] text-[var(--color-muted)] text-[10.5px] uppercase tracking-[0.12em]">
              <th className="py-2.5 font-semibold rounded-l-lg pl-3 px-2 text-left">Vendedor</th>
              <th className="py-2.5 font-semibold px-2 text-right">Vendas</th>
              <th className="py-2.5 font-semibold px-2 text-right">Ticket</th>
              <th className="py-2.5 font-semibold rounded-r-lg pr-3 px-2 text-right">Líquido</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr
                key={ri}
                onClick={() => setSel(r)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSel(r))}
                role="button"
                tabIndex={0}
                title="Ver detalhamento do vendedor"
                className="group cursor-pointer border-b border-[var(--color-border-soft)] last:border-0 hover:bg-white/[0.04] focus:bg-white/[0.04] focus:outline-none transition-colors"
              >
                <td className="py-2.5 pl-3 px-2 text-left text-[var(--color-subtle)] group-hover:text-[var(--color-blue)] transition-colors">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="truncate">{r.nome}</span>
                    <svg
                      viewBox="0 0 24 24"
                      className="w-[11px] h-[11px] shrink-0 text-[var(--color-muted)] opacity-0 group-hover:opacity-100 transition-opacity"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                    </svg>
                  </span>
                </td>
                <td className="py-2.5 px-2 text-right num text-[var(--color-subtle)]">{r.vendas}</td>
                <td className="py-2.5 px-2 text-right num text-[var(--color-subtle)]">{r.ticket}</td>
                <td className="py-2.5 pr-3 px-2 text-right num text-[var(--color-text)] font-medium">{r.liquido}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sel && (
        <ModalDetalhe
          label={sel.nome}
          value={sel.liquido}
          badge={null}
          cor={AZUL}
          corHex={AZUL_HEX}
          detalhe={sel.detalhe}
          menorMelhor={false}
          onClose={() => setSel(null)}
        />
      )}
    </>
  );
}
