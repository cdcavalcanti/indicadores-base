// Leitura da planilha da régua de cobrança -> linhas mapeadas por nome de header.
// Dois modos (escolhidos por presença de GOOGLE_SERVICE_ACCOUNT_JSON):
//  1) Service account (recomendado, planilha privada): assina um JWT RS256 com
//     node:crypto, troca por access token e usa a Sheets API v4 (values JSON).
//  2) CSV publicado (fallback de transição): export?format=csv&gid= + parser CSV.
// Estilo "fetch + token manual" igual ao googleAds.ts (sem dependência pesada).
import { existsSync, readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { config } from '../config.ts';
import { fetchJson } from './http.ts';
import { info } from '../log.ts';

export type SheetRow = Record<string, string>;

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function loadServiceAccount(raw: string): ServiceAccount {
  const text = raw.trim().startsWith('{') ? raw : readFileSync(raw, 'utf8');
  const sa = JSON.parse(text) as ServiceAccount;
  // .env às vezes guarda a chave com \n literal — normaliza p/ quebras reais.
  sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  return sa;
}

async function accessToken(sa: ServiceAccount): Promise<string> {
  const tokenUri = sa.token_uri ?? 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const signature = b64url(createSign('RSA-SHA256').update(unsigned).end().sign(sa.private_key));
  const r = await fetchJson<{ access_token: string }>(
    tokenUri,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${unsigned}.${signature}`,
      }),
    },
    { label: 'sheets/oauth' },
  );
  return r.access_token;
}

/** Resolve o título da aba a partir do gid (a Sheets API usa o título no range). */
async function abaPorGid(sheetId: string, gid: string, token: string): Promise<string> {
  const meta = await fetchJson<{ sheets: { properties: { sheetId: number; title: string } }[] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties(sheetId,title)`,
    { headers: { Authorization: `Bearer ${token}` } },
    { label: 'sheets/meta' },
  );
  const found = meta.sheets.find((s) => String(s.properties.sheetId) === String(gid));
  if (!found) throw new Error(`Aba gid=${gid} não encontrada na planilha ${sheetId}`);
  return found.properties.title;
}

function linhasParaObjetos(values: string[][]): SheetRow[] {
  if (!values.length) return [];
  const header = values[0].map((h) => h.trim());
  return values.slice(1).map((row) => {
    const obj: SheetRow = {};
    header.forEach((h, i) => {
      obj[h] = (row[i] ?? '').trim();
    });
    return obj;
  });
}

// --- Parser CSV mínimo (campos entre aspas com vírgula, ex.: "1671,92") ---
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ''));
}

async function fetchViaCsv(sheetId: string, gid: string): Promise<SheetRow[]> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  const res = await fetch(url); // segue o redirect assinado do Google automaticamente
  if (!res.ok) throw new Error(`sheets/csv ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return linhasParaObjetos(parseCsv(await res.text()));
}

async function fetchViaApi(sheetId: string, gid: string, range: string | undefined, saRaw: string): Promise<SheetRow[]> {
  const sa = loadServiceAccount(saRaw);
  const token = await accessToken(sa);
  const aba = range ?? `'${(await abaPorGid(sheetId, gid, token)).replace(/'/g, "''")}'`;
  const r = await fetchJson<{ values?: string[][] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(aba)}`,
    { headers: { Authorization: `Bearer ${token}` } },
    { label: 'sheets/values' },
  );
  return linhasParaObjetos(r.values ?? []);
}

/** Lê todas as linhas da planilha de cobrança como objetos {header: valor}. */
export async function fetchCobrancaRows(): Promise<SheetRow[]> {
  const { sheetId, gid, range, serviceAccountJson } = config.cobranca;
  if (!sheetId) throw new Error('Cobrança não configurada: defina SHEETS_COBRANCA_ID no .env');
  if (serviceAccountJson) {
    info('Cobrança: lendo planilha via Sheets API (service account)');
    return fetchViaApi(sheetId, gid, range, serviceAccountJson);
  }
  info('Cobrança: lendo planilha via CSV publicado (fallback — sem service account)');
  return fetchViaCsv(sheetId, gid);
}
