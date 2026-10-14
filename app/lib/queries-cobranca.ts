import { q } from './db';
import { CONSOLIDADO, type Filtros } from './filters';

// Cobrança: régua de WhatsApp (fact_cobranca_evento).
// Grão = evento (1 disparo por linha). Como o mesmo título aparece em até 3 eventos
// (vence_em_3_dias -> vence_hoje -> vencido_ha_3_dias), os KPIs de CADÊNCIA contam
// eventos, mas os KPIs FINANCEIROS deduplicam pelo ÚLTIMO evento por titulo_id (CTE `ult`)
// p/ não somar o mesmo valor 2-3×. status_pagamento é SNAPSHOT, não atribuição causal.

/** Cláusula de filial: vazia para Consolidado. Retorna [sqlExtra, params]. */
function filialClause(f: Filtros, startIdx: number): [string, unknown[]] {
  if (f.filial === CONSOLIDADO) return ['', []];
  return [` AND filial = $${startIdx}`, [f.filial]];
}

export type CobrancaKpis = {
  // operação (conta eventos)
  total_avisos: number;
  enviados: number;
  falhas: number;
  taxa_entrega: number; // enviados / (enviados + falhas)
  vence_hoje: number;
  vence_3d: number;
  vencido: number;
  // financeiro (dedup por titulo_id)
  titulos: number;
  qtd_aberto: number;
  qtd_pago: number;
  valor_avisado: number;
  valor_aberto: number;
  valor_pago: number;
  valor_pago_antes: number;
  qtd_pago_antes: number;
  // "Em aberto" por estágio da régua (vencido = apenas 'vencido_ha_3_dias';
  // 'vence_em_3_dias' e 'vence_hoje' contam como a vencer).
  valor_aberto_vence3d: number;
  valor_aberto_vencehoje: number;
  valor_aberto_vencido: number;
  qtd_aberto_vence3d: number;
  qtd_aberto_vencehoje: number;
  qtd_aberto_vencido: number;
  ticket_medio: number;
};

