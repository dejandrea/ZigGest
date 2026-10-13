create table public.financial_accounts(
 id uuid primary key default gen_random_uuid(),nome text not null check(length(btrim(nome)) between 1 and 100),
 tipo text not null check(tipo in ('CASH','BANK','CARD','WALLET')),ativo boolean not null default true,
 created_at timestamptz not null default now(),unique(nome)
);
create table public.financial_categories(
 id uuid primary key default gen_random_uuid(),nome text not null check(length(btrim(nome)) between 1 and 100),
 natureza text not null check(natureza in ('INCOME','EXPENSE','BOTH')),ativo boolean not null default true,unique(nome)
);
create table public.financial_payment_methods(
 id uuid primary key default gen_random_uuid(),nome text not null check(length(btrim(nome)) between 1 and 100),
 tipo text not null check(tipo in ('CASH','PIX','CREDIT_CARD','DEBIT_CARD','TRANSFER','BOLETO','OTHER')),
 conta_padrao_id uuid references public.financial_accounts(id),prazo_dias integer not null default 0 check(prazo_dias between 0 and 365),
 max_parcelas integer not null default 1 check(max_parcelas between 1 and 120),usar_pdv boolean not null default true,
 ativo boolean not null default true,unique(nome)
);
create index financial_methods_account_idx on public.financial_payment_methods(conta_padrao_id);
alter table public.supplier_payables add column categoria_id uuid references public.financial_categories(id);
create index supplier_payable_category_idx on public.supplier_payables(categoria_id);
alter table public.customer_ledger add column categoria_id uuid references public.financial_categories(id);
create index customer_ledger_category_idx on public.customer_ledger(categoria_id);
grant insert(categoria_id),update(categoria_id) on public.customer_ledger to authenticated;
create table public.financial_operations(
 id uuid primary key,tipo text not null check(tipo in ('PAYMENT','RECEIPT','TRANSFER','INCOME','EXPENSE','OPENING','ALLOCATION','REVERSAL')),
 valor numeric(14,2) not null check(valor>0),data date not null check(isfinite(data)),descricao text not null check(length(btrim(descricao)) between 1 and 200),
 conta_id uuid references public.financial_accounts(id),destino_id uuid references public.financial_accounts(id),
 categoria_id uuid references public.financial_categories(id),forma_id uuid references public.financial_payment_methods(id),
 parcela_id uuid references public.supplier_payable_installments(id),debito_id uuid references public.customer_ledger(id),credito_id uuid references public.customer_ledger(id),
 estorno_de uuid unique references public.financial_operations(id),motivo text not null default '' check(length(motivo)<=2000),
 actor_id uuid not null references auth.users(id),created_at timestamptz not null default now(),payload jsonb not null
);
create table public.financial_entries(
 id uuid primary key default gen_random_uuid(),operation_id uuid not null references public.financial_operations(id),
 conta_id uuid not null references public.financial_accounts(id),valor numeric(14,2) not null check(valor<>0),unique(operation_id,conta_id)
);
create index financial_entries_account_idx on public.financial_entries(conta_id);
create index financial_operations_due_idx on public.financial_operations(data);
create index financial_operations_payable_idx on public.financial_operations(parcela_id);
create index financial_operations_debit_idx on public.financial_operations(debito_id);
create index financial_operations_credit_idx on public.financial_operations(credito_id);
create index financial_operations_account_idx on public.financial_operations(conta_id);
create index financial_operations_destination_idx on public.financial_operations(destino_id);
create index financial_operations_category_idx on public.financial_operations(categoria_id);
create index financial_operations_method_idx on public.financial_operations(forma_id);
create index financial_operations_actor_idx on public.financial_operations(actor_id);
alter table public.customer_ledger add column financial_operation_id uuid references public.financial_operations(id);
create index customer_ledger_finance_idx on public.customer_ledger(financial_operation_id);
-- No client can forge financial_operation_id; it is written only by the settlement RPC.
do $$ declare t text;begin
 foreach t in array array['financial_accounts','financial_categories','financial_payment_methods','financial_operations','financial_entries'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy finance_read on public.%I for select to authenticated using ((select app_private.app_role()) in (''MASTER'',''ADMIN'',''OPERATOR''))',t);
 end loop;
end $$;

create function app_private.finance_config(p_kind text,p_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare h record;res jsonb;opening numeric;row_id uuid;new_account boolean;
begin
 if auth.uid() is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN') then raise exception 'Somente administradores podem configurar o financeiro.' using errcode='42501';end if;
 if p_id is null or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Cadastro inválido.';end if;
 select * into h from jsonb_to_record(p_data) as r(nome text,tipo text,natureza text,ativo boolean,conta_padrao_id uuid,prazo_dias integer,max_parcelas integer,usar_pdv boolean,saldo_inicial numeric,data date);
 if length(btrim(coalesce(h.nome,''))) not between 1 and 100 or h.ativo is null then raise exception 'Informe nome e situação.';end if;
 perform pg_advisory_xact_lock(hashtextextended('finance-config:'||p_id::text,0));
 if p_kind='accounts' then
  if h.tipo is null or h.tipo not in ('CASH','BANK','CARD','WALLET') then raise exception 'Tipo de conta inválido.';end if;
  new_account:=not exists(select 1 from public.financial_accounts where id=p_id);
  opening:=coalesce(h.saldo_inicial,0);
  if not new_account and opening<>0 and exists(select 1 from public.financial_operations o join public.financial_accounts a on a.id=o.conta_id where a.id=p_id and o.tipo='OPENING' and o.payload=p_data and a.nome=btrim(h.nome) and a.tipo=h.tipo and a.ativo=h.ativo) then return (select to_jsonb(a) from public.financial_accounts a where id=p_id);end if;
  if not(abs(opening)<=999999999999.99) or opening<>round(opening,2) or (not new_account and opening<>0) then raise exception 'Saldo inicial somente ao cadastrar a conta. Para corrigir, registre movimentação.';end if;
  if new_account and opening<>0 and (h.data is null or not isfinite(h.data) or h.data>(now() at time zone 'America/Bahia')::date) then raise exception 'Data do saldo inicial inválida.';end if;
  insert into public.financial_accounts(id,nome,tipo,ativo) values(p_id,btrim(h.nome),h.tipo,h.ativo) on conflict(id) do update set nome=excluded.nome,tipo=excluded.tipo,ativo=excluded.ativo returning to_jsonb(financial_accounts) into res;
  if new_account and opening<>0 then
   row_id:=gen_random_uuid();
   insert into public.financial_operations(id,tipo,valor,data,descricao,conta_id,actor_id,payload) values(row_id,'OPENING',abs(opening),h.data,'Saldo inicial: '||h.nome,p_id,auth.uid(),p_data);
   insert into public.financial_entries(operation_id,conta_id,valor) values(row_id,p_id,opening);
  end if;
 elsif p_kind='categories' then
  if h.natureza is null or h.natureza not in ('INCOME','EXPENSE','BOTH') then raise exception 'Natureza inválida.';end if;
  insert into public.financial_categories(id,nome,natureza,ativo) values(p_id,btrim(h.nome),h.natureza,h.ativo) on conflict(id) do update set nome=excluded.nome,natureza=excluded.natureza,ativo=excluded.ativo returning to_jsonb(financial_categories) into res;
 elsif p_kind='methods' then
  if h.tipo is null or h.tipo not in ('CASH','PIX','CREDIT_CARD','DEBIT_CARD','TRANSFER','BOLETO','OTHER') or h.prazo_dias is null or h.prazo_dias not between 0 and 365 or h.max_parcelas is null or h.max_parcelas not between 1 and 120 or h.usar_pdv is null then raise exception 'Confira tipo, prazo e parcelamento.';end if;
  if h.conta_padrao_id is not null and not exists(select 1 from public.financial_accounts where id=h.conta_padrao_id) then raise exception 'Conta padrão não encontrada.';end if;
  insert into public.financial_payment_methods(id,nome,tipo,ativo,conta_padrao_id,prazo_dias,max_parcelas,usar_pdv) values(p_id,btrim(h.nome),h.tipo,h.ativo,h.conta_padrao_id,h.prazo_dias,h.max_parcelas,h.usar_pdv) on conflict(id) do update set nome=excluded.nome,tipo=excluded.tipo,ativo=excluded.ativo,conta_padrao_id=excluded.conta_padrao_id,prazo_dias=excluded.prazo_dias,max_parcelas=excluded.max_parcelas,usar_pdv=excluded.usar_pdv returning to_jsonb(financial_payment_methods) into res;
 else raise exception 'Cadastro financeiro inválido.';end if;
 return res;
end $$;
create function public.finance_config(p_kind text,p_id uuid,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$select app_private.finance_config(p_kind,p_id,p_data)$$;

create function app_private.protect_financial_ledger() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.financial_operation_id is not null or exists(select 1 from public.financial_operations where debito_id=old.id or credito_id=old.id) then raise exception 'Lançamento vinculado ao financeiro. Use estorno; não altere ou exclua o histórico.';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger finance_ledger_protect before update or delete on public.customer_ledger for each row execute function app_private.protect_financial_ledger();
-- Preserve installment identities once any payment (including one later reversed) exists.
create function app_private.protect_financial_payable() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('payable:'||old.id::text,0));
 if exists(select 1 from public.supplier_payable_installments i join public.financial_operations o on o.parcela_id=i.id where i.payable_id=old.id) then raise exception 'Conta com histórico de pagamentos. Estorne e registre os ajustes separadamente.';end if;
 return new;
end $$;
create trigger finance_payable_protect before update on public.supplier_payables for each row execute function app_private.protect_financial_payable();

create function app_private.finance_operation(p_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  select coalesce(sum(o.valor),0) into paid from public.financial_operations o where o.debito_id=debit.id and o.tipo in ('RECEIPT','ALLOCATION') and not exists(select 1 from public.financial_operations r where r.estorno_de=o.id);
  if h.tipo in ('RECEIPT','ALLOCATION') and h.valor>debit.amount-paid then raise exception 'Valor maior que o saldo do débito. Atualize a lista.';end if;
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
create function public.finance_operation(p_id uuid,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$select app_private.finance_operation(p_id,p_data)$$;

-- Financially generated credits/reversal debits are valid even when customer credit is blocked.
create or replace function app_private.validate_ledger() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.customers;
begin
 if new.financial_operation_id is not null then
  if not exists(select 1 from public.financial_operations o join public.customer_ledger d on d.id=o.debito_id where o.id=new.financial_operation_id and o.actor_id=auth.uid() and d.customer_codigo=new.customer_codigo and o.valor=new.amount and (o.tipo='RECEIPT' and new.entry_type='CREDIT' or o.tipo='REVERSAL' and new.entry_type='DEBIT' and exists(select 1 from public.financial_operations r where r.id=o.estorno_de and r.tipo='RECEIPT'))) then raise exception 'Vínculo financeiro inválido.';end if;
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
-- Validate payable categories while retaining the existing idempotent stock-origin RPC.
create function app_private.validate_payable_category() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.categoria_id is not null and not exists(select 1 from public.financial_categories where id=new.categoria_id and ativo and natureza in ('EXPENSE','BOTH')) then raise exception 'Categoria de despesa inválida.';end if;return new;
end $$;
create trigger finance_payable_category before insert or update on public.supplier_payables for each row execute function app_private.validate_payable_category();
alter function app_private.save_supplier_payable(uuid,uuid,jsonb,boolean) rename to save_supplier_payable_base;
create function app_private.save_supplier_payable(p_id uuid,p_source uuid,p_data jsonb,p_edit boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare res jsonb;cat uuid;
begin
 if auth.uid() is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 cat:=(p_data->>'categoria_id')::uuid;
 res:=app_private.save_supplier_payable_base(p_id,p_source,p_data,p_edit);
 if (select categoria_id from public.supplier_payables where id=p_id) is distinct from cat then update public.supplier_payables set categoria_id=cat where id=p_id;end if;
 return (select to_jsonb(p)-'payload' from public.supplier_payables p where id=p_id);
end $$;
-- Recreate SQL wrapper so its dependency resolves the new function, not the renamed base.
create or replace function public.save_supplier_payable(p_id uuid,p_source uuid,p_data jsonb,p_edit boolean default false) returns jsonb language sql security invoker set search_path='' as $$select app_private.save_supplier_payable(p_id,p_source,p_data,p_edit)$$;
revoke all on function app_private.finance_config(text,uuid,jsonb),public.finance_config(text,uuid,jsonb),app_private.finance_operation(uuid,jsonb),public.finance_operation(uuid,jsonb),app_private.save_supplier_payable(uuid,uuid,jsonb,boolean) from public,anon;
grant execute on function app_private.finance_config(text,uuid,jsonb),public.finance_config(text,uuid,jsonb),app_private.finance_operation(uuid,jsonb),public.finance_operation(uuid,jsonb),app_private.save_supplier_payable(uuid,uuid,jsonb,boolean) to authenticated;
revoke all on function app_private.protect_financial_ledger(),app_private.protect_financial_payable(),app_private.validate_payable_category() from public,anon,authenticated;
revoke all on function app_private.save_supplier_payable_base(uuid,uuid,jsonb,boolean) from authenticated;
insert into public.financial_categories(nome,natureza) values('Vendas','INCOME'),('Compra de mercadorias','EXPENSE'),('Despesas gerais','EXPENSE');
insert into public.financial_payment_methods(nome,tipo,max_parcelas,prazo_dias) values('Dinheiro','CASH',1,0),('Pix','PIX',1,0),('Cartão de crédito','CREDIT_CARD',12,30),('Cartão de débito','DEBIT_CARD',1,1),('Transferência bancária','TRANSFER',1,0),('Boleto bancário','BOLETO',12,0);
