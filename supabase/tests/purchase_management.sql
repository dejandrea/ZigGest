begin;
do $$begin perform set_config('request.jwt.claim.sub',(select id::text from auth.users where lower(email)='dejandrea@gmail.com'),true);end $$;
set local role authenticated;
do $$
declare a uuid;b uuid;s1 uuid;s2 uuid;s3 uuid;data jsonb;answer jsonb;quote uuid:=gen_random_uuid();split uuid:=gen_random_uuid();invalid uuid:=gen_random_uuid();decision uuid:=gen_random_uuid();links bigint;
begin
 insert into public.suppliers(nome,ativo) values('Fixture compra fornecedor 1',true) returning id into s1;
 insert into public.suppliers(nome,ativo) values('Fixture compra fornecedor 2',true) returning id into s2;
 insert into public.suppliers(nome,ativo) values('Fixture compra fornecedor 3',true) returning id into s3;
 answer:=public.save_purchase_item(null,'{"nome":"Fixture compra cola","unidade":"UN","estoque_minimo":5}',to_jsonb(array[s1,s2,s3]));a:=(answer->>'id')::uuid;
 insert into public.stock_items(nome,unidade,estoque_minimo) values('Fixture compra agua','UN',2) returning id into b;
 if (select count(*) from public.stock_item_suppliers where stock_item_id=a)<>3 then raise exception 'Three suppliers not saved';end if;
 if not exists(select 1 from public.low_stock_alerts where stock_item_id=a and ativo) then raise exception 'No low stock alert';end if;
 perform public.record_stock_movement(gen_random_uuid(),'ENTRADA',a,null,6,1,'Restock');
 if exists(select 1 from public.low_stock_alerts where stock_item_id=a and ativo) then raise exception 'Alert not resolved after replenishment';end if;
 update public.stock_items set estoque_minimo=6 where id=a;
 if (select count(*) from public.low_stock_alerts where stock_item_id=a and ativo)<>1 then raise exception 'Threshold equality or duplicate alert';end if;
 update public.stock_items set estoque_minimo=null where id=a;
 if exists(select 1 from public.low_stock_alerts where stock_item_id=a and ativo) then raise exception 'Optional minimum still alerts';end if;
 perform public.record_stock_entry(gen_random_uuid(),b,1,1,'Manual supplier link',null,s1,10);
 if not exists(select 1 from public.stock_item_suppliers where stock_item_id=b and supplier_id=s1) then raise exception 'Manual entry supplier not linked';end if;
 data:=jsonb_build_object('nome','Fixture compare','items',jsonb_build_array(jsonb_build_object('item_id',a,'quantidade',10),jsonb_build_object('item_id',b,'quantidade',10)),
  'offers',jsonb_build_array(
   jsonb_build_object('supplier_id',s1,'frete',20,'desconto',0,'validade',current_date+10,'prazo_dias',2,'items',jsonb_build_array(jsonb_build_object('item_id',a,'preco_unitario',1),jsonb_build_object('item_id',b,'preco_unitario',3))),
   jsonb_build_object('supplier_id',s2,'frete',0,'desconto',0,'validade',current_date+10,'prazo_dias',3,'items',jsonb_build_array(jsonb_build_object('item_id',a,'preco_unitario',2),jsonb_build_object('item_id',b,'preco_unitario',2))),
   jsonb_build_object('supplier_id',s3,'frete',0,'desconto',0,'validade',current_date+10,'prazo_dias',1,'items',jsonb_build_array(jsonb_build_object('item_id',a,'preco_unitario',0.5)))));
 perform public.purchase_operation(quote,'SAVE',null,data);perform public.purchase_operation(quote,'SAVE',null,data);
 if (select count(*) from public.purchase_rounds where id=quote)<>1 then raise exception 'Save retry duplicate';end if;
 answer:=public.purchase_operation(quote,'DECIDE',0,jsonb_build_object('strategy','TOTAL','request_id',decision));
 if (answer->'decision'->>'total')::numeric<>40 or answer->'decision'->'items'->0->>'supplier_id'<>s2::text then raise exception 'Full basket picked partial supplier or ignored freight';end if;
 perform public.purchase_operation(quote,'DECIDE',0,jsonb_build_object('strategy','TOTAL','request_id',decision));
 begin perform public.purchase_operation(quote,'SAVE',1,data);raise exception 'FAIL: decided quote editable';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 perform public.purchase_operation(split,'SAVE',null,data);
 answer:=public.purchase_operation(split,'DECIDE',0,jsonb_build_object('strategy','ITEM','request_id',gen_random_uuid()));
 if (answer->'decision'->>'total')::numeric<>25 then raise exception 'Per item comparison incorrect';end if;
 perform public.purchase_operation(invalid,'SAVE',null,data);
 begin perform public.purchase_operation(invalid,'SAVE',8,data||'{"nome":"Stale"}');raise exception 'FAIL: stale quote overwrote';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 update public.suppliers set ativo=false where id in(s1,s2,s3);
 begin perform public.purchase_operation(invalid,'DECIDE',0,jsonb_build_object('strategy','TOTAL','request_id',gen_random_uuid()));raise exception 'FAIL: inactive suppliers chosen';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 begin update public.stock_item_suppliers set supplier_id=s2 where stock_item_id=b;raise exception 'FAIL: direct supplier link edit';exception when insufficient_privilege then null;end;
 begin update public.low_stock_alerts set ativo=false where stock_item_id=b;raise exception 'FAIL: direct alert edit';exception when insufficient_privilege then null;end;
 begin update public.purchase_rounds set decision='{}' where id=quote;raise exception 'FAIL: forged decision';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);end $$;
set local role authenticated;
do $$begin
 if exists(select 1 from public.purchase_rounds) or exists(select 1 from public.low_stock_alerts) or exists(select 1 from public.stock_item_suppliers) then raise exception 'Unauthorized purchase read';end if;
 begin perform public.purchase_operation(gen_random_uuid(),'SAVE',null,'{}');raise exception 'FAIL: unauthorized purchase';exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'Purchase supplier links, alert lifecycle, safe retries, full/partial comparison, freight, permissions and immutable decisions passed' as result;
