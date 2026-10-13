import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { targetClient, reportFailure } from './target-connection.mjs';
import { loadImportSource } from './import-source.mjs';
import { differences } from './transform.mjs';

const [expectedRef, freezeAcknowledgement] = process.argv.slice(2);
let client;
let stage = 'validate-source';
let originalSequences = [];
let commitAttempted = false;
const runId = randomUUID();
try {
  if (freezeAcknowledgement !== '--source-writes-blocked') throw new Error('Source freeze acknowledgement required');
  const source = await loadImportSource();
  if (source.users.length) throw new Error('Legacy user authentication requires separate review');
  client = targetClient(expectedRef);
  await client.connect();
  await client.query('begin');
  await client.query("set local lock_timeout='5s';set local statement_timeout='120s'");
  await client.query("select pg_advisory_xact_lock(hashtextextended('ziggest-fresh-install',0))");
  await client.query('lock table public.customers,public.customer_ledger in access exclusive mode');
  stage = 'verify-empty-target';
  const { rows: [installation] } = await client.query('select project_ref from app_private.installation_manifest');
  const { rows: [existing] } = await client.query(`select
    (select count(*) from public.customers)+(select count(*) from public.customer_ledger)+
    (select count(*) from public.users)+(select count(*) from app_private.legacy_import_runs) as total`);
  if (installation?.project_ref !== expectedRef || Number(existing.total)) throw new Error('Destination is not an empty prepared installation');
  for (const name of ['customers_codigo_cliente_seq','customer_ledger_codigo_conta_seq']) {
    const { rows: [state] } = await client.query(`select last_value::text,is_called from public.${name}`);
    originalSequences.push({name,...state});
  }
  // Disable only new-operation validation and cache recomputation during this
  // locked transaction. FK/check constraints, RLS and audit triggers stay on.
  // Historical debts for blocked/inactive customers are legitimate records.
  stage = 'load-history';
  await client.query(`alter table public.customer_ledger disable trigger app_ledger_validation;
    alter table public.customer_ledger disable trigger app_refresh_customer_balance;`);
  const insertRows = async (table, rows) => {
    if (!rows.length) return;
    const columns = Object.keys(rows[0]);
    // All names come from the fixed transform functions, never user input.
    await client.query(`insert into public.${table}(${columns.join(',')})
      select ${columns.map(column=>'r.'+column).join(',')}
      from jsonb_populate_recordset(null::public.${table},$1::jsonb) r`, [JSON.stringify(rows)]);
  };
  await insertRows('customers',source.customers);
  await insertRows('customer_ledger',source.entries);
  await client.query(`alter table public.customer_ledger enable trigger app_ledger_validation;
    alter table public.customer_ledger enable trigger app_refresh_customer_balance;`);
  stage = 'reconcile-all-fields';
  for (const [table,expected,key] of [['customers',source.customers,'codigo_cliente'],['customer_ledger',source.entries,'codigo_conta']]) {
    const { rows:actual } = await client.query(`select * from public.${table} order by ${key}`);
    const indexed = new Map(actual.map(row=>[row[key],row]));
    if (actual.length !== expected.length || expected.some(row=>!indexed.has(row[key]) || differences(row,indexed.get(row[key])).length)) {
      throw new Error('Imported field reconciliation failed');
    }
  }
  const { rows:[totals] } = await client.query(`select
    coalesce(sum(case when entry_type='DEBIT' then amount else 0 end),0)::text as debit,
    coalesce(sum(case when entry_type='CREDIT' then amount else 0 end),0)::text as credit,
    coalesce(sum(case when entry_type='DEBIT' then amount else -amount end),0)::text as balance
    from public.customer_ledger`);
  const { rows:[checks] } = await client.query(`select
    (select count(*) from public.customers c join public.v_customer_balance v on v.customer_id=c.id where c.total_pendente<>v.saldo) as balance_mismatches,
    (select count(*) from pg_trigger where tgrelid='public.customer_ledger'::regclass and tgname in ('app_ledger_validation','app_refresh_customer_balance') and tgenabled='O') as restored_triggers`);
  if (differences(totals,{debit:source.summary.debit,credit:source.summary.credit,balance:source.summary.balance}).length ||
      Number(checks.balance_mismatches) || Number(checks.restored_triggers)!==2) throw new Error('Totals or restored protection mismatch');
  stage = 'record-import';
  await client.query('insert into app_private.legacy_import_runs(id,source_database,snapshot_manifest,summary) values($1,$2,$3,$4)',
    [runId,source.manifest.database,JSON.stringify(source.manifest),JSON.stringify(source.summary)]);
  await client.query(`insert into app_private.legacy_customer_links(customer_id,mongo_oid,import_id,source_cached_balance)
    select c.id,r.mongo_oid,$2::uuid,r.source_cached_balance
    from jsonb_to_recordset($1::jsonb) r(codigo_cliente integer,mongo_oid text,source_cached_balance numeric)
    join public.customers c on c.codigo_cliente=r.codigo_cliente`, [JSON.stringify(source.customerLinks),runId]);
  stage = 'advance-business-sequences';
  for (const [name,value] of [['customers_codigo_cliente_seq',source.summary.customerSequence],['customer_ledger_codigo_conta_seq',source.summary.ledgerSequence]]) {
    await client.query('select setval($1::regclass,$2::bigint,$3::boolean)', [`public.${name}`,Math.max(value,1),value>0]);
  }
  stage = 'commit-import';
  commitAttempted = true;
  await client.query('commit');
  await writeFile(resolve(source.folder,'import-result.json'),JSON.stringify({target:expectedRef,runId,...source.summary},null,2),{mode:0o600});
  console.log(JSON.stringify({ok:true,target:expectedRef,runId,...source.summary,fieldDifferences:0,remainingSourceChanges:false}));
} catch(error) {
  await client?.query('rollback').catch(()=>{});
  // Never rewind sequences on an ambiguous COMMIT response. Reconcile by runId
  // before retrying; a second import into a populated destination is refused.
  if (!commitAttempted && client) {
    for (const sequence of originalSequences) {
      await client.query('select setval($1::regclass,$2::bigint,$3::boolean)',[`public.${sequence.name}`,sequence.last_value,sequence.is_called]).catch(()=>{});
    }
  }
  reportFailure(stage,error);
  if(commitAttempted) console.log(JSON.stringify({runId,checkCommittedRunBeforeRetry:true}));
} finally { await client?.end().catch(()=>{}); }
