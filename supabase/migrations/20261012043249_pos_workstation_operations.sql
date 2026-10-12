-- Sale amounts use cents; costs and financial accounting retain their own precision.
alter table public.dining_tables add column discount_amount numeric(14,2) not null default 0 check(discount_amount>=0),
 add column surcharge_amount numeric(14,2) not null default 0 check(surcharge_amount>=0);
alter table public.cash_sales add column discount_amount numeric(14,2) not null default 0 check(discount_amount>=0),
 add column surcharge_amount numeric(14,2) not null default 0 check(surcharge_amount>=0);
alter table public.comanda_payments add column received_amount numeric(14,2),add column change_amount numeric(14,2),
 add constraint comanda_cash_change_valid check ((received_amount is null and change_amount is null) or (tipo_forma='CASH' and received_amount>=valor and change_amount>=0 and change_amount=received_amount-valor));
CREATE OR REPLACE FUNCTION app_private.refresh_mesa_total()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare mesa integer;
begin
  mesa=case when tg_op='DELETE' then old.codigo_mesa else new.codigo_mesa end;
  update public.dining_tables set total_geral=(select coalesce(sum(total),0)
    from public.dining_table_items where codigo_mesa=mesa)-discount_amount+surcharge_amount where codigo_mesa=mesa;
  return null;
end;
$function$;
CREATE OR REPLACE FUNCTION app_private.comanda_operation(p_id uuid, p_action text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); c public.dining_tables; dest public.dining_tables; s public.cash_sessions;
 req uuid; prior app_private.comanda_requests; answer jsonb; line public.dining_table_items; selection jsonb;
 qty integer; paid_qty integer; moved numeric:=0; product public.products; new_id uuid;discount numeric;surcharge numeric;subtotal numeric;
