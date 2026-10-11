alter table public.cash_sessions add column opening_amount numeric(14,2) not null default 0 check(opening_amount>=0),
 add column counted_amount numeric(14,2),add column expected_amount numeric(14,2),add column difference numeric(14,2),
 add column closing_payload jsonb,add column next_sale_number integer not null default 1 check(next_sale_number>0);

create table public.cash_sales(
 id uuid primary key default gen_random_uuid(),cash_session_id uuid not null references public.cash_sessions(id),
 number integer not null check(number>0),comanda_id uuid unique not null references public.dining_tables(id),
 status text not null default 'FINALIZED' check(status in ('FINALIZED','CANCELED','REOPENED')),
 total numeric(14,2) not null check(total>=0),nome_cliente text not null,items jsonb not null,
 nota_fiscal boolean not null default false,created_at timestamptz not null default now(),
 finalized_at timestamptz not null default now(),actor_id uuid not null references auth.users(id),
 changed_at timestamptz,changed_by uuid references auth.users(id),reason text,
 reopened_comanda_id uuid references public.dining_tables(id),reopened_comanda_number integer,
 unique(cash_session_id,number)
);
create index cash_sales_actor_idx on public.cash_sales(actor_id);
create index cash_sales_changed_by_idx on public.cash_sales(changed_by);
create index cash_sales_reopened_idx on public.cash_sales(reopened_comanda_id);
alter table public.dining_tables add column sale_id uuid references public.cash_sales(id),
 add column sale_record integer,add column sale_voided boolean not null default false;
create index comandas_sale_idx on public.dining_tables(sale_id);
create table public.cash_movements(
 id uuid primary key,cash_session_id uuid not null references public.cash_sessions(id),
 kind text not null check(kind in ('OPENING','WITHDRAW','SUPPLY')),
 valor numeric(14,2) not null check(valor>0),motivo text not null,
 operation_id uuid unique references public.financial_operations(id),
 actor_id uuid not null references auth.users(id),created_at timestamptz not null default now()
);
create index cash_movements_session_idx on public.cash_movements(cash_session_id);
create index cash_movements_actor_idx on public.cash_movements(actor_id);
create table app_private.cash_requests(
 id uuid primary key,entity_id uuid not null,action text not null,payload jsonb not null,
 actor_id uuid not null,result jsonb not null,created_at timestamptz not null default now()
);
revoke all on app_private.cash_requests from public,anon,authenticated;
alter table public.comanda_payments add column tipo_forma text;
update public.comanda_payments p set tipo_forma=m.tipo from public.financial_payment_methods m where m.id=p.forma_id;
alter table public.comanda_payments alter column tipo_forma set not null;
create function app_private.snapshot_comanda_method() returns trigger language plpgsql security definer set search_path='' as $$
begin select tipo into new.tipo_forma from public.financial_payment_methods where id=new.forma_id;return new;end $$;
revoke all on function app_private.snapshot_comanda_method() from public,anon,authenticated;
create trigger comanda_method_snapshot before insert on public.comanda_payments for each row execute function app_private.snapshot_comanda_method();

-- Number existing closed sales deterministically inside their original sessions.
insert into public.cash_sales(cash_session_id,number,comanda_id,total,nome_cliente,items,created_at,finalized_at,actor_id)
select cc.cash_session_id,row_number() over(partition by cc.cash_session_id order by cc.created_at,cc.id),c.id,c.total_geral,c.nome_cliente,
 coalesce((select jsonb_agg(jsonb_build_object('descricao',i.descricao,'valor_unitario',i.valor_unitario,'quantidade',i.quantidade) order by i.id) from public.dining_table_items i where i.codigo_mesa=c.codigo_mesa),'[]'),cc.created_at,cc.created_at,cc.actor_id
from public.comanda_closures cc join public.dining_tables c on c.id=cc.comanda_id where cc.kind='CLOSE';
update public.dining_tables c set sale_id=s.id,sale_record=s.number from public.cash_sales s where s.comanda_id=c.id;
update public.cash_sessions cs set next_sale_number=coalesce((select max(number)+1 from public.cash_sales where cash_session_id=cs.id),1);

