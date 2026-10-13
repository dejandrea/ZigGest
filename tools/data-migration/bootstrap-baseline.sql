-- Empty legacy landing schema required by the first V2 migration.
-- No company data, users, credentials or demonstration fixtures are copied.
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  codigo_cliente serial not null unique,
  nome text not null,
  apelido text, telefone text, email text, endereco text,
  ativo boolean default true,
  status text default 'liberado' check(status in ('liberado','bloqueado')),
  limite numeric default 100,
  total_pendente numeric default 0,
  observacoes text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.users (
  id uuid primary key default gen_random_uuid(),
  mongo_oid text unique,
  codigo_usuario integer unique,
  nome text not null, email text not null unique, password_hash text not null,
  ativo boolean default true,
  status text default 'liberado' check(status in ('liberado','bloqueado')),
  role text default 'USER' check(role in ('ADMIN','MANAGER','CASHIER','USER')),
  created_at timestamptz, updated_at timestamptz
);
create table public.customer_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_codigo integer not null,
  mongo_oid text unique,
  codigo_conta serial,
  entry_type text not null check(entry_type in ('DEBIT','CREDIT')),
  amount numeric not null check(amount>=0),
  issue_at timestamptz, due_at timestamptz, notes text,
  created_at timestamptz, updated_at timestamptz
);
alter table public.customers enable row level security;
alter table public.users enable row level security;
alter table public.customer_ledger enable row level security;
revoke all on public.customers, public.users, public.customer_ledger from public, anon, authenticated;
create view public.v_customer_balance with (security_invoker=true) as
select c.id as customer_id,c.codigo_cliente,c.nome,
 coalesce(sum(case when l.entry_type='DEBIT' then l.amount else 0 end),0) as total_debitos,
 coalesce(sum(case when l.entry_type='CREDIT' then l.amount else 0 end),0) as total_creditos,
 coalesce(sum(case when l.entry_type='DEBIT' then l.amount else -l.amount end),0) as saldo
from public.customers c left join public.customer_ledger l on l.customer_codigo=c.codigo_cliente
group by c.id,c.codigo_cliente,c.nome;
revoke all on public.v_customer_balance from public,anon,authenticated;
