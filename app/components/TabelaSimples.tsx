export function TabelaSimples({
  head,
  rows,
  alignRightFrom = 1,
  maxH = false,
}: {
  head: string[];
  rows: (string | number)[][];
  alignRightFrom?: number;
  maxH?: boolean;
}) {
  if (!rows.length) return <p className="text-sm text-[var(--color-muted)]">Sem dados no período.</p>;
  return (
    <div className={maxH ? 'max-h-[420px] overflow-y-auto' : ''}>
      <table className="w-full text-[13px]">
        <thead className="sticky top-0 z-[1]">
          <tr className="bg-[var(--color-surface-2)] text-[var(--color-muted)] text-[10.5px] uppercase tracking-[0.12em]">
            {head.map((h, i) => (
              <th
                key={i}
                className={`py-2.5 font-semibold first:rounded-l-lg last:rounded-r-lg first:pl-3 last:pr-3 px-2 ${
                  i >= alignRightFrom ? 'text-right' : 'text-left'
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr
              key={ri}
              className="border-b border-[var(--color-border-soft)] last:border-0 hover:bg-white/[0.025] transition-colors"
            >
              {r.map((c, ci) => (
                <td
                  key={ci}
                  className={`py-2.5 first:pl-3 last:pr-3 px-2 ${
                    ci >= alignRightFrom
                      ? `text-right num ${ci === r.length - 1 ? 'text-[var(--color-text)] font-medium' : 'text-[var(--color-subtle)]'}`
                      : 'text-[var(--color-subtle)]'
                  }`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
