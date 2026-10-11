create table public.stock_locations(
 id uuid primary key default gen_random_uuid(),nome text not null unique check(length(btrim(nome)) between 1 and 100),
 principal boolean not null default false,ativo boolean not null default true,created_at timestamptz not null default now()
);
create unique index stock_single_main on public.stock_locations(principal) where principal;
insert into public.stock_locations(nome,principal) values('Estoque principal',true);
create function app_private.main_stock_location() returns uuid language sql stable set search_path='' as $$select id from public.stock_locations where principal$$;
revoke all on function app_private.main_stock_location() from public,anon,authenticated;
create table public.stock_balances(
 stock_item_id uuid not null references public.stock_items(id),location_id uuid not null references public.stock_locations(id),
 saldo numeric(18,3) not null default 0 check(saldo between -999999999999999.999 and 999999999999999.999),
 updated_at timestamptz not null default now(),primary key(stock_item_id,location_id)
);
create index stock_balances_location_idx on public.stock_balances(location_id);
insert into public.stock_balances(stock_item_id,location_id,saldo,updated_at) select id,app_private.main_stock_location(),saldo,updated_at from public.stock_items;
alter table public.stock_movement_lines add column location_id uuid references public.stock_locations(id),add column saldo_local_apos numeric(18,3);
update public.stock_movement_lines set location_id=app_private.main_stock_location(),saldo_local_apos=saldo_apos;
alter table public.stock_movement_lines alter column location_id set not null,alter column location_id set default app_private.main_stock_location(),alter column saldo_local_apos set not null;
alter table public.stock_movement_lines drop constraint stock_movement_lines_movement_id_stock_item_id_key;
alter table public.stock_movement_lines add unique(movement_id,stock_item_id,location_id);
create index stock_lines_location_idx on public.stock_movement_lines(location_id);
alter table public.stock_movements drop constraint stock_movements_tipo_check;
alter table public.stock_movements add constraint stock_movements_tipo_check check(tipo in ('ENTRADA','SAIDA','AJUSTE','TRANSFERENCIA'));
alter table public.products add column stock_location_id uuid references public.stock_locations(id);
create index products_stock_location_idx on public.products(stock_location_id) where stock_location_id is not null;
grant insert(stock_location_id),update(stock_location_id) on public.products to authenticated;
alter table public.stock_inventories add column location_id uuid references public.stock_locations(id);
create index inventories_location_idx on public.stock_inventories(location_id);
alter table public.stock_inventory_lines add column location_id uuid references public.stock_locations(id),add column location_nome text;
update public.stock_inventory_lines set location_id=app_private.main_stock_location(),location_nome='Estoque principal';
alter table public.stock_inventory_lines alter column location_id set not null,alter column location_nome set not null;
alter table public.stock_inventory_lines drop constraint stock_inventory_lines_inventory_id_stock_item_id_key;
alter table public.stock_inventory_lines add unique(inventory_id,stock_item_id,location_id);
create index inventory_lines_location_idx on public.stock_inventory_lines(location_id);
-- Previously opened counts refer only to the old principal stock.
update public.stock_inventories set location_id=app_private.main_stock_location();
do $$declare t text;begin
 foreach t in array array['stock_locations','stock_balances'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy stock_location_read on public.%I for select to authenticated using ((select app_private.app_role()) in (''MASTER'',''ADMIN'',''OPERATOR''))',t);
  execute format('create trigger application_operation_audit after insert or update or delete on public.%I for each row execute function app_private.audit_operation()',t);
 end loop;
end $$;
create function app_private.initialize_stock_balances() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='stock_items' then
  insert into public.stock_balances(stock_item_id,location_id) select new.id,id from public.stock_locations;
 else insert into public.stock_balances(stock_item_id,location_id) select id,new.id from public.stock_items;end if;
 return new;
end $$;
revoke all on function app_private.initialize_stock_balances() from public,anon,authenticated;
create trigger initialize_item_balances after insert on public.stock_items for each row execute function app_private.initialize_stock_balances();
create trigger initialize_location_balances after insert on public.stock_locations for each row execute function app_private.initialize_stock_balances();
-- Every new movement line updates its local balance and the consolidated cache.
create function app_private.apply_location_stock_line() returns trigger language plpgsql security definer set search_path='' as $$
declare item public.stock_items; balance public.stock_balances; kind text;
begin
 select * into item from public.stock_items where id=new.stock_item_id for update;
 select tipo into kind from public.stock_movements where id=new.movement_id;
 if kind='ENTRADA' and new.location_id<>app_private.main_stock_location() then raise exception 'Todas as entradas devem passar pelo estoque principal.';end if;
 if kind<>'AJUSTE' and not exists(select 1 from public.stock_locations where id=new.location_id and ativo) then raise exception 'Estoque de destino ou origem inativo.';end if;
 select * into balance from public.stock_balances where stock_item_id=new.stock_item_id and location_id=new.location_id for update;
 if not found then raise exception 'Saldo do setor não encontrado.';end if;
 if new.quantidade<0 and item.bloquear_estoque_negativo and balance.saldo+new.quantidade<0 then raise exception 'Estoque insuficiente para % no setor selecionado.',item.nome;end if;
 update public.stock_balances set saldo=saldo+new.quantidade,updated_at=clock_timestamp() where stock_item_id=new.stock_item_id and location_id=new.location_id returning saldo into new.saldo_local_apos;
 update public.stock_items set saldo=(select sum(saldo) from public.stock_balances where stock_item_id=new.stock_item_id) where id=new.stock_item_id;
 return new;
end $$;
-- Refund the original sectors even when the product's output location later changes.
do $$declare definition text;updated text;begin
 definition:=pg_get_functiondef('app_private.reverse_sale_stock(uuid)'::regprocedure);
 updated:=replace(definition,'select s.id,s.nome,s.unidade,-sum(l.quantidade) delta','select s.id,s.nome,s.unidade,l.location_id,-sum(l.quantidade) delta');
 updated:=replace(updated,'group by s.id,s.nome,s.unidade order by s.id','group by s.id,s.nome,s.unidade,l.location_id order by s.id,l.location_id');
 updated:=replace(updated,'quantidade,saldo_apos)','quantidade,saldo_apos,location_id)');
 updated:=replace(updated,'select movement,id,nome,unidade,line.delta,saldo from public.stock_items','select movement,id,nome,unidade,line.delta,saldo,line.location_id from public.stock_items');
 if position('saldo,line.location_id' in updated)=0 then raise exception 'Sale stock refund definition not found';end if;
 execute updated;
end $$;
create or replace function app_private.inventory_operation(p_id uuid,p_action text,p_revision integer,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();role_name text:=app_private.app_role();inv public.stock_inventories; line record;
 counted numeric;delta numeric;movement uuid;location uuid:=(p_data->>'location_id')::uuid;selected_item uuid:=(p_data->>'item_id')::uuid;line_id uuid;seen uuid[]:='{}';
begin
 if actor is null or coalesce(role_name,'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if p_id is null or p_action is null or p_action not in ('OPEN','SAVE','REBASE','CONFIRM','CANCEL') or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Inventário inválido.';end if;
 if p_action in ('CONFIRM','CANCEL') and role_name not in ('MASTER','ADMIN') then raise exception 'Somente administradores podem confirmar ou cancelar inventários.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('inventory:'||p_id::text,0));
 select * into inv from public.stock_inventories where id=p_id for update;
 if p_action='OPEN' then
  if found then
   if inv.actor_id<>actor or inv.descricao is distinct from btrim(p_data->>'descricao') or inv.observacoes is distinct from coalesce(p_data->>'observacoes','') or inv.item_id is distinct from selected_item or inv.kind is distinct from p_data->>'kind' or inv.location_id is distinct from location then raise exception 'Identificador já utilizado.';end if;
   return to_jsonb(inv);
  end if;
  if length(btrim(coalesce(p_data->>'descricao',''))) not between 1 and 200 or length(coalesce(p_data->>'observacoes',''))>2000 or p_data->>'kind' is null or p_data->>'kind' not in ('COUNT','INITIAL') then raise exception 'Informe descrição e tipo de inventário válidos.';end if;
  if location is not null and not exists(select 1 from public.stock_locations where id=location and ativo) then raise exception 'Escolha um setor ativo.';end if;
  -- Lock metadata first, then local balances in the same order as movements.
  perform id from public.stock_items where ativo and (selected_item is null or id=selected_item) order by id for update;
  perform b.stock_item_id from public.stock_balances b join public.stock_items s on s.id=b.stock_item_id join public.stock_locations l on l.id=b.location_id where s.ativo and l.ativo and (location is null or l.id=location) and (selected_item is null or s.id=selected_item) order by b.stock_item_id,b.location_id for update of b;
  insert into public.stock_inventories(id,descricao,actor_id,observacoes,item_id,kind,location_id) values(p_id,btrim(p_data->>'descricao'),actor,coalesce(p_data->>'observacoes',''),selected_item,p_data->>'kind',location) returning * into inv;
  insert into public.stock_inventory_lines(inventory_id,stock_item_id,nome,unidade,saldo_referencia,item_updated_at,location_id,location_nome)
   select p_id,s.id,s.nome,s.unidade,b.saldo,b.updated_at,l.id,l.nome from public.stock_items s join public.stock_balances b on b.stock_item_id=s.id join public.stock_locations l on l.id=b.location_id
   where s.ativo and l.ativo and (selected_item is null or s.id=selected_item) and (location is null or l.id=location)
    and (inv.kind='COUNT' or (b.saldo=0 and not exists(select 1 from public.stock_movement_lines m where m.stock_item_id=s.id and m.location_id=l.id)));
  if not found then raise exception 'Nenhum insumo ativo selecionado sem restrições para este inventário.';end if;
  return to_jsonb(inv);
 end if;
 if not found then raise exception 'Inventário não encontrado.';end if;
 if p_action='CONFIRM' and inv.status='CONFIRMED' then return to_jsonb(inv);end if;
 if inv.status<>'DRAFT' then raise exception 'Inventário encerrado; o histórico não pode ser alterado.';end if;
 if p_revision is distinct from inv.revision then raise exception 'Este inventário foi alterado em outra sessão. Atualize antes de continuar.';end if;
 if p_action='SAVE' then
  if jsonb_typeof(p_data->'lines') is distinct from 'array' or jsonb_array_length(p_data->'lines')<>(select count(*) from public.stock_inventory_lines where inventory_id=p_id) then raise exception 'Informe todas as linhas do inventário.';end if;
  if (select count(distinct coalesce(value->>'line_id',(value->>'item_id')||':'||coalesce(value->>'location_id',''))) from jsonb_array_elements(p_data->'lines'))<>jsonb_array_length(p_data->'lines') then raise exception 'Linha repetida no inventário.';end if;
  for line in select value from jsonb_array_elements(p_data->'lines') loop
   line_id:=null;
   if line.value->>'line_id' is not null then
    select id into line_id from public.stock_inventory_lines where inventory_id=p_id and id=(line.value->>'line_id')::uuid;
   else
    if (select count(*) from public.stock_inventory_lines where inventory_id=p_id and stock_item_id=(line.value->>'item_id')::uuid and (line.value->>'location_id' is null or location_id=(line.value->>'location_id')::uuid))<>1 then raise exception 'Informe a linha e o setor da contagem.';end if;
    select id into line_id from public.stock_inventory_lines where inventory_id=p_id and stock_item_id=(line.value->>'item_id')::uuid and (line.value->>'location_id' is null or location_id=(line.value->>'location_id')::uuid);
   end if;
   if line_id is null then raise exception 'Linha fora deste inventário.';end if;
   if line_id=any(seen) then raise exception 'Linha repetida no inventário.';end if;
   seen:=array_append(seen,line_id);
   counted:=(line.value->>'contado')::numeric;
   if counted is not null and (not(counted between 0 and 999999999999.999) or counted<>round(counted,3)) then raise exception 'Contagem deve ser zero ou positiva, com até três casas decimais.';end if;
   update public.stock_inventory_lines set contado=counted where id=line_id;
  end loop;
 elsif p_action='CANCEL' then update public.stock_inventories set status='CANCELLED' where id=p_id;
 else
  perform s.id from public.stock_items s join public.stock_inventory_lines l on l.stock_item_id=s.id where l.inventory_id=p_id order by s.id for update of s;
  perform b.stock_item_id from public.stock_balances b join public.stock_inventory_lines l on l.stock_item_id=b.stock_item_id and l.location_id=b.location_id where l.inventory_id=p_id order by b.stock_item_id,b.location_id for update of b;
  if p_action='REBASE' then
   update public.stock_inventory_lines l set saldo_referencia=b.saldo,item_updated_at=b.updated_at,nome=s.nome,unidade=s.unidade,location_nome=loc.nome,contado=null
   from public.stock_items s,public.stock_balances b,public.stock_locations loc where l.inventory_id=p_id and s.id=l.stock_item_id and b.stock_item_id=s.id and b.location_id=l.location_id and loc.id=l.location_id
    and (b.saldo<>l.saldo_referencia or b.updated_at<>l.item_updated_at or s.nome<>l.nome or s.unidade<>l.unidade or loc.nome<>l.location_nome or not s.ativo or not loc.ativo);
  else
   if not exists(select 1 from public.stock_inventory_lines where inventory_id=p_id and contado is not null) then raise exception 'Informe ao menos uma contagem.';end if;
   if inv.kind='INITIAL' and exists(select 1 from public.stock_inventory_lines l where l.inventory_id=p_id and l.contado is not null and exists(select 1 from public.stock_movement_lines m where m.stock_item_id=l.stock_item_id and m.location_id=l.location_id)) then raise exception 'Insumo já possui movimentações neste setor. Use uma contagem normal.';end if;
   if exists(select 1 from public.stock_inventory_lines l join public.stock_items s on s.id=l.stock_item_id join public.stock_balances b on b.stock_item_id=s.id and b.location_id=l.location_id join public.stock_locations loc on loc.id=l.location_id where l.inventory_id=p_id and l.contado is not null and (b.saldo<>l.saldo_referencia or b.updated_at<>l.item_updated_at or s.nome<>l.nome or s.unidade<>l.unidade or not s.ativo or not loc.ativo)) then raise exception 'O estoque mudou durante a contagem. Atualize a referência e reconte os itens alterados.';end if;
   movement:=gen_random_uuid();
   insert into public.stock_movements(id,tipo,descricao,quantidade,fator,actor_id,payload,observacoes,ocorrido_em)
   values(movement,'AJUSTE',case when inv.kind='INITIAL' then 'Inventário inicial: ' else 'Inventário: ' end||inv.descricao,1,1,actor,jsonb_build_object('inventory_id',p_id,'kind',inv.kind,'location_id',inv.location_id),inv.observacoes,clock_timestamp());
   for line in select * from public.stock_inventory_lines where inventory_id=p_id and contado is not null order by stock_item_id,location_id loop
    delta:=line.contado-line.saldo_referencia;
    if delta<>0 or inv.kind='INITIAL' then
     insert into public.stock_movement_lines(movement_id,stock_item_id,nome,unidade,quantidade,saldo_apos,location_id)
     select movement,line.stock_item_id,line.nome,line.unidade,delta,s.saldo+delta,line.location_id from public.stock_items s where s.id=line.stock_item_id;
    end if;
   end loop;
   update public.stock_inventories set status='CONFIRMED',confirmed_at=clock_timestamp(),confirmed_by=actor,movement_id=movement where id=p_id;
  end if;
 end if;
 update public.stock_inventories set revision=revision+1 where id=p_id returning * into inv;
 return to_jsonb(inv);
end $$;
revoke all on function app_private.apply_location_stock_line() from public,anon,authenticated;
create trigger apply_location_stock_line before insert on public.stock_movement_lines for each row execute function app_private.apply_location_stock_line();
create function app_private.location_operation(p_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare loc public.stock_locations;name text:=btrim(p_data->>'nome');active boolean:=(p_data->>'ativo')::boolean;
begin
 if auth.uid() is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN') then raise exception 'Somente administradores podem cadastrar setores.' using errcode='42501';end if;
 if p_id is null or jsonb_typeof(p_data) is distinct from 'object' or length(coalesce(name,'')) not between 1 and 100 or active is null then raise exception 'Informe nome e situação do estoque.';end if;
 perform pg_advisory_xact_lock(hashtextextended('stock-locations',0));
 select * into loc from public.stock_locations where id=p_id for update;
 if loc.principal and not active then raise exception 'O estoque principal deve permanecer ativo.';end if;
 if loc.id is not null and not active and (exists(select 1 from public.stock_balances where location_id=p_id and saldo<>0) or exists(select 1 from public.products where stock_location_id=p_id and ativo) or exists(select 1 from public.stock_inventories where status='DRAFT' and (location_id=p_id or location_id is null))) then raise exception 'Transfira os saldos e revise os produtos e inventários antes de desativar o setor.';end if;
 insert into public.stock_locations(id,nome,ativo) values(p_id,name,active) on conflict(id) do update set nome=excluded.nome,ativo=excluded.ativo returning * into loc;
 return to_jsonb(loc);
end $$;
create function public.stock_location_operation(p_id uuid,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$select app_private.location_operation(p_id,p_data)$$;
revoke all on function app_private.location_operation(uuid,jsonb),public.stock_location_operation(uuid,jsonb) from public,anon;
grant execute on function app_private.location_operation(uuid,jsonb),public.stock_location_operation(uuid,jsonb) to authenticated;
create function app_private.stock_transfer(p_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.stock_items; qty numeric:=(p_data->>'quantidade')::numeric;source uuid:=(p_data->>'origem_id')::uuid;dest uuid:=(p_data->>'destino_id')::uuid;previous public.stock_movements;
begin
 if auth.uid() is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if p_id is null or jsonb_typeof(p_data) is distinct from 'object' or source is null or dest is null or source=dest or qty is null or not(qty>0 and qty<=999999999999.999) or qty<>round(qty,3) or length(coalesce(p_data->>'observacoes',''))>2000 then raise exception 'Confira os estoques, insumo e quantidade da transferência.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into previous from public.stock_movements where id=p_id;
 if found then
  if previous.actor_id<>auth.uid() or previous.tipo<>'TRANSFERENCIA' or previous.payload<>p_data then raise exception 'Identificador já utilizado.';end if;
  return to_jsonb(previous)-'payload';
 end if;
 perform id from public.stock_locations where id in(source,dest) and ativo order by id for share;
 if (select count(*) from public.stock_locations where id in(source,dest) and ativo)<>2 then raise exception 'Escolha estoques ativos.';end if;
 select * into item from public.stock_items where id=(p_data->>'item_id')::uuid and ativo for update;
 if not found then raise exception 'Insumo não encontrado ou inativo.';end if;
 perform 1 from public.stock_balances where stock_item_id=item.id and location_id in(source,dest) order by location_id for update;
 insert into public.stock_movements(id,tipo,descricao,quantidade,fator,actor_id,payload,observacoes) values(p_id,'TRANSFERENCIA','Transferência: '||item.nome,qty,1,auth.uid(),p_data,coalesce(p_data->>'observacoes',''));
 insert into public.stock_movement_lines(movement_id,stock_item_id,nome,unidade,quantidade,saldo_apos,location_id) values(p_id,item.id,item.nome,item.unidade,-qty,item.saldo-qty,source);
 insert into public.stock_movement_lines(movement_id,stock_item_id,nome,unidade,quantidade,saldo_apos,location_id) values(p_id,item.id,item.nome,item.unidade,qty,item.saldo,dest);
 return (select to_jsonb(m)-'payload' from public.stock_movements m where id=p_id);
end $$;
create function public.transfer_stock(p_id uuid,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$select app_private.stock_transfer(p_id,p_data)$$;
revoke all on function app_private.stock_transfer(uuid,jsonb),public.transfer_stock(uuid,jsonb) from public,anon;
grant execute on function app_private.stock_transfer(uuid,jsonb),public.transfer_stock(uuid,jsonb) to authenticated;
create function app_private.validate_product_stock_location() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.stock_location_id is not null and not exists(select 1 from public.stock_locations where id=new.stock_location_id and (ativo or (tg_op='UPDATE' and new.stock_location_id=old.stock_location_id and not new.ativo))) then raise exception 'Selecione um estoque de saída ativo.';end if;
 return new;
end $$;
revoke all on function app_private.validate_product_stock_location() from public,anon,authenticated;
create trigger validate_product_stock_location before insert or update on public.products for each row execute function app_private.validate_product_stock_location();
-- Preserve invoice entry parsers; their lines default to the principal location.
do $$declare definition text;updated text;begin
 definition:=pg_get_functiondef('app_private.record_stock(uuid,text,uuid,bigint,numeric,numeric,text,timestamptz)'::regprocedure);
 updated:=replace(definition,'if qty<0 and item.bloquear_estoque_negativo and item.saldo+qty<0 then raise exception ''Estoque insuficiente para %.'',item.nome; end if;','-- Negative stock validation is performed against the local balance by the line trigger.');
 updated:=replace(updated,'quantidade,saldo_apos) values(movement_uuid,item.id,item.nome,item.unidade,qty,item.saldo);','quantidade,saldo_apos,location_id) values(movement_uuid,item.id,item.nome,item.unidade,qty,item.saldo,case when p_tipo=''ENTRADA'' then app_private.main_stock_location() else coalesce(product.stock_location_id,app_private.main_stock_location()) end);');
 if updated=definition or position('Negative stock validation' in updated)=0 or position('coalesce(product.stock_location_id' in updated)=0 then raise exception 'Stock movement definition not found';end if;
 execute updated;
 definition:=pg_get_functiondef('app_private.save_product_stock(bigint,jsonb,jsonb)'::regprocedure);
 updated:=replace(definition,'''observacoes'',''ativo'')','''observacoes'',''ativo'',''stock_location_id'')');
 updated:=replace(updated,'update public.products set nome=r.nome,','update public.products set stock_location_id=r.stock_location_id,nome=r.nome,');
 updated:=replace(updated,'observacoes,ativo)'||chr(10),'observacoes,ativo,stock_location_id)'||chr(10));
 updated:=replace(updated,'coalesce(r.ativo,true)) returning * into r;','coalesce(r.ativo,true),r.stock_location_id) returning * into r;');
 if position('stock_location_id=r.stock_location_id' in updated)=0 then raise exception 'Product stock definition not found';end if;
 execute updated;
end $$;

notify pgrst,'reload schema';
