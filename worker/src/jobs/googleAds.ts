// Google Ads API -> warehouse.gads_*
// Google Ads API -> warehouse.gads_*.
//   1) OAuth refresh em oauth2.googleapis.com/token
//   2) POST customers/{cid}/googleAds:searchStream com 4 GAQLs
//      (campanhas, ad groups, keywords, search terms), lookback em dias
//   3) Upsert nas tabelas gads_*  (cost_micros -> cost em moeda)
import { query } from '../db.ts';
import { config } from '../config.ts';
import { fetchJson } from '../clients/http.ts';
import { info } from '../log.ts';

const API_VERSION = 'v24';

function assertGads() {
  const g = config.googleAds;
  if (!g.developerToken || !g.clientId || !g.clientSecret || !g.refreshToken || !g.customerId) {
    throw new Error(
      'Google Ads não configurado: defina GADS_DEVELOPER_TOKEN, GADS_CLIENT_ID, GADS_CLIENT_SECRET, GADS_REFRESH_TOKEN e GADS_CUSTOMER_ID no .env',
    );
  }
}

async function accessToken(): Promise<string> {
  const g = config.googleAds;
  const body = new URLSearchParams({
    client_id: g.clientId!,
    client_secret: g.clientSecret!,
    refresh_token: g.refreshToken!,
    grant_type: 'refresh_token',
  });
  const r = await fetchJson<{ access_token: string }>(
    'https://oauth2.googleapis.com/token',
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body },
    { label: 'gads/oauth' },
  );
  return r.access_token;
}

type GadsRow = Record<string, any>;