export async function getCobrancaKpis(f: Filtros): Promise<CobrancaKpis> {
  const [fc, fp] = filialClause(f, 3);
  const rows = await q<Omit<CobrancaKpis, 'taxa_entrega' | 'ticket_medio'>>(
    `WITH ev AS (
       SELECT * FROM fact_cobranca_evento
       WHERE dia >= $1 AND dia <= $2${fc}
     ),
     ult AS (
       SELECT DISTINCT ON (titulo_id) titulo_id, valor, status_pagamento, status_evento, tipo_aviso
       FROM ev WHERE titulo_id IS NOT NULL
       ORDER BY titulo_id, data_evento DESC NULLS LAST
     )
     SELECT
       (SELECT COUNT(*) FROM ev)::int                                          AS total_avisos,
       (SELECT COUNT(*) FROM ev WHERE status_evento='enviado_ok')::int         AS enviados,
       (SELECT COUNT(*) FROM ev WHERE status_evento='falha_meta')::int         AS falhas,
       (SELECT COUNT(*) FROM ev WHERE tipo_aviso='vence_hoje')::int            AS vence_hoje,
       (SELECT COUNT(*) FROM ev WHERE tipo_aviso='vence_em_3_dias')::int       AS vence_3d,
       (SELECT COUNT(*) FROM ev WHERE tipo_aviso='vencido_ha_3_dias')::int     AS vencido,
       (SELECT COUNT(*) FROM ult)::int                                         AS titulos,
       (SELECT COUNT(*) FROM ult WHERE status_pagamento='em_aberto')::int      AS qtd_aberto,
       (SELECT COUNT(*) FROM ult WHERE status_pagamento='pago')::int           AS qtd_pago,
       COALESCE((SELECT SUM(valor) FROM ult),0)                                AS valor_avisado,
       COALESCE((SELECT SUM(valor) FROM ult WHERE status_pagamento='em_aberto'),0) AS valor_aberto,
       COALESCE((SELECT SUM(valor) FROM ult WHERE status_pagamento='pago'),0)      AS valor_pago,
       COALESCE((SELECT SUM(valor) FROM ult WHERE status_evento='pago_antes_envio'),0) AS valor_pago_antes,
       (SELECT COUNT(*) FROM ult WHERE status_evento='pago_antes_envio')::int  AS qtd_pago_antes,
       COALESCE((SELECT SUM(valor) FROM ult WHERE status_pagamento='em_aberto' AND tipo_aviso='vence_em_3_dias'),0)   AS valor_aberto_vence3d,
       COALESCE((SELECT SUM(valor) FROM ult WHERE status_pagamento='em_aberto' AND tipo_aviso='vence_hoje'),0)        AS valor_aberto_vencehoje,
       COALESCE((SELECT SUM(valor) FROM ult WHERE status_pagamento='em_aberto' AND tipo_aviso='vencido_ha_3_dias'),0) AS valor_aberto_vencido,
       (SELECT COUNT(*) FROM ult WHERE status_pagamento='em_aberto' AND tipo_aviso='vence_em_3_dias')::int   AS qtd_aberto_vence3d,
       (SELECT COUNT(*) FROM ult WHERE status_pagamento='em_aberto' AND tipo_aviso='vence_hoje')::int        AS qtd_aberto_vencehoje,
       (SELECT COUNT(*) FROM ult WHERE status_pagamento='em_aberto' AND tipo_aviso='vencido_ha_3_dias')::int AS qtd_aberto_vencido`,
    [f.from, f.to, ...fp],
  );
  const r = rows[0];
  return {
    ...r,
    taxa_entrega: r.enviados + r.falhas > 0 ? r.enviados / (r.enviados + r.falhas) : 0,
    ticket_medio: r.titulos > 0 ? r.valor_avisado / r.titulos : 0,
  };
}

export type CobrancaPonto = {
  dia: string;
  avisos: number;
  vence_hoje: number;
  vence_3d: number;
  vencido: number;
};

export async function getCobrancaSerie(f: Filtros): Promise<CobrancaPonto[]> {
  const [fc, fp] = filialClause(f, 3);
  return q<CobrancaPonto>(
    `SELECT dia::text AS dia,
       COUNT(*)::int AS avisos,
       COUNT(*) FILTER (WHERE tipo_aviso='vence_hoje')::int        AS vence_hoje,
       COUNT(*) FILTER (WHERE tipo_aviso='vence_em_3_dias')::int   AS vence_3d,
       COUNT(*) FILTER (WHERE tipo_aviso='vencido_ha_3_dias')::int AS vencido
     FROM fact_cobranca_evento
     WHERE dia >= $1 AND dia <= $2${fc}
     GROUP BY dia ORDER BY dia`,
    [f.from, f.to, ...fp],
  );
}

export type CobrancaTipo = { tipo: string; avisos: number; enviados: number; falhas: number; pago_antes: number };

export async function getCobrancaPorTipo(f: Filtros): Promise<CobrancaTipo[]> {
  const [fc, fp] = filialClause(f, 3);
  return q<CobrancaTipo>(
    `SELECT COALESCE(tipo_aviso,'(sem tipo)') AS tipo,
       COUNT(*)::int AS avisos,
       COUNT(*) FILTER (WHERE status_evento='enviado_ok')::int AS enviados,
       COUNT(*) FILTER (WHERE status_evento='falha_meta')::int AS falhas,
       COUNT(*) FILTER (WHERE status_evento='pago_antes_envio')::int AS pago_antes
     FROM fact_cobranca_evento
     WHERE dia >= $1 AND dia <= $2${fc}
     GROUP BY 1 ORDER BY avisos DESC`,
    [f.from, f.to, ...fp],
  );
}

