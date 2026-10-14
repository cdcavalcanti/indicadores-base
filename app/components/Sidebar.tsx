'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ComponentType } from 'react';
import { Logo } from './Logo';
import { IconGrid, IconTrend, IconRentabilidade, IconMeta, IconCobranca, IconPulse, LogoInstagram, LogoMeta, LogoWhatsApp, LogoGoogleAds } from './Icons';

const NAV: { href: string; label: string; Icon: ComponentType<{ className?: string }>; group: string; brand?: boolean }[] = [
  { href: '/', label: 'Visão Geral', Icon: IconGrid, group: 'Geral' },
  { href: '/vendas', label: 'Vendas', Icon: IconTrend, group: 'Geral' },
  { href: '/rentabilidade', label: 'Rentabilidade', Icon: IconRentabilidade, group: 'Geral' },
  { href: '/metas', label: 'Metas', Icon: IconMeta, group: 'Geral' },
  { href: '/cobranca', label: 'Cobrança', Icon: IconCobranca, group: 'Cobrança' },
  { href: '/marketing/instagram', label: 'Instagram', Icon: LogoInstagram, group: 'Marketing', brand: true },
  { href: '/marketing/meta-ads', label: 'Meta Ads', Icon: LogoMeta, group: 'Marketing', brand: true },
  { href: '/marketing/whatsapp', label: 'WhatsApp', Icon: LogoWhatsApp, group: 'Marketing', brand: true },
  { href: '/marketing/google-ads', label: 'Google Ads', Icon: LogoGoogleAds, group: 'Marketing', brand: true },
  { href: '/etl', label: 'Saúde do ETL', Icon: IconPulse, group: 'Sistema' },
];

export function Sidebar() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const qs = sp.toString();
  const suffix = qs ? `?${qs}` : '';

  const groups = Array.from(new Set(NAV.map((n) => n.group)));

  return (
    <aside className="w-[240px] shrink-0 border-r border-[var(--color-border-soft)] bg-[var(--color-surface)]/55 backdrop-blur sticky top-0 h-screen flex flex-col">
      <div className="px-5 pt-6 pb-5 border-b border-[var(--color-border-soft)]">
        <Logo />
      </div>

      <nav className="px-3 pt-5 flex-1 overflow-y-auto">
        {groups.map((g) => (
          <div key={g} className="mb-6">
            <div className="px-3 mb-2 text-[9.5px] uppercase tracking-[0.2em] text-[var(--color-muted)] font-semibold">
              {g}
            </div>
            <div className="space-y-0.5">
              {NAV.filter((n) => n.group === g).map(({ href, label, Icon, brand }) => {
                const active = pathname === href || (href !== '/' && pathname.startsWith(href));
                return (
                  <Link
                    key={href}
                    href={`${href}${suffix}`}
                    className={[
                      'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition-colors',
                      active
                        ? 'text-[var(--color-text)] bg-gradient-to-r from-[rgba(109,76,255,0.16)] to-transparent font-medium'
                        : 'text-[var(--color-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]',
                    ].join(' ')}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] rounded-full bg-[var(--color-action)] shadow-[0_0_10px_var(--color-action)]" />
                    )}
                    <Icon
                      className={[
                        'w-[17px] h-[17px] shrink-0 transition-opacity',
                        brand
                          ? active
                            ? 'opacity-100'
                            : 'opacity-65 group-hover:opacity-100'
                          : active
                            ? 'text-[var(--color-action)]'
                            : 'text-[var(--color-muted)]',
                      ].join(' ')}
                    />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-[var(--color-border-soft)]">
        <p className="text-[9px] uppercase tracking-[0.22em] text-[var(--color-muted)]">Vortex</p>
        <p className="mt-1 text-[12px] text-[var(--color-subtle)] leading-snug">Indicadores da operação</p>
      </div>
    </aside>
  );
}
