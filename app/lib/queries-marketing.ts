import { q } from './db';
import type { Filtros } from './filters';

// ---------------- Instagram ----------------

export type IgKpis = {
  posts: number;
  likes: number;
  comments: number;
  reach: number;
  saved: number;
  follows: number;
};

export async function getIgKpis(f: Filtros): Promise<IgKpis> {
  const rows = await q<IgKpis>(
    `SELECT COUNT(*)::int AS posts,
       COALESCE(SUM(like_count),0)::bigint     AS likes,
       COALESCE(SUM(comments_count),0)::bigint AS comments,
       COALESCE(SUM(reach),0)::bigint           AS reach,
       COALESCE(SUM(saved),0)::bigint           AS saved,
       COALESCE(SUM(follows),0)::bigint         AS follows
     FROM ig_media
     WHERE timestamp >= $1::date AND timestamp < ($2::date + 1)`,
    [f.from, f.to],
  );
  return rows[0];
}

export type IgSerie = { dia: string; likes: number; comments: number; posts: number };

export async function getIgSerie(f: Filtros): Promise<IgSerie[]> {
  return q<IgSerie>(
    `SELECT to_char(date_trunc('week', timestamp), 'YYYY-MM-DD') AS dia,
       COALESCE(SUM(like_count),0)::int AS likes,
       COALESCE(SUM(comments_count),0)::int AS comments,
       COUNT(*)::int AS posts
     FROM ig_media
     WHERE timestamp >= $1::date AND timestamp < ($2::date + 1)
     GROUP BY 1 ORDER BY 1`,
    [f.from, f.to],
  );
}

export type IgPost = {
  id: string;
  caption: string | null;
  media_type: string | null;
  media_product_type: string | null;
  like_count: number | null;
  comments_count: number | null;
  reach: number | null;
  saved: number | null;
  timestamp: string;
  permalink: string | null;
  imagem: string | null;
  tem_imagem: boolean; // imagem baixada e guardada no banco (servida via /api/ig-image/[id])
};

export type IgPostOrd = 'engajamento' | 'recentes';

export async function getIgTopPosts(f: Filtros, limit = 12, ord: IgPostOrd = 'engajamento'): Promise<IgPost[]> {
  // Whitelist de strings constantes — nunca input cru no ORDER BY.
  const orderSql = ord === 'recentes'
    ? 'timestamp DESC'
    : 'COALESCE(like_count,0) + COALESCE(comments_count,0) DESC';
  return q<IgPost>(
    `SELECT id, caption, media_type, media_product_type, like_count, comments_count,
            reach, saved, timestamp::text, permalink,
            -- vídeo/reels: media_url é .mp4, então preferimos thumbnail_url
            CASE WHEN media_type = 'VIDEO' THEN thumbnail_url
                 ELSE COALESCE(media_url, thumbnail_url) END AS imagem,
            (image_data IS NOT NULL) AS tem_imagem
     FROM ig_media
     WHERE timestamp >= $1::date AND timestamp < ($2::date + 1)
     ORDER BY ${orderSql}
     LIMIT ${Number(limit)}`,
    [f.from, f.to],
  );
}

export async function getIgPorTipo(f: Filtros): Promise<{ tipo: string; posts: number; likes: number }[]> {
  return q(
    `SELECT COALESCE(media_product_type, media_type, 'OUTRO') AS tipo,
       COUNT(*)::int AS posts, COALESCE(SUM(like_count),0)::int AS likes
     FROM ig_media
     WHERE timestamp >= $1::date AND timestamp < ($2::date + 1)
     GROUP BY 1 ORDER BY posts DESC`,
    [f.from, f.to],
  );
}

export type IgSeguidores = {
  ganhos_periodo: number;
  total_atual: number | null;
  serie: { dia: string; ganhos: number }[];
};

export async function getIgSeguidores(f: Filtros): Promise<IgSeguidores> {
  const [agg, total, serie] = await Promise.all([
    q<{ ganhos: number }>(
      `SELECT COALESCE(SUM(follower_count),0)::int AS ganhos
       FROM ig_account_daily WHERE date >= $1 AND date <= $2`,
      [f.from, f.to],
    ),
    q<{ followers_total: number }>(
      `SELECT followers_total FROM ig_account_daily
       WHERE followers_total IS NOT NULL ORDER BY date DESC LIMIT 1`,
    ),
    q<{ dia: string; ganhos: number }>(
      `SELECT date::text AS dia, COALESCE(follower_count,0)::int AS ganhos
       FROM ig_account_daily WHERE date >= $1 AND date <= $2 ORDER BY date`,
      [f.from, f.to],
    ),
  ]);
  return {
    ganhos_periodo: agg[0]?.ganhos ?? 0,
    total_atual: total[0]?.followers_total ?? null,
    serie,
  };
}