do $$declare t text;begin
 foreach t in array array['cash_sales','cash_movements'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy cash_read on public.%I for select to authenticated using ((select app_private.app_role()) in (''MASTER'',''ADMIN'',''OPERATOR''))',t);
 end loop;
end $$;

create function app_private.cash_expected(p_id uuid) returns numeric language sql stable set search_path='' as $$
 select s.opening_amount
 +coalesce((select sum(case when m.kind='SUPPLY' then m.valor when m.kind='WITHDRAW' then -m.valor else 0 end) from public.cash_movements m where m.cash_session_id=s.id),0)
 +coalesce((select sum(p.valor) from public.comanda_payments p join public.comanda_closures cc on cc.id=p.closure_id where cc.cash_session_id=s.id and p.tipo_forma='CASH' and p.operation_id is not null and not exists(select 1 from public.financial_operations r where r.estorno_de=p.operation_id)),0)
 from public.cash_sessions s where s.id=p_id
$$;
revoke all on function app_private.cash_expected(uuid) from public,anon,authenticated;

create or replace function app_private.cash_operation(p_id uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();s public.cash_sessions;prior app_private.cash_requests;value numeric;balance numeric;expected numeric;counted numeric;variance numeric;op uuid;other uuid;request uuid;res jsonb;
begin
 if actor is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if p_id is null or p_action is null or p_action not in ('OPEN','CLOSE','WITHDRAW','SUPPLY') or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Operação de caixa inválida.';end if;
 perform pg_advisory_xact_lock(hashtextextended('cash-session-global',0));
 if p_action in ('WITHDRAW','SUPPLY') then
  request:=(p_data->>'request_id')::uuid;if request is null then raise exception 'Identificador da operação obrigatório.';end if;
  select * into prior from app_private.cash_requests where id=request;
  if found then
   if prior.entity_id<>p_id or prior.action<>p_action or prior.payload<>p_data or prior.actor_id<>actor then raise exception 'Identificador já utilizado.';end if;
   return prior.result;
  end if;
 end if;
 select * into s from public.cash_sessions where id=p_id for update;
 if p_action='OPEN' then
  if found then
   if s.opening_payload<>p_data or s.opened_by<>actor then raise exception 'Identificador já utilizado.';end if;
   return to_jsonb(s)-'opening_payload'-'closing_payload';
  end if;
  if exists(select 1 from public.cash_sessions where status='OPEN') then raise exception 'Já existe um caixa aberto.';end if;
  if not exists(select 1 from public.financial_accounts where id=(p_data->>'conta_id')::uuid and ativo and tipo='CASH') then raise exception 'Selecione uma conta de dinheiro / caixa ativa.';end if;
  if not exists(select 1 from public.financial_categories where id=(p_data->>'categoria_id')::uuid and ativo and natureza in ('INCOME','BOTH')) then raise exception 'Selecione uma categoria de receita ativa.';end if;
  if not exists(select 1 from public.financial_payment_methods where ativo) then raise exception 'Cadastre uma forma de pagamento ativa.';end if;
  value:=coalesce((p_data->>'valor_abertura')::numeric,0);
  if not(value>=0 and value<=999999999999.99) or value<>round(value,2) then raise exception 'Valor de abertura inválido.';end if;
  other:=(p_data->>'origem_id')::uuid;
  if other is not null then
   if value<=0 then raise exception 'Informe o valor do troco a transferir.';end if;
   if other=(p_data->>'conta_id')::uuid then raise exception 'A origem do troco deve ser outra conta.';end if;
   perform id from public.financial_accounts where id in(other,(p_data->>'conta_id')::uuid) order by id for update;
   select coalesce(sum(valor),0) into balance from public.financial_entries where conta_id=other;
   if balance<value then raise exception 'Saldo insuficiente na conta de origem do troco.';end if;
   op:=gen_random_uuid();
   perform app_private.finance_operation(op,jsonb_build_object('tipo','TRANSFER','valor',value,'data',(now() at time zone 'America/Bahia')::date,'descricao','Troco de abertura do caixa','conta_id',other,'destino_id',(p_data->>'conta_id')::uuid));
  else
   perform 1 from public.financial_accounts where id=(p_data->>'conta_id')::uuid for update;
   select coalesce(sum(valor),0) into balance from public.financial_entries where conta_id=(p_data->>'conta_id')::uuid;
   if balance<value then raise exception 'O valor de abertura supera o saldo financeiro. Selecione a origem do troco ou ajuste o saldo da conta antes de abrir.';end if;
  end if;
  select coalesce(sum(valor),0) into balance from public.financial_entries where conta_id=(p_data->>'conta_id')::uuid;
  insert into public.cash_sessions(id,conta_id,categoria_id,method_ids,opened_by,opening_payload,saldo_abertura,opening_amount)
  values(p_id,(p_data->>'conta_id')::uuid,(p_data->>'categoria_id')::uuid,array(select id from public.financial_payment_methods where ativo order by id),actor,p_data,balance,value) returning * into s;
  if value>0 then insert into public.cash_movements(id,cash_session_id,kind,valor,motivo,operation_id,actor_id) values(gen_random_uuid(),s.id,'OPENING',value,'Troco de abertura',op,actor);end if;
  update public.dining_tables set cash_session_id=s.id where status='aberta' and cash_session_id is null;
 else
  if not found then raise exception 'Caixa não encontrado.';end if;
  if p_action='CLOSE' and s.status='CLOSED' then
   if s.closing_payload is distinct from p_data or s.closed_by is distinct from actor then raise exception 'Caixa já fechado. A conferência não pode ser alterada.';end if;
   return to_jsonb(s)-'opening_payload'-'closing_payload';
  end if;
  if s.status<>'OPEN' then raise exception 'Caixa fechado. Não é possível movimentá-lo.';end if;
  expected:=app_private.cash_expected(s.id);
  if p_action='CLOSE' then
   if exists(select 1 from public.dining_tables where status='aberta') then raise exception 'Encerre todas as comandas abertas antes de fechar o caixa.';end if;
   if expected is distinct from (p_data->>'esperado')::numeric then raise exception 'Os movimentos do caixa mudaram. Atualize e confira os valores novamente.';end if;
   counted:=(p_data->>'contado')::numeric;
   if counted is null or not(counted>=0 and counted<=999999999999.99) or counted<>round(counted,2) then raise exception 'Informe o dinheiro contado no fechamento.';end if;
   variance:=counted-expected;
   if length(coalesce(p_data->>'motivo',''))>2000 then raise exception 'A justificativa deve ter até 2000 caracteres.';end if;
   if variance<>0 and length(btrim(coalesce(p_data->>'motivo','')))<3 then raise exception 'Justifique a diferença entre o dinheiro esperado e o contado.';end if;
   select coalesce(sum(valor),0) into balance from public.financial_entries where conta_id=s.conta_id;
   update public.cash_sessions set status='CLOSED',closed_at=clock_timestamp(),closed_by=actor,saldo_fechamento=balance,expected_amount=expected,counted_amount=counted,difference=variance,closing_payload=p_data where id=s.id returning * into s;
  else
   value:=(p_data->>'valor')::numeric;other:=(p_data->>'conta_id')::uuid;
   if value is null or not(value>0 and value<=999999999999.99) or value<>round(value,2) or length(btrim(coalesce(p_data->>'motivo','')))<3 or length(p_data->>'motivo')>2000 then raise exception 'Informe valor e motivo da movimentação.';end if;
   if other is null or other=s.conta_id or not exists(select 1 from public.financial_accounts where id=other and ativo) then raise exception 'Selecione outra conta financeira ativa.';end if;
   if p_action='WITHDRAW' and value>expected then raise exception 'Sangria maior que o dinheiro disponível no caixa.';end if;
   perform id from public.financial_accounts where id in(s.conta_id,other) order by id for update;
   select coalesce(sum(valor),0) into balance from public.financial_entries where conta_id=case when p_action='WITHDRAW' then s.conta_id else other end;
   if value>balance then raise exception 'Saldo financeiro insuficiente na conta de origem.';end if;
   op:=gen_random_uuid();
   perform app_private.finance_operation(op,jsonb_build_object('tipo','TRANSFER','valor',value,'data',(now() at time zone 'America/Bahia')::date,'descricao',case when p_action='WITHDRAW' then 'Sangria do caixa' else 'Suprimento do caixa' end,'motivo',p_data->>'motivo','conta_id',case when p_action='WITHDRAW' then s.conta_id else other end,'destino_id',case when p_action='WITHDRAW' then other else s.conta_id end));
   insert into public.cash_movements(id,cash_session_id,kind,valor,motivo,operation_id,actor_id) values(request,s.id,p_action,value,btrim(p_data->>'motivo'),op,actor);
   res:=jsonb_build_object('id',request,'expected_cash',app_private.cash_expected(s.id));
   insert into app_private.cash_requests(id,entity_id,action,payload,actor_id,result) values(request,p_id,p_action,p_data,actor,res);
   return res;
  end if;
 end if;
 return to_jsonb(s)-'opening_payload'-'closing_payload';
end $$;

create or replace function app_private.comanda_operation(p_id uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();s public.cash_sessions;c public.dining_tables;customer public.customers;
 prior public.comanda_closures;payment jsonb;method public.financial_payment_methods;amount numeric;paid numeric:=0;
 deferred numeric:=0;due date;debit uuid;close_id uuid;acc uuid;operation uuid; remaining numeric; item_total numeric:=0; selected jsonb; line public.dining_table_items; qty integer; settled_qty integer; mode text;sale public.cash_sales;record_number integer;
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
   acc:=case when method.tipo='CASH' then s.conta_id else coalesce(method.conta_padrao_id,s.conta_id) end;
   operation:=gen_random_uuid();
   perform app_private.finance_operation(operation,jsonb_build_object('tipo','INCOME','valor',(payment->>'valor')::numeric,'data',(now() at time zone 'America/Bahia')::date,'descricao','Comanda #'||c.codigo_mesa||' - '||left(c.nome_cliente,150),'conta_id',acc,'categoria_id',s.categoria_id,'forma_id',method.id));
  end if;
  insert into public.comanda_payments(closure_id,forma_id,valor,operation_id,debito_id) values(close_id,method.id,(payment->>'valor')::numeric,operation,case when method.tipo='DEFERRED' then debit else null end);
 end loop;
 update public.dining_tables set paid_total=paid_total+paid,status=case when p_action='CLOSE' then 'fechada' else 'aberta' end,closed_at=case when p_action='CLOSE' then clock_timestamp() else null end where id=c.id returning * into c;
 if p_action='CLOSE' then
  if c.sale_id is null then
   update public.cash_sessions set next_sale_number=next_sale_number+1 where id=s.id returning next_sale_number-1 into record_number;
   insert into public.cash_sales(cash_session_id,number,comanda_id,total,nome_cliente,items,nota_fiscal,actor_id)
   values(s.id,record_number,c.id,c.total_geral,c.nome_cliente,
    coalesce((select jsonb_agg(jsonb_build_object('descricao',i.descricao,'valor_unitario',i.valor_unitario,'quantidade',i.quantidade) order by i.id) from public.dining_table_items i where i.codigo_mesa=c.codigo_mesa),'[]'),coalesce((p_data->>'nota_fiscal')::boolean,false),actor) returning * into sale;
  else
   select * into sale from public.cash_sales where id=c.sale_id for update;
   if not found or sale.status<>'REOPENED' or sale.reopened_comanda_id<>c.id or sale.cash_session_id<>s.id then raise exception 'Venda indisponível para nova finalização.';end if;
   update public.cash_sales set status='FINALIZED',comanda_id=c.id,total=c.total_geral,nome_cliente=c.nome_cliente,
    items=coalesce((select jsonb_agg(jsonb_build_object('descricao',i.descricao,'valor_unitario',i.valor_unitario,'quantidade',i.quantidade) order by i.id) from public.dining_table_items i where i.codigo_mesa=c.codigo_mesa),'[]'),nota_fiscal=coalesce((p_data->>'nota_fiscal')::boolean,false),finalized_at=clock_timestamp(),changed_at=clock_timestamp(),changed_by=actor where id=sale.id returning * into sale;
  end if;
  update public.dining_tables set sale_id=sale.id,sale_record=sale.number where id=c.id returning * into c;
 end if;
 return to_jsonb(c);
end $$;



alter table public.financial_operations drop constraint financial_operations_tipo_check;
alter table public.financial_operations add constraint financial_operations_tipo_check check(tipo in ('PAYMENT','RECEIPT','TRANSFER','INCOME','EXPENSE','OPENING','ALLOCATION','REVERSAL','SALE_VOID'));
create function app_private.finance_operation_base(p_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();h record;prior public.financial_operations;original public.financial_operations;debit public.customer_ledger;credit public.customer_ledger;
 paid numeric;remaining numeric;customer_balance numeric;parent uuid;entry record;payload jsonb;ledger_kind text;
begin
 if actor is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if p_id is null or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Movimentação inválida.';end if;
 select * into h from jsonb_to_record(p_data) as r(tipo text,valor numeric,data date,descricao text,conta_id uuid,destino_id uuid,categoria_id uuid,forma_id uuid,parcela_id uuid,debito_id uuid,credito_id uuid,estorno_de uuid,motivo text);
 if h.tipo is null or h.tipo not in ('PAYMENT','RECEIPT','TRANSFER','INCOME','EXPENSE','ALLOCATION','REVERSAL') or h.data is null or not isfinite(h.data) or h.data>(now() at time zone 'America/Bahia')::date or length(btrim(coalesce(h.descricao,''))) not between 1 and 200 or length(coalesce(h.motivo,''))>2000 then raise exception 'Confira tipo, descrição e data (atual ou passada).';end if;
 perform pg_advisory_xact_lock(hashtextextended('finance-request:'||p_id::text,0));
 select * into prior from public.financial_operations where id=p_id;
 if found then
  if prior.payload<>p_data or prior.actor_id<>actor then raise exception 'Identificador já utilizado em outra movimentação.';end if;
  return to_jsonb(prior)-'payload';
 end if;
 if h.tipo='REVERSAL' then
  if coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN') then raise exception 'Somente administradores podem estornar.' using errcode='42501';end if;
  if length(btrim(coalesce(h.motivo,'')))<3 or h.estorno_de is null then raise exception 'Informe o lançamento e o motivo do estorno.';end if;
  select * into original from public.financial_operations where id=h.estorno_de for update;
  if not found or original.tipo='REVERSAL' then raise exception 'Lançamento não pode ser estornado.';end if;
  if exists(select 1 from public.financial_operations where estorno_de=original.id) then raise exception 'Lançamento já estornado.';end if;
  if h.data<original.data then raise exception 'Estorno não pode ser anterior ao lançamento.';end if;
  h.valor:=original.valor;h.conta_id:=original.conta_id;h.destino_id:=original.destino_id;h.categoria_id:=original.categoria_id;h.forma_id:=original.forma_id;h.parcela_id:=original.parcela_id;h.debito_id:=original.debito_id;h.credito_id:=original.credito_id;
 else
  if h.estorno_de is not null then raise exception 'Origem de estorno inválida.';end if;
  if h.valor is null or not(h.valor>0 and h.valor<=999999999999.99) or h.valor<>round(h.valor,2) then raise exception 'Valor inválido.';end if;
  if h.tipo='PAYMENT' and (h.parcela_id is null or h.debito_id is not null or h.credito_id is not null) or h.tipo='RECEIPT' and (h.debito_id is null or h.parcela_id is not null or h.credito_id is not null) or h.tipo='ALLOCATION' and (h.debito_id is null or h.credito_id is null or h.parcela_id is not null) or h.tipo in ('TRANSFER','INCOME','EXPENSE') and (h.parcela_id is not null or h.debito_id is not null or h.credito_id is not null) then raise exception 'Vínculos da movimentação inválidos.';end if;
  if h.tipo='ALLOCATION' then
   if h.conta_id is not null or h.destino_id is not null or h.forma_id is not null or h.categoria_id is not null then raise exception 'Vincular crédito não movimenta contas financeiras.';end if;
  else
   if h.conta_id is null or not exists(select 1 from public.financial_accounts where id=h.conta_id and ativo) then raise exception 'Selecione uma conta financeira ativa.';end if;
   if h.tipo='TRANSFER' then
    if h.destino_id is null or h.destino_id=h.conta_id or not exists(select 1 from public.financial_accounts where id=h.destino_id and ativo) or h.forma_id is not null or h.categoria_id is not null then raise exception 'Selecione contas diferentes e ativas para transferir.';end if;
   elsif h.destino_id is not null then raise exception 'Conta de destino somente em transferências.';end if;
   if h.tipo<>'TRANSFER' and (h.forma_id is null or not exists(select 1 from public.financial_payment_methods where id=h.forma_id and ativo)) then raise exception 'Selecione uma forma de pagamento ativa.';end if;
   if h.tipo in ('INCOME','EXPENSE') and h.categoria_id is null then raise exception 'Selecione a categoria.';end if;
   if h.categoria_id is not null and not exists(select 1 from public.financial_categories where id=h.categoria_id and ativo and (natureza='BOTH' or natureza=case when h.tipo in ('INCOME','RECEIPT') then 'INCOME' else 'EXPENSE' end)) then raise exception 'Categoria incompatível ou inativa.';end if;
  end if;
 end if;
 -- Serialize settlement with payable editing and all settlements of the same customer.
 if h.parcela_id is not null then
  select payable_id into parent from public.supplier_payable_installments where id=h.parcela_id;
  if parent is null then raise exception 'Parcela não encontrada.';end if;
  perform pg_advisory_xact_lock(hashtextextended('payable:'||parent::text,0));
  select valor into remaining from public.supplier_payable_installments where id=h.parcela_id for update;
  if not found then raise exception 'Parcela alterada. Atualize a lista.';end if;
  select coalesce(sum(o.valor),0) into paid from public.financial_operations o where o.parcela_id=h.parcela_id and o.tipo='PAYMENT' and not exists(select 1 from public.financial_operations r where r.estorno_de=o.id);
  if h.tipo='PAYMENT' and h.valor>remaining-paid then raise exception 'Valor maior que o saldo da parcela. Atualize a lista.';end if;
 end if;
 if h.debito_id is not null then
  select * into debit from public.customer_ledger where id=h.debito_id;
  if not found or debit.entry_type<>'DEBIT' or debit.financial_operation_id is not null then raise exception 'Débito de cliente inválido.';end if;
  perform 1 from public.customers where codigo_cliente=debit.customer_codigo for update;
  select * into debit from public.customer_ledger where id=h.debito_id for update;
  select coalesce(sum(o.valor),0) into paid from public.financial_operations o where o.debito_id=debit.id and o.tipo in ('RECEIPT','ALLOCATION','SALE_VOID') and not exists(select 1 from public.financial_operations r where r.estorno_de=o.id);
  if h.tipo in ('RECEIPT','ALLOCATION','SALE_VOID') and h.valor>debit.amount-paid then raise exception 'Valor maior que o saldo do débito. Atualize a lista.';end if;
  if h.tipo='RECEIPT' then
   select coalesce(sum(case when entry_type='DEBIT' then amount else -amount end),0) into customer_balance from public.customer_ledger where customer_codigo=debit.customer_codigo;
   if h.valor>customer_balance then raise exception 'O cliente possui créditos. Vincule os créditos antes de receber este valor.';end if;
  elsif h.tipo='ALLOCATION' then
   select * into credit from public.customer_ledger where id=h.credito_id for update;
   if not found or credit.entry_type<>'CREDIT' or credit.customer_codigo<>debit.customer_codigo or credit.financial_operation_id is not null then raise exception 'Crédito inválido para este cliente.';end if;
   select coalesce(sum(o.valor),0) into paid from public.financial_operations o where o.credito_id=credit.id and o.tipo='ALLOCATION' and not exists(select 1 from public.financial_operations r where r.estorno_de=o.id);
   if h.valor>credit.amount-paid then raise exception 'Valor maior que o crédito disponível.';end if;
  end if;
 end if;
 -- Account balances are a sum of immutable entries. Lock account rows in UUID order.
 perform id from public.financial_accounts where id in (h.conta_id,h.destino_id) order by id for update;
 insert into public.financial_operations(id,tipo,valor,data,descricao,conta_id,destino_id,categoria_id,forma_id,parcela_id,debito_id,credito_id,estorno_de,motivo,actor_id,payload)
 values(p_id,h.tipo,h.valor,h.data,btrim(h.descricao),h.conta_id,h.destino_id,h.categoria_id,h.forma_id,h.parcela_id,h.debito_id,h.credito_id,h.estorno_de,coalesce(h.motivo,''),actor,p_data);
 if h.tipo='REVERSAL' then
  for entry in select * from public.financial_entries where operation_id=original.id loop
   insert into public.financial_entries(operation_id,conta_id,valor) values(p_id,entry.conta_id,-entry.valor);
  end loop;
 elsif h.tipo<>'ALLOCATION' then
  insert into public.financial_entries(operation_id,conta_id,valor) values(p_id,h.conta_id,case when h.tipo in ('PAYMENT','EXPENSE','TRANSFER') then -h.valor else h.valor end);
  if h.tipo='TRANSFER' then insert into public.financial_entries(operation_id,conta_id,valor) values(p_id,h.destino_id,h.valor);end if;
 end if;
 if h.tipo='RECEIPT' or h.tipo='REVERSAL' and original.tipo='RECEIPT' then
  ledger_kind:=case when h.tipo='RECEIPT' then 'CREDIT' else 'DEBIT' end;
  insert into public.customer_ledger(customer_codigo,entry_type,amount,issue_at,due_at,notes,financial_operation_id)
  values(debit.customer_codigo,ledger_kind,h.valor,h.data::timestamp at time zone 'America/Bahia',h.data::timestamp at time zone 'America/Bahia',h.descricao,p_id);
 end if;
 return (select to_jsonb(o)-'payload' from public.financial_operations o where id=p_id);
end $$;

revoke all on function app_private.finance_operation_base(uuid,jsonb) from public,anon,authenticated;
create or replace function app_private.validate_ledger() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.customers;
begin
 if new.financial_operation_id is not null then
  if not exists(select 1 from public.financial_operations o join public.customer_ledger d on d.id=o.debito_id where o.id=new.financial_operation_id and o.actor_id=auth.uid() and d.customer_codigo=new.customer_codigo and o.valor=new.amount and (o.tipo in ('RECEIPT','SALE_VOID') and new.entry_type='CREDIT' or o.tipo='REVERSAL' and new.entry_type='DEBIT' and exists(select 1 from public.financial_operations r where r.id=o.estorno_de and r.tipo='RECEIPT'))) then raise exception 'Vínculo financeiro inválido.';end if;
  return new;
 end if;
 if tg_op='UPDATE' then perform 1 from public.customers where codigo_cliente in (new.customer_codigo,old.customer_codigo) order by codigo_cliente for update;end if;
 select * into c from public.customers where codigo_cliente=new.customer_codigo for update;
 if not found then raise exception 'Cliente nao encontrado' using errcode='23503';end if;
 if not coalesce(c.ativo,false) then raise exception 'Cliente inativo' using errcode='22023';end if;
 if new.entry_type='DEBIT' and c.status='bloqueado' then
  if tg_op='INSERT' then raise exception 'Cliente bloqueado para novos debitos' using errcode='22023';
  elsif old.entry_type<>'DEBIT' or old.customer_codigo<>new.customer_codigo or new.amount>old.amount then raise exception 'Cliente bloqueado para aumentar debitos' using errcode='22023';end if;
 end if;
 if new.categoria_id is not null and not exists(select 1 from public.financial_categories where id=new.categoria_id and ativo and natureza in ('INCOME','BOTH')) then raise exception 'Categoria de recebimento inválida.';end if;
 return new;
end $$;

-- Financial writes belonging to the cash book must be reversed from that book.
create or replace function app_private.finance_operation(p_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare original public.financial_operations;
begin
 if auth.uid() is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('cash-session-global',0));
 if p_data->>'tipo'='REVERSAL' then
  select * into original from public.financial_operations where id=(p_data->>'estorno_de')::uuid;
  if original.tipo='SALE_VOID' or exists(select 1 from public.comanda_payments where operation_id=original.id) or exists(select 1 from public.cash_movements where operation_id=original.id) then raise exception 'Movimento do caixa. Use cancelamento ou reabertura da venda no caixa para preservar a conferência.';end if;
 end if;
 return app_private.finance_operation_base(p_id,p_data);
end $$;

create function app_private.cash_sale_operation(p_id uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
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
  update public.dining_tables set sale_voided=true where id=c.id;
  if p_action='REOPEN' then
   insert into public.dining_tables(nome_cliente,customer_codigo,cash_session_id,opened_by,sale_id,sale_record)
   values(c.nome_cliente,c.customer_codigo,s.id,actor,sale.id,sale.number) returning * into new_comanda;
   insert into public.dining_table_items(codigo_mesa,descricao,valor_unitario,quantidade)
   select new_comanda.codigo_mesa,v->>'descricao',(v->>'valor_unitario')::numeric,(v->>'quantidade')::integer from jsonb_array_elements(sale.items) v;
   update public.cash_sales set reopened_comanda_id=new_comanda.id,reopened_comanda_number=sale.number where id=p_id returning * into sale;
  end if;
  res:=to_jsonb(sale)||jsonb_build_object('comanda_id_aberta',new_comanda.id,'comanda_numero',new_comanda.sale_record);
 end if;
 insert into app_private.cash_requests(id,entity_id,action,payload,actor_id,result) values(request,p_id,p_action,p_data,actor,res);
 return res;
end $$;
create function public.cash_sale_operation(p_id uuid,p_action text,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$select app_private.cash_sale_operation(p_id,p_action,p_data)$$;
revoke all on function public.cash_sale_operation(uuid,text,jsonb),app_private.cash_sale_operation(uuid,text,jsonb) from public,anon;
grant execute on function public.cash_sale_operation(uuid,text,jsonb),app_private.cash_sale_operation(uuid,text,jsonb) to authenticated;

create function app_private.cash_dashboard() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 return coalesce((select jsonb_agg((to_jsonb(s)-'opening_payload'-'closing_payload')||jsonb_build_object('expected_cash',app_private.cash_expected(s.id),
  'movements',coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at,m.id) from public.cash_movements m where m.cash_session_id=s.id),'[]'),
  'sales',coalesce((select jsonb_agg(to_jsonb(v) order by v.number) from public.cash_sales v where v.cash_session_id=s.id),'[]')) order by s.opened_at desc,s.id)
 from public.cash_sessions s),'[]');
end $$;
create function public.cash_dashboard() returns jsonb language sql security invoker set search_path='' as $$select app_private.cash_dashboard()$$;
revoke all on function public.cash_dashboard(),app_private.cash_dashboard() from public,anon;
grant execute on function public.cash_dashboard(),app_private.cash_dashboard() to authenticated;

-- Application mutations are recorded in a private, append-only audit trail.
create table app_private.operation_logs(
 id bigint generated always as identity primary key,occurred_at timestamptz not null default clock_timestamp(),
 actor_id uuid,actor_role text,entity text not null,record_id text,action text not null,
 before_data jsonb,after_data jsonb,transaction_id bigint not null default txid_current()
);
create index operation_logs_occurred_idx on app_private.operation_logs(occurred_at);
create index operation_logs_entity_idx on app_private.operation_logs(entity,record_id);
create index operation_logs_actor_idx on app_private.operation_logs(actor_id);
alter table app_private.operation_logs enable row level security;
revoke all on app_private.operation_logs from public,anon,authenticated;
create function app_private.protect_operation_log() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Registros de auditoria não podem ser alterados ou apagados.';end $$;
revoke all on function app_private.protect_operation_log() from public,anon,authenticated;
create trigger operation_logs_immutable before update or delete on app_private.operation_logs for each row execute function app_private.protect_operation_log();
create function app_private.audit_operation() returns trigger language plpgsql security definer set search_path='' as $$
declare before_row jsonb;after_row jsonb;
begin
 if tg_op<>'INSERT' then before_row:=to_jsonb(old)-'password'-'senha'-'password_hash'-'xml'-'payload';end if;
 if tg_op<>'DELETE' then after_row:=to_jsonb(new)-'password'-'senha'-'password_hash'-'xml'-'payload';end if;
 insert into app_private.operation_logs(actor_id,actor_role,entity,record_id,action,before_data,after_data)
 values(auth.uid(),coalesce(app_private.app_role(),'SYSTEM'),tg_table_schema||'.'||tg_table_name,coalesce(after_row->>'id',before_row->>'id',after_row->>'auth_user_id',before_row->>'auth_user_id'),tg_op,before_row,after_row);
 return null;
end $$;
revoke all on function app_private.audit_operation() from public,anon,authenticated;
do $$declare t record;begin
 for t in select table_schema,table_name from information_schema.tables where table_type='BASE TABLE' and
  (table_schema='public' and table_name<>'teste_conexao' or table_schema='app_private' and table_name in ('account_directory','account_audit','cash_requests')) loop
  execute format('create trigger application_operation_audit after insert or update or delete on %I.%I for each row execute function app_private.audit_operation()',t.table_schema,t.table_name);
 end loop;
end $$;
notify pgrst, 'reload schema';
