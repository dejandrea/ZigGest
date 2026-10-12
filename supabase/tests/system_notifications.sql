begin;
do $$begin perform set_config('request.jwt.claim.sub',(select id::text from auth.users where lower(email)='dejandrea@gmail.com'),true);end $$;
-- Fixture changes, including an existing open cash session, are rolled back below.
do $$declare cash uuid;begin
 select id into cash from public.cash_sessions where status='OPEN' limit 1;
 if cash is null then
  insert into public.cash_sessions(id,conta_id,categoria_id,method_ids,opened_by,opened_at,opening_payload,saldo_abertura)
  select gen_random_uuid(),a.id,c.id,'{}'::uuid[],auth.uid(),now(),'{}',0 from public.financial_accounts a cross join public.financial_categories c
  where a.caixa_padrao and c.ativo and c.natureza in ('INCOME','BOTH') limit 1 returning id into cash;
 end if;
 if cash is null then raise exception 'Cash fixture setup failed';end if;
 update public.cash_sessions set opened_at=now()-interval '24 hours' where id=cash;
 perform set_config('fixture.notifications.cash',cash::text,true);
end $$;
set local role authenticated;
do $$begin
 if exists(select 1 from jsonb_array_elements(public.system_notifications()) a where a->>'id'='cash:'||current_setting('fixture.notifications.cash')) then raise exception 'Exact 24-hour threshold included too early';end if;
