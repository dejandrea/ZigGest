create table public.cash_sessions(
 id uuid primary key,conta_id uuid not null references public.financial_accounts(id),
 categoria_id uuid not null references public.financial_categories(id),method_ids uuid[] not null,
 status text not null default 'OPEN' check(status in ('OPEN','CLOSED')),
 opened_at timestamptz not null default now(),opened_by uuid not null references auth.users(id),
 closed_at timestamptz,closed_by uuid references auth.users(id),opening_payload jsonb not null,
 saldo_abertura numeric not null,saldo_fechamento numeric
);
create unique index cash_session_one_open on public.cash_sessions(status) where status='OPEN';
create index cash_session_account_idx on public.cash_sessions(conta_id);
create index cash_session_category_idx on public.cash_sessions(categoria_id);
create index cash_session_opened_by_idx on public.cash_sessions(opened_by);
create index cash_session_closed_by_idx on public.cash_sessions(closed_by);
alter table public.dining_tables add column customer_codigo integer references public.customers(codigo_cliente),
 add column cash_session_id uuid references public.cash_sessions(id),add column closed_at timestamptz,
 add column opened_by uuid references auth.users(id);
create index comandas_opened_by_idx on public.dining_tables(opened_by);
create index comandas_customer_idx on public.dining_tables(customer_codigo);
create index comandas_cash_idx on public.dining_tables(cash_session_id);
create table public.comanda_closures(
 id uuid primary key,comanda_id uuid unique not null references public.dining_tables(id),
 cash_session_id uuid not null references public.cash_sessions(id),
 actor_id uuid not null references auth.users(id),total numeric(14,2) not null,
 payments jsonb not null,created_at timestamptz not null default now()
);
create index comanda_closures_cash_idx on public.comanda_closures(cash_session_id);
create index comanda_closures_actor_idx on public.comanda_closures(actor_id);
create table public.comanda_payments(
 id uuid primary key default gen_random_uuid(),closure_id uuid not null references public.comanda_closures(id),
 forma_id uuid not null references public.financial_payment_methods(id),valor numeric(14,2) not null check(valor>0),
 operation_id uuid unique references public.financial_operations(id),debito_id uuid references public.customer_ledger(id)
);
create index comanda_payments_closure_idx on public.comanda_payments(closure_id);
create index comanda_payments_method_idx on public.comanda_payments(forma_id);
create index comanda_payments_debit_idx on public.comanda_payments(debito_id);
alter table public.customer_ledger add column comanda_id uuid unique references public.dining_tables(id);
do $$declare t text;begin
 foreach t in array array['cash_sessions','comanda_closures','comanda_payments'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy app_cash_read on public.%I for select to authenticated using ((select app_private.app_role()) in (''MASTER'',''ADMIN'',''OPERATOR''))',t);
 end loop;
end $$;
revoke insert,update,delete on public.dining_tables from authenticated;
revoke insert(nome_cliente,status),update(nome_cliente,status) on public.dining_tables from authenticated;
-- Identification and status now change only through validated operations.
update public.dining_tables set nome_cliente='Comanda #'||codigo_mesa where length(btrim(coalesce(nome_cliente,'')))=0;

create function app_private.cash_operation(p_id uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();s public.cash_sessions;mid uuid;balance numeric;
begin
 if actor is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if p_id is null or p_action not in ('OPEN','CLOSE') or p_action is null or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Caixa inválido.';end if;
 perform pg_advisory_xact_lock(hashtextextended('cash-session-global',0));
 select * into s from public.cash_sessions where id=p_id for update;
 if p_action='OPEN' then
  if found then
   if s.opening_payload<>p_data or s.opened_by<>actor then raise exception 'Identificador já utilizado.';end if;
   return to_jsonb(s)-'opening_payload';
  end if;
  if exists(select 1 from public.cash_sessions where status='OPEN') then raise exception 'Já existe um caixa aberto.';end if;
  if not exists(select 1 from public.financial_accounts where id=(p_data->>'conta_id')::uuid and ativo) or not exists(select 1 from public.financial_categories where id=(p_data->>'categoria_id')::uuid and ativo and natureza in ('INCOME','BOTH')) then raise exception 'Selecione conta e categoria de receita ativas.';end if;
  if jsonb_typeof(p_data->'method_ids') is distinct from 'array' or jsonb_array_length(p_data->'method_ids')=0 then raise exception 'Selecione as formas de pagamento do caixa.';end if;
  for mid in select value::uuid from jsonb_array_elements_text(p_data->'method_ids') loop
   if not exists(select 1 from public.financial_payment_methods where id=mid and ativo and usar_pdv and tipo<>'DEFERRED') then raise exception 'Forma de pagamento indisponível para o caixa.';end if;
  end loop;
  select coalesce(sum(valor),0) into balance from public.financial_entries where conta_id=(p_data->>'conta_id')::uuid;
  insert into public.cash_sessions(id,conta_id,categoria_id,method_ids,opened_by,opening_payload,saldo_abertura)
  values(p_id,(p_data->>'conta_id')::uuid,(p_data->>'categoria_id')::uuid,array(select distinct value::uuid from jsonb_array_elements_text(p_data->'method_ids')),actor,p_data,balance) returning * into s;
  update public.dining_tables set cash_session_id=s.id where status='aberta' and cash_session_id is null;
 else
  if not found then raise exception 'Caixa não encontrado.';end if;
  if s.status='CLOSED' then return to_jsonb(s)-'opening_payload';end if;
  if exists(select 1 from public.dining_tables where status='aberta') then raise exception 'Encerre todas as comandas abertas antes de fechar o caixa.';end if;
  select coalesce(sum(valor),0) into balance from public.financial_entries where conta_id=s.conta_id;
  update public.cash_sessions set status='CLOSED',closed_at=clock_timestamp(),closed_by=actor,saldo_fechamento=balance where id=s.id returning * into s;
 end if;
 return to_jsonb(s)-'opening_payload';
end $$;

create function app_private.comanda_operation(p_id uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();s public.cash_sessions;c public.dining_tables;customer public.customers;
 prior public.comanda_closures;payment jsonb;method public.financial_payment_methods;amount numeric;paid numeric:=0;
 deferred numeric:=0;due date;debit uuid;close_id uuid;acc uuid;operation uuid;
begin
 if actor is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if p_id is null or p_action is null or p_action not in ('OPEN','IDENTIFY','CLOSE') or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Comanda inválida.';end if;
 perform pg_advisory_xact_lock(hashtextextended('cash-session-global',0));
 select * into s from public.cash_sessions where status='OPEN' for update;
 select * into c from public.dining_tables where id=p_id for update;
 if p_action='CLOSE' then
  close_id:=(p_data->>'request_id')::uuid;
  if close_id is null then raise exception 'Identificador do encerramento obrigatório.';end if;
  select * into prior from public.comanda_closures where comanda_id=p_id;
  if found then
   if prior.id<>close_id or prior.actor_id<>actor or prior.payments<>p_data then raise exception 'Comanda já encerrada.';end if;
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
 if c.total_geral<0 or c.total_geral>999999999999.99 or c.total_geral<>round(c.total_geral,2) then raise exception 'Total da comanda inválido.';end if;
 if jsonb_typeof(p_data->'payments') is distinct from 'array' or jsonb_array_length(p_data->'payments')>10 then raise exception 'Informe até dez pagamentos.';end if;
 if c.total_geral=0 and jsonb_array_length(p_data->'payments')<>0 then raise exception 'Comanda sem consumo não precisa de pagamento.';end if;
 for payment in select value from jsonb_array_elements(p_data->'payments') loop
  amount:=(payment->>'valor')::numeric;
  if amount is null or not(amount>0 and amount<=999999999999.99) or amount<>round(amount,2) then raise exception 'Valor de pagamento inválido.';end if;
  select * into method from public.financial_payment_methods where id=(payment->>'forma_id')::uuid and ativo and usar_pdv;
  if not found or (method.tipo<>'DEFERRED' and not(method.id=any(s.method_ids))) then raise exception 'Forma não configurada no caixa.';end if;
  if method.tipo='DEFERRED' then deferred:=deferred+amount;end if;
  paid:=paid+amount;
 end loop;
 if paid<>c.total_geral then raise exception 'A soma dos pagamentos deve ser igual ao total da comanda.';end if;
 if deferred>0 then
  if c.customer_codigo is null then raise exception 'Cadastre ou selecione um cliente para pagamento a prazo.';end if;
  select * into customer from public.customers where codigo_cliente=c.customer_codigo for update;
  if not found or not customer.ativo or customer.status='bloqueado' then raise exception 'Cliente inativo ou bloqueado para venda a prazo.';end if;
  if customer.total_pendente+deferred>customer.limite then raise exception 'O valor a prazo ultrapassa o limite do cliente.';end if;
  due:=(p_data->>'vencimento')::date;
  if due is null or not isfinite(due) or due<(now() at time zone 'America/Bahia')::date then raise exception 'Informe vencimento atual ou futuro.';end if;
  insert into public.customer_ledger(customer_codigo,entry_type,amount,issue_at,due_at,notes,comanda_id,categoria_id)
  values(customer.codigo_cliente,'DEBIT',deferred,clock_timestamp(),due::timestamp at time zone 'America/Bahia','Comanda #'||c.codigo_mesa||' - '||c.nome_cliente,c.id,s.categoria_id) returning id into debit;
 end if;
 insert into public.comanda_closures(id,comanda_id,cash_session_id,actor_id,total,payments) values(close_id,c.id,s.id,actor,c.total_geral,p_data);
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
 update public.dining_tables set status='fechada',closed_at=clock_timestamp() where id=c.id returning * into c;
 return to_jsonb(c);
end $$;

create or replace function app_private.validate_mesa_item() returns trigger language plpgsql security definer set search_path='' as $$
declare code integer;tab public.dining_tables;
begin
 perform pg_advisory_xact_lock(hashtextextended('cash-session-global',0));
 code:=case when tg_op='DELETE' then old.codigo_mesa else new.codigo_mesa end;
 select * into tab from public.dining_tables where codigo_mesa=code for update;
 if not found or tab.status<>'aberta' or not exists(select 1 from public.cash_sessions where id=tab.cash_session_id and status='OPEN') then raise exception 'Comanda encerrada ou caixa fechado.' using errcode='22023';end if;
 if tg_op<>'DELETE' and (new.valor_unitario<>round(new.valor_unitario,2) or new.valor_unitario>999999999999.99) then raise exception 'Preço inválido.';end if;
 if tg_op='DELETE' then return old;end if;
 return new;
end $$;
create function app_private.protect_comanda_debit() returns trigger language plpgsql set search_path='' as $$
begin
 if old.comanda_id is not null then raise exception 'Débito originado de comanda. Registre recebimentos para dar baixa; preserve o histórico.';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger protect_comanda_debit before update or delete on public.customer_ledger for each row execute function app_private.protect_comanda_debit();
revoke all on function app_private.protect_comanda_debit() from public,anon,authenticated;
create function public.cash_operation(p_id uuid,p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select app_private.cash_operation(p_id,p_action,p_data)$$;
create function public.comanda_operation(p_id uuid,p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select app_private.comanda_operation(p_id,p_action,p_data)$$;
revoke all on function public.cash_operation(uuid,text,jsonb),app_private.cash_operation(uuid,text,jsonb),public.comanda_operation(uuid,text,jsonb),app_private.comanda_operation(uuid,text,jsonb) from public,anon;
grant execute on function public.cash_operation(uuid,text,jsonb),app_private.cash_operation(uuid,text,jsonb),public.comanda_operation(uuid,text,jsonb),app_private.comanda_operation(uuid,text,jsonb) to authenticated;
