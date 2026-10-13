import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { targetClient, reportFailure } from './target-connection.mjs';

const [expectedRef] = process.argv.slice(2);
let client;
let stage = 'connect';
try {
  client = targetClient(expectedRef);
  await client.connect();
  stage = 'verify-installation';
  const { rows: [manifest] } = await client.query('select * from app_private.installation_manifest');
  if (manifest?.project_ref !== expectedRef) throw new Error('Installation project mismatch');
  const directory = resolve(import.meta.dirname, '../../supabase/migrations');
  const files = (await readdir(directory)).filter(file => /^\d{14}_.+\.sql$/.test(file)).sort();
  if (files.length !== manifest.migrations.length) throw new Error('Migration count mismatch');
  for (const file of files) {
    const sql = await readFile(resolve(directory, file), 'utf8');
    if (!manifest.migrations.some(entry => entry.file === file && entry.sha256 === createHash('sha256').update(sql).digest('hex'))) {
      throw new Error('Migration fingerprint mismatch');
    }
  }
  const { rows: [result] } = await client.query(`select
    (select count(*)::int from information_schema.tables where table_schema='public' and table_type='BASE TABLE') as public_tables,
    (select count(*)::int from information_schema.tables where table_schema='app_private' and table_type='BASE TABLE') as private_tables,
    (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
    (select count(*)::int from public.customers) as customers,
    (select count(*)::int from public.customer_ledger) as ledger,
    (select count(*)::int from public.users) as legacy_users,
    (select count(*)::int from auth.users) as auth_users,
    (select count(*)::int from public.app_profiles) as profiles,
    (select count(*)::int from public.financial_accounts where caixa_padrao and nome='Conta caixa' and tipo='CASH') as default_cash,
    (select count(*)::int from public.financial_accounts where banco_inicial and nome='Conta banco' and tipo='BANK') as initial_bank,
    (select count(*)::int from public.stock_locations where principal) as main_stock,
    (select count(*)::int from public.financial_payment_methods where ativo) as payment_methods,
    (select count(*)::int from app_private.account_directory where role='MASTER' and enabled) as enabled_master,
    (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','app_private') and c.relkind in ('r','p') and not c.relrowsecurity) as tables_without_rls,
    (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','app_private') and p.prosecdef and
      (p.proconfig is null or not exists(select 1 from unnest(p.proconfig) config where config like 'search_path=%'))) as unsafe_function_search_paths,
    (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','app_private') and c.relkind in ('r','p') and has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')) as anon_table_grants,
    has_table_privilege('authenticated','public.users','SELECT') as exposed_password_hashes`);
  if (result.migrations !== files.length || result.customers || result.ledger || result.legacy_users || result.auth_users || result.profiles ||
      result.default_cash !== 1 || result.initial_bank !== 1 || result.main_stock !== 1 || result.enabled_master !== 1 ||
      result.payment_methods !== 7 || result.tables_without_rls || result.unsafe_function_search_paths || result.anon_table_grants || result.exposed_password_hashes) {
    console.log(JSON.stringify({ verification: result }));
    throw new Error('Fresh installation verification failed');
  }
  stage = 'verify-anonymous-access';
  await client.query('begin; set local role anon');
  for (const sql of ['select * from public.customers', 'select * from public.users', 'select * from public.customer_ledger', 'select public.system_notifications()', 'select public.my_app_profile()']) {
    await client.query('savepoint denied_call');
    try {
      await client.query(sql);
      throw new Error('Unexpected anonymous access');
    } catch (error) {
      await client.query('rollback to savepoint denied_call');
      if (error.code !== '42501') throw error;
    }
  }
  await client.query('rollback');
  stage = 'verify-unassigned-authenticated-access';
  await client.query("begin; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000000',true); set local role authenticated");
  const { rows: [unassigned] } = await client.query('select (select count(*) from public.customers)+(select count(*) from public.customer_ledger) as visible_rows');
  if (Number(unassigned.visible_rows)) throw new Error('Unassigned account read company records');
  await client.query('savepoint denied_unassigned');
  try {
    await client.query('select public.system_notifications()');
    throw new Error('Unassigned account accessed notifications');
  } catch (error) {
    await client.query('rollback to savepoint denied_unassigned');
    if (error.code !== '42501') throw error;
  }
  await client.query('rollback');
  console.log(JSON.stringify({ ok: true, target: expectedRef, ...result, anonymous_access_blocked: true, unassigned_account_blocked: true }));
} catch (error) {
  await client?.query('rollback').catch(() => {});
  reportFailure(stage, error);
} finally {
  await client?.end().catch(() => {});
}
