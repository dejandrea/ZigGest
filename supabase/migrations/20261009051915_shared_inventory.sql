create table public.stock_items (
 id uuid primary key default gen_random_uuid(), codigo_insumo bigserial unique not null,
 nome text not null check(length(btrim(nome)) between 1 and 200),
 unidade text not null check(unidade in ('UN','KG','G','L','ML','M','CX','PCT')),
 saldo numeric(18,3) not null default 0 check(saldo>=0 and saldo<=999999999999999.999),
 estoque_minimo numeric(18,3) not null default 0 check(estoque_minimo>=0 and estoque_minimo<=999999999999999.999),
 observacoes text not null default '' check(length(observacoes)<=2000), ativo boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.product_components (
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.products(id) on delete restrict,
 stock_item_id uuid not null references public.stock_items(id) on delete restrict,
 quantidade numeric(18,3) not null check(quantidade>0 and quantidade<=999999999999.999),
 unique(product_id,stock_item_id)
);
create index product_components_stock_idx on public.product_components(stock_item_id);
create table public.stock_movements (
 id uuid primary key, tipo text not null check(tipo in ('ENTRADA','SAIDA')),
 descricao text not null, quantidade numeric not null, fator numeric not null,
 product_id uuid references public.products(id) on delete restrict,
 actor_id uuid not null references auth.users(id) on delete restrict,
 payload jsonb not null, observacoes text not null default '', created_at timestamptz not null default now()
);
create index stock_movements_product_idx on public.stock_movements(product_id);
create index stock_movements_actor_idx on public.stock_movements(actor_id);
create index stock_movements_created_idx on public.stock_movements(created_at desc);
create table public.stock_movement_lines (
 id uuid primary key default gen_random_uuid(), movement_id uuid not null references public.stock_movements(id),
 stock_item_id uuid not null references public.stock_items(id), nome text not null, unidade text not null,
 quantidade numeric(18,3) not null, saldo_apos numeric(18,3) not null, unique(movement_id,stock_item_id)
);
create index stock_movement_lines_item_idx on public.stock_movement_lines(stock_item_id);
alter table public.stock_items enable row level security;
alter table public.product_components enable row level security;
alter table public.stock_movements enable row level security;
alter table public.stock_movement_lines enable row level security;
revoke all on public.stock_items, public.product_components, public.stock_movements, public.stock_movement_lines from public,anon,authenticated;
revoke all on sequence public.stock_items_codigo_insumo_seq from public,anon,authenticated;
grant select on public.stock_items,public.product_components,public.stock_movements,public.stock_movement_lines to authenticated;
grant insert(nome,unidade,estoque_minimo,observacoes,ativo),update(nome,estoque_minimo,observacoes,ativo) on public.stock_items to authenticated;
grant usage on sequence public.stock_items_codigo_insumo_seq to authenticated;
create policy app_stock_item_access on public.stock_items for all to authenticated
 using ((select app_private.app_role()) in ('MASTER','ADMIN','OPERATOR')) with check ((select app_private.app_role()) in ('MASTER','ADMIN','OPERATOR'));
create policy app_component_read on public.product_components for select to authenticated using ((select app_private.app_role()) in ('MASTER','ADMIN','OPERATOR'));
create policy app_movement_read on public.stock_movements for select to authenticated using ((select app_private.app_role()) in ('MASTER','ADMIN','OPERATOR'));
create policy app_movement_line_read on public.stock_movement_lines for select to authenticated using ((select app_private.app_role()) in ('MASTER','ADMIN','OPERATOR'));
create trigger stock_items_updated_at before update on public.stock_items for each row execute function app_private.touch_updated_at();

-- Product and its recipe are committed together. Only these explicit fields are writable.
create function app_private.save_product_stock(p_codigo bigint,p_dados jsonb,p_componentes jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.products; product_uuid uuid; data jsonb; component jsonb; item_uuid uuid; qty numeric;
begin
 if auth.uid() is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501'; end if;
 if jsonb_typeof(p_dados) is distinct from 'object' or jsonb_typeof(p_componentes) is distinct from 'array' then raise exception 'Dados do produto ou composição inválidos.'; end if;
 select coalesce(jsonb_object_agg(key,value),'{}') into data from jsonb_each(p_dados) where key in ('nome','codigo_barras','categoria','unidade','custo','preco_venda','observacoes','ativo');
 if p_codigo is not null then
  select * into r from public.products where codigo_produto=p_codigo for update;
  if not found then raise exception 'Produto não encontrado.'; end if;
  product_uuid:=r.id;
 end if;
 r:=jsonb_populate_record(r,data);
 if p_codigo is null then
  insert into public.products(nome,codigo_barras,categoria,unidade,custo,preco_venda,observacoes,ativo)
  values(r.nome,nullif(btrim(r.codigo_barras),''),coalesce(r.categoria,''),coalesce(r.unidade,'UN'),coalesce(r.custo,0),coalesce(r.preco_venda,0),coalesce(r.observacoes,''),coalesce(r.ativo,true)) returning * into r;
  product_uuid:=r.id;
 else
  update public.products set nome=r.nome,codigo_barras=nullif(btrim(r.codigo_barras),''),categoria=r.categoria,unidade=r.unidade,custo=r.custo,preco_venda=r.preco_venda,observacoes=r.observacoes,ativo=r.ativo where id=product_uuid returning * into r;
 end if;
 delete from public.product_components where product_id=product_uuid;
 for component in select value from jsonb_array_elements(p_componentes) loop
  item_uuid:=(component->>'stock_item_id')::uuid; qty:=(component->>'quantidade')::numeric;
  if qty is null or not(qty>0 and qty<=999999999999.999) or qty<>round(qty,3) then raise exception 'Quantidade de consumo inválida. Use até três casas decimais.'; end if;
  insert into public.product_components(product_id,stock_item_id,quantidade) values(product_uuid,item_uuid,qty);
 end loop;
 return to_jsonb(r)||jsonb_build_object('componentes',p_componentes);
end $$;
revoke all on function app_private.save_product_stock(bigint,jsonb,jsonb) from public,anon;
grant execute on function app_private.save_product_stock(bigint,jsonb,jsonb) to authenticated;
create function public.save_product_with_stock(p_codigo bigint,p_dados jsonb,p_componentes jsonb) returns jsonb
language sql security invoker set search_path='' as $$select app_private.save_product_stock(p_codigo,p_dados,p_componentes)$$;
revoke all on function public.save_product_with_stock(bigint,jsonb,jsonb) from public,anon;
grant execute on function public.save_product_with_stock(bigint,jsonb,jsonb) to authenticated;

-- Lock each affected stock item in UUID order, reject negative balance and append immutable history.
-- Request IDs make a retry safe even if the previous HTTP response was lost.
create function app_private.record_stock(p_request uuid,p_tipo text,p_item uuid,p_produto bigint,p_quantidade numeric,p_fator numeric,p_observacoes text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); payload jsonb; previous public.stock_movements; product public.products; item public.stock_items; component record; qty numeric; movement_uuid uuid; description text;
begin
 if actor is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501'; end if;
 if p_request is null or p_tipo is null or p_tipo not in ('ENTRADA','SAIDA') or p_quantidade is null or not(p_quantidade>0 and p_quantidade<=999999999999.999) or p_quantidade<>round(p_quantidade,3) or p_fator is null or not(p_fator>0 and p_fator<=999999999999.999) or p_fator<>round(p_fator,3) or length(coalesce(p_observacoes,''))>2000 then raise exception 'Movimentação inválida.'; end if;
 if (p_tipo='ENTRADA' and (p_item is null or p_produto is not null)) or (p_tipo='SAIDA' and (p_produto is null or p_item is not null or p_fator<>1)) then raise exception 'Informe o item para entrada ou o produto para saída.'; end if;
 payload:=jsonb_build_object('tipo',p_tipo,'item',p_item,'produto',p_produto,'quantidade',p_quantidade,'fator',p_fator,'observacoes',coalesce(p_observacoes,''));
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into previous from public.stock_movements where id=p_request;
 if found then
  if previous.actor_id<>actor or previous.payload<>payload then raise exception 'Identificador já utilizado em outra movimentação.'; end if;
  return to_jsonb(previous)-'payload';
 end if;
 if p_tipo='SAIDA' then
  select * into product from public.products where codigo_produto=p_produto for update;
  if not found or not product.ativo then raise exception 'Produto indisponível ou inativo.'; end if;
  if not exists(select 1 from public.product_components where product_id=product.id) then raise exception 'Configure a composição de estoque deste produto antes da saída.'; end if;
  description:=product.nome;
  perform s.id from public.stock_items s join public.product_components c on c.stock_item_id=s.id where c.product_id=product.id order by s.id for update of s;
 else
  select * into item from public.stock_items where id=p_item for update;
  if not found then raise exception 'Item de estoque não encontrado.'; end if;
  description:=item.nome;
 end if;
 insert into public.stock_movements(id,tipo,descricao,quantidade,fator,product_id,actor_id,payload,observacoes)
 values(p_request,p_tipo,description,p_quantidade,p_fator,product.id,actor,payload,coalesce(p_observacoes,'')) returning id into movement_uuid;
 for component in
  select s.id,case when p_tipo='ENTRADA' then p_quantidade*p_fator else -p_quantidade*c.quantidade end as delta
  from public.stock_items s left join public.product_components c on c.stock_item_id=s.id and c.product_id=product.id
  where (p_tipo='ENTRADA' and s.id=p_item) or (p_tipo='SAIDA' and c.product_id=product.id) order by s.id
 loop
  select * into item from public.stock_items where id=component.id;
  qty:=component.delta;
  if not item.ativo then raise exception 'Item de estoque inativo: %.',item.nome; end if;
  if qty<>round(qty,3) or abs(qty)>999999999999999.999 then raise exception 'Conversão fora da precisão suportada.'; end if;
  if item.saldo+qty<0 then raise exception 'Estoque insuficiente para %.',item.nome; end if;
  update public.stock_items set saldo=saldo+qty where id=item.id returning * into item;
  insert into public.stock_movement_lines(movement_id,stock_item_id,nome,unidade,quantidade,saldo_apos) values(movement_uuid,item.id,item.nome,item.unidade,qty,item.saldo);
 end loop;
 return (select to_jsonb(m)-'payload' from public.stock_movements m where id=movement_uuid);
end $$;
revoke all on function app_private.record_stock(uuid,text,uuid,bigint,numeric,numeric,text) from public,anon;
grant execute on function app_private.record_stock(uuid,text,uuid,bigint,numeric,numeric,text) to authenticated;
create function public.record_stock_movement(p_request uuid,p_tipo text,p_item uuid,p_produto bigint,p_quantidade numeric,p_fator numeric,p_observacoes text) returns jsonb
language sql security invoker set search_path='' as $$select app_private.record_stock(p_request,p_tipo,p_item,p_produto,p_quantidade,p_fator,p_observacoes)$$;
revoke all on function public.record_stock_movement(uuid,text,uuid,bigint,numeric,numeric,text) from public,anon;
grant execute on function public.record_stock_movement(uuid,text,uuid,bigint,numeric,numeric,text) to authenticated;
