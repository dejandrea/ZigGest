-- Each receipt is immutable; historical closures remain final settlements.
alter table public.comanda_closures drop constraint comanda_closures_comanda_id_key;
alter table public.comanda_closures add column kind text not null default 'CLOSE' check(kind in ('CLOSE','VALUE','ITEMS')),
 add column items jsonb not null default '[]' check(jsonb_typeof(items)='array');
create index comanda_settlements_comanda_idx on public.comanda_closures(comanda_id);
create unique index comanda_one_final_closure on public.comanda_closures(comanda_id) where kind='CLOSE';
alter table public.customer_ledger drop constraint customer_ledger_comanda_id_key;
create index customer_ledger_comanda_idx on public.customer_ledger(comanda_id);
alter table public.dining_tables add column paid_total numeric(14,2) not null default 0 check(paid_total>=0);
update public.dining_tables c set paid_total=(select coalesce(sum(total),0) from public.comanda_closures where comanda_id=c.id);

create or replace function app_private.comanda_operation(p_id uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();s public.cash_sessions;c public.dining_tables;customer public.customers;
 prior public.comanda_closures;payment jsonb;method public.financial_payment_methods;amount numeric;paid numeric:=0;
 deferred numeric:=0;due date;debit uuid;close_id uuid;acc uuid;operation uuid; remaining numeric; item_total numeric:=0; selected jsonb; line public.dining_table_items; qty integer; settled_qty integer; mode text;
begin
 if actor is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if p_id is null or p_action is null or p_action not in ('OPEN','IDENTIFY','CLOSE','PAY') or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Comanda inválida.';end if;
 perform pg_advisory_xact_lock(hashtextextended('cash-session-global',0));
 select * into s from public.cash_sessions where status='OPEN' for update;
 select * into c from public.dining_tables where id=p_id for update;
 if p_action in ('CLOSE','PAY') then
  close_id:=(p_data->>'request_id')::uuid;
  if close_id is null then raise exception 'Identificador do encerramento obrigatório.';end if;
  select * into prior from public.comanda_closures where id=close_id;
  if found then
   if prior.comanda_id<>p_id or prior.actor_id<>actor or prior.payments<>p_data or (prior.kind='CLOSE')<>(p_action='CLOSE') then raise exception 'Comanda já encerrada.';end if;
   return to_jsonb(c);
  end if;
 end if;
 if s.id is null then raise exception 'Abra o caixa antes de operar comandas.';end if;
 if p_action in ('OPEN','IDENTIFY') then
  if p_action='OPEN' and c.id is not null then
   if c.opened_by is distinct from actor or c.nome_cliente is distinct from btrim(p_data->>'identificacao') or c.customer_codigo is distinct from (p_data->>'customer_codigo')::integer then raise exception 'Identificador já utilizado.';end if;
   return to_jsonb(c);
  end if;
  if length(btrim(coalesce(p_data->>'identificacao',''))) not between 1 and 200 then raise exception 'Informe a identificação da comanda.';end if;
  if p_data->>'customer_codigo' is not null then
   select * into customer from public.customers where codigo_cliente=(p_data->>'customer_codigo')::integer;
   if not found or not customer.ativo then raise exception 'Cliente não encontrado ou inativo.';end if;
  end if;
  if p_action='OPEN' then
   insert into public.dining_tables(id,nome_cliente,customer_codigo,cash_session_id,opened_by)
   values(p_id,btrim(p_data->>'identificacao'),customer.codigo_cliente,s.id,actor) returning * into c;
  else
   if c.id is null or c.status<>'aberta' or c.cash_session_id<>s.id then raise exception 'Comanda indisponível.';end if;
   update public.dining_tables set nome_cliente=btrim(p_data->>'identificacao'),customer_codigo=customer.codigo_cliente where id=p_id returning * into c;
  end if;
  return to_jsonb(c);
 end if;
 if c.id is null or c.status<>'aberta' or c.cash_session_id is distinct from s.id then raise exception 'Comanda indisponível para encerramento.';end if;
 if c.total_geral is distinct from (p_data->>'total')::numeric then raise exception 'O consumo mudou. Atualize a comanda e revise o pagamento.';end if;
 remaining:=c.total_geral-c.paid_total;
 if c.paid_total is distinct from coalesce((p_data->>'paid_total')::numeric,0) then raise exception 'Os pagamentos mudaram. Atualize a comanda e revise o saldo.';end if;
 mode:=case when p_action='CLOSE' then 'CLOSE' else p_data->>'mode' end;
 if mode is null or mode not in ('CLOSE','VALUE','ITEMS') then raise exception 'Selecione pagamento por itens ou por valor.';end if;
 if mode='ITEMS' then
  if jsonb_typeof(p_data->'items') is distinct from 'array' then raise exception 'Selecione os itens.';end if;
  if jsonb_array_length(p_data->'items')=0 or jsonb_array_length(p_data->'items')>1000 then raise exception 'Selecione de um a mil itens.';end if;
  if exists(select 1 from jsonb_array_elements(p_data->'items') v group by v->>'item_id' having count(*)>1) then raise exception 'Item repetido no pagamento.';end if;
  for selected in select value from jsonb_array_elements(p_data->'items') loop
   select * into line from public.dining_table_items where id=(selected->>'item_id')::uuid and codigo_mesa=c.codigo_mesa for update;
   if not found then raise exception 'Item não pertence à comanda.';end if;
   if (selected->>'quantidade')::numeric is null or (selected->>'quantidade')::numeric<>trunc((selected->>'quantidade')::numeric) then raise exception 'Quantidade inválida.';end if;
   qty:=(selected->>'quantidade')::integer;
   select coalesce(sum((v->>'quantidade')::integer),0) into settled_qty from public.comanda_closures cc cross join lateral jsonb_array_elements(cc.items) v where cc.comanda_id=c.id and v->>'item_id'=line.id::text;
   if qty<=0 or qty>line.quantidade-settled_qty then raise exception 'Quantidade supera os itens ainda não pagos.';end if;
   item_total:=item_total+line.valor_unitario*qty;
  end loop;
 end if;
 if c.total_geral<0 or c.total_geral>999999999999.99 or c.total_geral<>round(c.total_geral,2) then raise exception 'Total da comanda inválido.';end if;
 if jsonb_typeof(p_data->'payments') is distinct from 'array' or jsonb_array_length(p_data->'payments')>10 then raise exception 'Informe até dez pagamentos.';end if;
 if remaining=0 and jsonb_array_length(p_data->'payments')<>0 then raise exception 'Comanda sem consumo não precisa de pagamento.';end if;
 for payment in select value from jsonb_array_elements(p_data->'payments') loop
  amount:=(payment->>'valor')::numeric;
  if amount is null or not(amount>0 and amount<=999999999999.99) or amount<>round(amount,2) then raise exception 'Valor de pagamento inválido.';end if;
  select * into method from public.financial_payment_methods where id=(payment->>'forma_id')::uuid and ativo and usar_pdv;
  if not found or (method.tipo<>'DEFERRED' and not(method.id=any(s.method_ids))) then raise exception 'Forma não configurada no caixa.';end if;
  if method.tipo='DEFERRED' then deferred:=deferred+amount;end if;
  paid:=paid+amount;
 end loop;
 if paid>remaining then raise exception 'O pagamento ultrapassa o saldo restante da comanda.';end if;
 if p_action='CLOSE' and paid<>remaining then raise exception 'A soma dos pagamentos deve ser igual ao saldo restante da comanda.';end if;
 if p_action='PAY' and paid<=0 then raise exception 'Informe um pagamento parcial maior que zero.';end if;
 if mode='ITEMS' and paid<>item_total then raise exception 'A soma dos pagamentos deve ser igual ao valor dos itens selecionados.';end if;
 if deferred>0 then
  if coalesce((p_data->>'customer_codigo')::integer,c.customer_codigo) is null then raise exception 'Cadastre ou selecione um cliente para pagamento a prazo.';end if;
  select * into customer from public.customers where codigo_cliente=coalesce((p_data->>'customer_codigo')::integer,c.customer_codigo) for update;
  if not found or not customer.ativo or customer.status='bloqueado' then raise exception 'Cliente inativo ou bloqueado para venda a prazo.';end if;
  if customer.total_pendente+deferred>customer.limite then raise exception 'O valor a prazo ultrapassa o limite do cliente.';end if;
  due:=(p_data->>'vencimento')::date;
  if due is null or not isfinite(due) or due<(now() at time zone 'America/Bahia')::date then raise exception 'Informe vencimento atual ou futuro.';end if;
  insert into public.customer_ledger(customer_codigo,entry_type,amount,issue_at,due_at,notes,comanda_id,categoria_id)
  values(customer.codigo_cliente,'DEBIT',deferred,clock_timestamp(),due::timestamp at time zone 'America/Bahia','Comanda #'||c.codigo_mesa||' - '||c.nome_cliente,c.id,s.categoria_id) returning id into debit;
 end if;
 insert into public.comanda_closures(id,comanda_id,cash_session_id,actor_id,total,payments,kind,items) values(close_id,c.id,s.id,actor,paid,p_data,mode,case when mode='ITEMS' then p_data->'items' else '[]'::jsonb end);
 for payment in select value from jsonb_array_elements(p_data->'payments') loop
  select * into method from public.financial_payment_methods where id=(payment->>'forma_id')::uuid;
  operation:=null;
  if method.tipo<>'DEFERRED' then
   acc:=coalesce(method.conta_padrao_id,s.conta_id);
   operation:=gen_random_uuid();
   perform app_private.finance_operation(operation,jsonb_build_object('tipo','INCOME','valor',(payment->>'valor')::numeric,'data',(now() at time zone 'America/Bahia')::date,'descricao','Comanda #'||c.codigo_mesa||' - '||left(c.nome_cliente,150),'conta_id',acc,'categoria_id',s.categoria_id,'forma_id',method.id));
  end if;
  insert into public.comanda_payments(closure_id,forma_id,valor,operation_id,debito_id) values(close_id,method.id,(payment->>'valor')::numeric,operation,case when method.tipo='DEFERRED' then debit else null end);
 end loop;
 update public.dining_tables set paid_total=paid_total+paid,status=case when p_action='CLOSE' then 'fechada' else 'aberta' end,closed_at=case when p_action='CLOSE' then clock_timestamp() else null end where id=c.id returning * into c;
 return to_jsonb(c);
end $$;


create or replace function app_private.validate_mesa_item() returns trigger language plpgsql security definer set search_path='' as $$
declare code integer;tab public.dining_tables;settled integer;next_total numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended('cash-session-global',0));
 code:=case when tg_op='DELETE' then old.codigo_mesa else new.codigo_mesa end;
 select * into tab from public.dining_tables where codigo_mesa=code for update;
 if not found or tab.status<>'aberta' or not exists(select 1 from public.cash_sessions where id=tab.cash_session_id and status='OPEN') then raise exception 'Comanda encerrada ou caixa fechado.' using errcode='22023';end if;
 if tg_op<>'INSERT' then
  select coalesce(sum((v->>'quantidade')::integer),0) into settled from public.comanda_closures cc cross join lateral jsonb_array_elements(cc.items) v where cc.comanda_id=tab.id and v->>'item_id'=old.id::text;
  if settled>0 and (tg_op='DELETE' or new.valor_unitario is distinct from old.valor_unitario or new.descricao is distinct from old.descricao or new.quantidade<settled) then raise exception 'Preserve os itens já pagos. Adicione novo consumo ou ajuste apenas a quantidade ainda não paga.';end if;
 end if;
 next_total:=tab.total_geral;
 if tg_op<>'INSERT' then next_total:=next_total-old.total;end if;
 if tg_op<>'DELETE' then
  if new.valor_unitario<>round(new.valor_unitario,2) or new.valor_unitario>999999999999.99 then raise exception 'Preço inválido.';end if;
  next_total:=next_total+new.valor_unitario*new.quantidade;
 end if;
 if next_total<tab.paid_total then raise exception 'O consumo não pode ficar menor que o valor já pago.';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
notify pgrst, 'reload schema';
