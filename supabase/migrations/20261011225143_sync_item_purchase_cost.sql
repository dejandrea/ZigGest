-- Last purchase cost is expressed in the item's base stock unit, not in packages.
-- A retroactive entry must not supersede a more recent receiving date.
create function app_private.latest_stock_purchase_cost(p_item uuid) returns numeric
language sql volatile security invoker set search_path='' as $$
 select cost from (
  select round(sum(i.valor_total)/nullif(sum(i.quantidade_estoque),0),6) cost,
   m.ocorrido_em,m.created_at,m.id
  from public.stock_invoice_items i join public.stock_movements m on m.invoice_id=i.invoice_id
  where i.stock_item_id=p_item and m.tipo='ENTRADA'
  group by m.id having sum(i.quantidade_estoque)>0
  union all
  select round(m.total_entrada/nullif(sum(l.quantidade),0),6),m.ocorrido_em,m.created_at,m.id
  from public.stock_movements m join public.stock_movement_lines l on l.movement_id=m.id
  where l.stock_item_id=p_item and m.tipo='ENTRADA' and m.invoice_id is null and m.total_entrada is not null
  group by m.id having sum(l.quantidade)>0
 ) purchases order by ocorrido_em desc,created_at desc,id desc limit 1;
$$;
revoke all on function app_private.latest_stock_purchase_cost(uuid) from public,anon,authenticated;

create function app_private.refresh_purchase_item_cost(p_items uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare product record;cost numeric;
begin
 for product in select id,stock_item_id,custo from public.products
  where stock_item_id=any(p_items) and supply_mode='DIRECT' order by id for update loop
  cost:=app_private.latest_stock_purchase_cost(product.stock_item_id);
  -- Preserve an explicitly configured cost when no priced entry exists.
  if cost is not null and product.custo is distinct from cost then
   if cost>9999999999.99 then raise exception 'Custo da entrada ultrapassa o limite do cadastro do item.';end if;
   update public.products set custo=cost where id=product.id;
  end if;
 end loop;
end $$;
revoke all on function app_private.refresh_purchase_item_cost(uuid[]) from public,anon,authenticated;

create function app_private.refresh_purchase_cost_from_line() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.stock_movements where id=new.movement_id and tipo='ENTRADA' and (invoice_id is not null or total_entrada is not null)) then
  perform app_private.refresh_purchase_item_cost(array[new.stock_item_id]);
 end if;return new;
end $$;
revoke all on function app_private.refresh_purchase_cost_from_line() from public,anon,authenticated;
create trigger refresh_purchase_item_cost after insert on public.stock_movement_lines
for each row execute function app_private.refresh_purchase_cost_from_line();

-- Manual entry totals are set after its movement lines have been recorded.
create function app_private.refresh_purchase_cost_from_movement() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.tipo='ENTRADA' and (new.invoice_id is not null or new.total_entrada is not null) then
  perform app_private.refresh_purchase_item_cost(array(select stock_item_id from public.stock_movement_lines where movement_id=new.id));
 end if;return new;
end $$;
revoke all on function app_private.refresh_purchase_cost_from_movement() from public,anon,authenticated;
create trigger refresh_purchase_item_cost after update of ocorrido_em,total_entrada on public.stock_movements
for each row execute function app_private.refresh_purchase_cost_from_movement();

-- Also initialize products linked to stock that already has purchased units.
create function app_private.initialize_linked_purchase_cost() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.stock_item_id is not null and new.supply_mode='DIRECT' and new.custo=0 then
  perform app_private.refresh_purchase_item_cost(array[new.stock_item_id]);
 end if;return new;
end $$;
revoke all on function app_private.initialize_linked_purchase_cost() from public,anon,authenticated;
create trigger initialize_purchase_item_cost after insert or update of stock_item_id on public.products
for each row execute function app_private.initialize_linked_purchase_cost();

-- Recompute both the old and new item links after an invoice edit is complete.
do $migration$
declare definition text;updated text;
begin
 definition:=pg_get_functiondef('app_private.edit_stock_invoice(uuid,integer,uuid,jsonb,jsonb,timestamp with time zone,text)'::regprocedure);
 updated:=replace(definition,' return jsonb_build_object(''id'',m.id,''revision'',n.revision+1);',
  ' perform app_private.refresh_purchase_item_cost(array(select stock_item_id from public.stock_invoice_items where invoice_id=p_id union select (value->>''stock_item_id'')::uuid from jsonb_array_elements((select payload->''before_items'' from public.stock_movements where id=correction))));'||chr(10)||
  ' return jsonb_build_object(''id'',m.id,''revision'',n.revision+1);');
 if updated=definition then raise exception 'Invoice purchase cost patch failed';end if;
 execute updated;
end $migration$;

-- Repair the missing costs without replacing costs users already entered manually.
do $$declare item record;begin
 for item in select stock_item_id from public.products where custo=0 and stock_item_id is not null and supply_mode='DIRECT' order by stock_item_id loop
  perform app_private.refresh_purchase_item_cost(array[item.stock_item_id]);
 end loop;
end $$;
notify pgrst,'reload schema';
