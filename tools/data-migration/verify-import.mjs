import { randomUUID } from 'node:crypto';
import { targetClient, reportFailure } from './target-connection.mjs';
import { loadImportSource } from './import-source.mjs';
import { differences } from './transform.mjs';

const [expectedRef] = process.argv.slice(2);
let client;
let stage = 'validate-snapshot';
try {
  const source = await loadImportSource();
  client = targetClient(expectedRef);
  await client.connect();
  stage = 'verify-import-journal';
  const { rows:runs } = await client.query('select * from app_private.legacy_import_runs');
  if (runs.length !== 1 || runs[0].source_database !== source.manifest.database ||
      runs[0].snapshot_manifest.collections.length !== source.manifest.collections.length ||
      source.manifest.collections.some(entry=>!runs[0].snapshot_manifest.collections.some(saved=>saved.name===entry.name&&saved.sha256===entry.sha256&&saved.count===entry.count))) {
    throw new Error('Source snapshot changed since import');
  }
  stage = 'verify-fields';
  for(const [table,expected,key] of [['customers',source.customers,'codigo_cliente'],['customer_ledger',source.entries,'codigo_conta']]) {
    const { rows } = await client.query(`select * from public.${table}`);
    const indexed = new Map(rows.map(row=>[row[key],row]));
    if(rows.length!==expected.length || expected.some(row=>!indexed.has(row[key])||differences(row,indexed.get(row[key])).length)) {
      throw new Error('Imported field changed or missing');
    }
  }
  const { rows:links } = await client.query('select c.codigo_cliente,l.mongo_oid,l.source_cached_balance from app_private.legacy_customer_links l join public.customers c on c.id=l.customer_id');
  const indexedLinks = new Map(links.map(row=>[row.codigo_cliente,row]));
  if(links.length!==source.customerLinks.length || source.customerLinks.some(row=>!indexedLinks.has(row.codigo_cliente)||differences(row,indexedLinks.get(row.codigo_cliente)).length)) {
    throw new Error('Legacy customer identifiers or cached fields missing');
  }
  stage = 'verify-balances-and-permissions';
  const { rows:[checks] } = await client.query(`select
    (select count(*) from public.customers c join public.v_customer_balance v on v.customer_id=c.id where c.total_pendente<>v.saldo) as balance_mismatches,
    (select count(*) from public.customer_ledger l left join public.customers c on c.codigo_cliente=l.customer_codigo where c.id is null) as orphans,
    (select count(*) from pg_trigger where tgrelid='public.customer_ledger'::regclass and tgname in ('app_ledger_validation','app_refresh_customer_balance') and tgenabled='O') as protected_triggers,
    (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app_private') and c.relkind in ('r','p') and not c.relrowsecurity) as unprotected_tables,
    has_table_privilege('anon','public.customers','SELECT,INSERT,UPDATE,DELETE') as anonymous_customer_access,
    has_table_privilege('authenticated','public.users','SELECT') as exposed_legacy_passwords`);
  if(Number(checks.balance_mismatches)||Number(checks.orphans)||Number(checks.protected_triggers)!==2||Number(checks.unprotected_tables)||checks.anonymous_customer_access||checks.exposed_legacy_passwords) throw new Error('Integrity or protection mismatch');
  const nextCodes = {};
  for(const [name,maximum,label] of [['customers_codigo_cliente_seq',source.summary.customerSequence,'customer'],['customer_ledger_codigo_conta_seq',source.summary.ledgerSequence,'ledger']]) {
    const { rows:[sequence] } = await client.query(`select last_value::text,is_called from public.${name}`);
    const next = Number(sequence.last_value)+(sequence.is_called?1:0);
    if(next<=maximum) throw new Error('Business sequence could reuse a historical code');
    nextCodes[label] = next;
  }
  stage = 'verify-master-visibility';
  await client.query('begin');
  const { rows:masters } = await client.query("select email from app_private.account_directory where role='MASTER' and enabled");
  if(masters.length!==1) throw new Error('Expected one enabled master');
  const { rows:accounts } = await client.query('select id from auth.users where lower(email)=$1',[masters[0].email]);
  let authId = accounts[0]?.id;
  if(!authId) {
    authId = randomUUID();
    await client.query("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),'{}')",[authId,masters[0].email]);
  }
  await client.query("select set_config('request.jwt.claim.sub',$1,true)",[authId]);
  await client.query('set local role authenticated');
  const { rows:[visible] } = await client.query(`select app_private.app_role() as role,
    (select count(*)::int from public.customers) as customers,
    (select count(*)::int from public.customer_ledger) as entries,
    (select coalesce(sum(saldo),0)::text from public.v_customer_balance) as balance`);
  if(visible.role!=='MASTER'||visible.customers!==source.summary.customers||visible.entries!==source.summary.entries||visible.balance!==source.summary.balance) throw new Error('Master cannot read migrated records');
  await client.query('rollback');
  console.log(JSON.stringify({ok:true,target:expectedRef,...source.summary,fieldDifferences:0,sourceSnapshotUnchanged:true,nextCodes,masterVisibilityVerified:true,fixturesReverted:true}));
} catch(error) {
  await client?.query('rollback').catch(()=>{});
  reportFailure(stage,error);
} finally { await client?.end().catch(()=>{}); }
