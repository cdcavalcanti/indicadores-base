// Cobrança: régua de WhatsApp (planilha alimentada pelo n8n) -> fact_cobranca_evento.
// A planilha é a saída fiel do que a régua fez. Grão = evento (1 disparo por linha);
// UPSERT por id_evento preserva histórico mesmo se a planilha rolar e absorve mudança
// de status entre execuções. Mapeamento por NOME de header (resiliente a reordenação).
import { query } from '../db.ts';
import { fetchCobrancaRows, type SheetRow } from '../clients/googleSheets.ts';
import { info } from '../log.ts';

// Ordem das colunas no INSERT (espelha fact_cobranca_evento, exceto updated_at).
const COLS = [
  'id_evento', 'data_evento', 'dia', 'tipo_aviso', 'template', 'status_evento', 'is_whatsapp',
  'meta_message_id', 'meta_error_code', 'meta_error_msg', 'cliente_id', 'cliente_nome',
  'cliente_cpf_cnpj', 'telefone', 'titulo_id', 'nro_doc', 'valor', 'vencimento', 'filial',
  'banco', 'status_pagamento',
];
const UPDATE_SET = COLS.filter((c) => c !== 'id_evento')
  .map((c) => `${c}=EXCLUDED.${c}`)
  .join(', ') + ', updated_at=now()';

const nn = (s: string | undefined) => (s && s.trim() !== '' ? s.trim() : null);

/** Número BR -> JS: "1.671,92" -> 1671.92; "760" -> 760; "1671.92" -> 1671.92. */
function numBR(v: string | undefined): number {
  if (!v) return 0;
  let s = v.trim().replace(/[^\d.,-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); // vírgula = decimal; ponto = milhar
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Linha da planilha -> tupla na ordem de COLS (ou null se sem id_evento). */
function toRow(s: SheetRow): unknown[] | null {
  const id = nn(s.id_evento);
  if (!id) return null;
  const dataEvento = nn(s.data_evento);
  return [
    id,
    dataEvento,
    dataEvento ? dataEvento.slice(0, 10) : null, // dia (já em -03:00 na string)
    nn(s.tipo_aviso),
    nn(s.template),
    nn(s.status_evento),
    s.is_whatsapp?.trim() === 'sim',
    nn(s.meta_message_id),
    nn(s.meta_error_code),
    nn(s.meta_error_msg),
    nn(s.cliente_id),
    nn(s.cliente_nome),
    nn(s.cliente_cpf_cnpj),
    nn(s.telefone_original), // telefone <- telefone_original
    nn(s.titulo_id),
    nn(s.nro_doc),
    numBR(s.valor),
    nn(s.vencimento),
    nn(s.filial),
    nn(s.banco),
    nn(s.status_pagamento),
  ];
}

export async function syncCobranca(): Promise<number> {
  const raw = await fetchCobrancaRows();

  // Dedup por id_evento (a mesma chave não pode aparecer 2× no mesmo ON CONFLICT).
  const porId = new Map<string, unknown[]>();
  for (const s of raw) {
    const row = toRow(s);
    if (row) porId.set(row[0] as string, row);
  }
  const rows = [...porId.values()];
  info(`Cobrança: ${raw.length} linhas na planilha -> ${rows.length} eventos únicos`);

  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const values: unknown[] = [];
    const tuples = batch.map((r, bi) => {
      values.push(...r);
      return `(${r.map((_, ci) => `$${bi * COLS.length + ci + 1}`).join(',')})`;
    });
    await query(
      `INSERT INTO fact_cobranca_evento (${COLS.join(',')}) VALUES ${tuples.join(',')}
       ON CONFLICT (id_evento) DO UPDATE SET ${UPDATE_SET}`,
      values,
    );
  }

  return rows.length;
}
