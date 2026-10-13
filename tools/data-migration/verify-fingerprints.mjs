import { BSON } from 'mongodb';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { customer, ledger, user, money, date } from './transform.mjs';
const folder = (await readFile(resolve(import.meta.dirname, '../../.migration-private/latest-export'), 'utf8')).trim();
const manifest = JSON.parse(await readFile(resolve(folder, 'manifest.json'), 'utf8'));
const datasets = [ ['clientes', 'customers', customer], ['usuarios', 'users', user], ['contas', 'customer_ledger', ledger] ];
const numeric = new Set(['amount', 'limite', 'total_pendente']);
function canonical(value) {
  if (value == null || value === '') return '-1:';
  const text = String(value);
  return Buffer.byteLength(text, 'utf8') + ':' + text;
}
const expected = [], selects = [];
for (const [collection, table, transform] of datasets) {
  const item = manifest.collections.find(c => c.name === collection);
  const text = await readFile(resolve(folder, item.filename), 'utf8');
  if (createHash('sha256').update(text).digest('hex') !== item.sha256) throw new Error('snapshot hash mismatch');
  const rows = BSON.EJSON.parse(text, { relaxed: true }).map(transform);
  const fields = Object.keys(rows[0] ?? {});
  for (const row of rows) {
    const normalized = fields.map(field => numeric.has(field) ? money(row[field]) : field.endsWith('_at') ? date(row[field]) : row[field]);
    const digest = createHash('sha256').update(normalized.map(canonical).join('')).digest('hex');
    expected.push("('" + table + "','" + digest + "')");
  }
  const expr = fields.map(field => {
    let value = numeric.has(field) ? 'trim_scale(' + field + ')::text' : field.endsWith('_at') ? "to_char(" + field + " at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')" : field + '::text';
    value = "nullif(" + value + ",'')";
    return "case when " + value + " is null then '-1:' else octet_length(convert_to(" + value + ",'UTF8'))::text||':'||" + value + " end";
  }).join(' || ');
  selects.push("select '" + table + "' as table_name, encode(extensions.digest(" + expr + ",'sha256'),'hex') as row_digest from public." + table);
}
const query = "with expected(table_name,row_digest) as (values " + expected.join(',') + "), actual as (" + selects.join(' union all ') + ") select jsonb_build_object('expected_rows',(select count(*) from expected),'actual_rows',(select count(*) from actual),'missing_or_changed',(select count(*) from (select * from expected except all select * from actual) e),'unexpected_rows',(select count(*) from (select * from actual except all select * from expected) a)) as fingerprint_validation;";
await writeFile(resolve(folder, 'verify-fingerprints.sql'), query, { mode: 0o600 });
console.log(JSON.stringify({ query }));
