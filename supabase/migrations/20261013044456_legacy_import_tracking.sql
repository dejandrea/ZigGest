begin;
create table app_private.legacy_import_runs (
 id uuid primary key,
 source_database text not null,
 snapshot_manifest jsonb not null,
 summary jsonb not null,
 completed_at timestamptz not null default now()
);
create table app_private.legacy_customer_links (
 customer_id uuid primary key references public.customers(id) on delete restrict,
 mongo_oid text not null unique,
 import_id uuid not null references app_private.legacy_import_runs(id),
 source_cached_balance numeric not null
);
alter table app_private.legacy_import_runs enable row level security;
alter table app_private.legacy_customer_links enable row level security;
revoke all on app_private.legacy_import_runs,app_private.legacy_customer_links from public,anon,authenticated;
commit;
