import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { targetClient, reportFailure } from './target-connection.mjs';

const [expectedRef] = process.argv.slice(2);
// Current end-to-end database flows. Fixtures exist only inside rolled-back
// transactions; never run this preparation suite after importing company data.
const tests = [
  'utf8_text', 'suppliers_security', 'products_security', 'stock_inventory_permissions',
  'unified_item_registration', 'six_decimal_costs', 'supplier_state_registration',
  'invoice_recipients', 'sync_item_purchase_cost', 'financial_foundation',
  'default_cash_account', 'initial_bank_account', 'deferred_payment_method',
  'stock_inventory_counts', 'add_inventory_item', 'batch_production',
  'purchase_management', 'supplier_payables', 'comanda_partial_payments',
  'cash_register_operations', 'pdv_comanda_transfers', 'pos_workstation_operations',
  'system_notifications',
];
let client;
let stage = 'connect';
let sequences = [];
const quote = identifier => '"' + identifier.replaceAll('"', '""') + '"';
try {
  client = targetClient(expectedRef);
  await client.connect();
  stage = 'verify-empty-business-data';
  const { rows: [data] } = await client.query(`select
    (select count(*) from public.customers)+(select count(*) from public.customer_ledger)+
    (select count(*) from auth.users)+(select count(*) from public.stock_items)+
    (select count(*) from public.stock_movements)+(select count(*) from public.cash_sessions) as total`);
  if (Number(data.total)) throw new Error('Preparation tests require an unused destination');
  const { rows: masters } = await client.query("select email from app_private.account_directory where role='MASTER' and enabled");
  if (masters.length !== 1) throw new Error('A single enabled master is required for preparation tests');
  const masterEmail = masters[0].email;
  const { rows } = await client.query("select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='S' and n.nspname in ('public','app_private')");
  for (const row of rows) {
    const name = `${quote(row.nspname)}.${quote(row.relname)}`;
    const { rows: [state] } = await client.query(`select last_value::text,is_called from ${name}`);
    sequences.push({ name, ...state });
  }
  for (const name of tests) {
    stage = name;
    await client.query('begin');
    await client.query("set local statement_timeout='90s'");
    await client.query(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
      values(gen_random_uuid(),$1,now(),'{}')`, [masterEmail]);
    const source = await readFile(resolve(import.meta.dirname, '../../supabase/tests', name + '.sql'), 'utf8');
    const sql = source.replaceAll("'dejandrea@gmail.com'", "'" + masterEmail.replaceAll("'", "''") + "'");
    // These SQL files explicitly ROLLBACK. The outer BEGIN ensures that the
    // prerequisite auth fixture is rolled back with the rest of the test.
    await client.query(sql);
    await client.query('rollback');
    console.log(JSON.stringify({ passed: name }));
  }
  console.log(JSON.stringify({ ok: true, tests: tests.length, companyDataImported: false }));
} catch (error) {
  reportFailure(stage, error);
} finally {
  if (client) {
    await client.query('rollback').catch(() => {});
    // PostgreSQL sequence increments are not transactional. Restore the
    // verified empty destination's sequence positions after all fixtures.
    for (const state of sequences) {
      try { await client.query('select setval($1::regclass,$2::bigint,$3::boolean)', [state.name, state.last_value, state.is_called]); }
      catch (error) { reportFailure('restore-fixture-sequence', error); }
    }
    await client.end().catch(() => {});
  }
}
