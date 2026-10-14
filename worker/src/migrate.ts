import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { pool } from './db.ts';
import { info } from './log.ts';

const here = dirname(fileURLToPath(import.meta.url)); // worker/src

/** Resolve o caminho do schema.sql em dev (monorepo) e em Docker. */
function findSchema(): string {
  const candidates = [
    process.env.SCHEMA_PATH,
    resolve(here, '../../db/schema.sql'), // dev: repo/db/schema.sql
    '/db/schema.sql', // docker: volume montado
  ].filter(Boolean) as string[];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error(`schema.sql não encontrado. Procurado em: ${candidates.join(', ')}`);
}

export async function migrate() {
  const path = findSchema();
  const sql = readFileSync(path, 'utf8');
  info(`Aplicando schema: ${path}`);
  await pool.query(sql);
  info('Schema aplicado (idempotente).');
}

// Permite rodar diretamente: `npm run migrate`
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  migrate()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
