begin;
do $$ begin perform set_config('request.jwt.claim.sub',(select id::text from auth.users where lower(email)='dejandrea@gmail.com'),true);end $$;
set local role authenticated;
do $$
declare item uuid;supplier uuid;entry uuid:=gen_random_uuid();payable uuid:=gen_random_uuid();data jsonb;before_count bigint;
begin
 insert into public.stock_items(nome,unidade) values('Fixture payable item','UN') returning id into item;
 insert into public.suppliers(nome) values('Fixture payable supplier') returning id into supplier;
 perform public.record_stock_entry(entry,item,2,12,'Fixture',null,supplier,100);
 perform public.record_stock_entry(entry,item,2,12,'Fixture',null,supplier,100);
 if (select saldo from public.stock_items where id=item)<>24 then raise exception 'Retry duplicated stock';end if;
 if not exists(select 1 from public.stock_movements where id=entry and fornecedor_id=supplier and total_entrada=100) then raise exception 'Entry finance data missing';end if;
 begin perform public.record_stock_entry(entry,item,2,12,'Fixture',null,supplier,101);raise exception 'FAIL: changed entry';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 data:=jsonb_build_object('fornecedor_id',supplier,'fornecedor_nome','Fixture supplier','fornecedor_documento','','descricao','Fixture purchase','total',100,'observacoes','','parcelas',jsonb_build_array(
 jsonb_build_object('numero',1,'referencia','001','vencimento','2026-11-01','valor',33.34,'forma_pagamento','Boleto'),
 jsonb_build_object('numero',2,'referencia','002','vencimento','2026-12-01','valor',33.33,'forma_pagamento','Boleto'),
 jsonb_build_object('numero',3,'referencia','003','vencimento','2027-01-01','valor',33.33,'forma_pagamento','Pix')));
 perform public.save_supplier_payable(payable,entry,data);
 perform public.save_supplier_payable(payable,entry,data);
 if (select count(*) from public.supplier_payable_installments where payable_id=payable)<>3 or (select sum(valor) from public.supplier_payable_installments where payable_id=payable)<>100 then raise exception 'Incorrect installments';end if;
 begin perform public.save_supplier_payable(gen_random_uuid(),entry,data);raise exception 'FAIL: duplicate source';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 select count(*) into before_count from public.supplier_payables;
 begin perform public.save_supplier_payable(gen_random_uuid(),null,data||'{"total":101}');raise exception 'FAIL: bad sum';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 if (select count(*) from public.supplier_payables)<>before_count then raise exception 'Partial financial save';end if;
 perform public.save_supplier_payable(payable,entry,data||'{"descricao":"Edited fixture"}',true);
 if not exists(select 1 from public.supplier_payables where id=payable and descricao='Edited fixture') then raise exception 'Edit failed';end if;
 begin perform public.save_supplier_payable(payable,null,data,true);raise exception 'FAIL: change source';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 begin update public.supplier_payables set total=999 where id=payable;raise exception 'FAIL: direct update';exception when insufficient_privilege then null;end;
 begin delete from public.supplier_payable_installments where payable_id=payable;raise exception 'FAIL: direct delete';exception when insufficient_privilege then null;end;
 begin insert into public.supplier_payable_installments(payable_id,numero,referencia,vencimento,valor) values(payable,4,'004','2026-11-01',1);raise exception 'FAIL: direct insert';exception when insufficient_privilege then null;end;
 if (select saldo from public.stock_items where id=item)<>24 then raise exception 'Finance changed inventory';end if;
end $$;
reset role;
do $$ begin perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000000',true);end $$;
set local role authenticated;
do $$ begin
 if exists(select 1 from public.supplier_payables) or exists(select 1 from public.supplier_payable_installments) then raise exception 'Unauthorized read';end if;
 begin perform public.save_supplier_payable(gen_random_uuid(),null,'{}');raise exception 'FAIL: unauthorized RPC';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.save_supplier_payable(gen_random_uuid(),null,'{}');raise exception 'FAIL: anon RPC';exception when insufficient_privilege then null;end;
 begin perform 1 from public.supplier_payables;raise exception 'FAIL: anon read';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'Supplier payables fixtures passed; no fixture data persisted.' as resultado;
