-- Migration destination only. Does not delete or rewrite customer data.
-- Default deny for browser roles until V2 Auth policies are implemented.
begin;
set local lock_timeout = '5s';
alter table public.customers enable row level security;
alter table public.users enable row level security;
alter table public.customer_ledger enable row level security;
alter view public.v_customer_balance set (security_invoker = true);
revoke all on table public.users from anon, authenticated;
revoke all on table public.customers, public.customer_ledger, public.v_customer_balance from anon;
commit;
