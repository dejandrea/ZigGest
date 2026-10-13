create table public.stock_inventories(
 id uuid primary key,descricao text not null check(length(btrim(descricao)) between 1 and 200),
 item_id uuid references public.stock_items(id),kind text not null check(kind in ('COUNT','INITIAL')),
 status text not null default 'DRAFT' check(status in ('DRAFT','CONFIRMED','CANCELLED')),
 revision integer not null default 0,actor_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),confirmed_at timestamptz,confirmed_by uuid references auth.users(id),
 movement_id uuid unique references public.stock_movements(id),observacoes text not null default '' check(length(observacoes)<=2000)
);
create index stock_inventories_actor_idx on public.stock_inventories(actor_id);
create index stock_inventories_item_idx on public.stock_inventories(item_id);
create index stock_inventories_confirmer_idx on public.stock_inventories(confirmed_by);
create table public.stock_inventory_lines(
 id uuid primary key default gen_random_uuid(),inventory_id uuid not null references public.stock_inventories(id),
 stock_item_id uuid not null references public.stock_items(id),nome text not null,unidade text not null,
 saldo_referencia numeric(18,3) not null,item_updated_at timestamptz not null,
 contado numeric(18,3) check(contado between 0 and 999999999999.999),
 unique(inventory_id,stock_item_id)
);
create index stock_inventory_lines_item_idx on public.stock_inventory_lines(stock_item_id);
alter table public.stock_inventories enable row level security;
alter table public.stock_inventory_lines enable row level security;
revoke all on public.stock_inventories,public.stock_inventory_lines from public,anon,authenticated;
grant select on public.stock_inventories,public.stock_inventory_lines to authenticated;
create policy inventory_read on public.stock_inventories for select to authenticated using ((select app_private.app_role()) in ('MASTER','ADMIN','OPERATOR'));
create policy inventory_lines_read on public.stock_inventory_lines for select to authenticated using ((select app_private.app_role()) in ('MASTER','ADMIN','OPERATOR'));
alter table public.stock_movements drop constraint stock_movements_tipo_check;
alter table public.stock_movements add constraint stock_movements_tipo_check check(tipo in ('ENTRADA','SAIDA','AJUSTE'));