// ---------------- Meta Ads ----------------

export type AdsKpis = {
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  ctr: number;
  cpc: number;
};

export async function getMetaKpis(f: Filtros): Promise<AdsKpis> {
  const rows = await q<Omit<AdsKpis, 'ctr' | 'cpc'>>(
    `SELECT COALESCE(SUM(spend),0) AS spend,
       COALESCE(SUM(impressions),0)::bigint AS impressions,
       COALESCE(SUM(clicks),0)::bigint AS clicks,
       COALESCE(SUM(reach),0)::bigint AS reach
     FROM meta_ads_insights WHERE date >= $1 AND date <= $2`,
    [f.from, f.to],
  );
  const r = rows[0];
  return {
    ...r,
    ctr: r.impressions > 0 ? r.clicks / Number(r.impressions) : 0,
    cpc: r.clicks > 0 ? r.spend / Number(r.clicks) : 0,
  };
}

export type AdsSerie = {
  dia: string;
  spend: number;
  clicks: number;
  impressions: number;
  reach?: number;
  conversions?: number;
};

export async function getMetaSerie(f: Filtros): Promise<AdsSerie[]> {
  return q<AdsSerie>(
    `SELECT date::text AS dia, SUM(spend) AS spend,
       SUM(clicks)::int AS clicks, SUM(impressions)::int AS impressions,
       SUM(reach)::bigint AS reach
     FROM meta_ads_insights WHERE date >= $1 AND date <= $2
     GROUP BY date ORDER BY date`,
    [f.from, f.to],
  );
}

export type MetaCampanha = {
  campaign_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
};

export async function getMetaCampanhas(f: Filtros): Promise<MetaCampanha[]> {
  return q<MetaCampanha>(
    `SELECT COALESCE(campaign_name,'(sem nome)') AS campaign_name,
       SUM(spend) AS spend, SUM(impressions)::bigint AS impressions, SUM(clicks)::bigint AS clicks,
       CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::numeric / SUM(impressions) ELSE 0 END AS ctr,
       CASE WHEN SUM(clicks) > 0 THEN SUM(spend) / SUM(clicks) ELSE 0 END AS cpc
     FROM meta_ads_insights WHERE date >= $1 AND date <= $2
     GROUP BY 1 ORDER BY spend DESC`,
    [f.from, f.to],
  );
}

// ---- Meta Ads: campanhas WhatsApp e Engajamento (réplica das abas do relatório de referência) ----
// As métricas vêm do JSONB `actions` da API de insights:
//   Conversas Iniciadas = onsite_conversion.messaging_conversation_started_7d
//   Engajamento         = post_engagement
// Campanhas identificadas pelo prefixo no nome ([WHATS] / [PERFIL]).

const ACTION_CONVERSA = 'onsite_conversion.messaging_conversation_started_7d';
const ACTION_ENGAJAMENTO = 'post_engagement';

/** SQL: soma do valor de uma action do JSONB (tipo é constante do código, não input do usuário). */
function sumAction(tipo: string): string {
  return `COALESCE(SUM((
    SELECT SUM((a->>'value')::numeric)
    FROM jsonb_array_elements(actions) a
    WHERE a->>'action_type' = '${tipo}'
  )),0)`;
}

export type MetaAcaoKpis = {
  spend: number;
  acoes: number;
  custo_acao: number;
  impressions: number;
  reach: number;
  clicks: number;
};

async function metaAcaoKpis(f: Filtros, filtroCampanha: string, action: string): Promise<MetaAcaoKpis> {
  const rows = await q<Omit<MetaAcaoKpis, 'custo_acao'>>(
    `SELECT COALESCE(SUM(spend),0) AS spend,
       ${sumAction(action)}::int AS acoes,
       COALESCE(SUM(impressions),0)::bigint AS impressions,
       COALESCE(SUM(reach),0)::bigint AS reach,
       COALESCE(SUM(clicks),0)::bigint AS clicks
     FROM meta_ads_insights
     WHERE date >= $1 AND date <= $2 AND campaign_name ILIKE $3`,
    [f.from, f.to, `%${filtroCampanha}%`],
  );
  const r = rows[0];
  return { ...r, custo_acao: r.acoes > 0 ? Number(r.spend) / r.acoes : 0 };
}

export type MetaAcaoSerie = {
  dia: string;
  spend: number;
  acoes: number;
  impressions: number;
  reach: number;
  clicks: number;
};

async function metaAcaoSerie(f: Filtros, filtroCampanha: string, action: string): Promise<MetaAcaoSerie[]> {
  return q<MetaAcaoSerie>(
    `SELECT date::text AS dia, SUM(spend) AS spend, ${sumAction(action)}::int AS acoes,
       SUM(impressions)::bigint AS impressions, SUM(reach)::bigint AS reach, SUM(clicks)::bigint AS clicks
     FROM meta_ads_insights
     WHERE date >= $1 AND date <= $2 AND campaign_name ILIKE $3
     GROUP BY date ORDER BY date`,
    [f.from, f.to, `%${filtroCampanha}%`],
  );
}

