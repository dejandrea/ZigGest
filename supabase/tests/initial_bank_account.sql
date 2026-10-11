begin;
update public.dining_tables set status='fechada' where status='aberta';
update public.cash_sessions set status='CLOSED' where status='OPEN';
do $$begin perform set_config('request.jwt.claim.sub',(select id::text from auth.users where lower(email)='dejandrea@gmail.com'),true);end $$;
set local role authenticated;
do $$
declare bank uuid; cash uuid; custom uuid:=gen_random_uuid(); cat uuid:=gen_random_uuid(); session uuid:=gen_random_uuid(); method uuid; cmd uuid; code integer; tipo text; base_bank numeric; base_cash numeric; amount numeric; data jsonb;
begin
 select id into bank from public.financial_accounts where banco_inicial;
 select id into cash from public.financial_accounts where caixa_padrao;
 if bank is null or bank=cash then raise exception 'Bank seed missing or sharing cash account';end if;
 if (select count(*) from public.financial_accounts where banco_inicial)<>1 then raise exception 'Bank seed duplicated';end if;
 if exists(select 1 from public.financial_payment_methods where nome in ('Pix','Cartão de crédito','Cartão de débito','Boleto bancário') and conta_padrao_id is null) then raise exception 'Initial methods not assigned';end if;
 select coalesce(sum(valor),0) into base_bank from public.financial_entries where conta_id=bank;
 select coalesce(sum(valor),0) into base_cash from public.financial_entries where conta_id=cash;
 perform public.finance_config('accounts',custom,'{"nome":"Fixture custom bank","tipo":"BANK","ativo":true}');
 perform public.finance_config('categories',cat,'{"nome":"Fixture seed revenue","natureza":"INCOME","ativo":true}');
 perform public.cash_operation(session,'OPEN',jsonb_build_object('categoria_id',cat,'valor_abertura',0));
 -- Renaming the bank must keep its identity and all method assignments.
 perform public.finance_config('accounts',bank,'{"nome":"Fixture bank renamed","tipo":"BANK","ativo":true}');
 foreach tipo in array array['PIX','CREDIT_CARD','DEBIT_CARD','BOLETO'] loop
  method:=gen_random_uuid();cmd:=gen_random_uuid();
  data:=jsonb_build_object('nome','Fixture seed '||tipo,'tipo',tipo,'ativo',true,'usar_pdv',true,'prazo_dias',0,'max_parcelas',1);
  perform public.finance_config('methods',method,data);
  if (select conta_padrao_id from public.financial_payment_methods where id=method)<>bank then raise exception 'New method missed initial bank';end if;
  perform public.comanda_operation(cmd,'OPEN',jsonb_build_object('identificacao','Fixture sale '||tipo));
  select codigo_mesa into code from public.dining_tables where id=cmd;
  insert into public.dining_table_items(codigo_mesa,descricao,valor_unitario,quantidade) values(code,'Consumo',10,1);
  perform public.comanda_operation(cmd,'CLOSE',jsonb_build_object('request_id',gen_random_uuid(),'total',10,'paid_total',0,'payments',jsonb_build_array(jsonb_build_object('forma_id',method,'valor',10))));
 end loop;
 if (select sum(valor) from public.financial_entries where conta_id=bank)-base_bank<>40 then raise exception 'Electronic receipts missed initial bank';end if;
 if (select coalesce(sum(valor),0) from public.financial_entries where conta_id=cash)<>base_cash then raise exception 'Electronic receipts changed cash balance';end if;
 if (select (v->>'expected_cash')::numeric from jsonb_array_elements(public.cash_dashboard()) v where v->>'id'=session::text)<>0 then raise exception 'Electronic receipts changed physical cash';end if;
 -- User-selected destinations win; edits remain editable and NULL resets to the seed fallback.
 perform public.finance_config('methods',method,data||jsonb_build_object('conta_padrao_id',custom));
 cmd:=gen_random_uuid();perform public.comanda_operation(cmd,'OPEN','{"identificacao":"Fixture custom destination"}');
 select codigo_mesa into code from public.dining_tables where id=cmd;
 insert into public.dining_table_items(codigo_mesa,descricao,valor_unitario,quantidade) values(code,'Consumo',10,1);
 perform public.comanda_operation(cmd,'CLOSE',jsonb_build_object('request_id',gen_random_uuid(),'total',10,'paid_total',0,'payments',jsonb_build_array(jsonb_build_object('forma_id',method,'valor',10))));
 if (select sum(valor) from public.financial_entries where conta_id=custom)<>10 then raise exception 'Explicit account ignored';end if;
 perform public.finance_config('methods',method,data||jsonb_build_object('conta_padrao_id',null));
 cmd:=gen_random_uuid();perform public.comanda_operation(cmd,'OPEN','{"identificacao":"Fixture fallback bank"}');
 select codigo_mesa into code from public.dining_tables where id=cmd;
 insert into public.dining_table_items(codigo_mesa,descricao,valor_unitario,quantidade) values(code,'Consumo',10,1);
 perform public.comanda_operation(cmd,'CLOSE',jsonb_build_object('request_id',gen_random_uuid(),'total',10,'paid_total',0,'payments',jsonb_build_array(jsonb_build_object('forma_id',method,'valor',10))));
 if (select sum(valor) from public.financial_entries where conta_id=bank)-base_bank<>50 then raise exception 'Null configuration fell back to cash';end if;
 perform public.finance_config('accounts',bank,'{"nome":"Fixture bank renamed","tipo":"BANK","ativo":false}');
 cmd:=gen_random_uuid();perform public.comanda_operation(cmd,'OPEN','{"identificacao":"Fixture inactive bank"}');
 select codigo_mesa into code from public.dining_tables where id=cmd;
 insert into public.dining_table_items(codigo_mesa,descricao,valor_unitario,quantidade) values(code,'Consumo',10,1);
 begin perform public.comanda_operation(cmd,'CLOSE',jsonb_build_object('request_id',gen_random_uuid(),'total',10,'paid_total',0,'payments',jsonb_build_array(jsonb_build_object('forma_id',method,'valor',10))));raise exception 'FAIL: inactive bank silently fell back to cash';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 begin perform app_private.payment_receiving_account(method,cash);raise exception 'FAIL: private helper executable';exception when insufficient_privilege then null;end;
end $$;
rollback;