/** searchStream retorna um ARRAY de batches, cada um com results[]. */
async function gaql(token: string, q: string): Promise<GadsRow[]> {
  const g = config.googleAds;
  const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${g.customerId}/googleAds:searchStream`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'developer-token': g.developerToken!,
    'Content-Type': 'application/json',
  };
  if (g.loginCustomerId) headers['login-customer-id'] = g.loginCustomerId;

  const resp = await fetchJson<unknown>(url, { method: 'POST', headers, body: JSON.stringify({ query: q }) }, { label: 'gads/search' });
  const batches = Array.isArray(resp) ? resp : [resp];
  const rows: GadsRow[] = [];
  for (const b of batches) rows.push(...(((b as any)?.results ?? []) as GadsRow[]));
  return rows;
}

const micros = (v: unknown) => Number(v ?? 0) / 1_000_000;
const num = (v: unknown) => Number(v ?? 0);

function dateRange(opts: { from?: string; to?: string }): string {
  // GAQL aceita DURING LAST_7_DAYS etc., mas BETWEEN dá controle fino do lookback.
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fim = new Date();
  const ini = new Date();
  ini.setDate(ini.getDate() - config.googleAds.lookbackDays);
  return `segments.date BETWEEN '${opts.from ?? ymd(ini)}' AND '${opts.to ?? ymd(fim)}'`;
}

export async function syncGoogleAds(opts: { from?: string; to?: string } = {}): Promise<number> {
  assertGads();
  const token = await accessToken();
  const cid = config.googleAds.customerId!;
  const range = dateRange(opts);
  info(`Google Ads: ${range}`);
  let total = 0;

  // ---- Campanhas ----
  const camps = await gaql(token, `
    SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
           segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros,
           metrics.conversions, metrics.conversions_value
    FROM campaign WHERE ${range}`);
  for (const r of camps) {
    await query(
      `INSERT INTO gads_campaigns_daily (customer_id, campaign_id, date, campaign_name, status, channel_type,
         impressions, clicks, cost, conversions, conversions_value, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
       ON CONFLICT (customer_id, campaign_id, date) DO UPDATE SET
         campaign_name=EXCLUDED.campaign_name, status=EXCLUDED.status, channel_type=EXCLUDED.channel_type,
         impressions=EXCLUDED.impressions, clicks=EXCLUDED.clicks, cost=EXCLUDED.cost,
         conversions=EXCLUDED.conversions, conversions_value=EXCLUDED.conversions_value, updated_at=now()`,
      [cid, String(r.campaign?.id), r.segments?.date, r.campaign?.name ?? null, r.campaign?.status ?? null,
       r.campaign?.advertisingChannelType ?? null, num(r.metrics?.impressions), num(r.metrics?.clicks),
       micros(r.metrics?.costMicros), num(r.metrics?.conversions), num(r.metrics?.conversionsValue)],
    );
    total++;
  }
  info(`Google Ads: ${camps.length} linhas de campanhas`);

  // ---- Ad Groups ----
  const groups = await gaql(token, `
    SELECT campaign.id, ad_group.id, ad_group.name, ad_group.status, segments.date,
           metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value
    FROM ad_group WHERE ${range}`);
  for (const r of groups) {
    await query(
      `INSERT INTO gads_adgroups_daily (customer_id, campaign_id, ad_group_id, date, ad_group_name, status,
         impressions, clicks, cost, conversions, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
       ON CONFLICT (customer_id, ad_group_id, date) DO UPDATE SET
         campaign_id=EXCLUDED.campaign_id, ad_group_name=EXCLUDED.ad_group_name, status=EXCLUDED.status,
         impressions=EXCLUDED.impressions, clicks=EXCLUDED.clicks, cost=EXCLUDED.cost,
         conversions=EXCLUDED.conversions, updated_at=now()`,
      [cid, String(r.campaign?.id), String(r.adGroup?.id), r.segments?.date, r.adGroup?.name ?? null,
       r.adGroup?.status ?? null, num(r.metrics?.impressions), num(r.metrics?.clicks),
       micros(r.metrics?.costMicros), num(r.metrics?.conversions)],
    );
    total++;
  }
  info(`Google Ads: ${groups.length} linhas de ad groups`);

  // ---- Keywords ----
  const kws = await gaql(token, `
    SELECT campaign.id, ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text,
           ad_group_criterion.keyword.match_type, segments.date,
           metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value
    FROM keyword_view WHERE ${range}`);
  for (const r of kws) {
    await query(
      `INSERT INTO gads_keywords_daily (customer_id, ad_group_id, criterion_id, date, keyword_text, match_type,
         impressions, clicks, cost, conversions, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
       ON CONFLICT (customer_id, criterion_id, ad_group_id, date) DO UPDATE SET
         keyword_text=EXCLUDED.keyword_text, match_type=EXCLUDED.match_type,
         impressions=EXCLUDED.impressions, clicks=EXCLUDED.clicks, cost=EXCLUDED.cost,
         conversions=EXCLUDED.conversions, updated_at=now()`,
      [cid, String(r.adGroup?.id), String(r.adGroupCriterion?.criterionId), r.segments?.date,
       r.adGroupCriterion?.keyword?.text ?? null, r.adGroupCriterion?.keyword?.matchType ?? null,
       num(r.metrics?.impressions), num(r.metrics?.clicks), micros(r.metrics?.costMicros), num(r.metrics?.conversions)],
    );
    total++;
  }
  info(`Google Ads: ${kws.length} linhas de keywords`);

  // ---- Search Terms ----
  const terms = await gaql(token, `
    SELECT campaign.id, ad_group.id, search_term_view.search_term, segments.date,
           metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
    FROM search_term_view WHERE ${range}`);
  for (const r of terms) {
    await query(
      `INSERT INTO gads_search_terms_daily (customer_id, ad_group_id, date, search_term,
         impressions, clicks, cost, conversions, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
       ON CONFLICT (customer_id, ad_group_id, date, search_term) DO UPDATE SET
         impressions=EXCLUDED.impressions, clicks=EXCLUDED.clicks, cost=EXCLUDED.cost,
         conversions=EXCLUDED.conversions, updated_at=now()`,
      [cid, String(r.adGroup?.id), r.segments?.date, r.searchTermView?.searchTerm ?? '',
       num(r.metrics?.impressions), num(r.metrics?.clicks), micros(r.metrics?.costMicros), num(r.metrics?.conversions)],
    );
    total++;
  }
  info(`Google Ads: ${terms.length} linhas de search terms`);

  return total;
}