export type MetaAcaoCampanha = {
  campaign_name: string;
  anuncios: number;
  spend: number;
  acoes: number;
  custo_acao: number;
  impressions: number;
  reach: number;
  clicks: number;
};

async function metaAcaoCampanhas(f: Filtros, filtroCampanha: string, action: string): Promise<MetaAcaoCampanha[]> {
  return q<MetaAcaoCampanha>(
    `SELECT COALESCE(campaign_name,'(sem nome)') AS campaign_name,
       COUNT(DISTINCT ad_id)::int AS anuncios,
       SUM(spend) AS spend,
       ${sumAction(action)}::int AS acoes,
       CASE WHEN ${sumAction(action)} > 0 THEN SUM(spend) / ${sumAction(action)} ELSE 0 END AS custo_acao,
       SUM(impressions)::bigint AS impressions,
       SUM(reach)::bigint AS reach,
       SUM(clicks)::bigint AS clicks
     FROM meta_ads_insights
     WHERE date >= $1 AND date <= $2 AND campaign_name ILIKE $3
     GROUP BY 1 ORDER BY spend DESC`,
    [f.from, f.to, `%${filtroCampanha}%`],
  );
}

export type MetaWhatsAnuncio = {
  ad_id: string;
  ad_name: string;
  campaign_name: string;
  spend: number;
  acoes: number;
  custo_acao: number;
  impressions: number;
  clicks: number;
  imagem: string | null;
};

/** Anúncios [WHATS] com thumbnail do criativo (réplica do card de imagens do relatório de referência). */
export async function getMetaWhatsAnuncios(f: Filtros, limit = 12): Promise<MetaWhatsAnuncio[]> {
  return q<MetaWhatsAnuncio>(
    `SELECT i.ad_id,
       COALESCE(MAX(i.ad_name),'(sem nome)') AS ad_name,
       COALESCE(MAX(i.campaign_name),'(sem campanha)') AS campaign_name,
       SUM(i.spend) AS spend,
       ${sumAction(ACTION_CONVERSA)}::int AS acoes,
       CASE WHEN ${sumAction(ACTION_CONVERSA)} > 0
            THEN SUM(i.spend) / ${sumAction(ACTION_CONVERSA)} ELSE 0 END AS custo_acao,
       SUM(i.impressions)::bigint AS impressions,
       SUM(i.clicks)::bigint AS clicks,
       COALESCE(MAX(c.image_url), MAX(c.thumbnail_url)) AS imagem
     FROM meta_ads_insights i
     LEFT JOIN meta_ad_creatives c ON c.ad_id = i.ad_id
     WHERE i.date >= $1 AND i.date <= $2 AND i.campaign_name ILIKE $3
     GROUP BY i.ad_id
     HAVING SUM(i.spend) > 0
     ORDER BY 5 DESC, 4 DESC
     LIMIT ${Number(limit)}`,
    [f.from, f.to, '%[WHATS]%'],
  );
}

export const getMetaWhatsKpis = (f: Filtros) => metaAcaoKpis(f, '[WHATS]', ACTION_CONVERSA);
export const getMetaWhatsSerie = (f: Filtros) => metaAcaoSerie(f, '[WHATS]', ACTION_CONVERSA);
export const getMetaWhatsCampanhas = (f: Filtros) => metaAcaoCampanhas(f, '[WHATS]', ACTION_CONVERSA);

export const getMetaEngKpis = (f: Filtros) => metaAcaoKpis(f, '[PERFIL]', ACTION_ENGAJAMENTO);
export const getMetaEngSerie = (f: Filtros) => metaAcaoSerie(f, '[PERFIL]', ACTION_ENGAJAMENTO);
export const getMetaEngCampanhas = (f: Filtros) => metaAcaoCampanhas(f, '[PERFIL]', ACTION_ENGAJAMENTO);

// ---- Custo por mensagem (conta inteira) ----
// Investimento TOTAL da conta ÷ conversas de mensagem iniciadas (mesma action da aba WhatsApp,
// mas SEM filtro de campanha — inclui linhas com campaign_name nulo, igual ao getMetaKpis).
// É a eficiência "misturada" da conta: quanto a conta gasta, no todo, por conversa gerada.
export type MetaMsgKpis = { spend: number; mensagens: number; custo_msg: number };