end $$;
reset role;
update public.cash_sessions set opened_at=now()-interval '24 hours 1 second' where id=current_setting('fixture.notifications.cash')::uuid;
set local role authenticated;
do $$
declare today date:=(now() at time zone 'America/Bahia')::date;stock uuid;bank uuid:=gen_random_uuid();payable uuid:=gen_random_uuid();method uuid;overdue uuid;soon uuid;later uuid;first_payment uuid:=gen_random_uuid();customer integer;debit uuid;receipt uuid:=gen_random_uuid();alerts jsonb;row jsonb;
begin
 insert into public.stock_items(nome,unidade,estoque_minimo) values('Notification fixture stock','UN',2) returning id into stock;
 perform public.finance_config('accounts',bank,jsonb_build_object('nome','Notification fixture bank','tipo','BANK','ativo',true,'saldo_inicial',100,'data',today));
 select id into method from public.financial_payment_methods where ativo and tipo='PIX' limit 1;
 perform public.save_supplier_payable(payable,null,jsonb_build_object('fornecedor_nome','Notification supplier','descricao','Notification fixture payable','total',15.123457,'parcelas',jsonb_build_array(
  jsonb_build_object('numero',1,'vencimento',today-1,'valor',10.123456),jsonb_build_object('numero',2,'vencimento',today+7,'valor',2.000001),jsonb_build_object('numero',3,'vencimento',today+8,'valor',3))));
 select id into overdue from public.supplier_payable_installments where payable_id=payable and numero=1;
 select id into soon from public.supplier_payable_installments where payable_id=payable and numero=2;
 select id into later from public.supplier_payable_installments where payable_id=payable and numero=3;
 insert into public.customers(nome,limite) values('Notification fixture customer',25) returning codigo_cliente into customer;
 insert into public.customer_ledger(customer_codigo,entry_type,amount,due_at) values(customer,'DEBIT',10,((today-1)::timestamp at time zone 'America/Bahia')+interval '12 hours') returning id into debit;
 insert into public.customer_ledger(customer_codigo,entry_type,amount,due_at) values(customer,'DEBIT',16,((today+8)::timestamp at time zone 'America/Bahia')+interval '12 hours');
 alerts:=public.system_notifications();
 if not exists(select 1 from jsonb_array_elements(alerts) a where a->>'kind'='LOW_STOCK' and a->'details'->>'stockItemId'=stock::text) then raise exception 'Missing stock notification';end if;
 if not exists(select 1 from jsonb_array_elements(alerts) a where a->>'id'='cash:'||current_setting('fixture.notifications.cash')) then raise exception 'Missing cash age notification';end if;
 if not exists(select 1 from jsonb_array_elements(alerts) a where a->>'id'='payable:'||overdue::text and a->>'kind'='PAYABLE_OVERDUE') or not exists(select 1 from jsonb_array_elements(alerts) a where a->>'id'='payable:'||soon::text and a->>'kind'='PAYABLE_DUE_SOON') or exists(select 1 from jsonb_array_elements(alerts) a where a->>'id'='payable:'||later::text) then raise exception 'Payable date boundaries incorrect';end if;
 if not exists(select 1 from jsonb_array_elements(alerts) a where a->>'id'='receivable:'||debit::text) or not exists(select 1 from jsonb_array_elements(alerts) a where a->>'kind'='CUSTOMER_OVER_LIMIT' and (a->'details'->>'customerCode')::integer=customer) then raise exception 'Missing receivable or limit notification';end if;
 perform public.finance_operation(first_payment,jsonb_build_object('tipo','PAYMENT','valor',0.000001,'data',today,'descricao','Notification partial payable','conta_id',bank,'forma_id',method,'parcela_id',overdue));
 select a into row from jsonb_array_elements(public.system_notifications()) a where a->>'id'='payable:'||overdue::text;
 if (row->'details'->>'balance')::numeric<>10.123455 then raise exception 'Partial payable precision lost';end if;
 perform public.finance_operation(gen_random_uuid(),jsonb_build_object('tipo','PAYMENT','valor',10.123455,'data',today,'descricao','Notification full payable','conta_id',bank,'forma_id',method,'parcela_id',overdue));
 if exists(select 1 from jsonb_array_elements(public.system_notifications()) a where a->>'id'='payable:'||overdue::text) then raise exception 'Paid payable remained visible';end if;
 perform public.finance_operation(gen_random_uuid(),jsonb_build_object('tipo','REVERSAL','estorno_de',first_payment,'data',today,'descricao','Notification reversal','motivo','Fixture correction'));
 select a into row from jsonb_array_elements(public.system_notifications()) a where a->>'id'='payable:'||overdue::text;
 if (row->'details'->>'balance')::numeric<>0.000001 then raise exception 'Reversed payment not restored';end if;
 perform public.finance_operation(receipt,jsonb_build_object('tipo','RECEIPT','valor',2.000001,'data',today,'descricao','Notification partial receipt','conta_id',bank,'forma_id',method,'debito_id',debit));
 alerts:=public.system_notifications();
 select a into row from jsonb_array_elements(alerts) a where a->>'id'='receivable:'||debit::text;
 if (row->'details'->>'balance')::numeric<>7.999999 or exists(select 1 from jsonb_array_elements(alerts) a where a->>'kind'='CUSTOMER_OVER_LIMIT' and (a->'details'->>'customerCode')::integer=customer) then raise exception 'Partial receipt or limit recovery failed';end if;
 perform public.finance_operation(gen_random_uuid(),jsonb_build_object('tipo','RECEIPT','valor',7.999999,'data',today,'descricao','Notification full receipt','conta_id',bank,'forma_id',method,'debito_id',debit));
 if exists(select 1 from jsonb_array_elements(public.system_notifications()) a where a->>'id'='receivable:'||debit::text) then raise exception 'Paid receivable remained visible';end if;
 perform public.finance_operation(gen_random_uuid(),jsonb_build_object('tipo','REVERSAL','estorno_de',receipt,'data',today,'descricao','Notification receipt reversal','motivo','Fixture correction'));
 select a into row from jsonb_array_elements(public.system_notifications()) a where a->>'id'='receivable:'||debit::text;
 if (row->'details'->>'balance')::numeric<>2.000001 then raise exception 'Reversed receipt not restored';end if;
 insert into public.customer_ledger(customer_codigo,entry_type,amount) values(customer,'CREDIT',18.000001);
 if exists(select 1 from jsonb_array_elements(public.system_notifications()) a where a->>'id'='receivable:'||debit::text) then raise exception 'Zero net customer balance still warned';end if;
 perform public.record_stock_movement(gen_random_uuid(),'ENTRADA',stock,null,3,1,'Notification stock recovered');
 if exists(select 1 from jsonb_array_elements(public.system_notifications()) a where a->>'kind'='LOW_STOCK' and a->'details'->>'stockItemId'=stock::text) then raise exception 'Recovered stock still warned';end if;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.system_notifications();raise exception 'FAIL unauthorized notifications';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin perform set_config('request.jwt.claim.sub',(select id::text from auth.users where lower(email)='dejandrea@gmail.com'),true);end $$;
update public.cash_sessions set status='CLOSED' where id=current_setting('fixture.notifications.cash')::uuid;
set local role authenticated;
do $$begin
 if exists(select 1 from jsonb_array_elements(public.system_notifications()) a where a->>'id'='cash:'||current_setting('fixture.notifications.cash')) then raise exception 'Closed cash session still warned';end if;
end $$;
reset role;
do $$begin
 if has_function_privilege('anon','public.system_notifications()','EXECUTE') then raise exception 'Anonymous notifications access exposed';end if;
end $$;
rollback;
