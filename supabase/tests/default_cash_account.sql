begin;
update public.dining_tables set status='fechada' where status='aberta';
update public.cash_sessions set status='CLOSED' where status='OPEN';
do $$begin perform set_config('request.jwt.claim.sub',(select id::text from auth.users where lower(email)='dejandrea@gmail.com'),true);end $$;
set local role authenticated;
do $$
declare acc uuid; other uuid:=gen_random_uuid(); cat uuid:=gen_random_uuid(); method uuid:=gen_random_uuid(); session uuid:=gen_random_uuid(); cmd uuid:=gen_random_uuid(); request uuid:=gen_random_uuid(); data jsonb; balance numeric; code integer;
begin
 select id into acc from public.financial_accounts where caixa_padrao and nome='Conta caixa' and tipo='CASH' and ativo;
 if acc is null or (select count(*) from public.financial_accounts where caixa_padrao)<>1 then raise exception 'Default account missing or duplicated';end if;
 select coalesce(sum(valor),0) into balance from public.financial_entries where conta_id=acc;
 perform public.finance_config('accounts',other,jsonb_build_object('nome','Fixture default cash other','tipo','BANK','ativo',true,'saldo_inicial',100,'data',(now() at time zone 'America/Bahia')::date));
 perform public.finance_config('categories',cat,'{"nome":"Fixture default cash income","natureza":"INCOME","ativo":true}');
 perform public.finance_config('methods',method,jsonb_build_object('nome','Fixture default cash method','tipo','CASH','ativo',true,'usar_pdv',true,'conta_padrao_id',other,'prazo_dias',0,'max_parcelas',1));
 begin perform public.finance_config('accounts',acc,'{"nome":"Outro nome","tipo":"CASH","ativo":true}');raise exception 'FAIL: default renamed';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 begin perform public.finance_config('accounts',acc,'{"nome":"Conta caixa","tipo":"BANK","ativo":true}');raise exception 'FAIL: default type changed';exception when raise_exception or check_violation then if SQLERRM like 'FAIL:%' then raise;end if;end;
 begin perform public.finance_config('accounts',acc,'{"nome":"Conta caixa","tipo":"CASH","ativo":false}');raise exception 'FAIL: default disabled';exception when raise_exception or check_violation then if SQLERRM like 'FAIL:%' then raise;end if;end;
 data:=jsonb_build_object('categoria_id',cat,'valor_abertura',20,'origem_id',other);
 begin perform public.cash_operation(session,'OPEN',data||jsonb_build_object('conta_id',other));raise exception 'FAIL: nondefault cash account';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 perform public.cash_operation(session,'OPEN',data);perform public.cash_operation(session,'OPEN',data);
 if (select conta_id from public.cash_sessions where id=session)<>acc then raise exception 'Opening missed default account';end if;
 perform public.comanda_operation(cmd,'OPEN','{"identificacao":"Fixture caixa padrão"}');
 select codigo_mesa into code from public.dining_tables where id=cmd;
 insert into public.dining_table_items(codigo_mesa,descricao,valor_unitario,quantidade) values(code,'Consumo',10,1);
 perform public.comanda_operation(cmd,'CLOSE',jsonb_build_object('request_id',request,'total',10,'paid_total',0,'payments',jsonb_build_array(jsonb_build_object('forma_id',method,'valor',10))));
 if (select sum(valor) from public.financial_entries where conta_id=acc)-balance<>30 then raise exception 'Cash payment went to method bank instead of default cash';end if;
 data:=jsonb_build_object('request_id',gen_random_uuid(),'valor',5,'conta_id',other,'motivo','Guardar dinheiro');
 perform public.cash_operation(session,'WITHDRAW',data);perform public.cash_operation(session,'WITHDRAW',data);
 if (select sum(valor) from public.financial_entries where conta_id=acc)-balance<>25 then raise exception 'Withdrawal missed default account';end if;
 perform public.cash_operation(session,'CLOSE','{"contado":25,"esperado":25}');
 begin perform app_private.cash_operation_base(gen_random_uuid(),'OPEN','{}');raise exception 'FAIL: unguarded base executable';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin
 begin delete from public.financial_accounts where caixa_padrao;raise exception 'FAIL: deleted default';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 begin update public.financial_accounts set caixa_padrao=false where caixa_padrao;raise exception 'FAIL: removed default marker';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
end $$;
rollback;