export async function getMetaMsgKpis(f: Filtros): Promise<MetaMsgKpis> {
  const rows = await q<Omit<MetaMsgKpis, 'custo_msg'>>(
    `SELECT COALESCE(SUM(spend),0) AS spend,
       ${sumAction(ACTION_CONVERSA)}::int AS mensagens
     FROM meta_ads_insights
     WHERE date >= $1 AND date <= $2`,
    [f.from, f.to],
  );
  const r = rows[0];
  return { ...r, custo_msg: r.mensagens > 0 ? Number(r.spend) / r.mensagens : 0 };
}

/** Série diária p/ o spark do card "Custo por mensagem" (conta inteira). */
export async function getMetaMsgSerie(f: Filtros): Promise<{ dia: string; custo_msg: number }[]> {
  const rows = await q<{ dia: string; spend: number; mensagens: number }>(
    `SELECT date::text AS dia, SUM(spend) AS spend, ${sumAction(ACTION_CONVERSA)}::int AS mensagens
     FROM meta_ads_insights
     WHERE date >= $1 AND date <= $2
     GROUP BY date ORDER BY date`,
    [f.from, f.to],
  );
  return rows.map((r) => ({ dia: r.dia, custo_msg: r.mensagens > 0 ? Number(r.spend) / r.mensagens : 0 }));
}

// ---------------- Google Ads ----------------

export type GadsKpis = AdsKpis & { conversions: number; conversionsValue: number };

export async function getGadsKpis(f: Filtros): Promise<GadsKpis> {
  const rows = await q<{ spend: number; impressions: number; clicks: number; conversions: number; conversionsvalue: number }>(
    `SELECT COALESCE(SUM(cost),0) AS spend,
       COALESCE(SUM(impressions),0)::bigint AS impressions,
       COALESCE(SUM(clicks),0)::bigint AS clicks,
       COALESCE(SUM(conversions),0) AS conversions,
       COALESCE(SUM(conversions_value),0) AS conversionsvalue
     FROM gads_campaigns_daily WHERE date >= $1 AND date <= $2`,
    [f.from, f.to],
  );
  const r = rows[0];
  return {
    spend: r.spend,
    impressions: r.impressions,
    clicks: r.clicks,
    reach: 0,
    conversions: r.conversions,
    conversionsValue: r.conversionsvalue,
    ctr: Number(r.impressions) > 0 ? Number(r.clicks) / Number(r.impressions) : 0,
    cpc: Number(r.clicks) > 0 ? r.spend / Number(r.clicks) : 0,
  };
}

export async function getGadsSerie(f: Filtros): Promise<AdsSerie[]> {
  return q<AdsSerie>(
    `SELECT date::text AS dia, SUM(cost) AS spend,
       SUM(clicks)::int AS clicks, SUM(impressions)::int AS impressions,
       SUM(conversions) AS conversions
     FROM gads_campaigns_daily WHERE date >= $1 AND date <= $2
     GROUP BY date ORDER BY date`,
    [f.from, f.to],
  );
}

export type GadsCampanha = {
  campaign_name: string;
  channel_type: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
};

export async function getGadsCampanhas(f: Filtros): Promise<GadsCampanha[]> {
  return q<GadsCampanha>(
    `SELECT COALESCE(campaign_name,'(sem nome)') AS campaign_name, MAX(channel_type) AS channel_type,
       SUM(cost) AS spend, SUM(impressions)::bigint AS impressions,
       SUM(clicks)::bigint AS clicks, SUM(conversions) AS conversions
     FROM gads_campaigns_daily WHERE date >= $1 AND date <= $2
     GROUP BY 1 ORDER BY spend DESC`,
    [f.from, f.to],
  );
}

export type GadsKeyword = {
  keyword_text: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
};

export async function getGadsKeywords(f: Filtros, limit = 25): Promise<GadsKeyword[]> {
  return q<GadsKeyword>(
    `SELECT COALESCE(keyword_text,'(sem texto)') AS keyword_text,
       SUM(impressions)::bigint AS impressions, SUM(clicks)::bigint AS clicks,
       SUM(cost) AS cost, SUM(conversions) AS conversions
     FROM gads_keywords_daily WHERE date >= $1 AND date <= $2
     GROUP BY 1 ORDER BY clicks DESC LIMIT ${Number(limit)}`,
    [f.from, f.to],
  );
}

export type GadsTermo = { search_term: string; impressions: number; clicks: number; cost: number };

export async function getGadsTermos(f: Filtros, limit = 25): Promise<GadsTermo[]> {
  return q<GadsTermo>(
    `SELECT search_term, SUM(impressions)::bigint AS impressions,
       SUM(clicks)::bigint AS clicks, SUM(cost) AS cost
     FROM gads_search_terms_daily WHERE date >= $1 AND date <= $2
     GROUP BY 1 ORDER BY clicks DESC LIMIT ${Number(limit)}`,
    [f.from, f.to],
  );
}
