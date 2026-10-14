// Instagram Graph API -> warehouse.ig_media
// Instagram Graph API -> warehouse.ig_media.
//   1) GET /{IG_USER_ID}/media (paginado) -> upsert dos campos de mídia
//   2) Para mídias recentes: GET /{media_id}/insights (lifetime) pivotado em colunas.
//      FEED aceita mais métricas; REELS rejeita algumas -> tenta o conjunto cheio
//      e cai para o reduzido (reach,saved) se a API recusar (mesma estratégia do n8n).
import { query } from '../db.ts';
import { config } from '../config.ts';
import { fetchJson } from '../clients/http.ts';
import { info } from '../log.ts';

type Media = {
  id: string;
  media_type?: string;
  media_product_type?: string;
  comments_count?: number;
  like_count?: number;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  caption?: string;
};

const MEDIA_FIELDS =
  'id,media_type,media_product_type,comments_count,like_count,media_url,thumbnail_url,permalink,timestamp,caption';
const METRICS_FULL = 'reach,saved,profile_visits,follows,likes,comments,shares,reposts';
const METRICS_REDUCED = 'reach,saved';
// Colunas de insight que persistimos (likes/comments já vêm da própria mídia)
const INSIGHT_COLS = ['reach', 'saved', 'profile_visits', 'follows', 'shares', 'reposts'] as const;

function assertIg() {
  if (!config.instagram.accessToken || !config.instagram.userId) {
    throw new Error('Instagram não configurado: defina IG_ACCESS_TOKEN e IG_USER_ID no .env');
  }
}

async function* listMedia(): AsyncGenerator<Media[]> {
  const { accessToken, userId, graphVersion } = config.instagram;
  let url =
    `https://graph.facebook.com/${graphVersion}/${userId}/media` +
    `?fields=${MEDIA_FIELDS}&limit=100&access_token=${encodeURIComponent(accessToken!)}`;
  while (url) {
    const page = await fetchJson<{ data: Media[]; paging?: { next?: string } }>(url, {}, { label: 'ig/media' });
    yield page.data ?? [];
    url = page.paging?.next ?? '';
  }
}

async function upsertMedia(m: Media): Promise<void> {
  await query(
    `INSERT INTO ig_media (id, media_type, media_product_type, comments_count, like_count, media_url, thumbnail_url, permalink, caption, timestamp, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
     ON CONFLICT (id) DO UPDATE SET
       media_type = EXCLUDED.media_type,
       media_product_type = EXCLUDED.media_product_type,
       comments_count = EXCLUDED.comments_count,
       like_count = EXCLUDED.like_count,
       media_url = EXCLUDED.media_url,
       thumbnail_url = COALESCE(EXCLUDED.thumbnail_url, ig_media.thumbnail_url),
       permalink = COALESCE(EXCLUDED.permalink, ig_media.permalink),
       caption = EXCLUDED.caption,
       timestamp = EXCLUDED.timestamp,
       updated_at = now()`,
    [m.id, m.media_type ?? null, m.media_product_type ?? null, m.comments_count ?? null,
     m.like_count ?? null, m.media_url ?? null, m.thumbnail_url ?? null, m.permalink ?? null,
     m.caption ?? null, m.timestamp ?? null],
  );
}

/** URL da imagem a persistir: vídeo/reels usa thumbnail; senão media_url (ou thumbnail). */
function imagemUrl(m: Media): string | null {
  if (m.media_type === 'VIDEO') return m.thumbnail_url ?? m.media_url ?? null;
  return m.media_url ?? m.thumbnail_url ?? null;
}

/**
 * Baixa a imagem do post e guarda os BYTES em ig_media (image_data/image_mime).
 * As URLs do CDN do Instagram expiram em horas/dias — servir do banco resolve de vez.
 * Best-effort: falha aqui nunca derruba o sync (o card cai no placeholder).
 */
async function gravarImagem(m: Media): Promise<boolean> {
  const url = imagemUrl(m);
  if (!url) return false;
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const mime = res.headers.get('content-type') ?? 'image/jpeg';
    if (!mime.startsWith('image/')) return false; // não guardar HTML de erro / vídeo
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return false;
    await query(
      `UPDATE ig_media SET image_data = $2, image_mime = $3, image_at = now(), updated_at = now() WHERE id = $1`,
      [m.id, buf, mime],
    );
    return true;
  } catch {
    return false;
  }
}

