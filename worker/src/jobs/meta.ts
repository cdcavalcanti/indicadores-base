// Meta (Facebook) Marketing API -> warehouse.meta_ads_insights
// Meta Marketing API -> warehouse.meta_ads_insights.
//   GET /act_{id}/insights  level=ad, time_increment=1, janelas de CHUNK_DAYS
//   paginação via paging.next; upsert por (ad_id, date).
import { query } from '../db.ts';
import { config } from '../config.ts';
import { fetchJson } from '../clients/http.ts';
import { info } from '../log.ts';

const FIELDS =
  'account_id,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,objective,optimization_goal,' +
  'spend,impressions,reach,frequency,clicks,inline_link_clicks,cpm,cpc,ctr,' +
  'conversions,actions,action_values,date_start,date_stop';

type InsightRow = Record<string, unknown> & { ad_id?: string; date_start?: string };

function assertMeta() {
  if (!config.meta.accessToken || !config.meta.adAccountId) {
    throw new Error('Meta Ads não configurado: defina META_ACCESS_TOKEN e META_AD_ACCOUNT_ID no .env');
  }
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const jsonOrNull = (v: unknown) => (v === undefined || v === null ? null : JSON.stringify(v));

async function upsertRow(r: InsightRow): Promise<void> {
  if (!r.ad_id || !r.date_start) return;
  await query(
    `INSERT INTO meta_ads_insights
       (ad_account_id, date, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name,
        objective, optimization_goal, spend, impressions, reach, frequency, clicks,
        inline_link_clicks, cpm, cpc, ctr, conversions, actions, action_values, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,now())
     ON CONFLICT (ad_id, date) DO UPDATE SET
       campaign_id = EXCLUDED.campaign_id, campaign_name = EXCLUDED.campaign_name,
       adset_id = EXCLUDED.adset_id, adset_name = EXCLUDED.adset_name, ad_name = EXCLUDED.ad_name,
       objective = EXCLUDED.objective, optimization_goal = EXCLUDED.optimization_goal,
       spend = EXCLUDED.spend, impressions = EXCLUDED.impressions, reach = EXCLUDED.reach,
       frequency = EXCLUDED.frequency, clicks = EXCLUDED.clicks,
       inline_link_clicks = EXCLUDED.inline_link_clicks, cpm = EXCLUDED.cpm, cpc = EXCLUDED.cpc,
       ctr = EXCLUDED.ctr, conversions = EXCLUDED.conversions, actions = EXCLUDED.actions,
       action_values = EXCLUDED.action_values, updated_at = now()`,
    [
      r.account_id ?? null, r.date_start, r.campaign_id ?? null, r.campaign_name ?? null,
      r.adset_id ?? null, r.adset_name ?? null, r.ad_id, r.ad_name ?? null,
      r.objective ?? null, r.optimization_goal ?? null,
      num(r.spend), num(r.impressions), num(r.reach), numOrNull(r.frequency), num(r.clicks),
      numOrNull(r.inline_link_clicks), numOrNull(r.cpm), numOrNull(r.cpc), numOrNull(r.ctr),
      jsonOrNull(r.conversions), jsonOrNull(r.actions), jsonOrNull(r.action_values),
    ],
  );
}

// ---- Criativos (thumbnail dos anúncios, para os cards do painel) ----
// GET /act_{id}/ads?fields=id,name,creative{...}: a URL do thumbnail é CDN
// assinada e expira, então o sync diário renova todas.

type AdCreativeRow = {
  id?: string;
  name?: string;
  creative?: { thumbnail_url?: string; image_url?: string };
};

async function syncCreatives(account: string): Promise<number> {
  const { accessToken, graphVersion } = config.meta;
  let total = 0;
  let url =
    `https://graph.facebook.com/${graphVersion}/${account}/ads` +
    `?fields=id,name,creative.thumbnail_width(512).thumbnail_height(512){thumbnail_url,image_url}` +
    `&limit=200&access_token=${encodeURIComponent(accessToken!)}`;

  let pages = 0;
  while (url && pages < 500) {
    const resp = await fetchJson<{ data: AdCreativeRow[]; paging?: { next?: string } }>(
      url, {}, { label: 'meta/ads-creatives' },
    );
    for (const ad of resp.data ?? []) {
      if (!ad.id) continue;
      await query(
        `INSERT INTO meta_ad_creatives (ad_id, ad_name, thumbnail_url, image_url, updated_at)
         VALUES ($1,$2,$3,$4,now())
         ON CONFLICT (ad_id) DO UPDATE SET
           ad_name = EXCLUDED.ad_name, thumbnail_url = EXCLUDED.thumbnail_url,
           image_url = EXCLUDED.image_url, updated_at = now()`,
        [ad.id, ad.name ?? null, ad.creative?.thumbnail_url ?? null, ad.creative?.image_url ?? null],
      );
      total++;
    }
    url = resp.paging?.next ?? '';
    pages++;
  }
  info(`Meta Ads: ${total} criativos atualizados`);
  return total;
}

export async function syncMeta(): Promise<number> {
  assertMeta();
  const { accessToken, adAccountId, graphVersion, lookbackDays, chunkDays } = config.meta;
  const account = adAccountId!.startsWith('act_') ? adAccountId! : `act_${adAccountId}`;

  let total = 0;
  const hoje = new Date();

  for (let offset = lookbackDays; offset > 0; offset -= chunkDays) {
    const since = new Date(hoje);
    since.setDate(since.getDate() - offset);
    const until = new Date(hoje);
    until.setDate(until.getDate() - Math.max(0, offset - chunkDays + 1));

    const timeRange = JSON.stringify({ since: ymd(since), until: ymd(until) });
    let url =
      `https://graph.facebook.com/${graphVersion}/${account}/insights` +
      `?level=ad&fields=${FIELDS}&time_increment=1&limit=500` +
      `&time_range=${encodeURIComponent(timeRange)}` +
      `&access_token=${encodeURIComponent(accessToken!)}`;

    let pages = 0;
    while (url && pages < 5000) {
      const resp = await fetchJson<{ data: InsightRow[]; paging?: { next?: string } }>(
        url, {}, { label: 'meta/insights' },
      );
      for (const r of resp.data ?? []) {
        await upsertRow(r);
        total++;
      }
      url = resp.paging?.next ?? '';
      pages++;
    }
    info(`Meta Ads: janela ${ymd(since)}..${ymd(until)} ok (acum. ${total})`);
  }

  total += await syncCreatives(account);
  return total;
}
