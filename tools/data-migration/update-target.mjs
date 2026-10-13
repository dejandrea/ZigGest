import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { targetClient, transactionBody, reportFailure } from './target-connection.mjs';

const [expectedRef] = process.argv.slice(2);
let client;
let stage = 'connect';
try {
  client = targetClient(expectedRef);
  await client.connect();
  await client.query('begin');
  await client.query("set local lock_timeout='5s'; set local statement_timeout='120s'");
  await client.query("select pg_advisory_xact_lock(hashtextextended('ziggest-fresh-install',0))");
  stage = 'verify-history';
  const { rows: [installation] } = await client.query('select * from app_private.installation_manifest for update');
  if (installation?.project_ref !== expectedRef) throw new Error('Installation target mismatch');
  const { rows: history } = await client.query('select version from supabase_migrations.schema_migrations order by version');
  const directory = resolve(import.meta.dirname, '../../supabase/migrations');
  const files = (await readdir(directory)).filter(file => /^\d{14}_.+\.sql$/.test(file)).sort();
  const manifest = installation.migrations;
  if (history.length !== manifest.length || history.some(row => !manifest.some(entry => entry.file.startsWith(row.version + '_')))) {
    throw new Error('Migration history mismatch');
  }
  for (const entry of manifest) {
    const source = await readFile(resolve(directory, entry.file), 'utf8');
    if (createHash('sha256').update(source).digest('hex') !== entry.sha256) throw new Error('Applied migration changed');
  }
  const pending = files.filter(file => !manifest.some(entry => entry.file === file));
  if (pending.some(file => file.slice(0,14) <= (history.at(-1)?.version ?? ''))) throw new Error('Out-of-order migration');
  for (const file of pending) {
    stage = file;
    const source = await readFile(resolve(directory, file), 'utf8');
    const sql = transactionBody(source);
    await client.query(sql);
    const [,version,name] = /^(\d{14})_(.+)\.sql$/.exec(file);
    await client.query('insert into supabase_migrations.schema_migrations(version,statements,name) values($1,$2,$3)', [version,[sql],name]);
    manifest.push({ file,sha256:createHash('sha256').update(source).digest('hex') });
  }
  await client.query('update app_private.installation_manifest set migrations=$1 where singleton', [JSON.stringify(manifest)]);
  await client.query("notify pgrst, 'reload schema'");
  await client.query('commit');
  console.log(JSON.stringify({ ok:true,target:expectedRef,applied:pending }));
} catch (error) {
  await client?.query('rollback').catch(() => {});
  reportFailure(stage,error);
} finally {
  await client?.end().catch(() => {});
}
