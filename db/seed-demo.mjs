/**
 * Dados sintéticos para abrir o painel sem o ETL real.
 * Não são números da operação. Rode depois do schema.sql.
 *
 *   DATABASE_URL=postgres://vortex:vortex@localhost:5432/vortex_insights node db/seed-demo.mjs
 */
import pg from '../app/node_modules/pg/lib/index.js';

const url = process.env.DATABASE_URL || 'postgres://vortex:vortex@localhost:5432/vortex_insights';
const client = new pg.Client({ connectionString: url });

const LOJAS = [
  ['Loja Centro', 1],
  ['Loja Norte', 0.62],
  ['Loja Sul', 0.55],
  ['Loja Leste', 0.4],
  ['Loja Jardim', 0.38],
  ['Loja Serra', 0.28],
  ['Depósito', 0.08],
];
const METAS = [980000, 460000, 430000, 310000, 290000, 230000, 40000];
const VENDEDORES = ['Ana Lima', 'Bruno Costa', 'Carla Nunes', 'Diego Prado'];
const SHARES = [0.34, 0.28, 0.22, 0.16];
const PRODUTOS = [
  ['ACR18', 'Acrílico fosco 18 L', 0.22],
  ['ESM36', 'Esmalte sintético 3,6 L', 0.16],
  ['MAS25', 'Massa corrida 25 kg', 0.14],
  ['SEL18', 'Selador acrílico 18 L', 0.12],
  ['VER36', 'Verniz marítimo 3,6 L', 0.1],
  ['TEX25', 'Textura média 25 kg', 0.1],
  ['DIL05', 'Diluente 5 L', 0.08],
  ['ROL23', 'Rolo de lã 23 cm', 0.08],
];

