-- One registration can expose a product and its own stock item without changing
-- the identifiers used by invoices, balances, recipes and historical sales.
alter table public.products add column stock_item_id uuid unique
 references public.stock_items(id) on delete restrict;

create table app_private.item_registration_requests (
 id uuid primary key, actor_id uuid not null references auth.users(id),
 payload jsonb not null, result jsonb not null, created_at timestamptz not null default now()
);
alter table app_private.item_registration_requests enable row level security;
revoke all on app_private.item_registration_requests from public,anon,authenticated;

create function app_private.sync_registered_item() returns trigger
language plpgsql security definer set search_path='' as $$
declare s public.stock_items;
begin
 if pg_trigger_depth()>1 then return new; end if;
 if tg_table_name='products' and new.stock_item_id is not null then
  select * into s from public.stock_items where id=new.stock_item_id;
  if new.unidade<>s.unidade then raise exception 'A unidade do item com estoque não pode ser alterada.';end if;
  update public.stock_items set nome=new.nome,observacoes=new.observacoes,ativo=new.ativo
   where id=s.id and (nome,observacoes,ativo) is distinct from (new.nome,new.observacoes,new.ativo);
 elsif tg_table_name='stock_items' then
  update public.products set nome=new.nome,observacoes=new.observacoes,ativo=new.ativo
   where stock_item_id=new.id and (nome,observacoes,ativo) is distinct from (new.nome,new.observacoes,new.ativo);
 end if;
 return new;
end $$;
revoke all on function app_private.sync_registered_item() from public,anon,authenticated;
create trigger registered_product_sync after insert or update of nome,unidade,observacoes,ativo,stock_item_id
 on public.products for each row execute function app_private.sync_registered_item();
create trigger registered_stock_sync after update of nome,observacoes,ativo
 on public.stock_items for each row execute function app_private.sync_registered_item();

-- Enforce the 1:1 recipe even when older clients edit a linked product.
create function app_private.check_direct_item_recipe() returns trigger
language plpgsql security definer set search_path='' as $$
declare pid uuid; sid uuid;
begin
 if tg_table_name='products' then pid:=new.id;
 else pid:=case when tg_op='DELETE' then old.product_id else new.product_id end;end if;
 select stock_item_id into sid from public.products where id=pid;
 if sid is not null and ((select count(*) from public.product_components where product_id=pid)<>1
  or not exists(select 1 from public.product_components where product_id=pid and stock_item_id=sid and quantidade=1)) then
  raise exception 'Produto e insumo devem consumir uma unidade do próprio estoque.';
 end if;
 return null;
end $$;
revoke all on function app_private.check_direct_item_recipe() from public,anon,authenticated;
create constraint trigger registered_product_recipe after insert or update on public.products
 deferrable initially deferred for each row execute function app_private.check_direct_item_recipe();
create constraint trigger registered_component_recipe after insert or update or delete on public.product_components
 deferrable initially deferred for each row execute function app_private.check_direct_item_recipe();

create function app_private.save_registered_item(p_request uuid,p_product bigint,p_stock bigint,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); previous app_private.item_registration_requests;
 p public.products; s public.stock_items; pd jsonb; sd jsonb; components jsonb;
 product_data jsonb; stock_data jsonb; answer jsonb; payload jsonb;
 is_product boolean; is_stock boolean; name text; unit text; active boolean; notes text;
