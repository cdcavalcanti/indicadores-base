import { getFiliais, getMetas } from '@/lib/queries';
import { MetasManager } from './MetasManager';

// Sempre dado fresco: a meta acabou de ser salva/editada pela Server Action.
export const dynamic = 'force-dynamic';

export default async function MetasPage() {
  const [filiais, metas] = await Promise.all([getFiliais(), getMetas()]);
  const agora = new Date();
  const anoAtual = agora.getFullYear();
  const mesAtual = agora.getMonth() + 1;

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-[var(--color-border-soft)] bg-[var(--color-base)]/85 backdrop-blur-md px-7 py-4">
        <h1 className="titulo">
          Metas
        </h1>
        <p className="text-[11.5px] text-[var(--color-subtle)] mt-1.5">
          cadastro das metas mensais de faturamento por loja
        </p>
      </header>

      <div className="p-7 space-y-6 max-w-[900px]">
        <MetasManager
          filiais={filiais.map((f) => f.nome)}
          metas={metas}
          anoAtual={anoAtual}
          mesAtual={mesAtual}
        />
      </div>
    </>
  );
}
