import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { Inter, JetBrains_Mono, Michroma } from 'next/font/google';
import './globals.css';
import { Sidebar } from '@/components/Sidebar';
import { PageTransition } from '@/components/PageTransition';

const michroma = Michroma({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-michroma',
  display: 'swap',
});
const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono-jb', display: 'swap' });

export const metadata: Metadata = {
  title: 'Vortex — Indicadores',
  description: 'Painel de indicadores da Vortex',
};

export const viewport: Viewport = {
  themeColor: '#07070A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${michroma.variable} ${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <div className="flex min-h-screen">
          <Suspense fallback={<div className="w-[240px] shrink-0 border-r border-[var(--color-border-soft)]" />}>
            <Sidebar />
          </Suspense>
          <main className="flex-1 min-w-0">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
      </body>
    </html>
  );
}
