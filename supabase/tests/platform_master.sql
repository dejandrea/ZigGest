begin;
insert into app_private.account_directory(id,email,nome,role,enabled) values
('30000000-0000-4000-8000-000000000001','master-fixture@example.invalid','Fixture','MASTER',true),
('30000000-0000-4000-8000-000000000002','admin-fixture@example.invalid','Fixture','ADMIN',true);
insert into auth.users(id,email,email_confirmed_at) values
('40000000-0000-4000-8000-000000000001','master-fixture@example.invalid',now()),
('40000000-0000-4000-8000-000000000002','admin-fixture@example.invalid',now());
select set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $t$ begin
 if exists(select 1 from public.admin_list_accounts() where role='MASTER') then raise exception 'FAIL master visible to admin'; end if;
 begin
 perform public.admin_save_account('30000000-0000-4000-8000-000000000001','master-fixture@example.invalid','Fixture','ADMIN',true);
 raise exception 'FAIL admin altered master';
 exception when insufficient_privilege then null; end;
 begin
 perform public.admin_save_account(null,'new-master@example.invalid','Fixture','MASTER',true);
 raise exception 'FAIL admin created master';
 exception when insufficient_privilege then null; end;
end $t$;
reset role;
select set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $t$ begin
 if app_private.app_role()<>'MASTER' then raise exception 'FAIL master missing'; end if;
 if not exists(select 1 from public.admin_list_accounts() where role='MASTER') then raise exception 'FAIL master management'; end if;
 if (select count(*) from public.customers)<>5 then raise exception 'FAIL master business access'; end if;
 perform public.admin_save_account('30000000-0000-4000-8000-000000000002','admin-fixture@example.invalid','Fixture','OPERATOR',true);
end $t$;
rollback;