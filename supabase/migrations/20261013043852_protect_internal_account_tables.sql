begin;
-- These tables are accessed only by guarded SECURITY DEFINER functions.
-- Browser roles have no direct grants; RLS adds defense in depth.
alter table app_private.account_directory enable row level security;
alter table app_private.account_audit enable row level security;
alter table app_private.cash_requests enable row level security;
revoke all on app_private.account_directory,app_private.account_audit,app_private.cash_requests
from public,anon,authenticated;
commit;
