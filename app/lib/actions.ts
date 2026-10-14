'use server';

import { revalidatePath } from 'next/cache';
import { q } from './db';

export type SalvarMetaResult = { ok: true; valor: number } | { ok: false; erro: string };

/**
 * Cadastra/atualiza a meta mensal de uma filial (grão filial+ano+mês) em `dim_meta`.
 * UPSERT: se já existe meta para o (filial, ano, mês), sobrescreve o valor. Server Action
 * chamada pelo formulário em /metas — é a única escrita no banco vinda da UI do app.
 * Revalida as telas que exibem meta (/, /vendas, /metas) para refletir na hora.
 */
export async function salvarMeta(
  filial: string,
  ano: number,
  mes: number,
  valor: number,
): Promise<SalvarMetaResult> {
  // Validação defensiva (o form já restringe, mas a action é a fronteira de confiança).
  if (!filial || !filial.trim()) return { ok: false, erro: 'Selecione uma loja.' };
  if (!Number.isInteger(ano) || ano < 2020 || ano > 2100) return { ok: false, erro: 'Ano inválido.' };
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return { ok: false, erro: 'Mês inválido.' };
  if (!Number.isFinite(valor) || valor < 0) return { ok: false, erro: 'Valor inválido.' };

  // A filial precisa existir em dim_filial (integridade — não gravar loja fantasma).
  const existe = await q<{ nome: string }>(`SELECT nome FROM dim_filial WHERE nome = $1`, [filial]);
  if (existe.length === 0) return { ok: false, erro: 'Loja não encontrada.' };

  await q(
    `INSERT INTO dim_meta (filial, ano, mes, valor)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (filial, ano, mes)
     DO UPDATE SET valor = EXCLUDED.valor, updated_at = now()`,
    [filial, ano, mes, valor],
  );

  revalidatePath('/metas');
  revalidatePath('/vendas');
  revalidatePath('/');
  return { ok: true, valor };
}
