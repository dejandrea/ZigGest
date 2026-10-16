import { targetClient, reportFailure } from './target-connection.mjs';

const [expectedRef, mode] = process.argv.slice(2);
let client;
let stage = 'connect';
const summary = `select count(*)::integer as total,
  count(*) filter (where apelido is null or apelido !~ '[^[:space:]]')::integer as missing,
  count(*) filter (where nome is null or nome !~ '[^[:space:]]')::integer as missing_name
  from public.customers`;
try {
  if (!['--check', '--apply'].includes(mode)) throw new Error('Specify --check or --apply');
  client = targetClient(expectedRef);
  await client.connect();
  await client.query('begin');
  await client.query("set local lock_timeout='5s'; set local statement_timeout='60s'");
  const { rows: [before] } = await client.query(summary);
  let updated = 0;
  if (mode === '--apply') {
    stage = 'fill-nicknames';
    const result = await client.query(`update public.customers set apelido = nome
      where (apelido is null or apelido !~ '[^[:space:]]')
      and nome ~ '[^[:space:]]'`);
    updated = result.rowCount;
  }
  stage = 'verify';
  const { rows: [after] } = await client.query(summary);
  if (mode === '--apply' && after.missing > 0) throw new Error('Customers still missing nicknames');
  await client.query('commit');
  console.log(JSON.stringify({ok:true,target:expectedRef,mode,before,updated,after}));
} catch (error) {
  await client?.query('rollback').catch(() => {});
  reportFailure(stage, error);
} finally {
  await client?.end().catch(() => {});
}
