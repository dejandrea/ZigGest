create table public.stock_item_suppliers(
 id uuid primary key default gen_random_uuid(),stock_item_id uuid not null references public.stock_items(id),supplier_id uuid not null references public.suppliers(id),
 origem text not null default 'MANUAL' check(origem in ('MANUAL','ENTRADA')),ultimo_preco numeric(18,4),ultima_entrada timestamptz,unique(stock_item_id,supplier_id)
);
create index stock_item_suppliers_supplier_idx on public.stock_item_suppliers(supplier_id);
create table public.low_stock_alerts(
 id uuid primary key default gen_random_uuid(),stock_item_id uuid not null unique references public.stock_items(id),nome text not null,unidade text not null,
 saldo numeric(18,3) not null,minimo numeric(18,3) not null,ativo boolean not null,started_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index low_stock_active_idx on public.low_stock_alerts(started_at) where ativo;
create table public.purchase_rounds(
 id uuid primary key,numero bigserial unique not null,nome text not null check(length(btrim(nome)) between 1 and 200),
 status text not null default 'DRAFT' check(status in ('DRAFT','DECIDED','CANCELLED')),revision integer not null default 0,
 items jsonb not null,offers jsonb not null default '[]',decision jsonb,last_save jsonb,actor_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index purchase_rounds_actor_idx on public.purchase_rounds(actor_id);
do $$declare t text;begin
 foreach t in array array['stock_item_suppliers','low_stock_alerts','purchase_rounds'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy purchase_read on public.%I for select to authenticated using ((select app_private.app_role()) in (''MASTER'',''ADMIN'',''OPERATOR''))',t);
  execute format('create trigger application_operation_audit after insert or update or delete on public.%I for each row execute function app_private.audit_operation()',t);
 end loop;
end $$;
create function app_private.refresh_low_stock() returns trigger language plpgsql security definer set search_path='' as $$
declare low boolean:=new.ativo and new.estoque_minimo is not null and new.saldo<=new.estoque_minimo;
begin
 if low or exists(select 1 from public.low_stock_alerts where stock_item_id=new.id) then
  insert into public.low_stock_alerts(stock_item_id,nome,unidade,saldo,minimo,ativo) values(new.id,new.nome,new.unidade,new.saldo,coalesce(new.estoque_minimo,0),low)
  on conflict(stock_item_id) do update set nome=excluded.nome,unidade=excluded.unidade,saldo=excluded.saldo,minimo=excluded.minimo,ativo=excluded.ativo,
   started_at=case when excluded.ativo and not low_stock_alerts.ativo then clock_timestamp() else low_stock_alerts.started_at end,updated_at=clock_timestamp();
 end if;return new;
end $$;
revoke all on function app_private.refresh_low_stock() from public,anon,authenticated;
create trigger refresh_low_stock after insert or update of saldo,estoque_minimo,ativo,nome,unidade on public.stock_items for each row execute function app_private.refresh_low_stock();
insert into public.low_stock_alerts(stock_item_id,nome,unidade,saldo,minimo,ativo) select id,nome,unidade,saldo,estoque_minimo,true from public.stock_items where ativo and estoque_minimo is not null and saldo<=estoque_minimo;
-- Resolve the issuer once, reusing an existing supplier or registering name/CNPJ.
create function app_private.invoice_purchase_supplier() returns trigger language plpgsql security definer set search_path='' as $$
declare supplier uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('invoice-supplier:'||new.emitente_documento,0));
 select id into supplier from public.suppliers where regexp_replace(documento,'[^0-9]','','g')=new.emitente_documento order by codigo_fornecedor limit 1;
 if supplier is null then insert into public.suppliers(nome,documento,ativo) values(new.emitente_nome,new.emitente_documento,true);end if;
 return new;
end $$;
revoke all on function app_private.invoice_purchase_supplier() from public,anon,authenticated;
create trigger invoice_purchase_supplier after insert on public.stock_invoices for each row execute function app_private.invoice_purchase_supplier();
create function app_private.link_purchase_supplier() returns trigger language plpgsql security definer set search_path='' as $$
declare supplier uuid;movement public.stock_movements;invoice public.stock_invoices;price numeric;arrival timestamptz;
begin
 select * into movement from public.stock_movements where id=new.movement_id;
 if movement.tipo<>'ENTRADA' then return new;end if;
 supplier:=movement.fornecedor_id;arrival:=movement.ocorrido_em;
 if movement.invoice_id is not null then
  select * into invoice from public.stock_invoices where id=movement.invoice_id;
  select id into supplier from public.suppliers where regexp_replace(documento,'[^0-9]','','g')=invoice.emitente_documento order by codigo_fornecedor limit 1;
  select round(sum(valor_total)/nullif(sum(quantidade_estoque),0),4) into price from public.stock_invoice_items where invoice_id=invoice.id and stock_item_id=new.stock_item_id;
 end if;
 if supplier is not null then
  insert into public.stock_item_suppliers(stock_item_id,supplier_id,origem,ultimo_preco,ultima_entrada) values(new.stock_item_id,supplier,'ENTRADA',price,arrival)
  on conflict(stock_item_id,supplier_id) do update set ultimo_preco=case when stock_item_suppliers.ultima_entrada is null or excluded.ultima_entrada>=stock_item_suppliers.ultima_entrada then coalesce(excluded.ultimo_preco,stock_item_suppliers.ultimo_preco) else stock_item_suppliers.ultimo_preco end,ultima_entrada=greatest(stock_item_suppliers.ultima_entrada,excluded.ultima_entrada);
 end if;return new;
end $$;
revoke all on function app_private.link_purchase_supplier() from public,anon,authenticated;
create trigger link_purchase_supplier after insert on public.stock_movement_lines for each row execute function app_private.link_purchase_supplier();
create function app_private.link_manual_entry_supplier() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.tipo='ENTRADA' and new.fornecedor_id is not null then
  insert into public.stock_item_suppliers(stock_item_id,supplier_id,origem,ultima_entrada) select distinct stock_item_id,new.fornecedor_id,'ENTRADA',new.ocorrido_em from public.stock_movement_lines where movement_id=new.id
  on conflict(stock_item_id,supplier_id) do update set ultima_entrada=greatest(stock_item_suppliers.ultima_entrada,excluded.ultima_entrada);
 end if;return new;
end $$;
revoke all on function app_private.link_manual_entry_supplier() from public,anon,authenticated;
create trigger link_manual_entry_supplier after update of fornecedor_id on public.stock_movements for each row execute function app_private.link_manual_entry_supplier();
-- Seed links from existing entries without creating suppliers for historical invoices.
insert into public.stock_item_suppliers(stock_item_id,supplier_id,origem,ultima_entrada)
 select distinct on(l.stock_item_id,s.id) l.stock_item_id,s.id,'ENTRADA',m.ocorrido_em from public.stock_movement_lines l join public.stock_movements m on m.id=l.movement_id
 left join public.stock_invoices i on i.id=m.invoice_id join public.suppliers s on s.id=m.fornecedor_id or (i.id is not null and regexp_replace(s.documento,'[^0-9]','','g')=i.emitente_documento)
 where m.tipo='ENTRADA' order by l.stock_item_id,s.id,m.ocorrido_em desc;
create function app_private.save_purchase_item(p_codigo bigint,p_data jsonb,p_suppliers jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.stock_items;ids uuid[];actor uuid:=auth.uid();
begin
 if actor is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_data) k where k not in ('nome','unidade','estoque_minimo','bloquear_estoque_negativo','observacoes','ativo')) or jsonb_typeof(p_suppliers) is distinct from 'array' or jsonb_array_length(p_suppliers)>50 then raise exception 'Dados do insumo inválidos.';end if;
 select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(p_suppliers);
 if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception 'Selecione fornecedores diferentes.';end if;
 if exists(select 1 from unnest(ids) x where not exists(select 1 from public.suppliers where id=x)) then raise exception 'Fornecedor não encontrado.';end if;
 if p_codigo is not null then
  select * into item from public.stock_items where codigo_insumo=p_codigo for update;
  if not found then raise exception 'Insumo não encontrado.';end if;
  if exists(select 1 from unnest(ids) x join public.suppliers s on s.id=x where not s.ativo and not exists(select 1 from public.stock_item_suppliers where stock_item_id=item.id and supplier_id=x)) then raise exception 'Selecione fornecedores ativos.';end if;
  item:=jsonb_populate_record(item,p_data);
  update public.stock_items set nome=item.nome,estoque_minimo=item.estoque_minimo,bloquear_estoque_negativo=item.bloquear_estoque_negativo,observacoes=item.observacoes,ativo=item.ativo where id=item.id returning * into item;
 else
  if exists(select 1 from unnest(ids) x join public.suppliers s on s.id=x where not s.ativo) then raise exception 'Selecione fornecedores ativos.';end if;
  item:=jsonb_populate_record(item,p_data);
  insert into public.stock_items(nome,unidade,estoque_minimo,bloquear_estoque_negativo,observacoes,ativo) values(item.nome,coalesce(item.unidade,'UN'),item.estoque_minimo,coalesce(item.bloquear_estoque_negativo,false),coalesce(item.observacoes,''),coalesce(item.ativo,true)) returning * into item;
 end if;
 delete from public.stock_item_suppliers where stock_item_id=item.id and not(supplier_id=any(ids));
 insert into public.stock_item_suppliers(stock_item_id,supplier_id) select item.id,x from unnest(ids) x on conflict(stock_item_id,supplier_id) do nothing;
 return to_jsonb(item)||jsonb_build_object('fornecedores_ids',to_jsonb(ids));
end $$;
create function public.save_purchase_item(p_codigo bigint,p_data jsonb,p_suppliers jsonb) returns jsonb language sql security invoker set search_path='' as $$select app_private.save_purchase_item(p_codigo,p_data,p_suppliers)$$;
revoke all on function app_private.save_purchase_item(bigint,jsonb,jsonb),public.save_purchase_item(bigint,jsonb,jsonb) from public,anon;
grant execute on function app_private.save_purchase_item(bigint,jsonb,jsonb),public.save_purchase_item(bigint,jsonb,jsonb) to authenticated;
create function app_private.purchase_operation(p_id uuid,p_action text,p_revision integer,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.purchase_rounds;row jsonb;offer jsonb;part jsonb;stock public.stock_items;sid uuid;new_items jsonb:='[]';new_offers jsonb:='[]';assignments jsonb:='[]';ids uuid[]:='{}';sids uuid[]:='{}';seen uuid[];q numeric;price numeric;freight numeric;discount numeric;subtotal numeric;total numeric:=0;candidate numeric;chosen uuid;strategy text;request uuid;
begin
 if auth.uid() is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if p_id is null or p_action is null or p_action not in ('SAVE','DECIDE','CANCEL') or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Operação de compras inválida.';end if;
 perform pg_advisory_xact_lock(hashtextextended('purchase:'||p_id::text,0));
 select * into r from public.purchase_rounds where id=p_id for update;
 if found and r.status<>'DRAFT' then
  if p_action='DECIDE' and r.status='DECIDED' and r.decision->>'request_id'=p_data->>'request_id' then return to_jsonb(r);end if;
  if p_action='CANCEL' and r.status='CANCELLED' then return to_jsonb(r);end if;
  raise exception 'Cotação encerrada; abra uma nova cotação.';
 end if;
 if p_action='SAVE' and r.id is not null and r.last_save=p_data then return to_jsonb(r);end if;
 if r.id is not null and p_revision is distinct from r.revision then raise exception 'Cotação alterada em outra sessão. Atualize antes de continuar.';end if;
 if p_action='SAVE' then
  if length(btrim(coalesce(p_data->>'nome',''))) not between 1 and 200 or jsonb_typeof(p_data->'items') is distinct from 'array' or jsonb_array_length(p_data->'items') not between 1 and 200 or jsonb_typeof(p_data->'offers') is distinct from 'array' or jsonb_array_length(p_data->'offers')>50 then raise exception 'Informe nome, itens e fornecedores da cotação.';end if;
  for row in select value from jsonb_array_elements(p_data->'items') loop
   select * into stock from public.stock_items where id=(row->>'item_id')::uuid and ativo;
   if not found or stock.id=any(ids) then raise exception 'Insumo inválido ou repetido.';end if;
   ids:=array_append(ids,stock.id);q:=(row->>'quantidade')::numeric;
   if q is null or not(q>0 and q<=999999999999.999) or q<>round(q,3) then raise exception 'Quantidade de compra inválida.';end if;
   new_items:=new_items||jsonb_build_array(jsonb_build_object('item_id',stock.id,'nome',stock.nome,'unidade',stock.unidade,'quantidade',q));
  end loop;
  for offer in select value from jsonb_array_elements(p_data->'offers') loop
   sid:=(offer->>'supplier_id')::uuid;
   if sid is null or sid=any(sids) or not exists(select 1 from public.suppliers where id=sid and ativo) then raise exception 'Fornecedor inválido, inativo ou repetido.';end if;
   sids:=array_append(sids,sid);freight:=(offer->>'frete')::numeric;discount:=(offer->>'desconto')::numeric;
   if freight is null or discount is null or not(freight between 0 and 9999999999.99) or not(discount between 0 and 9999999999.99) or freight<>round(freight,2) or discount<>round(discount,2) or (offer->>'validade')::date is null or offer->>'prazo_dias' is null or (offer->>'prazo_dias')::integer not between 0 and 3650 or jsonb_typeof(offer->'items') is distinct from 'array' then raise exception 'Confira frete, desconto, validade e prazo da proposta.';end if;
   seen:='{}';subtotal:=0;
   for part in select value from jsonb_array_elements(offer->'items') loop
    chosen:=(part->>'item_id')::uuid;price:=(part->>'preco_unitario')::numeric;
    if chosen is null or not(chosen=any(ids)) or chosen=any(seen) or price is null or not(price>0 and price<=9999999999.9999) or price<>round(price,4) then raise exception 'Preço unitário ou item da proposta inválido.';end if;
    seen:=array_append(seen,chosen);select (value->>'quantidade')::numeric into q from jsonb_array_elements(new_items) where value->>'item_id'=chosen::text;subtotal:=subtotal+round(q*price,2);
   end loop;
   if discount>subtotal then raise exception 'O desconto não pode ultrapassar os itens cotados.';end if;
   if subtotal>9999999999.99 or subtotal+freight-discount>9999999999.99 then raise exception 'O valor da compra ultrapassa o limite permitido.';end if;
   new_offers:=new_offers||jsonb_build_array(jsonb_build_object('supplier_id',sid,'fornecedor_nome',(select nome from public.suppliers where id=sid),'frete',freight,'desconto',discount,'validade',(offer->>'validade')::date,'prazo_dias',(offer->>'prazo_dias')::integer,'items',offer->'items'));
  end loop;
  if r.id is null then
   if p_revision is not null then raise exception 'Cotação não encontrada.';end if;
   insert into public.purchase_rounds(id,nome,items,offers,actor_id,last_save) values(p_id,btrim(p_data->>'nome'),new_items,new_offers,auth.uid(),p_data) returning * into r;
  else update public.purchase_rounds set nome=btrim(p_data->>'nome'),items=new_items,offers=new_offers,last_save=p_data,revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into r;end if;
 elsif p_action='CANCEL' then
  if r.id is null then raise exception 'Cotação não encontrada.';end if;
  update public.purchase_rounds set status='CANCELLED',revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into r;
 else
  if r.id is null then raise exception 'Cotação não encontrada.';end if;
  strategy:=p_data->>'strategy';request:=(p_data->>'request_id')::uuid;
  if request is null or strategy is null or strategy not in ('TOTAL','ITEM') then raise exception 'Escolha o critério da compra.';end if;
  if strategy='TOTAL' then
   for offer in select value from jsonb_array_elements(r.offers) where (value->>'validade')::date>=(now() at time zone 'America/Bahia')::date and exists(select 1 from public.suppliers where id=(value->>'supplier_id')::uuid and ativo) loop
    if jsonb_array_length(offer->'items')<>jsonb_array_length(r.items) then continue;end if;
    select sum(round((i->>'quantidade')::numeric*(p->>'preco_unitario')::numeric,2)) into subtotal from jsonb_array_elements(r.items) i join jsonb_array_elements(offer->'items') p on p->>'item_id'=i->>'item_id';
    candidate:=subtotal+(offer->>'frete')::numeric-(offer->>'desconto')::numeric;
    if chosen is null or candidate<total then chosen:=(offer->>'supplier_id')::uuid;total:=candidate;end if;
   end loop;
   if chosen is null then raise exception 'Nenhum fornecedor possui proposta válida para a compra completa.';end if;
   select value into offer from jsonb_array_elements(r.offers) where value->>'supplier_id'=chosen::text;
   for row in select value from jsonb_array_elements(r.items) loop
    select (value->>'preco_unitario')::numeric into price from jsonb_array_elements(offer->'items') where value->>'item_id'=row->>'item_id';assignments:=assignments||jsonb_build_array(row||jsonb_build_object('supplier_id',chosen,'preco_unitario',price));
   end loop;
  else
   -- Select by unit price. Freight is counted once per selected supplier; discounts
   -- for a full basket apply only when its entire quoted basket is selected.
   for row in select value from jsonb_array_elements(r.items) loop
    select (o->>'supplier_id')::uuid,(p->>'preco_unitario')::numeric into chosen,price from jsonb_array_elements(r.offers) o cross join jsonb_array_elements(o->'items') p
     where p->>'item_id'=row->>'item_id' and (o->>'validade')::date>=(now() at time zone 'America/Bahia')::date and exists(select 1 from public.suppliers where id=(o->>'supplier_id')::uuid and ativo)
     order by (p->>'preco_unitario')::numeric,(o->>'supplier_id') limit 1;
    if chosen is null then raise exception 'Há insumo sem proposta válida.';end if;
    assignments:=assignments||jsonb_build_array(row||jsonb_build_object('supplier_id',chosen,'preco_unitario',price));
   end loop;
   total:=0;
   for offer in select value from jsonb_array_elements(r.offers) loop
    select sum(round((value->>'quantidade')::numeric*(value->>'preco_unitario')::numeric,2)) into subtotal from jsonb_array_elements(assignments) where value->>'supplier_id'=offer->>'supplier_id';
    if subtotal is not null then
     discount:=case when (select count(*) from jsonb_array_elements(assignments) where value->>'supplier_id'=offer->>'supplier_id')=jsonb_array_length(offer->'items') then (offer->>'desconto')::numeric else 0 end;
     total:=total+subtotal+(offer->>'frete')::numeric-discount;
    end if;
   end loop;
  end if;
  if exists(select 1 from jsonb_array_elements(r.items) i where not exists(select 1 from public.stock_items where id=(i->>'item_id')::uuid and ativo)) then raise exception 'Há insumo desativado. Revise a cotação.';end if;
  if total>9999999999.99 then raise exception 'O valor da compra ultrapassa o limite permitido.';end if;
  update public.purchase_rounds set status='DECIDED',decision=jsonb_build_object('request_id',request,'strategy',strategy,'items',assignments,'total',total,'decided_at',clock_timestamp(),'actor_id',auth.uid()),revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into r;
 end if;return to_jsonb(r);
end $$;
create function public.purchase_operation(p_id uuid,p_action text,p_revision integer,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$select app_private.purchase_operation(p_id,p_action,p_revision,p_data)$$;
revoke all on function app_private.purchase_operation(uuid,text,integer,jsonb),public.purchase_operation(uuid,text,integer,jsonb) from public,anon;
grant execute on function app_private.purchase_operation(uuid,text,integer,jsonb),public.purchase_operation(uuid,text,integer,jsonb) to authenticated;
notify pgrst,'reload schema';
