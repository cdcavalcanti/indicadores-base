'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtData, nomeMes } from '@/lib/format';
import { IconCalendar } from './Icons';

function pad(n: number) {
  return String(n).padStart(2, '0');
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/** Presets da barra lateral; cada um devolve um intervalo {from,to} em 'YYYY-MM-DD'. */
const PRESETS: { label: string; range: () => { from: string; to: string } }[] = [
  { label: 'Hoje', range: () => { const h = new Date(); return { from: ymd(h), to: ymd(h) }; } },
  { label: 'Últimos 7 dias', range: () => { const h = new Date(); const i = new Date(h); i.setDate(i.getDate() - 6); return { from: ymd(i), to: ymd(h) }; } },
  { label: 'Últimos 30 dias', range: () => { const h = new Date(); const i = new Date(h); i.setDate(i.getDate() - 29); return { from: ymd(i), to: ymd(h) }; } },
  { label: 'Este mês', range: () => { const h = new Date(); return { from: ymd(new Date(h.getFullYear(), h.getMonth(), 1)), to: ymd(h) }; } },
  { label: 'Mês passado', range: () => { const h = new Date(); return { from: ymd(new Date(h.getFullYear(), h.getMonth() - 1, 1)), to: ymd(new Date(h.getFullYear(), h.getMonth(), 0)) }; } },
  { label: 'Este ano', range: () => { const h = new Date(); return { from: ymd(new Date(h.getFullYear(), 0, 1)), to: ymd(h) }; } },
  { label: 'Ano passado', range: () => { const h = new Date(); return { from: ymd(new Date(h.getFullYear() - 1, 0, 1)), to: ymd(new Date(h.getFullYear() - 1, 11, 31)) }; } },
];

export function SeletorPeriodo({
  from,
  to,
  onApply,
  className = '',
}: {
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [selFrom, setSelFrom] = useState(from);
  const [selTo, setSelTo] = useState(to);
  const [view, setView] = useState(() => parseYmd(to || from));
  const ref = useRef<HTMLDivElement>(null);
  const hojeStr = ymd(new Date());

  // Ao abrir, sincroniza a seleção com o valor vigente e posiciona o calendário no mês final.
  useEffect(() => {
    if (!aberto) return;
    setSelFrom(from);
    setSelTo(to);
    setView(parseYmd(to || from));
  }, [aberto, from, to]);

  // Fecha ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!aberto) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [aberto]);

  const clicarDia = (ds: string) => {
    // 1º clique (ou recomeço) define o início; 2º clique define o fim (ordena se necessário).
    if (!selFrom || (selFrom && selTo)) {
      setSelFrom(ds);
      setSelTo('');
    } else if (ds < selFrom) {
      setSelTo(selFrom);
      setSelFrom(ds);
    } else {
      setSelTo(ds);
    }
  };

  const aplicar = () => {
    const f = selFrom || from;
    const t = selTo || selFrom || to;
    onApply(f <= t ? f : t, f <= t ? t : f);
    setAberto(false);
  };

  const aplicarPreset = (r: { from: string; to: string }) => {
    setSelFrom(r.from);
    setSelTo(r.to);
    setView(parseYmd(r.to));
  };

  const presetAtivo = (r: { from: string; to: string }) => r.from === selFrom && r.to === selTo;

  // Células do mês em exibição (com espaços em branco antes do dia 1).
  const celulas = useMemo(() => {
    const y = view.getFullYear();
    const m = view.getMonth();
    const inicio = new Date(y, m, 1).getDay();
    const dias = new Date(y, m + 1, 0).getDate();
    const out: (string | null)[] = Array.from({ length: inicio }, () => null);
    for (let d = 1; d <= dias; d++) out.push(ymd(new Date(y, m, d)));
    return out;
  }, [view]);

  const mudarMes = (delta: number) => setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));

  const cabecalhoMes = `${nomeMes(view.getMonth() + 1).replace(/^./, (c) => c.toUpperCase())} ${view.getFullYear()}`;
  const rodapeRange = `${fmtData(selFrom || from)} – ${fmtData(selTo || selFrom || to)}`;

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setAberto((o) => !o)}
        className="h-9 flex items-center gap-2 bg-[var(--color-surface-2)] border border-[var(--color-border-soft)] rounded-lg px-3 text-[13px] text-[var(--color-text)] outline-none transition-colors hover:border-[var(--color-border)] data-[open=true]:border-[var(--color-action)]"
        data-open={aberto}
      >
        <IconCalendar className="w-[14px] h-[14px] text-[var(--color-muted)]" />
        <span className="num">{fmtData(from)} – {fmtData(to)}</span>
        <svg viewBox="0 0 24 24" className={`w-3.5 h-3.5 text-[var(--color-muted)] transition-transform ${aberto ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {aberto && (
        <div className="absolute right-0 mt-2 z-30 flex rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-surface)] shadow-[0_24px_60px_rgba(0,0,0,0.55)] overflow-hidden">
          {/* Presets */}
          <div className="w-[150px] shrink-0 border-r border-[var(--color-border-soft)] p-2 bg-[var(--color-surface-2)]/40">
            {PRESETS.map((p) => {
              const r = p.range();
              const ativo = presetAtivo(r);
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => aplicarPreset(r)}
                  className={[
                    'w-full text-left text-[12.5px] rounded-lg px-3 py-2 mb-0.5 transition-colors',
                    ativo
                      ? 'bg-[var(--color-action)]/15 text-[var(--color-text)] font-medium'
                      : 'text-[var(--color-subtle)] hover:bg-white/[0.04] hover:text-[var(--color-text)]',
                  ].join(' ')}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Calendário */}
          <div className="p-3 w-[280px]">
            <div className="flex items-center justify-between px-1 mb-2">
              <button type="button" onClick={() => mudarMes(-1)} aria-label="Mês anterior" className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-subtle)] hover:bg-white/[0.06] hover:text-[var(--color-text)] transition-colors">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
              <span className="text-[13px] font-medium text-[var(--color-text)]">{cabecalhoMes}</span>
              <button type="button" onClick={() => mudarMes(1)} aria-label="Próximo mês" className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-subtle)] hover:bg-white/[0.06] hover:text-[var(--color-text)] transition-colors">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
              </button>
            </div>

            <div className="grid grid-cols-7 mb-1">
              {DIAS_SEMANA.map((d, i) => (
                <div key={i} className="h-7 flex items-center justify-center text-[10.5px] text-[var(--color-muted)]">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-y-0.5">
              {celulas.map((ds, i) => {
                if (!ds) return <div key={i} />;
                const temFim = !!selTo;
                const isStart = ds === selFrom;
                const isEnd = ds === selTo;
                const inRange = temFim && ds > selFrom && ds < selTo;
                const isHoje = ds === hojeStr;
                const ponta = isStart || isEnd;
                return (
                  <div
                    key={i}
                    className={[
                      'flex items-center justify-center',
                      inRange ? 'bg-white/[0.06]' : '',
                      isStart && temFim ? 'bg-white/[0.06] rounded-l-full' : '',
                      isEnd ? 'bg-white/[0.06] rounded-r-full' : '',
                    ].join(' ')}
                  >
                    <button
                      type="button"
                      onClick={() => clicarDia(ds)}
                      className={[
                        'w-9 h-8 text-[12.5px] rounded-lg flex items-center justify-center transition-colors',
                        ponta
                          ? 'bg-[var(--color-action)] text-[#F4F1EA] font-medium shadow-[0_2px_8px_rgba(109,76,255,0.45)]'
                          : inRange
                            ? 'text-[var(--color-text)]'
                            : 'text-[var(--color-subtle)] hover:bg-white/[0.06] hover:text-[var(--color-text)]',
                        isHoje && !ponta ? 'ring-1 ring-inset ring-[var(--color-action)]/55' : '',
                      ].join(' ')}
                    >
                      {Number(ds.slice(8, 10))}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-[var(--color-border-soft)]">
              <span className="num text-[11.5px] text-[var(--color-muted)]">{rodapeRange}</span>
              <button
                type="button"
                onClick={aplicar}
                className="h-8 px-4 rounded-lg bg-[var(--color-action)] text-[#F4F1EA] text-[12.5px] font-medium hover:brightness-110 transition-[filter]"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