begin
 if actor is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if p_id is null or p_action is null or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Operação inválida.';end if;
 if p_action in ('OPEN','IDENTIFY','CLOSE','PAY') then
  if p_action='CLOSE' then
   perform pg_advisory_xact_lock(hashtextextended('cash-session-global',0));
   select * into c from public.dining_tables where id=p_id for update;
   if c.origem='PDV' and c.status='aberta' and not exists(select 1 from public.dining_table_items where codigo_mesa=c.codigo_mesa) then raise exception 'Adicione ao menos um item antes de finalizar a venda.';end if;
  end if;
  answer:=app_private.comanda_operation_base(p_id,p_action,p_data);
  if p_action='CLOSE' then perform app_private.finalize_sale_stock(p_id);end if;
  return answer;
 end if;
 if p_action not in ('OPEN_PDV','ADD_PRODUCT','TRANSFER','CONVERT','CHANGE_QUANTITY','SET_ADJUSTMENTS') then raise exception 'Operação inválida.';end if;
 perform pg_advisory_xact_lock(hashtextextended('cash-session-global',0));
 if p_action='OPEN_PDV' then
  select * into c from public.dining_tables where id=p_id;
  if c.id is not null and c.origem<>'PDV' then raise exception 'Identificador já utilizado.';end if;
  answer:=app_private.comanda_operation_base(p_id,'OPEN',p_data);
  select * into c from public.dining_tables where id=p_id;
  update public.dining_tables set origem='PDV' where id=p_id returning * into c;
  return to_jsonb(c);
 end if;
 req:=(p_data->>'request_id')::uuid;
 if req is null then raise exception 'Identificador da operação obrigatório.';end if;
 select * into prior from app_private.comanda_requests where id=req;
 if found then
  if prior.comanda_id<>p_id or prior.action<>p_action or prior.payload<>p_data or prior.actor_id<>actor then raise exception 'Identificador já utilizado.';end if;
  return prior.result;
 end if;
 select * into s from public.cash_sessions where status='OPEN' for update;
 select * into c from public.dining_tables where id=p_id for update;
 if s.id is null or c.id is null or c.status<>'aberta' or c.cash_session_id is distinct from s.id then raise exception 'Atendimento indisponível ou caixa fechado.';end if;
 if c.total_geral is distinct from (p_data->>'total')::numeric or c.paid_total is distinct from (p_data->>'paid_total')::numeric then raise exception 'O atendimento mudou. Atualize os itens e o saldo.';end if;
 if p_action='SET_ADJUSTMENTS' then
  discount:=(p_data->>'discount_amount')::numeric;surcharge:=(p_data->>'surcharge_amount')::numeric;
  if discount is null or surcharge is null or not(discount between 0 and 999999999999.99) or not(surcharge between 0 and 999999999999.99) or discount<>round(discount,2) or surcharge<>round(surcharge,2) then raise exception 'Informe desconto e acréscimo com até duas casas decimais.';end if;
  if c.discount_amount is distinct from coalesce((p_data->>'expected_discount')::numeric,0) or c.surcharge_amount is distinct from coalesce((p_data->>'expected_surcharge')::numeric,0) then raise exception 'Os ajustes mudaram. Atualize o atendimento.';end if;
  select coalesce(sum(total),0) into subtotal from public.dining_table_items where codigo_mesa=c.codigo_mesa;
  if subtotal-discount+surcharge<c.paid_total or subtotal-discount+surcharge>999999999999.99 then raise exception 'O total ajustado deve cobrir o valor já pago e respeitar o limite da venda.';end if;
  if not exists(select 1 from public.dining_table_items where codigo_mesa=c.codigo_mesa) and (discount>0 or surcharge>0) then raise exception 'Adicione itens antes de aplicar ajustes.';end if;
  update public.dining_tables set discount_amount=discount,surcharge_amount=surcharge,total_geral=subtotal-discount+surcharge where id=c.id returning to_jsonb(dining_tables) into answer;
 elsif p_action='CHANGE_QUANTITY' then
  select * into line from public.dining_table_items where id=(p_data->>'item_id')::uuid and codigo_mesa=c.codigo_mesa for update;
  if not found then raise exception 'Item não pertence ao atendimento.';end if;
  if line.quantidade is distinct from (p_data->>'expected_quantity')::integer then raise exception 'A quantidade mudou. Atualize os itens.';end if;
  if (p_data->>'quantidade')::numeric is null or not((p_data->>'quantidade')::numeric between 1 and 2147483647) or (p_data->>'quantidade')::numeric<>trunc((p_data->>'quantidade')::numeric) then raise exception 'Quantidade inteira maior que zero obrigatória.';end if;
  update public.dining_table_items set quantidade=(p_data->>'quantidade')::integer where id=line.id;
  select to_jsonb(t) into answer from public.dining_tables t where id=c.id;
 elsif p_action='ADD_PRODUCT' then
  select * into product from public.products where id=(p_data->>'product_id')::uuid and ativo for share;
  if not found then raise exception 'Produto não encontrado ou inativo.';end if;
  if (p_data->>'quantidade')::numeric is null or (p_data->>'quantidade')::numeric<>trunc((p_data->>'quantidade')::numeric) then raise exception 'Quantidade inválida.';end if;
  qty:=(p_data->>'quantidade')::integer;
  if qty<1 then raise exception 'Quantidade inválida.';end if;
  insert into public.dining_table_items(codigo_mesa,descricao,valor_unitario,quantidade,product_id) values(c.codigo_mesa,product.nome,product.preco_venda,qty,product.id);
  select to_jsonb(t) into answer from public.dining_tables t where id=c.id;
 elsif p_action='CONVERT' then
  if c.origem<>'PDV' then raise exception 'Este atendimento já é uma comanda.';end if;
  -- Conversion preserves item IDs, receipts, deferred debts and paid quantities.
  perform app_private.comanda_operation_base(p_id,'IDENTIFY',p_data);
  update public.dining_tables set origem='COMANDA' where id=p_id returning * into dest;
  answer:=jsonb_build_object('comanda_id',dest.id,'comanda_numero',coalesce(dest.sale_record,dest.codigo_mesa),'convertida',true);
 else
  if c.discount_amount<>0 or c.surcharge_amount<>0 then raise exception 'Remova os descontos e acréscimos da origem antes de transferir itens. Converter a venda inteira em nova comanda preserva os ajustes.';end if;
  if jsonb_typeof(p_data->'items') is distinct from 'array' then raise exception 'Selecione os itens a transferir.';end if;
  if jsonb_array_length(p_data->'items') not between 1 and 1000 then raise exception 'Selecione de um a mil itens.';end if;
  if exists(select 1 from jsonb_array_elements(p_data->'items') v group by v->>'item_id' having count(*)>1) then raise exception 'Item repetido na transferência.';end if;
  new_id:=(p_data->>'destination_id')::uuid;
  if new_id is null or new_id=p_id then raise exception 'Escolha outra comanda de destino.';end if;
  if coalesce((p_data->>'new_destination')::boolean,false) then
   if exists(select 1 from public.dining_tables where id=new_id) then raise exception 'Identificador da nova comanda já utilizado.';end if;
   perform app_private.comanda_operation_base(new_id,'OPEN',p_data);
  end if;
  select * into dest from public.dining_tables where id=new_id for update;
  if dest.id is null or dest.origem<>'COMANDA' or dest.status<>'aberta' or dest.cash_session_id is distinct from s.id then raise exception 'A comanda de destino deve estar aberta no mesmo caixa.';end if;
  if not coalesce((p_data->>'new_destination')::boolean,false) and (dest.total_geral is distinct from (p_data->>'destination_total')::numeric or dest.paid_total is distinct from (p_data->>'destination_paid_total')::numeric) then raise exception 'A comanda de destino mudou. Atualize antes de transferir.';end if;
  if c.sale_id is not null then raise exception 'Finalize a venda reaberta no próprio registro antes de transferir itens.';end if;
  for selection in select value from jsonb_array_elements(p_data->'items') loop
   select * into line from public.dining_table_items where id=(selection->>'item_id')::uuid and codigo_mesa=c.codigo_mesa for update;
   if not found then raise exception 'Item não pertence ao atendimento de origem.';end if;
   if (selection->>'quantidade')::numeric is null or (selection->>'quantidade')::numeric<>trunc((selection->>'quantidade')::numeric) then raise exception 'Quantidade inválida.';end if;
   qty:=(selection->>'quantidade')::integer;
   select coalesce(sum((v->>'quantidade')::integer),0) into paid_qty from public.comanda_closures cc cross join lateral jsonb_array_elements(cc.items) v where cc.comanda_id=c.id and v->>'item_id'=line.id::text;
   if qty<1 or qty>line.quantidade-paid_qty then raise exception 'Transfira apenas quantidades ainda não pagas.';end if;
   moved:=moved+qty*line.valor_unitario;
   if moved>c.total_geral-c.paid_total then raise exception 'A transferência ultrapassa o saldo restante. Pagamentos por valor permanecem na origem.';end if;
   insert into public.dining_table_items(codigo_mesa,descricao,valor_unitario,quantidade,product_id) values(dest.codigo_mesa,line.descricao,line.valor_unitario,qty,line.product_id);
   if qty=line.quantidade then delete from public.dining_table_items where id=line.id;
   else update public.dining_table_items set quantidade=quantidade-qty where id=line.id;end if;
  end loop;
  answer:=jsonb_build_object('comanda_id',dest.id,'comanda_numero',coalesce(dest.sale_record,dest.codigo_mesa),'valor_transferido',moved);
  -- A fully transferred unpaid PDV has no sale: end its empty draft without consuming a sale number.
  if c.origem='PDV' and c.paid_total=0 and not exists(select 1 from public.dining_table_items where codigo_mesa=c.codigo_mesa) then
   update public.dining_tables set status='fechada',closed_at=clock_timestamp() where id=c.id;
  end if;
 end if;
 insert into app_private.comanda_requests(id,comanda_id,action,payload,result,actor_id) values(req,p_id,p_action,p_data,answer,actor);
 return answer;