export type CobrancaFilial = {
  filial: string;
  avisos: number;
  titulos: number;
  valor_avisado: number;
  valor_aberto: number;
  valor_pago: number;
  // Decomposição CAUSAL do pago (aberto + apos + sem = avisado):
  valor_pago_apos: number; // pago E recebeu >=1 aviso (enviado_ok) em algum estágio
  valor_pago_sem: number; // pago mas nunca recebeu aviso (já ia pagar)
  // "Em aberto" por estágio da régua (somam valor_aberto). vencido = 'vencido_ha_3_dias'.
  valor_aberto_vence3d: number;
  valor_aberto_vencehoje: number;
  valor_aberto_vencido: number;
};

export async function getCobrancaPorFilial(f: Filtros): Promise<CobrancaFilial[]> {
  const [fc, fp] = filialClause(f, 3);
  return q<CobrancaFilial>(
    `WITH ev AS (
       SELECT * FROM fact_cobranca_evento
       WHERE dia >= $1 AND dia <= $2${fc}
     ),
     tit AS (
       -- 1 linha por título: capta o sinal causal (recebeu aviso?) + estado atual.
       SELECT titulo_id,
         MAX(filial) AS filial,
         MAX(valor)  AS valor,
         bool_or(status_evento = 'enviado_ok') AS recebeu_msg,
         (array_agg(status_pagamento ORDER BY data_evento DESC NULLS LAST))[1] AS status_atual,
         (array_agg(tipo_aviso ORDER BY data_evento DESC NULLS LAST))[1] AS tipo_atual
       FROM ev WHERE titulo_id IS NOT NULL
       GROUP BY titulo_id
     ),
     av AS (SELECT filial, COUNT(*)::int AS avisos FROM ev GROUP BY filial),
     fin AS (
       SELECT filial,
         COUNT(*)::int AS titulos,
         SUM(valor) AS valor_avisado,
         SUM(valor) FILTER (WHERE status_atual='em_aberto') AS valor_aberto,
         SUM(valor) FILTER (WHERE status_atual='pago')      AS valor_pago,
         SUM(valor) FILTER (WHERE status_atual='pago' AND recebeu_msg)     AS valor_pago_apos,
         SUM(valor) FILTER (WHERE status_atual='pago' AND NOT recebeu_msg) AS valor_pago_sem,
         SUM(valor) FILTER (WHERE status_atual='em_aberto' AND tipo_atual='vence_em_3_dias')   AS valor_aberto_vence3d,
         SUM(valor) FILTER (WHERE status_atual='em_aberto' AND tipo_atual='vence_hoje')        AS valor_aberto_vencehoje,
         SUM(valor) FILTER (WHERE status_atual='em_aberto' AND tipo_atual='vencido_ha_3_dias') AS valor_aberto_vencido
       FROM tit GROUP BY filial
     )
     SELECT COALESCE(av.filial, fin.filial, '(sem filial)') AS filial,
       COALESCE(av.avisos,0)        AS avisos,
       COALESCE(fin.titulos,0)      AS titulos,
       COALESCE(fin.valor_avisado,0) AS valor_avisado,
       COALESCE(fin.valor_aberto,0)  AS valor_aberto,
       COALESCE(fin.valor_pago,0)    AS valor_pago,
       COALESCE(fin.valor_pago_apos,0) AS valor_pago_apos,
       COALESCE(fin.valor_pago_sem,0)  AS valor_pago_sem,
       COALESCE(fin.valor_aberto_vence3d,0)   AS valor_aberto_vence3d,
       COALESCE(fin.valor_aberto_vencehoje,0) AS valor_aberto_vencehoje,
       COALESCE(fin.valor_aberto_vencido,0)   AS valor_aberto_vencido
     FROM av FULL OUTER JOIN fin ON av.filial = fin.filial
     ORDER BY valor_avisado DESC`,
    [f.from, f.to, ...fp],
  );
}