type InsightMetric = { name: string; values?: { value?: unknown }[] };

function pivot(metrics: InsightMetric[]): Record<string, number | null> {
  const row: Record<string, number | null> = {};
  for (const m of metrics ?? []) {
    if (!m?.name) continue;
    const v = Number(m.values?.[0]?.value);
    row[m.name] = Number.isFinite(v) ? v : null;
  }
  return row;
}

async function fetchInsights(mediaId: string): Promise<Record<string, number | null> | null> {
  const { accessToken, graphVersion } = config.instagram;
  const mk = (metrics: string) =>
    `https://graph.facebook.com/${graphVersion}/${mediaId}/insights` +
    `?metric=${metrics}&period=lifetime&access_token=${encodeURIComponent(accessToken!)}`;
  try {
    const r = await fetchJson<{ data: InsightMetric[] }>(mk(METRICS_FULL), {}, { label: 'ig/insights', retries: 1 });
    return pivot(r.data);
  } catch {
    try {
      const r = await fetchJson<{ data: InsightMetric[] }>(mk(METRICS_REDUCED), {}, { label: 'ig/insights-reduced', retries: 1 });
      return pivot(r.data);
    } catch {
      return null; // mídia sem insights disponíveis (ex.: muito antiga) — segue o jogo
    }
  }
}

export async function syncInstagram(): Promise<number> {
  assertIg();
  let count = 0;
  const recentes: Media[] = [];
  const todas: Media[] = [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - config.instagram.insightsDays);

  for await (const page of listMedia()) {
    for (const m of page) {
      await upsertMedia(m);
      count++;
      todas.push(m);
      if (m.timestamp && new Date(m.timestamp) >= cutoff) recentes.push(m);
    }
  }
  info(`Instagram: ${count} mídias sincronizadas; insights p/ ${recentes.length} recentes (${config.instagram.insightsDays}d)`);

  let ok = 0;
  for (const m of recentes) {
    if (await gravarInsights(m.id)) ok++;
  }
  info(`Instagram: insights gravados em ${ok}/${recentes.length} mídias`);

  // Baixa a imagem de todo post que ainda não a tem, usando a URL da LISTAGEM (válida agora —
  // o endpoint por-id /{media_id} nem sempre resolve mídias antigas). O sync diário vai
  // preenchendo o que faltar sem depender do backfill por-id.
  const semImg = new Set(
    (await query<{ id: string }>(`SELECT id FROM ig_media WHERE image_data IS NULL`)).rows.map((r) => r.id),
  );
  let img = 0;
  for (const m of todas) {
    if (!semImg.has(m.id)) continue;
    if (await gravarImagem(m)) img++;
  }
  info(`Instagram: imagens baixadas em ${img}/${semImg.size} pendentes`);

  // métricas diárias da conta (seguidores/dia) — falha aqui não derruba o sync de mídia
  try {
    await syncIgAccountDaily();
  } catch (e) {
    info('Instagram conta: falhou (segue o jogo) -> ' + (e instanceof Error ? e.message : e));
  }
  return count;
}

async function gravarInsights(mediaId: string): Promise<boolean> {
  const ins = await fetchInsights(mediaId);
  if (!ins) return false;
  const sets = INSIGHT_COLS.map((c, i) => `${c} = $${i + 2}`).join(', ');
  await query(
    `UPDATE ig_media SET ${sets}, insights_at = now(), updated_at = now() WHERE id = $1`,
    [mediaId, ...INSIGHT_COLS.map((c) => ins[c] ?? null)],
  );
  return true;
}

/**
 * Métricas diárias da CONTA: seguidores ganhos por dia (follower_count, period=day —
 * a API devolve no máx. ~30 dias) + snapshot do total atual de seguidores.
 * Rodando todo dia, acumula histórico contínuo a partir de agora.
 */
