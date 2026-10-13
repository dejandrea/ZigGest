begin;
set local lock_timeout = '5s';

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated;

create table app_private.account_directory (
  id uuid primary key default gen_random_uuid(),
  legacy_user_id uuid unique references public.users(id) on delete restrict,
  email text not null unique check (email = lower(btrim(email))),
  nome text not null check (length(btrim(nome)) > 0),
  role text not null check (role in ('ADMIN', 'OPERATOR')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.app_profiles (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  account_id uuid not null unique references app_private.account_directory(id) on delete cascade
);
alter table public.app_profiles enable row level security;
revoke all on public.app_profiles from public, anon, authenticated;
revoke all on app_private.account_directory from public, anon, authenticated;
create table app_private.account_audit (
  id bigint generated always as identity primary key,
  actor uuid not null,
  account_id uuid not null,
  action text not null,
  occurred_at timestamptz not null default now()
);
revoke all on app_private.account_audit from public, anon, authenticated;

insert into app_private.account_directory (id, legacy_user_id, email, nome, role, enabled)
select id, id, lower(btrim(email)), nome, 'OPERATOR', coalesce(ativo,false) and status='liberado'
from public.users;
insert into app_private.account_directory (email, nome, role, enabled)
values ('dejandreafranca@gmail.com', 'Administrador', 'ADMIN', true)
on conflict(email) do update set role='ADMIN', enabled=true, updated_at=now();

create function app_private.app_role() returns text
language sql stable security definer set search_path=''
as $function$
  select d.role from public.app_profiles p
  join app_private.account_directory d on d.id=p.account_id
  join auth.users u on u.id=p.auth_user_id
  where p.auth_user_id=(select auth.uid()) and d.enabled and u.email_confirmed_at is not null
$function$;
revoke all on function app_private.app_role() from public, anon;
grant execute on function app_private.app_role() to authenticated;

create function app_private.authorize_signup() returns trigger
language plpgsql security definer set search_path=''
as $function$
begin
  if not exists (select 1 from app_private.account_directory
    where email=lower(btrim(new.email)) and enabled) then
    raise exception 'Cadastro indisponivel para este email' using errcode='42501';
  end if;
  return new;
end;
$function$;
revoke all on function app_private.authorize_signup() from public, anon, authenticated;
create trigger app_authorize_signup before insert on auth.users
for each row execute function app_private.authorize_signup();

create function app_private.link_auth_profile() returns trigger
language plpgsql security definer set search_path=''
as $function$
begin
  insert into public.app_profiles(auth_user_id, account_id)
  select new.id, id from app_private.account_directory where email=lower(btrim(new.email));
  return new;
end;
$function$;
revoke all on function app_private.link_auth_profile() from public, anon, authenticated;
create trigger app_link_auth_profile after insert on auth.users
for each row execute function app_private.link_auth_profile();

create function public.my_app_profile()
returns table(id uuid, email text, nome text, role text, enabled boolean)
language sql stable security definer set search_path=''
as $function$
  select d.id,d.email,d.nome,d.role,d.enabled
  from public.app_profiles p join app_private.account_directory d on d.id=p.account_id
  where p.auth_user_id=(select auth.uid()) and (select app_private.app_role()) is not null
$function$;
revoke all on function public.my_app_profile() from public, anon;
grant execute on function public.my_app_profile() to authenticated;

create function public.admin_list_accounts()
returns table(id uuid,email text,nome text,role text,enabled boolean,registered boolean)
language plpgsql stable security definer set search_path=''
as $function$
begin
  if (select app_private.app_role()) is distinct from 'ADMIN' then
    raise exception 'Acesso administrativo necessario' using errcode='42501';
  end if;
  return query select d.id,d.email,d.nome,d.role,d.enabled,
    exists(select 1 from public.app_profiles p where p.account_id=d.id)
    from app_private.account_directory d order by d.nome,d.id;
end;
$function$;
revoke all on function public.admin_list_accounts() from public, anon;
grant execute on function public.admin_list_accounts() to authenticated;

create function public.admin_save_account(p_id uuid,p_email text,p_nome text,p_role text,p_enabled boolean)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare result_id uuid; actor_account uuid;
begin
  if (select app_private.app_role()) is distinct from 'ADMIN' then
    raise exception 'Acesso administrativo necessario' using errcode='42501';
  end if;
  if p_role not in ('ADMIN','OPERATOR') or p_role is null or p_enabled is null
    or length(btrim(coalesce(p_nome,'')))=0
    or btrim(coalesce(p_email,'')) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Dados de usuario invalidos' using errcode='22023';
  end if;
  select account_id into actor_account from public.app_profiles where auth_user_id=auth.uid();
  if p_id=actor_account and (not p_enabled or p_role<>'ADMIN') then
    raise exception 'Voce nao pode remover seu proprio acesso administrativo' using errcode='42501';
  end if;
  if p_id is null then
    insert into app_private.account_directory(email,nome,role,enabled)
    values(lower(btrim(p_email)),btrim(p_nome),p_role,p_enabled) returning id into result_id;
  else
    if exists(select 1 from public.app_profiles where account_id=p_id)
      and exists(select 1 from app_private.account_directory where id=p_id and email<>lower(btrim(p_email))) then
      raise exception 'Email de conta ja registrada nao pode ser alterado' using errcode='22023';
    end if;
    update app_private.account_directory set email=lower(btrim(p_email)),nome=btrim(p_nome),
      role=p_role,enabled=p_enabled,updated_at=now() where id=p_id returning id into result_id;
    if result_id is null then raise exception 'Usuario nao encontrado' using errcode='P0002'; end if;
  end if;
  insert into app_private.account_audit(actor,account_id,action)
    values(auth.uid(),result_id,case when p_id is null then 'CREATE' else 'UPDATE' end);
  return result_id;
end;
$function$;
revoke all on function public.admin_save_account(uuid,text,text,text,boolean) from public, anon;
grant execute on function public.admin_save_account(uuid,text,text,text,boolean) to authenticated;

-- Application reads and writes require a currently enabled, confirmed account.
revoke all on public.customers,public.customer_ledger,public.v_customer_balance from authenticated;
grant select on public.customers,public.customer_ledger,public.v_customer_balance to authenticated;
grant insert(nome,apelido,telefone,email,endereco,ativo,status,limite,observacoes)
  on public.customers to authenticated;
grant update(nome,apelido,telefone,email,endereco,ativo,status,limite,observacoes)
  on public.customers to authenticated;
grant delete on public.customers to authenticated;
grant insert(customer_codigo,entry_type,amount,issue_at,due_at,notes) on public.customer_ledger to authenticated;
grant update(customer_codigo,entry_type,amount,issue_at,due_at,notes) on public.customer_ledger to authenticated;
grant delete on public.customer_ledger to authenticated;
grant usage on sequence public.customers_codigo_cliente_seq,public.customer_ledger_codigo_conta_seq to authenticated;
revoke all on public.users from anon,authenticated;
create policy app_customer_access on public.customers for all to authenticated
  using ((select app_private.app_role()) in ('ADMIN','OPERATOR'))
  with check ((select app_private.app_role()) in ('ADMIN','OPERATOR'));
create policy app_ledger_access on public.customer_ledger for all to authenticated
  using ((select app_private.app_role()) in ('ADMIN','OPERATOR'))
  with check ((select app_private.app_role()) in ('ADMIN','OPERATOR'));
alter view public.v_customer_balance set (security_invoker=true);

alter table public.customer_ledger add constraint ledger_customer_fk
  foreign key(customer_codigo) references public.customers(codigo_cliente) on delete restrict;
create index ledger_customer_idx on public.customer_ledger(customer_codigo);
alter table public.customer_ledger add constraint ledger_business_code_unique unique(codigo_conta);
alter table public.customer_ledger alter column codigo_conta set not null;

alter table public.customers alter column created_at set default now(),alter column updated_at set default now(),alter column limite set default 100;
alter table public.customer_ledger alter column created_at set default now(),alter column updated_at set default now(),
  alter column issue_at set default now(),alter column due_at set default now()+interval '30 days';

create function app_private.touch_updated_at() returns trigger
language plpgsql set search_path=''
as $function$ begin new.updated_at=now(); return new; end; $function$;
revoke all on function app_private.touch_updated_at() from public,anon,authenticated;
create trigger app_customer_updated before update on public.customers
for each row execute function app_private.touch_updated_at();
create trigger app_ledger_updated before update on public.customer_ledger
for each row execute function app_private.touch_updated_at();

create function app_private.validate_ledger() returns trigger
language plpgsql security definer set search_path=''
as $function$
declare c public.customers;
begin
  -- Lock both customers in a consistent order when moving an entry.
  if tg_op='UPDATE' then
    perform 1 from public.customers where codigo_cliente in (new.customer_codigo,old.customer_codigo)
      order by codigo_cliente for update;
  end if;
  select * into c from public.customers where codigo_cliente=new.customer_codigo for update;
  if not found then raise exception 'Cliente nao encontrado' using errcode='23503'; end if;
  if not coalesce(c.ativo,false) then raise exception 'Cliente inativo' using errcode='22023'; end if;
  if new.entry_type='DEBIT' and c.status='bloqueado' then
    if tg_op='INSERT' then
      raise exception 'Cliente bloqueado para novos debitos' using errcode='22023';
    elsif old.entry_type<>'DEBIT' or old.customer_codigo<>new.customer_codigo or new.amount>old.amount then
      raise exception 'Cliente bloqueado para aumentar debitos' using errcode='22023';
    end if;
  end if;
  return new;
end;
$function$;
revoke all on function app_private.validate_ledger() from public,anon,authenticated;
create trigger app_ledger_validation before insert or update on public.customer_ledger
for each row execute function app_private.validate_ledger();

create function app_private.refresh_customer_balance() returns trigger
language plpgsql security definer set search_path=''
as $function$
declare codes integer[]; code integer; balance numeric;
begin
  if tg_op='INSERT' then codes=array[new.customer_codigo];
  elsif tg_op='DELETE' then codes=array[old.customer_codigo];
  else codes=array[old.customer_codigo,new.customer_codigo]; end if;
  for code in select distinct unnest(codes) order by 1 loop
    perform 1 from public.customers where codigo_cliente=code for update;
    select coalesce(sum(case when entry_type='DEBIT' then amount else -amount end),0)
      into balance from public.customer_ledger where customer_codigo=code;
    update public.customers set total_pendente=balance,
      status=case when balance>=limite then 'bloqueado' else 'liberado' end where codigo_cliente=code;
  end loop;
  return null;
end;
$function$;
revoke all on function app_private.refresh_customer_balance() from public,anon,authenticated;
create trigger app_refresh_customer_balance after insert or update or delete on public.customer_ledger
for each row execute function app_private.refresh_customer_balance();

create table public.dining_tables (
  id uuid primary key default gen_random_uuid(),
  codigo_mesa integer generated by default as identity unique not null,
  nome_cliente text,
  status text not null default 'aberta' check(status in ('aberta','fechada')),
  total_geral numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.dining_table_items (
  id uuid primary key default gen_random_uuid(),
  codigo_mesa integer not null references public.dining_tables(codigo_mesa) on delete restrict,
  descricao text not null check(length(btrim(descricao))>0),
  valor_unitario numeric not null check(valor_unitario>=0),
  quantidade integer not null default 1 check(quantidade>0),
  total numeric generated always as (valor_unitario*quantidade) stored,
  created_at timestamptz not null default now()
);
create index dining_items_mesa_idx on public.dining_table_items(codigo_mesa);
alter table public.dining_tables enable row level security;
alter table public.dining_table_items enable row level security;
revoke all on public.dining_tables,public.dining_table_items from anon,authenticated;
grant select,delete on public.dining_tables,public.dining_table_items to authenticated;
grant insert(nome_cliente,status),update(nome_cliente,status) on public.dining_tables to authenticated;
grant insert(codigo_mesa,descricao,valor_unitario,quantidade),update(descricao,valor_unitario,quantidade)
  on public.dining_table_items to authenticated;
grant usage on sequence public.dining_tables_codigo_mesa_seq to authenticated;
create policy app_mesa_access on public.dining_tables for all to authenticated
  using ((select app_private.app_role()) in ('ADMIN','OPERATOR'))
  with check ((select app_private.app_role()) in ('ADMIN','OPERATOR'));
create policy app_mesa_item_access on public.dining_table_items for all to authenticated
  using ((select app_private.app_role()) in ('ADMIN','OPERATOR'))
  with check ((select app_private.app_role()) in ('ADMIN','OPERATOR'));
create trigger app_mesa_updated before update on public.dining_tables
for each row execute function app_private.touch_updated_at();

create function app_private.validate_mesa_item() returns trigger
language plpgsql security definer set search_path=''
as $function$
declare mesa integer;
begin
  mesa=case when tg_op='DELETE' then old.codigo_mesa else new.codigo_mesa end;
  perform 1 from public.dining_tables where codigo_mesa=mesa and status='aberta' for update;
  if not found then raise exception 'Mesa fechada ou inexistente' using errcode='22023'; end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$function$;
revoke all on function app_private.validate_mesa_item() from public,anon,authenticated;
create trigger app_validate_mesa_item before insert or update or delete on public.dining_table_items
for each row execute function app_private.validate_mesa_item();

create function app_private.refresh_mesa_total() returns trigger
language plpgsql security definer set search_path=''
as $function$
declare mesa integer;
begin
  mesa=case when tg_op='DELETE' then old.codigo_mesa else new.codigo_mesa end;
  update public.dining_tables set total_geral=(select coalesce(sum(total),0)
    from public.dining_table_items where codigo_mesa=mesa) where codigo_mesa=mesa;
  return null;
end;
$function$;
revoke all on function app_private.refresh_mesa_total() from public,anon,authenticated;
create trigger app_refresh_mesa_total after insert or update or delete on public.dining_table_items
for each row execute function app_private.refresh_mesa_total();

notify pgrst, 'reload schema';
commit;
