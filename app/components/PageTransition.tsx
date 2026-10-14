'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Transição suave ao trocar de aba. A key é o pathname: remonta (e re-anima) só
 * quando muda a ROTA — mudar filial/período (mesma rota) não dispara a animação.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
