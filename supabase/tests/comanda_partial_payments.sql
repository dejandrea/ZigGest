begin;
update public.dining_tables set status='fechada' where status='aberta';
update public.cash_sessions set status='CLOSED' where status='OPEN';
do $$begin perform set_config('request.jwt.claim.sub',(select id::text from auth.users where lower(email)='dejandrea@gmail.com'),true);end $$;
set local role authenticated;
do $$
declare acc uuid:=gen_random_uuid();cat uuid:=gen_random_uuid();pix uuid:=gen_random_uuid();credit uuid:=gen_random_uuid();
 session uuid:=gen_random_uuid();cmd uuid:=gen_random_uuid();other uuid:=gen_random_uuid();customer integer;tab public.dining_tables;
 coca uuid;beer uuid;snack uuid;data jsonb;request uuid:=gen_random_uuid();debit uuid;
begin
 perform public.finance_config('accounts',acc,'{"nome":"Fixture partial account","tipo":"CASH","ativo":true,"saldo_inicial":0}');
 perform public.finance_config('categories',cat,'{"nome":"Fixture partial category","natureza":"INCOME","ativo":true}');
 perform public.finance_config('methods',pix,'{"nome":"Fixture partial pix","tipo":"PIX","ativo":true,"usar_pdv":true,"prazo_dias":0,"max_parcelas":1}');
 perform public.finance_config('methods',credit,'{"nome":"Fixture partial deferred","tipo":"DEFERRED","ativo":true,"usar_pdv":true,"prazo_dias":30,"max_parcelas":1}');
 perform public.cash_operation(session,'OPEN',jsonb_build_object('conta_id',acc,'categoria_id',cat,'method_ids',jsonb_build_array(pix)));
 perform public.comanda_operation(cmd,'OPEN','{"identificacao":"Três pessoas"}');
 select * into tab from public.dining_tables where id=cmd;
 insert into public.dining_table_items(codigo_mesa,descricao,valor_unitario,quantidade) values(tab.codigo_mesa,'Coca',8,3) returning id into coca;
 insert into public.dining_table_items(codigo_mesa,descricao,valor_unitario,quantidade) values(tab.codigo_mesa,'Cerveja',10,2) returning id into beer;
 insert into public.dining_table_items(codigo_mesa,descricao,valor_unitario,quantidade) values(tab.codigo_mesa,'Salgadinho',5,4) returning id into snack;
 -- One of each: 23. Leave the consumption total and the comanda open.
 data:=jsonb_build_object('request_id',request,'total',64,'paid_total',0,'mode','ITEMS','items',jsonb_build_array(jsonb_build_object('item_id',coca,'quantidade',1),jsonb_build_object('item_id',beer,'quantidade',1),jsonb_build_object('item_id',snack,'quantidade',1)),'payments',jsonb_build_array(jsonb_build_object('forma_id',pix,'valor',23)));
 perform public.comanda_operation(cmd,'PAY',data);perform public.comanda_operation(cmd,'PAY',data);
 if (select paid_total from public.dining_tables where id=cmd)<>23 or (select total_geral from public.dining_tables where id=cmd)<>64 or (select status from public.dining_tables where id=cmd)<>'aberta' then raise exception 'Wrong partial item balance';end if;
 begin update public.dining_table_items set valor_unitario=9 where id=coca;raise exception 'FAIL: changed paid price';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 begin delete from public.dining_table_items where id=coca;raise exception 'FAIL: deleted paid item';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 begin perform public.comanda_operation(cmd,'PAY',data||jsonb_build_object('request_id',gen_random_uuid()));raise exception 'FAIL: stale paid balance';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 begin perform public.comanda_operation(cmd,'PAY',data||jsonb_build_object('request_id',gen_random_uuid(),'paid_total',23,'items',jsonb_build_array(jsonb_build_object('item_id',coca,'quantidade',3))));raise exception 'FAIL: exceeded available quantity';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 begin perform public.comanda_operation(cmd,'PAY',data||jsonb_build_object('request_id',gen_random_uuid(),'paid_total',23,'items',jsonb_build_array(jsonb_build_object('item_id',coca,'quantidade',1),jsonb_build_object('item_id',coca,'quantidade',1))));raise exception 'FAIL: repeated item';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 -- Another person pays 30, split 20 Pix and 10 deferred, registered as payer.
 insert into public.customers(nome,limite) values('Fixture partial payer',100) returning codigo_cliente into customer;
 request:=gen_random_uuid();
 data:=jsonb_build_object('request_id',request,'total',64,'paid_total',23,'mode','VALUE','customer_codigo',customer,'vencimento',(now() at time zone 'America/Bahia')::date+30,'payments',jsonb_build_array(jsonb_build_object('forma_id',pix,'valor',20),jsonb_build_object('forma_id',credit,'valor',10)));
 perform public.comanda_operation(cmd,'PAY',data);perform public.comanda_operation(cmd,'PAY',data);
 if (select total_pendente from public.customers where codigo_cliente=customer)<>10 or (select paid_total from public.dining_tables where id=cmd)<>53 then raise exception 'Wrong mixed partial settlement';end if;
 begin perform public.cash_operation(session,'CLOSE','{}');raise exception 'FAIL: cash closed with partial comanda';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 begin perform public.comanda_operation(cmd,'PAY',jsonb_build_object('request_id',gen_random_uuid(),'total',64,'paid_total',53,'mode','VALUE','payments',jsonb_build_array(jsonb_build_object('forma_id',pix,'valor',12))));raise exception 'FAIL: overpayment';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 begin perform public.comanda_operation(cmd,'PAY',jsonb_build_object('request_id',gen_random_uuid(),'total',64,'paid_total',53,'mode','ITEMS','items',jsonb_build_array(jsonb_build_object('item_id',coca,'quantidade',2)),'payments',jsonb_build_array(jsonb_build_object('forma_id',pix,'valor',16))));raise exception 'FAIL: item total exceeds balance after value payment';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 -- Second deferred receipt creates another debt, not a duplicate or overwrite.
 request:=gen_random_uuid();
 data:=jsonb_build_object('request_id',request,'total',64,'paid_total',53,'mode','VALUE','customer_codigo',customer,'vencimento',(now() at time zone 'America/Bahia')::date+30,'payments',jsonb_build_array(jsonb_build_object('forma_id',credit,'valor',5)));
 perform public.comanda_operation(cmd,'PAY',data);
 if (select count(*) from public.customer_ledger where comanda_id=cmd)<>2 or (select total_pendente from public.customers where codigo_cliente=customer)<>15 then raise exception 'Multiple deferred debts missing';end if;
 -- Final close pays only the remaining 6, total consumption stays 64.
 data:=jsonb_build_object('request_id',gen_random_uuid(),'total',64,'paid_total',58,'payments',jsonb_build_array(jsonb_build_object('forma_id',pix,'valor',6)));
 perform public.comanda_operation(cmd,'CLOSE',data);perform public.comanda_operation(cmd,'CLOSE',data);
 if (select status from public.dining_tables where id=cmd)<>'fechada' or (select paid_total from public.dining_tables where id=cmd)<>64 then raise exception 'Final close failed';end if;
 if (select sum(valor) from public.financial_entries where conta_id=acc)<>49 then raise exception 'Wrong cash receipts';end if;
 if (select count(*) from public.comanda_closures where comanda_id=cmd)<>4 then raise exception 'Wrong settlement count';end if;
 -- Full amount via PAY still requires explicit close, which can have no payments.
 perform public.comanda_operation(other,'OPEN','{"identificacao":"Pago integralmente"}');
 select * into tab from public.dining_tables where id=other;
 insert into public.dining_table_items(codigo_mesa,descricao,valor_unitario,quantidade) values(tab.codigo_mesa,'Consumo',1,1);
 perform public.comanda_operation(other,'PAY',jsonb_build_object('request_id',gen_random_uuid(),'total',1,'paid_total',0,'mode','VALUE','payments',jsonb_build_array(jsonb_build_object('forma_id',pix,'valor',1))));
 if (select status from public.dining_tables where id=other)<>'aberta' then raise exception 'Partial action closed comanda';end if;
 perform public.comanda_operation(other,'CLOSE',jsonb_build_object('request_id',gen_random_uuid(),'total',1,'paid_total',1,'payments','[]'::jsonb));
 perform public.cash_operation(session,'CLOSE','{}');
end $$;
rollback;
select 'partial comanda payments passed' as result;
