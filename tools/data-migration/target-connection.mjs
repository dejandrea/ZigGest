import { config } from 'dotenv';
import pg from 'pg';
import { resolve } from 'node:path';

config({ path: resolve(import.meta.dirname, '../../backend/.env'), quiet: true });

export function targetClient(expectedRef) {
  if (!/^[a-z]{20}$/.test(expectedRef ?? '')) throw new Error('Expected project reference is required');
  const url = new URL(process.env.SUPABASE_URL ?? '');
  const database = new URL(process.env.SUPABASE_DB_URL ?? '');
  const direct = database.hostname === `db.${expectedRef}.supabase.co`;
  const pooler = database.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(database.username) === `postgres.${expectedRef}`;
  if (url.hostname !== `${expectedRef}.supabase.co` || (!direct && !pooler)) {
    throw new Error('Target project does not match both configured connections');
  }
  return new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, connectionTimeoutMillis: 15000 });
}

// Remove only the outer transaction, never statements inside a function body.
export function transactionBody(sql, ending = 'commit') {
  return sql.replace(/^\uFEFF?\s*begin;\s*\r?\n/i, '')
    .replace(new RegExp(`\\b${ending};\\s*$`, 'i'), '');
}

export function reportFailure(stage, error) {
  console.error(JSON.stringify({ ok: false, stage, code: error.code ?? null, type: error.name }));
  // Database error messages may include credentials, SQL data or personal data.
  process.exitCode = 1;
}