create function app_private.inventory_operation(p_id uuid,p_action text,p_revision integer,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();role_name text:=app_private.app_role();inv public.stock_inventories;
 line record;item public.stock_items;counted numeric;delta numeric;movement uuid;payload jsonb;
begin
 if actor is null or coalesce(role_name,'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if p_id is null or p_action is null or p_action not in ('OPEN','SAVE','REBASE','CONFIRM','CANCEL') or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Inventário inválido.';end if;
 if p_action in ('CONFIRM','CANCEL') and role_name not in ('MASTER','ADMIN') then raise exception 'Somente administradores podem confirmar ou cancelar inventários.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('inventory:'||p_id::text,0));
 select * into inv from public.stock_inventories where id=p_id for update;
 if p_action='OPEN' then
  if found then
   if inv.actor_id<>actor or inv.descricao is distinct from btrim(p_data->>'descricao') or inv.observacoes is distinct from coalesce(p_data->>'observacoes','')
    or inv.item_id is distinct from (p_data->>'item_id')::uuid or inv.kind is distinct from p_data->>'kind'
   then raise exception 'Identificador já utilizado.';end if;
   return to_jsonb(inv);
  end if;
  if length(btrim(coalesce(p_data->>'descricao',''))) not between 1 and 200 or length(coalesce(p_data->>'observacoes',''))>2000 then raise exception 'Informe descrição e observações válidas.';end if;
  if p_data->>'kind' is null or p_data->>'kind' not in ('COUNT','INITIAL') then raise exception 'Tipo de inventário inválido.';end if;
  perform id from public.stock_items where ativo and (p_data->>'item_id' is null or id=(p_data->>'item_id')::uuid) order by id for update;
  insert into public.stock_inventories(id,descricao,actor_id,observacoes,item_id,kind) values(p_id,btrim(p_data->>'descricao'),actor,coalesce(p_data->>'observacoes',''),(p_data->>'item_id')::uuid,p_data->>'kind') returning * into inv;
  insert into public.stock_inventory_lines(inventory_id,stock_item_id,nome,unidade,saldo_referencia,item_updated_at)
   select p_id,id,nome,unidade,saldo,updated_at from public.stock_items s where ativo and (p_data->>'item_id' is null or id=(p_data->>'item_id')::uuid)
    and (inv.kind='COUNT' or (saldo=0 and not exists(select 1 from public.stock_movement_lines m where m.stock_item_id=s.id)));
  if not found then raise exception 'Nenhum insumo ativo selecionado.';end if;
  return to_jsonb(inv);
 end if;
 if not found then raise exception 'Inventário não encontrado.';end if;
 if p_action='CONFIRM' and inv.status='CONFIRMED' then return to_jsonb(inv);end if;
 if inv.status<>'DRAFT' then raise exception 'Inventário encerrado; o histórico não pode ser alterado.';end if;
 if p_revision is distinct from inv.revision then raise exception 'Este inventário foi alterado em outra sessão. Atualize antes de continuar.';end if;
 if p_action='SAVE' then
  if jsonb_typeof(p_data->'lines') is distinct from 'array' or jsonb_array_length(p_data->'lines')<>(select count(*) from public.stock_inventory_lines where inventory_id=p_id) then raise exception 'Informe todas as linhas do inventário.';end if;
  if (select count(distinct value->>'item_id') from jsonb_array_elements(p_data->'lines'))<>jsonb_array_length(p_data->'lines') then raise exception 'Insumo repetido.';end if;
  for line in select value from jsonb_array_elements(p_data->'lines') loop
   if not exists(select 1 from public.stock_inventory_lines where inventory_id=p_id and stock_item_id=(line.value->>'item_id')::uuid) then raise exception 'Insumo fora deste inventário.';end if;
   counted:=(line.value->>'contado')::numeric;
   if counted is not null and (not(counted between 0 and 999999999999.999) or counted<>round(counted,3)) then raise exception 'Contagem deve ser zero ou positiva, com até três casas decimais.';end if;
   update public.stock_inventory_lines set contado=counted where inventory_id=p_id and stock_item_id=(line.value->>'item_id')::uuid;
  end loop;
 elsif p_action='CANCEL' then
  update public.stock_inventories set status='CANCELLED' where id=p_id;
 else
  perform s.id from public.stock_items s join public.stock_inventory_lines l on l.stock_item_id=s.id where l.inventory_id=p_id order by s.id for update of s;
  if p_action='REBASE' then
   update public.stock_inventory_lines l set saldo_referencia=s.saldo,item_updated_at=s.updated_at,nome=s.nome,unidade=s.unidade,contado=null
   from public.stock_items s where l.inventory_id=p_id and s.id=l.stock_item_id and (s.saldo<>l.saldo_referencia or s.updated_at<>l.item_updated_at or not s.ativo);
  else
   if not exists(select 1 from public.stock_inventory_lines where inventory_id=p_id and contado is not null) then raise exception 'Informe ao menos uma contagem.';end if;
   if inv.kind='INITIAL' and exists(select 1 from public.stock_inventory_lines l where l.inventory_id=p_id and l.contado is not null and exists(select 1 from public.stock_movement_lines m where m.stock_item_id=l.stock_item_id)) then raise exception 'Insumo já possui movimentações. Use uma contagem normal.';end if;
   if exists(select 1 from public.stock_inventory_lines l join public.stock_items s on s.id=l.stock_item_id where l.inventory_id=p_id and l.contado is not null and (s.saldo<>l.saldo_referencia or s.updated_at<>l.item_updated_at or not s.ativo)) then raise exception 'O estoque mudou durante a contagem. Atualize a referência e reconte os itens alterados.';end if;
   movement:=gen_random_uuid();
   insert into public.stock_movements(id,tipo,descricao,quantidade,fator,actor_id,payload,observacoes,ocorrido_em)
   values(movement,'AJUSTE',case when inv.kind='INITIAL' then 'Inventário inicial: ' else 'Inventário: ' end||inv.descricao,1,1,actor,jsonb_build_object('inventory_id',p_id,'kind',inv.kind),inv.observacoes,clock_timestamp());
   for line in select * from public.stock_inventory_lines where inventory_id=p_id and contado is not null order by stock_item_id loop
    delta:=line.contado-line.saldo_referencia;
    if delta<>0 or inv.kind='INITIAL' then
     update public.stock_items set saldo=line.contado where id=line.stock_item_id returning * into item;
     insert into public.stock_movement_lines(movement_id,stock_item_id,nome,unidade,quantidade,saldo_apos) values(movement,line.stock_item_id,line.nome,line.unidade,delta,line.contado);
    end if;
   end loop;
   update public.stock_inventories set status='CONFIRMED',confirmed_at=clock_timestamp(),confirmed_by=actor,movement_id=movement where id=p_id;
  end if;
 end if;
 update public.stock_inventories set revision=revision+1 where id=p_id returning * into inv;
 return to_jsonb(inv);
end $$;
create function public.inventory_operation(p_id uuid,p_action text,p_revision integer default null,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select app_private.inventory_operation(p_id,p_action,p_revision,p_data)$$;
revoke all on function app_private.inventory_operation(uuid,text,integer,jsonb),public.inventory_operation(uuid,text,integer,jsonb) from public,anon;
grant execute on function app_private.inventory_operation(uuid,text,integer,jsonb),public.inventory_operation(uuid,text,integer,jsonb) to authenticated;