begin
 if actor is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then
  raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if p_request is null or jsonb_typeof(p_data) is distinct from 'object'
  or exists(select 1 from jsonb_object_keys(p_data) k where k not in
   ('produto','insumo','product','stock','components','suppliers','product_updated_at','stock_updated_at'))
  or jsonb_typeof(p_data->'produto') is distinct from 'boolean'
  or jsonb_typeof(p_data->'insumo') is distinct from 'boolean' then raise exception 'Cadastro de item inválido.';end if;
 is_product:=(p_data->>'produto')::boolean;is_stock:=(p_data->>'insumo')::boolean;
 if not is_product and not is_stock then raise exception 'Marque Produto, Insumo ou ambos.';end if;
 payload:=jsonb_build_object('product',p_product,'stock',p_stock,'data',p_data);
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into previous from app_private.item_registration_requests where id=p_request;
 if found then
  if previous.actor_id<>actor or previous.payload<>payload then raise exception 'Pedido já utilizado em outro cadastro.';end if;
  return previous.result;
 end if;
 -- Serialise links so two registrations cannot claim the same existing stock.
 perform pg_advisory_xact_lock(hashtextextended('unified-item-registration',0));
 if p_product is not null then
  select * into p from public.products where codigo_produto=p_product for update;
  if not found then raise exception 'Produto não encontrado.';end if;
  if not is_product then raise exception 'Para encerrar o uso de um produto existente, desative o item.';end if;
  if p_data->>'product_updated_at' is not null and p.updated_at<>(p_data->>'product_updated_at')::timestamptz then
   raise exception 'O item foi alterado. Atualize a lista e tente novamente.';end if;
 end if;
 if p.stock_item_id is not null and p_stock is null then raise exception 'Informe o estoque vinculado ao item.';end if;
 if p_stock is not null then
  select * into s from public.stock_items where codigo_insumo=p_stock for update;
  if not found then raise exception 'Insumo não encontrado.';end if;
  if not is_stock then raise exception 'Para encerrar o uso de um insumo existente, desative o item.';end if;
  if p_data->>'stock_updated_at' is not null and s.updated_at<>(p_data->>'stock_updated_at')::timestamptz then
   raise exception 'O estoque foi alterado. Atualize a lista e tente novamente.';end if;
  if exists(select 1 from public.products where stock_item_id=s.id and id is distinct from p.id) then
   raise exception 'Este insumo já possui um produto no cadastro unificado.';end if;
  if p.stock_item_id is not null and p.stock_item_id<>s.id then raise exception 'O estoque próprio do item não pode ser substituído.';end if;
 end if;
 pd:=coalesce(p_data->'product','{}');sd:=coalesce(p_data->'stock','{}');
 if jsonb_typeof(pd) is distinct from 'object' or jsonb_typeof(sd) is distinct from 'object'
  or jsonb_typeof(p_data->'components') is distinct from 'array'
  or jsonb_typeof(p_data->'suppliers') is distinct from 'array'
  or jsonb_array_length(p_data->'components')>50 then raise exception 'Dados do item inválidos.';end if;
 name:=upper(btrim(case when is_product then pd->>'nome' else sd->>'nome' end));
 unit:=case when is_product then pd->>'unidade' else sd->>'unidade' end;
 notes:=coalesce(case when is_product then pd->>'observacoes' else sd->>'observacoes' end,'');
 active:=coalesce((case when is_product then pd->>'ativo' else sd->>'ativo' end)::boolean,true);
 if name is null or length(name) not between 1 and 200 then raise exception 'Informe o nome do item.';end if;
 if is_stock and s.id is not null and unit<>s.unidade then raise exception 'A unidade de estoque não pode ser alterada.';end if;
 if is_stock and is_product and p.id is not null and p.stock_item_id is null
  and exists(select 1 from public.product_components where product_id=p.id
   and (stock_item_id is distinct from s.id or quantidade<>1)) then
  raise exception 'Este produto usa uma receita. Mantenha apenas Produto ou ajuste sua composição antes de vinculá-lo como item 1:1.';
 end if;
 if is_stock then
  stock_data:=app_private.save_purchase_item(s.codigo_insumo,
   sd||jsonb_build_object('nome',name,'unidade',unit,'observacoes',notes,'ativo',active),p_data->'suppliers');
  select * into s from public.stock_items where id=(stock_data->>'id')::uuid;
 end if;
 if is_product then
  components:=case when is_stock then jsonb_build_array(jsonb_build_object('stock_item_id',s.id,'quantidade',1)) else p_data->'components' end;
  if exists(select 1 from jsonb_array_elements(components) c where not exists
   (select 1 from public.stock_items where id=(c->>'stock_item_id')::uuid and (ativo or not active))) then
   raise exception 'Selecione insumos ativos para a composição.';end if;
  product_data:=app_private.save_product_stock(p.codigo_produto,
   pd||jsonb_build_object('nome',name,'unidade',unit,'observacoes',notes,'ativo',active),components);
  select * into p from public.products where id=(product_data->>'id')::uuid;
  if is_stock then
   update public.products set stock_item_id=s.id where id=p.id returning * into p;
   product_data:=to_jsonb(p)||jsonb_build_object('componentes',components);
  end if;
 end if;
 answer:=jsonb_build_object('product',product_data,'stock',stock_data);
 insert into app_private.item_registration_requests(id,actor_id,payload,result) values(p_request,actor,payload,answer);
 return answer;
end $$;
create function public.save_registered_item(p_request uuid,p_product bigint,p_stock bigint,p_data jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select app_private.save_registered_item(p_request,p_product,p_stock,p_data)
$$;
revoke all on function app_private.save_registered_item(uuid,bigint,bigint,jsonb),
 public.save_registered_item(uuid,bigint,bigint,jsonb) from public,anon;
grant execute on function app_private.save_registered_item(uuid,bigint,bigint,jsonb),
 public.save_registered_item(uuid,bigint,bigint,jsonb) to authenticated;
create trigger item_registration_audit after insert on app_private.item_registration_requests
 for each row execute function app_private.audit_operation();
notify pgrst, 'reload schema';