end $function$;
CREATE OR REPLACE FUNCTION app_private.comanda_operation_base(p_id uuid, p_action text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid();s public.cash_sessions;c public.dining_tables;customer public.customers;
 prior public.comanda_closures;payment jsonb;method public.financial_payment_methods;amount numeric;paid numeric:=0;
 deferred numeric:=0;due date;debit uuid;close_id uuid;acc uuid;operation uuid; remaining numeric; item_total numeric:=0; selected jsonb; line public.dining_table_items; qty integer; settled_qty integer; mode text;sale public.cash_sales;record_number integer;received numeric;
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
  select * into method from public.financial_payment_methods where id=(payment->>'forma_id')::uuid and ativo;
  if not found then raise exception 'Forma não configurada no caixa.';end if;
  if payment ? 'recebido' then
   received:=(payment->>'recebido')::numeric;
   if method.tipo<>'CASH' or received is null or not(received between amount and 999999999999.99) or received<>round(received,2) then raise exception 'Dinheiro recebido deve cobrir o pagamento e usar duas casas decimais.';end if;
  end if;
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
   acc:=app_private.payment_receiving_account(method.id,s.conta_id);
   operation:=gen_random_uuid();
   perform app_private.finance_operation(operation,jsonb_build_object('tipo','INCOME','valor',(payment->>'valor')::numeric,'data',(now() at time zone 'America/Bahia')::date,'descricao','Comanda #'||c.codigo_mesa||' - '||left(c.nome_cliente,150),'conta_id',acc,'categoria_id',s.categoria_id,'forma_id',method.id));
  end if;
  insert into public.comanda_payments(closure_id,forma_id,valor,operation_id,debito_id,received_amount,change_amount)
  values(close_id,method.id,(payment->>'valor')::numeric,operation,case when method.tipo='DEFERRED' then debit else null end,
   case when method.tipo='CASH' then coalesce((payment->>'recebido')::numeric,(payment->>'valor')::numeric) else null end,
   case when method.tipo='CASH' then coalesce((payment->>'recebido')::numeric,(payment->>'valor')::numeric)-(payment->>'valor')::numeric else null end);
 end loop;
 update public.dining_tables set paid_total=paid_total+paid,status=case when p_action='CLOSE' then 'fechada' else 'aberta' end,closed_at=case when p_action='CLOSE' then clock_timestamp() else null end where id=c.id returning * into c;
 if p_action='CLOSE' then
  if c.sale_id is null then
   update public.cash_sessions set next_sale_number=next_sale_number+1 where id=s.id returning next_sale_number-1 into record_number;
   insert into public.cash_sales(cash_session_id,number,comanda_id,total,nome_cliente,items,nota_fiscal,actor_id,discount_amount,surcharge_amount)
   values(s.id,record_number,c.id,c.total_geral,c.nome_cliente,
    coalesce((select jsonb_agg(jsonb_build_object('product_id',i.product_id,'descricao',i.descricao,'valor_unitario',i.valor_unitario,'quantidade',i.quantidade) order by i.id) from public.dining_table_items i where i.codigo_mesa=c.codigo_mesa),'[]'),coalesce((p_data->>'nota_fiscal')::boolean,false),actor,c.discount_amount,c.surcharge_amount) returning * into sale;
  else
   select * into sale from public.cash_sales where id=c.sale_id for update;
   if not found or sale.status<>'REOPENED' or sale.reopened_comanda_id<>c.id or sale.cash_session_id<>s.id then raise exception 'Venda indisponível para nova finalização.';end if;
   update public.cash_sales set status='FINALIZED',comanda_id=c.id,total=c.total_geral,nome_cliente=c.nome_cliente,discount_amount=c.discount_amount,surcharge_amount=c.surcharge_amount,
    items=coalesce((select jsonb_agg(jsonb_build_object('product_id',i.product_id,'descricao',i.descricao,'valor_unitario',i.valor_unitario,'quantidade',i.quantidade) order by i.id) from public.dining_table_items i where i.codigo_mesa=c.codigo_mesa),'[]'),nota_fiscal=coalesce((p_data->>'nota_fiscal')::boolean,false),finalized_at=clock_timestamp(),changed_at=clock_timestamp(),changed_by=actor where id=sale.id returning * into sale;
  end if;
  update public.dining_tables set sale_id=sale.id,sale_record=sale.number where id=c.id returning * into c;
 end if;
 return to_jsonb(c);
end $function$;
CREATE OR REPLACE FUNCTION app_private.cash_sale_operation(p_id uuid, p_action text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid();sale public.cash_sales;s public.cash_sessions;c public.dining_tables;new_comanda public.dining_tables;
 prior app_private.cash_requests;request uuid;payment record;debt public.customer_ledger;refund numeric;settled numeric;
 operation uuid;sale_reason text;res jsonb;
begin
 if actor is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if p_id is null or p_action is null or p_action not in ('CANCEL','REOPEN','INVOICE') or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Operação de venda inválida.';end if;
 if p_action in ('CANCEL','REOPEN') and app_private.app_role() not in ('MASTER','ADMIN') then raise exception 'Somente administradores podem cancelar ou reabrir vendas.' using errcode='42501';end if;
 request:=(p_data->>'request_id')::uuid;if request is null then raise exception 'Identificador da operação obrigatório.';end if;
 perform pg_advisory_xact_lock(hashtextextended('cash-session-global',0));
 select * into prior from app_private.cash_requests where id=request;
 if found then
  if prior.entity_id<>p_id or prior.action<>p_action or prior.payload<>p_data or prior.actor_id<>actor then raise exception 'Identificador já utilizado.';end if;
  return prior.result;
 end if;
 select * into sale from public.cash_sales where id=p_id for update;
 if not found or sale.status<>'FINALIZED' then raise exception 'A venda não está finalizada ou já foi cancelada/reaberta. Atualize a lista.';end if;
 select * into s from public.cash_sessions where id=sale.cash_session_id for update;
 if p_action='INVOICE' then
  if jsonb_typeof(p_data->'nota_fiscal') is distinct from 'boolean' then raise exception 'Informe se foi gerada a nota fiscal.';end if;
  update public.cash_sales set nota_fiscal=(p_data->>'nota_fiscal')::boolean,changed_at=clock_timestamp(),changed_by=actor where id=p_id returning * into sale;
  res:=to_jsonb(sale);
 else
  if s.status<>'OPEN' then raise exception 'O caixa da venda já foi fechado. Seu movimento e conferência não podem ser alterados.';end if;
  sale_reason:=btrim(coalesce(p_data->>'motivo',''));
  if length(sale_reason) not between 3 and 2000 then raise exception 'Informe o motivo do cancelamento ou reabertura.';end if;
  select * into c from public.dining_tables where id=sale.comanda_id for update;
  if c.status<>'fechada' then raise exception 'A comanda de origem não está encerrada.';end if;
  select coalesce(sum(p.valor),0) into refund from public.comanda_payments p join public.comanda_closures cc on cc.id=p.closure_id where cc.comanda_id=c.id and p.tipo_forma='CASH' and p.operation_id is not null and not exists(select 1 from public.financial_operations r where r.estorno_de=p.operation_id);
  if refund>app_private.cash_expected(s.id) then raise exception 'Dinheiro insuficiente para devolver a venda. Registre suprimento antes de cancelar ou reabrir.';end if;
  -- Lock customers first, then validate all debts before doing any compensation.
  perform cu.codigo_cliente from public.customers cu where cu.codigo_cliente in(select d.customer_codigo from public.customer_ledger d where d.comanda_id=c.id and d.entry_type='DEBIT') order by cu.codigo_cliente for update;
  for debt in select d.* from public.customer_ledger d where d.comanda_id=c.id and d.entry_type='DEBIT' order by d.id for update loop
   select coalesce(sum(o.valor),0) into settled from public.financial_operations o where o.debito_id=debt.id and o.tipo in ('RECEIPT','ALLOCATION','SALE_VOID') and not exists(select 1 from public.financial_operations r where r.estorno_de=o.id);
   if settled>0 then raise exception 'A venda a prazo já possui recebimentos ou créditos vinculados. Estorne essas baixas antes de cancelar ou reabrir.';end if;
  end loop;
  update public.cash_sales set status=case when p_action='CANCEL' then 'CANCELED' else 'REOPENED' end,changed_at=clock_timestamp(),changed_by=actor,reason=sale_reason where id=p_id returning * into sale;
  for payment in select p.* from public.comanda_payments p join public.comanda_closures cc on cc.id=p.closure_id where cc.comanda_id=c.id and p.operation_id is not null order by p.id loop
   if not exists(select 1 from public.financial_operations r where r.estorno_de=payment.operation_id) then
    perform app_private.finance_operation_base(gen_random_uuid(),jsonb_build_object('tipo','REVERSAL','estorno_de',payment.operation_id,'data',(now() at time zone 'America/Bahia')::date,'descricao',case when p_action='CANCEL' then 'Cancelamento' else 'Reabertura' end||' da venda #'||sale.number,'motivo',sale_reason));
   end if;
  end loop;
  for debt in select d.* from public.customer_ledger d where d.comanda_id=c.id and d.entry_type='DEBIT' order by d.id loop
   operation:=gen_random_uuid();
   insert into public.financial_operations(id,tipo,valor,data,descricao,debito_id,motivo,actor_id,payload)
   values(operation,'SALE_VOID',debt.amount,(now() at time zone 'America/Bahia')::date,'Anulação do débito da venda #'||sale.number,debt.id,sale_reason,actor,jsonb_build_object('sale_id',sale.id,'request_id',request,'action',p_action));
   insert into public.customer_ledger(customer_codigo,entry_type,amount,notes,financial_operation_id,comanda_id)
   values(debt.customer_codigo,'CREDIT',debt.amount,'Anulação do débito da venda #'||sale.number,operation,c.id);
  end loop;
  perform app_private.reverse_sale_stock(c.id);
  update public.dining_tables set sale_voided=true where id=c.id;
  if p_action='REOPEN' then
   insert into public.dining_tables(nome_cliente,customer_codigo,cash_session_id,opened_by,sale_id,sale_record)
   values(c.nome_cliente,c.customer_codigo,s.id,actor,sale.id,sale.number) returning * into new_comanda;
   insert into public.dining_table_items(codigo_mesa,descricao,valor_unitario,quantidade,product_id)
   select new_comanda.codigo_mesa,v->>'descricao',(v->>'valor_unitario')::numeric,(v->>'quantidade')::integer,(v->>'product_id')::uuid from jsonb_array_elements(sale.items) v;
   update public.dining_tables set discount_amount=sale.discount_amount,surcharge_amount=sale.surcharge_amount,total_geral=sale.total where id=new_comanda.id returning * into new_comanda;
   update public.cash_sales set reopened_comanda_id=new_comanda.id,reopened_comanda_number=sale.number where id=p_id returning * into sale;
  end if;
  res:=to_jsonb(sale)||jsonb_build_object('comanda_id_aberta',new_comanda.id,'comanda_numero',new_comanda.sale_record);
 end if;
 insert into app_private.cash_requests(id,entity_id,action,payload,actor_id,result) values(request,p_id,p_action,p_data,actor,res);
 return res;
end $function$;
notify pgrst,'reload schema';