function iso(date) {
  return date.toISOString().slice(0, 10);
}
function eachDay(from, to) {
  const days = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    days.push(iso(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}
function onda(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const days = eachDay(new Date('2026-08-01T00:00:00Z'), new Date('2026-10-14T00:00:00Z'));

await client.connect();
await client.query('BEGIN');
await client.query('SET search_path TO warehouse');

await client.query(`
  TRUNCATE
    fact_vendas_dia,
    fact_vendas_vendedor_dia,
    fact_vendas_produto_dia,
    fact_cobranca_evento,
    ig_media,
    ig_account_daily,
    meta_ads_insights,
    meta_ad_creatives,
    gads_campaigns_daily,
    gads_adgroups_daily,
    gads_keywords_daily,
    gads_search_terms_daily,
    etl_sync_log
`);

for (const mes of [8, 9, 10]) {
  for (let i = 0; i < LOJAS.length; i++) {
    await client.query(
      `INSERT INTO dim_meta (filial, ano, mes, valor)
       VALUES ($1, 2026, $2, $3)
       ON CONFLICT (filial, ano, mes) DO UPDATE SET valor = EXCLUDED.valor`,
      [LOJAS[i][0], mes, METAS[i]],
    );
  }
}

let n = 0;
for (const dia of days) {
  const dow = new Date(`${dia}T00:00:00Z`).getUTCDay();
  const semana = dow === 0 ? 0.42 : dow === 6 ? 0.72 : 1;
  for (let i = 0; i < LOJAS.length; i++) {
    const [filial, peso] = LOJAS[i];
    const ruido = 0.82 + onda(n++) * 0.36;
    const liquidoCliente = Math.round(peso * 24000 * semana * ruido);
    const transferencia = Math.round(liquidoCliente * 0.04);
    const devolucao = Math.round(liquidoCliente * 0.028);
    const qtd = Math.max(1, Math.round(liquidoCliente / 430));
    const qtdDev = Math.max(0, Math.round(qtd * 0.04));
    const bruto = liquidoCliente + devolucao + transferencia;
    const liquido = liquidoCliente + transferencia;

    await client.query(
      `INSERT INTO fact_vendas_dia
        (filial, dia, qtd_vendas, qtd_devolucoes, faturamento_bruto, valor_devolucoes, faturamento_liquido, faturamento_previsto)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [filial, dia, qtd + Math.round(qtd * 0.04), qtdDev, bruto, devolucao, liquido, Math.round(liquido * 1.03)],
    );

    for (let v = 0; v < VENDEDORES.length; v++) {
      const parte = SHARES[v];
      const liqV = Math.round(liquidoCliente * parte);
      const qtdV = Math.max(1, Math.round(qtd * parte));
      await client.query(
        `INSERT INTO fact_vendas_vendedor_dia
          (filial, dia, codigo_vendedor, nome_vendedor, qtd_vendas, faturamento_bruto, valor_devolucoes, faturamento_liquido, faturamento_previsto)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [filial, dia, `V${i}${v}`, VENDEDORES[v], qtdV, liqV + Math.round(devolucao * parte), Math.round(devolucao * parte), liqV, Math.round(liqV * 1.03)],
      );
    }
    await client.query(
      `INSERT INTO fact_vendas_vendedor_dia
        (filial, dia, codigo_vendedor, nome_vendedor, qtd_vendas, faturamento_bruto, valor_devolucoes, faturamento_liquido, faturamento_previsto)
       VALUES ($1,$2,'TR',$3,1,$4,0,$4,$4)`,
      [filial, dia, 'TRANSFERENCIA', transferencia],
    );

    for (let p = 0; p < PRODUTOS.length; p++) {
      const [codigo, nome, fatia] = PRODUTOS[p];
      const tabela = Math.round((liquidoCliente + devolucao) * fatia * 1.12);
      const receita = Math.round(liquidoCliente * fatia);
      const custo = Math.round(receita * 0.61);
      const un = Math.max(1, Math.round(qtd * fatia));
      await client.query(
        `INSERT INTO fact_vendas_produto_dia
          (filial, dia, codigo_produto, nome_produto, quantidade_vendida, faturamento_bruto, custo_total, receita_liquida)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [filial, dia, codigo, nome, un, tabela, custo, receita],
      );
    }
  }
}

const avisos = ['vence_em_3_dias', 'vence_hoje', 'vencido_ha_3_dias'];
for (let i = 0; i < 36; i++) {
  const dia = days[days.length - 1 - (i % 28)];
  const filial = LOJAS[i % LOJAS.length][0];
  const tipo = avisos[i % avisos.length];
  const pago = i % 3 === 0;
  const valor = 800 + (i % 9) * 450;
  await client.query(
    `INSERT INTO fact_cobranca_evento
      (id_evento, data_evento, dia, tipo_aviso, template, status_evento, is_whatsapp,
       cliente_id, cliente_nome, titulo_id, nro_doc, valor, vencimento, filial, status_pagamento)
     VALUES ($1,$2::date,$2::date,$3,'regua_demo',$4,true,$5,$6,$7,$8,$9,$2::date,$10,$11)`,
    [
      `demo-${i}`,
      dia,
      tipo,
      i % 11 === 0 ? 'falha_meta' : pago ? 'pago_antes_envio' : 'enviado_ok',
      `cli-${i}`,
      `Cliente demo ${i + 1}`,
      `tit-${i}`,
      `DOC-${1000 + i}`,
      valor,
      filial,
      pago ? 'pago' : 'em_aberto',
    ],
  );
}

const legendas = [
  'Cor na parede da sala, antes e depois.',
  'Esmalte na esquadria: o brilho no fim da tarde.',
  'Textura na fachada da loja.',
  'Como escolher o fundo certo.',
  'Rolo novo, canto limpo.',
  'Verniz na madeira da varanda.',
];
for (let i = 0; i < 18; i++) {
  const dia = days[days.length - 2 - i * 3];
  await client.query(
    `INSERT INTO ig_media
      (id, media_type, media_product_type, comments_count, like_count, caption, timestamp, reach, saved, follows, shares)
     VALUES ($1,'IMAGE',$2,$3,$4,$5,$6::date, $7,$8,$9,$10)`,
    [
      `ig-demo-${i}`,
      i % 4 === 0 ? 'REELS' : 'FEED',
      4 + (i % 7),
      80 + i * 17,
      legendas[i % legendas.length],
      dia,
      1200 + i * 180,
      10 + i,
      i % 5,
      3 + (i % 4),
    ],
  );
  await client.query(
    `INSERT INTO ig_account_daily (date, follower_count, followers_total)
     VALUES ($1::date, $2, $3)
     ON CONFLICT (date) DO NOTHING`,
    [dia, 8 + (i % 6), 18400 + i * 12],
  );
}

const campanhas = [
  ['[WHATS] Conversas da loja', 'ad-whats-1', 'Anúncio conversa balcão'],
  ['[WHATS] Régua de orçamento', 'ad-whats-2', 'Anúncio orçamento'],
  ['[PERFIL] Alcance da marca', 'ad-perfil-1', 'Anúncio alcance'],
  ['Sempre cor — conversão', 'ad-conv-1', 'Anúncio catálogo'],
];
for (const dia of days.filter((_, idx) => idx % 1 === 0)) {
  for (let c = 0; c < campanhas.length; c++) {
    const [nome, adId, adName] = campanhas[c];
    const spend = Math.round((40 + c * 18) * (0.7 + onda(n++) * 0.6));
    const impressions = spend * 38;
    const clicks = Math.round(impressions * 0.018);
    const conversas = 2 + (c % 3);
    const engajamento = 15 + c * 4;
    await client.query(
      `INSERT INTO meta_ads_insights
        (ad_account_id, date, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name,
         spend, impressions, reach, clicks, actions)
       VALUES ('demo', $1::date, $2, $3, $4, 'conjunto', $5, $6, $7, $8, $9, $10, $11::jsonb)`,
      [
        dia,
        `camp-${c}`,
        nome,
        `set-${c}`,
        adId,
        adName,
        spend,
        impressions,
        Math.round(impressions * 0.72),
        clicks,
        JSON.stringify([
          { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: String(conversas) },
          { action_type: 'post_engagement', value: String(engajamento) },
        ]),
      ],
    );
  }
}

for (const [adId, adName] of [
  ['ad-whats-1', 'Anúncio conversa balcão'],
  ['ad-whats-2', 'Anúncio orçamento'],
]) {
  await client.query(
    `INSERT INTO meta_ad_creatives (ad_id, ad_name) VALUES ($1, $2) ON CONFLICT (ad_id) DO NOTHING`,
    [adId, adName],
  );
}

const gCampanhas = [
  ['g-marca', 'Marca — tintas'],
  ['g-produto', 'Produto — acrílico'],
  ['g-loja', 'Loja — perto de mim'],
];
for (const dia of days) {
  for (let c = 0; c < gCampanhas.length; c++) {
    const [id, nome] = gCampanhas[c];
    const clicks = 20 + c * 8 + Math.round(onda(n++) * 10);
    const impressions = clicks * 22;
    const cost = Math.round(clicks * (1.4 + c * 0.3));
    await client.query(
      `INSERT INTO gads_campaigns_daily
        (customer_id, campaign_id, date, campaign_name, status, channel_type, impressions, clicks, cost, conversions, conversions_value)
       VALUES ('demo', $1, $2::date, $3, 'ENABLED', 'SEARCH', $4, $5, $6, $7, $8)`,
      [id, dia, nome, impressions, clicks, cost, +(clicks * 0.08).toFixed(2), Math.round(cost * 4.2)],
    );
    await client.query(
      `INSERT INTO gads_keywords_daily
        (customer_id, ad_group_id, criterion_id, date, keyword_text, match_type, impressions, clicks, cost, conversions)
       VALUES ('demo', $1, $2, $3::date, $4, 'PHRASE', $5, $6, $7, $8)`,
      [`ag-${c}`, `kw-${c}`, dia, ['tinta acrílica', 'tinta para parede', 'loja de tinta'][c], impressions, clicks, cost, +(clicks * 0.08).toFixed(2)],
    );
    await client.query(
      `INSERT INTO gads_search_terms_daily
        (customer_id, ad_group_id, date, search_term, impressions, clicks, cost, conversions)
       VALUES ('demo', $1, $2::date, $3, $4, $5, $6, $7)`,
      [`ag-${c}`, dia, ['tinta lavável fosca', 'quanto custa pintar sala', 'tinta perto'][c], impressions, clicks, cost, +(clicks * 0.05).toFixed(2)],
    );
  }
}

for (const source of ['sales', 'instagram', 'meta', 'google_ads']) {
  await client.query(
    `INSERT INTO etl_sync_log (source, started_at, finished_at, status, rows)
     VALUES ($1, now() - interval '2 hours', now() - interval '2 hours' + interval '3 minutes', 'ok', $2)`,
    [source, 400 + source.length * 10],
  );
}

await client.query('COMMIT');
await client.end();
console.log(`seed ok: ${days.length} dias`);