export async function syncIgAccountDaily(): Promise<number> {
  assertIg();
  const { accessToken, userId, graphVersion } = config.instagram;

  // A API limita follower_count a ~30 dias; sem since/until devolve só 2.
  // Janelas de 29 dias para cobrir os 30 permitidos.
  let n = 0;
  const agora = Math.floor(Date.now() / 1000);
  const DIA = 86400;
  const since = agora - 29 * DIA;
  const ins = await fetchJson<{ data: { name: string; values: { value: number; end_time: string }[] }[] }>(
    `https://graph.facebook.com/${graphVersion}/${userId}/insights` +
      `?metric=follower_count&period=day&since=${since}&until=${agora}` +
      `&access_token=${encodeURIComponent(accessToken!)}`,
    {},
    { label: 'ig/account-insights' },
  );
  for (const m of ins.data ?? []) {
    for (const v of m.values ?? []) {
      const date = String(v.end_time).slice(0, 10);
      await query(
        `INSERT INTO ig_account_daily (date, follower_count, updated_at) VALUES ($1,$2,now())
         ON CONFLICT (date) DO UPDATE SET follower_count = EXCLUDED.follower_count, updated_at = now()`,
        [date, Number(v.value) || 0],
      );
      n++;
    }
  }

  // total atual de seguidores -> snapshot no dia de hoje
  const conta = await fetchJson<{ followers_count?: number }>(
    `https://graph.facebook.com/${graphVersion}/${userId}` +
      `?fields=followers_count&access_token=${encodeURIComponent(accessToken!)}`,
    {},
    { label: 'ig/account' },
  );
  if (conta.followers_count != null) {
    await query(
      `INSERT INTO ig_account_daily (date, followers_total, updated_at) VALUES (CURRENT_DATE, $1, now())
       ON CONFLICT (date) DO UPDATE SET followers_total = EXCLUDED.followers_total, updated_at = now()`,
      [conta.followers_count],
    );
  }
  info(`Instagram conta: ${n} dias de follower_count; total atual = ${conta.followers_count ?? '?'}`);
  return n;
}

/**
 * Backfill one-shot das IMAGENS: para cada post sem image_data, busca a URL FRESCA da API
 * (a salva no banco já expirou) e baixa os bytes. Resumível: rode de novo p/ continuar.
 * `limit` opcional limita o lote (rate limit); default = todos.
 */
export async function backfillIgImages(limit?: number): Promise<number> {
  assertIg();
  const { accessToken, graphVersion } = config.instagram;
  const cap = limit && limit > 0 ? ` LIMIT ${Math.floor(limit)}` : '';
  const pend = await query<{ id: string }>(
    `SELECT id FROM ig_media WHERE image_data IS NULL ORDER BY timestamp DESC NULLS LAST${cap}`,
  );
  info(`Instagram imagens-backfill: ${pend.rows.length} posts sem imagem`);
  let ok = 0, fail = 0;
  for (const [i, r] of pend.rows.entries()) {
    try {
      // URL fresca direto da API (a do banco expirou)
      const fresh = await fetchJson<Media>(
        `https://graph.facebook.com/${graphVersion}/${r.id}` +
          `?fields=id,media_type,media_url,thumbnail_url&access_token=${encodeURIComponent(accessToken!)}`,
        {},
        { label: 'ig/media-one', retries: 1 },
      );
      if (await gravarImagem(fresh)) ok++; else fail++;
    } catch {
      fail++;
    }
    if ((i + 1) % 25 === 0) info(`  progresso: ${i + 1}/${pend.rows.length} (ok ${ok}, falha ${fail})`);
    await new Promise((res) => setTimeout(res, 150)); // não martelar a API
  }
  info(`Instagram imagens-backfill: concluído — ${ok} baixadas, ${fail} sem imagem`);
  return ok;
}

/**
 * Backfill one-shot: busca insights de TODOS os posts ainda sem insights_at,
 * do mais novo para o mais velho. Resumível: se a API limitar (rate limit),
 * basta rodar de novo que continua de onde parou.
 */
export async function backfillIgInsights(): Promise<number> {
  assertIg();
  const pend = await query<{ id: string }>(
    `SELECT id FROM ig_media WHERE insights_at IS NULL ORDER BY timestamp DESC NULLS LAST`,
  );
  info(`Instagram insights-backfill: ${pend.rows.length} posts pendentes`);
  let ok = 0, fail = 0;
  for (const [i, r] of pend.rows.entries()) {
    if (await gravarInsights(r.id)) ok++;
    else fail++;
    if ((i + 1) % 50 === 0) info(`  progresso: ${i + 1}/${pend.rows.length} (ok ${ok}, sem insights ${fail})`);
    await new Promise((res) => setTimeout(res, 150)); // não martelar a API
  }
  info(`Instagram insights-backfill: concluído — ${ok} com insights, ${fail} sem (posts antigos podem não ter)`);
  return ok;
}
