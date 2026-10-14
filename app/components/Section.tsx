import type { ReactNode } from 'react';

export function Section({
  title,
  sub,
  right,
  children,
  className = '',
}: {
  title: string;
  /** Linha de apoio discreta sob o título. */
  sub?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-5 ${className}`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="mt-[3px] w-[3px] h-[14px] rounded-full bg-[var(--color-blue)] shrink-0" />
          <div className="min-w-0">
            <h2 className="text-[13.5px] font-semibold text-[var(--color-text)] tracking-[-0.01em]">{title}</h2>
            {sub != null && <p className="text-[11.5px] text-[var(--color-muted)] mt-0.5">{sub}</p>}
          </div>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}
