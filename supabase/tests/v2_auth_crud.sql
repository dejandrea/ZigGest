begin;
-- Run after the V2 migration in the same transaction, then ROLLBACK.
-- Reserved fixture business codes avoid advancing existing production sequences.
alter table public.customers alter column codigo_cliente set default 999911;
alter table public.customer_ledger alter column codigo_conta set default 999912;
insert into app_private.account_directory(id,email,nome,role,enabled) values
('10000000-0000-4000-8000-000000000001','v2-test-admin@example.invalid','Fixture Admin','ADMIN',true),
('10000000-0000-4000-8000-000000000002','v2-test-operator@example.invalid','Fixture Operator','OPERATOR',true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('20000000-0000-4000-8000-000000000001','v2-test-admin@example.invalid',now(),'{}'),
('20000000-0000-4000-8000-000000000002','v2-test-operator@example.invalid',now(),'{"role":"ADMIN"}');
do $test$ begin
  begin
    insert into auth.users(id,email) values(gen_random_uuid(),'v2-unapproved@example.invalid');
    raise exception 'FAIL: unapproved signup succeeded';
  exception when insufficient_privilege then null; end;
end $test$;
insert into public.customers(codigo_cliente,nome,ativo,status,limite) values(999913,'Fixture second customer',true,'liberado',200);
insert into public.dining_tables(codigo_mesa,nome_cliente) values(999914,'Fixture table');

set local role anon;
do $test$ begin
  begin perform 1 from public.customers; raise exception 'FAIL: anonymous customer read succeeded';
  exception when insufficient_privilege then null; end;
  begin perform * from public.my_app_profile(); raise exception 'FAIL: anonymous profile RPC succeeded';
  exception when insufficient_privilege then null; end;
end $test$;

reset role;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $test$ declare entry uuid; item uuid; total numeric; state text;
begin
  if app_private.app_role()<>'OPERATOR' then raise exception 'FAIL: user metadata escalated role'; end if;
  if not exists(select 1 from public.my_app_profile() where role='OPERATOR') then raise exception 'FAIL: profile missing'; end if;
  begin perform * from public.admin_list_accounts(); raise exception 'FAIL: operator listed admin accounts';
  exception when insufficient_privilege then null; end;
  begin perform password_hash from public.users; raise exception 'FAIL: password hash exposed';
  exception when insufficient_privilege then null; end;
  begin update public.customers set total_pendente=0 where codigo_cliente=1; raise exception 'FAIL: protected balance writable';
  exception when insufficient_privilege then null; end;

  insert into public.customers(nome,ativo,status,limite) values('Fixture customer',true,'liberado',100);
  insert into public.customer_ledger(customer_codigo,entry_type,amount,notes)
    values(999911,'DEBIT',101,'Fixture entry') returning id into entry;
  select total_pendente,status into total,state from public.customers where codigo_cliente=999911;
  if total<>101 or state<>'bloqueado' then raise exception 'FAIL: debit did not update balance/status'; end if;
  begin
    insert into public.customer_ledger(customer_codigo,entry_type,amount) values(999911,'DEBIT',1);
    raise exception 'FAIL: blocked customer accepted new debit';
  exception when invalid_parameter_value then null; end;
  update public.customer_ledger set amount=50 where id=entry;
  select total_pendente,status into total,state from public.customers where codigo_cliente=999911;
  if total<>50 or state<>'liberado' then raise exception 'FAIL: reduced debit did not unblock'; end if;
  update public.customer_ledger set customer_codigo=999913 where id=entry;
  if (select total_pendente from public.customers where codigo_cliente=999911)<>0
    or (select total_pendente from public.customers where codigo_cliente=999913)<>50 then
    raise exception 'FAIL: moving entry did not update both balances'; end if;
  begin delete from public.customers where codigo_cliente=999913; raise exception 'FAIL: orphan-producing delete succeeded';
  exception when foreign_key_violation then null; end;
  delete from public.customer_ledger where id=entry;
  if (select total_pendente from public.customers where codigo_cliente=999913)<>0 then
    raise exception 'FAIL: deleting entry did not update balance'; end if;
  delete from public.customers where codigo_cliente=999911;
  delete from public.customers where codigo_cliente=999913;

  insert into public.dining_table_items(codigo_mesa,descricao,valor_unitario,quantidade)
    values(999914,'Fixture item',2.5,2) returning id into item;
  if (select total_geral from public.dining_tables where codigo_mesa=999914)<>5 then raise exception 'FAIL: table total'; end if;
  update public.dining_table_items set valor_unitario=3 where id=item;
  if (select total_geral from public.dining_tables where codigo_mesa=999914)<>6 then raise exception 'FAIL: item update total'; end if;
  update public.dining_tables set status='fechada' where codigo_mesa=999914;
  begin delete from public.dining_table_items where id=item; raise exception 'FAIL: closed table edited';
  exception when invalid_parameter_value then null; end;
  update public.dining_tables set status='aberta' where codigo_mesa=999914;
  delete from public.dining_table_items where id=item;
  if (select total_geral from public.dining_tables where codigo_mesa=999914)<>0 then raise exception 'FAIL: deleted item total'; end if;
  delete from public.dining_tables where codigo_mesa=999914;
end $test$;

reset role;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $test$ begin
  if app_private.app_role()<>'ADMIN' then raise exception 'FAIL: admin role'; end if;
  perform * from public.admin_list_accounts();
  begin
    perform public.admin_save_account('10000000-0000-4000-8000-000000000001','v2-test-admin@example.invalid','Fixture Admin','OPERATOR',true);
    raise exception 'FAIL: admin removed own access';
  exception when insufficient_privilege then null; end;
  perform public.admin_save_account('10000000-0000-4000-8000-000000000002','v2-test-operator@example.invalid','Fixture Operator','OPERATOR',false);
end $test$;
reset role;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $test$ begin
  if app_private.app_role() is not null then raise exception 'FAIL: disabled account retained role'; end if;
  if exists(select 1 from public.customers) or exists(select 1 from public.customer_ledger) then
    raise exception 'FAIL: disabled account retained row access'; end if;
  if exists(select 1 from public.my_app_profile()) then raise exception 'FAIL: disabled profile visible'; end if;
end $test$;
reset role;
rollback;
