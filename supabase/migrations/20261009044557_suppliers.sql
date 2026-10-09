create table public.suppliers (
 id uuid primary key default gen_random_uuid(),
 codigo_fornecedor bigserial unique not null,
 nome text not null check (length(btrim(nome)) between 1 and 200),
 nome_fantasia text not null default '',
 documento text not null default '',
 contato text not null default '',
 telefone text not null default '',
 email text not null default '',
 endereco text not null default '',
 observacoes text not null default '',
 ativo boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index suppliers_documento_unique on public.suppliers
 (upper(regexp_replace(documento, '[^a-zA-Z0-9]', '', 'g')))
 where regexp_replace(documento, '[^a-zA-Z0-9]', '', 'g') <> '';
alter table public.suppliers enable row level security;
revoke all on public.suppliers from public, anon, authenticated;
revoke all on sequence public.suppliers_codigo_fornecedor_seq from public, anon, authenticated;
grant select on public.suppliers to authenticated;
grant insert (nome,nome_fantasia,documento,contato,telefone,email,endereco,observacoes,ativo),
 update (nome,nome_fantasia,documento,contato,telefone,email,endereco,observacoes,ativo)
 on public.suppliers to authenticated;
grant usage on sequence public.suppliers_codigo_fornecedor_seq to authenticated;
create policy app_supplier_access on public.suppliers for all to authenticated
 using ((select app_private.app_role()) in ('MASTER','ADMIN','OPERATOR'))
 with check ((select app_private.app_role()) in ('MASTER','ADMIN','OPERATOR'));
create trigger suppliers_updated_at before update on public.suppliers
 for each row execute function app_private.touch_updated_at();
