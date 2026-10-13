-- Flexible inventory: minimum is optional; negative balance blocking is opt-in.
alter table public.stock_items alter column estoque_minimo drop not null, alter column estoque_minimo drop default;
alter table public.stock_items add column bloquear_estoque_negativo boolean not null default false;
alter table public.stock_items drop constraint stock_items_saldo_check;
alter table public.stock_items add constraint stock_items_saldo_check check(saldo between -999999999999999.999 and 999999999999999.999);
grant insert(bloquear_estoque_negativo),update(bloquear_estoque_negativo) on public.stock_items to authenticated;
-- Existing minimum settings remain unchanged, including explicitly configured zero.
alter table public.stock_movements add column ocorrido_em timestamptz;
update public.stock_movements set ocorrido_em=created_at;
alter table public.stock_movements alter column ocorrido_em set not null, alter column ocorrido_em set default now();
-- Existing history and balance snapshots are never rewritten by a backdated entry.
drop function public.record_stock_movement(uuid,text,uuid,bigint,numeric,numeric,text);
drop function app_private.record_stock(uuid,text,uuid,bigint,numeric,numeric,text);
create function app_private.record_stock(p_request uuid,p_tipo text,p_item uuid,p_produto bigint,p_quantidade numeric,p_fator numeric,p_observacoes text,p_ocorrido_em timestamptz default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); payload jsonb; previous public.stock_movements; product public.products; item public.stock_items; component record; qty numeric; movement_uuid uuid; description text;
begin
 if actor is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501'; end if;
 if p_request is null or p_tipo is null or p_tipo not in ('ENTRADA','SAIDA') or p_quantidade is null or not(p_quantidade>0 and p_quantidade<=999999999999.999) or p_quantidade<>round(p_quantidade,3) or p_fator is null or not(p_fator>0 and p_fator<=999999999999.999) or p_fator<>round(p_fator,3) or length(coalesce(p_observacoes,''))>2000 then raise exception 'Movimentação inválida.'; end if;
 if (p_tipo='ENTRADA' and (p_item is null or p_produto is not null)) or (p_tipo='SAIDA' and (p_produto is null or p_item is not null or p_fator<>1)) then raise exception 'Informe o item para entrada ou o produto para saída.'; end if;
 if p_ocorrido_em is not null and (p_tipo<>'ENTRADA' or not isfinite(p_ocorrido_em) or p_ocorrido_em>clock_timestamp()) then raise exception 'Data de entrada invalida ou futura.'; end if;
 payload:=jsonb_build_object('tipo',p_tipo,'item',p_item,'produto',p_produto,'quantidade',p_quantidade,'fator',p_fator,'observacoes',coalesce(p_observacoes,''));
 if p_ocorrido_em is not null then payload:=payload||jsonb_build_object('ocorrido_em',p_ocorrido_em); end if;
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
 insert into public.stock_movements(id,tipo,descricao,quantidade,fator,product_id,actor_id,payload,observacoes,ocorrido_em)
 values(p_request,p_tipo,description,p_quantidade,p_fator,product.id,actor,payload,coalesce(p_observacoes,''),coalesce(p_ocorrido_em,clock_timestamp())) returning id into movement_uuid;
 for component in
  select s.id,case when p_tipo='ENTRADA' then p_quantidade*p_fator else -p_quantidade*c.quantidade end as delta
  from public.stock_items s left join public.product_components c on c.stock_item_id=s.id and c.product_id=product.id
  where (p_tipo='ENTRADA' and s.id=p_item) or (p_tipo='SAIDA' and c.product_id=product.id) order by s.id
 loop
  select * into item from public.stock_items where id=component.id;
  qty:=component.delta;
  if not item.ativo then raise exception 'Item de estoque inativo: %.',item.nome; end if;
  if qty<>round(qty,3) or abs(qty)>999999999999999.999 then raise exception 'Conversão fora da precisão suportada.'; end if;
  if qty<0 and item.bloquear_estoque_negativo and item.saldo+qty<0 then raise exception 'Estoque insuficiente para %.',item.nome; end if;
  update public.stock_items set saldo=saldo+qty where id=item.id returning * into item;
  insert into public.stock_movement_lines(movement_id,stock_item_id,nome,unidade,quantidade,saldo_apos) values(movement_uuid,item.id,item.nome,item.unidade,qty,item.saldo);
 end loop;
 return (select to_jsonb(m)-'payload' from public.stock_movements m where id=movement_uuid);
end $$;
revoke all on function app_private.record_stock(uuid,text,uuid,bigint,numeric,numeric,text,timestamptz) from public,anon;
grant execute on function app_private.record_stock(uuid,text,uuid,bigint,numeric,numeric,text,timestamptz) to authenticated;
create function public.record_stock_movement(p_request uuid,p_tipo text,p_item uuid,p_produto bigint,p_quantidade numeric,p_fator numeric,p_observacoes text,p_ocorrido_em timestamptz default null) returns jsonb
language sql security invoker set search_path='' as $$select app_private.record_stock(p_request,p_tipo,p_item,p_produto,p_quantidade,p_fator,p_observacoes,p_ocorrido_em)$$;
revoke all on function public.record_stock_movement(uuid,text,uuid,bigint,numeric,numeric,text,timestamptz) from public,anon;
grant execute on function public.record_stock_movement(uuid,text,uuid,bigint,numeric,numeric,text,timestamptz) to authenticated;
