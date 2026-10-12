-- Add newly registered stock items to a draft without resetting existing counts.
CREATE OR REPLACE FUNCTION app_private.inventory_operation(p_id uuid, p_action text, p_revision integer, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid();role_name text:=app_private.app_role();inv public.stock_inventories; line record;
 counted numeric;delta numeric;movement uuid;location uuid:=(p_data->>'location_id')::uuid;selected_item uuid:=(p_data->>'item_id')::uuid;line_id uuid;seen uuid[]:='{}';
begin
 if actor is null or coalesce(role_name,'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if p_id is null or p_action is null or p_action not in ('OPEN','SAVE','REBASE','CONFIRM','CANCEL','ADD_ITEM') or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Inventário inválido.';end if;
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
 if p_action='ADD_ITEM' then
  if selected_item is null or not exists(select 1 from public.stock_items where id=selected_item and ativo) then raise exception 'Selecione um item de estoque ativo.';end if;
  if exists(select 1 from public.stock_inventory_lines where inventory_id=p_id and stock_item_id=selected_item) then
   return to_jsonb(inv)||jsonb_build_object('lines',(select jsonb_agg(to_jsonb(l) order by l.nome,l.location_nome,l.id) from public.stock_inventory_lines l where l.inventory_id=p_id));
  end if;
 end if;
 if p_revision is distinct from inv.revision then raise exception 'Este inventário foi alterado em outra sessão. Atualize antes de continuar.';end if;
 if p_action='ADD_ITEM' then
  perform id from public.stock_items where id=selected_item order by id for update;
  perform b.stock_item_id from public.stock_balances b join public.stock_locations l on l.id=b.location_id
   where b.stock_item_id=selected_item and l.ativo and (inv.location_id is null or l.id=inv.location_id)
   order by b.stock_item_id,b.location_id for update of b;
  insert into public.stock_inventory_lines(inventory_id,stock_item_id,nome,unidade,saldo_referencia,item_updated_at,location_id,location_nome)
   select p_id,s.id,s.nome,s.unidade,b.saldo,b.updated_at,l.id,l.nome
   from public.stock_items s join public.stock_balances b on b.stock_item_id=s.id join public.stock_locations l on l.id=b.location_id
   where s.id=selected_item and s.ativo and l.ativo and (inv.location_id is null or l.id=inv.location_id)
    and (inv.kind='COUNT' or (b.saldo=0 and not exists(select 1 from public.stock_movement_lines m where m.stock_item_id=s.id and m.location_id=l.id)));
  if not found then raise exception 'O item não pode ser incluído neste inventário. Confira o setor e as restrições do inventário inicial.';end if;
  if inv.item_id is not null and inv.item_id<>selected_item then update public.stock_inventories set item_id=null where id=p_id;end if;
 elsif p_action='SAVE' then
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
 if p_action='ADD_ITEM' then
  return to_jsonb(inv)||jsonb_build_object('lines',(select jsonb_agg(to_jsonb(l) order by l.nome,l.location_nome,l.id) from public.stock_inventory_lines l where l.inventory_id=p_id));
 end if;
 return to_jsonb(inv);
end $function$;
notify pgrst,'reload schema';
