import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { targetClient, transactionBody, reportFailure } from './target-connection.mjs';

const [expectedRef, masterEmail] = process.argv.slice(2);
let client;
let stage = 'validate-configuration';
try {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(masterEmail ?? '') || masterEmail !== masterEmail.toLowerCase().trim()) {
    throw new Error('Explicit normalized master email required');
  }
  client = targetClient(expectedRef);
  await client.connect();
  await client.query('begin');
  await client.query("set local lock_timeout='5s'; set local statement_timeout='120s'");
  await client.query("select pg_advisory_xact_lock(hashtextextended('ziggest-fresh-install',0))");
  stage = 'verify-empty-target';
  const { rows: [existing] } = await client.query(`select
    (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname in ('public','app_private') and c.relkind in ('r','p','v','m','S')) as objects,
    (select count(*)::int from auth.users) as auth_users`);
  if (existing.objects || existing.auth_users) throw new Error('Target is not empty; no changes allowed');
  stage = 'bootstrap-baseline';
  const baseline = await readFile(resolve(import.meta.dirname, 'bootstrap-baseline.sql'), 'utf8');
  await client.query(baseline);
  await client.query(`create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations(version text primary key,statements text[],name text);
    revoke all on schema supabase_migrations from public,anon,authenticated;
    revoke all on supabase_migrations.schema_migrations from public,anon,authenticated;`);
  const migrationDir = resolve(import.meta.dirname, '../../supabase/migrations');
  const files = (await readdir(migrationDir)).filter(name => /^\d{14}_.+\.sql$/.test(name)).sort();
  const manifest = [];
  for (const file of files) {
    stage = file;
    const source = await readFile(resolve(migrationDir, file), 'utf8');
    const sql = transactionBody(source);
    await client.query(sql);
    const [, version, name] = /^(\d{14})_(.+)\.sql$/.exec(file);
    await client.query('insert into supabase_migrations.schema_migrations(version,statements,name) values($1,$2,$3)', [version, [sql], name]);
    manifest.push({ file, sha256: createHash('sha256').update(source).digest('hex') });
    console.log(JSON.stringify({ applied: file }));
  }
  stage = 'initialize-authorized-master';
  // The historical first migration seeds a development admin. In an empty
  // installation it is not a company account and must not survive provisioning.
  await client.query("delete from app_private.account_directory where email='dejandreafranca@gmail.com' and legacy_user_id is null and not exists(select 1 from public.app_profiles where account_id=account_directory.id)");
  await client.query(`insert into app_private.account_directory(email,nome,role,enabled)
    values($1,'Master do sistema','MASTER',true)
    on conflict(email) do update set role='MASTER',enabled=true`, [masterEmail]);
  await client.query(`create table app_private.installation_manifest (
    singleton boolean primary key default true check(singleton),
    project_ref text not null, baseline_sha256 text not null,
    migrations jsonb not null, prepared_at timestamptz not null default now()
  ); alter table app_private.installation_manifest enable row level security;
  revoke all on app_private.installation_manifest from public,anon,authenticated;`);
  await client.query('insert into app_private.installation_manifest(project_ref,baseline_sha256,migrations) values($1,$2,$3)',
    [expectedRef, createHash('sha256').update(baseline).digest('hex'), JSON.stringify(manifest)]);
  stage = 'commit-preparation';
  await client.query("notify pgrst, 'reload schema'");
  await client.query('commit');
  console.log(JSON.stringify({ ok: true, target: expectedRef, migrations: files.length, businessDataImported: false, authUsersCreated: false }));
} catch (error) {
  await client?.query('rollback').catch(() => {});
  reportFailure(stage, error);
} finally {
  await client?.end().catch(() => {});
}
