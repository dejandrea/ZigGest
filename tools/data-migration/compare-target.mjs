import { createClient } from '@supabase/supabase-js';
import { BSON } from 'mongodb';
import { config } from 'dotenv';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import Decimal from 'decimal.js';
import { customer, ledger, user, differences } from './transform.mjs';

config({ path: resolve(import.meta.dirname, '../../backend/.env'), quiet: true });
if (new URL(process.env.SUPABASE_URL).hostname !== 'klrnvnzhzmazuaawxele.supabase.co') throw new Error('destination mismatch');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) {
  console.error('No privileged server key configured. Use the administrative connector or configure a server-only secret key.');
  process.exit(1);
}
const role = key.startsWith('sb_secret_') ? 'service_role' : JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role;
if (role !== 'service_role') {
  console.error('Configured server key is not privileged. Refusing to treat RLS-hidden rows as an empty destination.');
  process.exit(1);
}
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const folder = (await readFile(resolve(import.meta.dirname, '../../.migration-private/latest-export'), 'utf8')).trim();
const manifest = JSON.parse(await readFile(resolve(folder, 'manifest.json'), 'utf8'));
async function source(name) {
  const item = manifest.collections.find(c => c.name === name);
  if (!item) return [];
  const text = await readFile(resolve(folder, item.filename), 'utf8');
  if (createHash('sha256').update(text).digest('hex') !== item.sha256) throw new Error('snapshot hash mismatch');
  return BSON.EJSON.parse(text, { relaxed: true });
}
async function destination(name) {
  let result = [];
  for (let offset = 0; ; offset += 1000) {
    const response = await supabase.from(name).select('*').order('id').range(offset, offset + 999);
    if (response.error) throw Object.assign(new Error('destination read failed'), { code: response.error.code });
    result.push(...response.data);
    if (response.data.length < 1000) return result;
  }
}
try {
  const target = {};
  for (const name of ['customers', 'users', 'customer_ledger', 'teste_conexao']) target[name] = await destination(name);
  await mkdir(resolve(folder, 'target-before'), { recursive: true });
  for (const [name, rows] of Object.entries(target)) await writeFile(resolve(folder, 'target-before', name + '.json'), JSON.stringify(rows), { mode: 0o600 });
  const datasets = [
    { source: 'clientes', table: 'customers', key: 'codigo_cliente', transform: customer },
    { source: 'usuarios', table: 'users', key: 'mongo_oid', transform: user },
    { source: 'contas', table: 'customer_ledger', key: 'mongo_oid', transform: ledger },
  ];
  const plan = { destination: 'klrnvnzhzmazuaawxele', tables: {}, blockers: [] };
  for (const dataset of datasets) {
    const docs = await source(dataset.source);
    const rows = docs.map(dataset.transform);
    if (new Set(rows.map(row => row[dataset.key])).size !== rows.length) throw new Error('duplicate source identity');
    const insert = [], existing = [], conflicts = [];
    for (const row of rows) {
      const match = target[dataset.table].find(item => item[dataset.key] === row[dataset.key]);
      if (!match) {
        if (dataset.table === 'users' && target.users.some(item => item.email === row.email || item.codigo_usuario === row.codigo_usuario)) { conflicts.push({ fields: ['identity'] }); continue; }
        insert.push(row); continue;
      }
      const fields = differences(row, match);
      if (fields.length) conflicts.push({ fields });
      else existing.push(row[dataset.key]);
    }
    plan.tables[dataset.table] = { sourceCount: rows.length, targetBefore: target[dataset.table].length, insert, existing, conflicts };
    if (conflicts.length) plan.blockers.push(dataset.table + ': existing values differ');
  }
  const codes = new Set((await source('clientes')).map(d => Number(d.codigoCliente)));
  const entries = await source('contas');
  const orphans = entries.filter(d => !codes.has(Number(d.codigoCliente))).length;
  if (orphans) plan.blockers.push('orphan source entries');
  if ((await source('mesas')).length || (await source('itemmesas')).length) plan.blockers.push('table data requires additional mapping');
  const totals = { debito: new Decimal(0), credito: new Decimal(0) };
  for (const doc of entries) totals[doc.tipo] = totals[doc.tipo].plus(String(doc.valor));
  plan.totals = { debit: totals.debito.toString(), credit: totals.credito.toString(), balance: totals.debito.minus(totals.credito).toString() };
  await writeFile(resolve(folder, 'plan.json'), JSON.stringify(plan, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ tables: Object.fromEntries(Object.entries(plan.tables).map(([name, table]) => [name, { sourceCount: table.sourceCount, targetBefore: table.targetBefore, pendingInsert: table.insert.length, identicalExisting: table.existing.length, conflicts: table.conflicts.length, conflictFields: [...new Set(table.conflicts.flatMap(c => c.fields))] }])), orphanEntries: orphans, totals: plan.totals, blockers: plan.blockers, destinationBackupCreated: true }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ error: 'Comparison failed; no target writes performed.', type: error.name, code: error.code ?? null }));
  process.exitCode = 1;
}
