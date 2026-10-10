create table public.products (
 id uuid primary key default gen_random_uuid(),
 codigo_produto bigserial unique not null,
 nome text not null check (length(btrim(nome)) between 1 and 200),
 codigo_barras text constraint products_codigo_barras_key unique
  check (codigo_barras is null or (codigo_barras=btrim(codigo_barras) and length(codigo_barras) between 1 and 64)),
 categoria text not null default '' check(length(categoria)<=100),
 unidade text not null default 'UN' check(unidade in ('UN','KG','G','L','ML','M','CX','PCT')),
 custo numeric(12,2) not null default 0 check(custo>=0 and custo<='9999999999.99'::numeric),
 preco_venda numeric(12,2) not null default 0 check(preco_venda>=0 and preco_venda<='9999999999.99'::numeric),
 observacoes text not null default '' check(length(observacoes)<=2000),
 ativo boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.products enable row level security;
revoke all on public.products from public,anon,authenticated;
revoke all on sequence public.products_codigo_produto_seq from public,anon,authenticated;
grant select on public.products to authenticated;
grant insert(nome,codigo_barras,categoria,unidade,custo,preco_venda,observacoes,ativo),
 update(nome,codigo_barras,categoria,unidade,custo,preco_venda,observacoes,ativo)
 on public.products to authenticated;
grant usage on sequence public.products_codigo_produto_seq to authenticated;
create policy app_product_access on public.products for all to authenticated
 using ((select app_private.app_role()) in ('MASTER','ADMIN','OPERATOR'))
 with check ((select app_private.app_role()) in ('MASTER','ADMIN','OPERATOR'));
create trigger products_updated_at before update on public.products
 for each row execute function app_private.touch_updated_at();
