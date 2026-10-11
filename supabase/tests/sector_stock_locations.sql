begin;
do $$begin perform set_config('request.jwt.claim.sub',(select id::text from auth.users where lower(email)='dejandrea@gmail.com'),true);end $$;
set local role authenticated;
do $$
declare main uuid; kitchen uuid:=gen_random_uuid();item uuid;product jsonb;transfer uuid:=gen_random_uuid();inv uuid:=gen_random_uuid();local_inv uuid:=gen_random_uuid();initial_inv uuid:=gen_random_uuid();lines jsonb;
begin
 select id into main from public.stock_locations where principal;
 perform public.stock_location_operation(kitchen,'{"nome":"Fixture cozinha","ativo":true}');
 insert into public.stock_items(nome,unidade) values('Fixture sector cola','UN') returning id into item;
 perform public.record_stock_movement(gen_random_uuid(),'ENTRADA',item,null,2,12,'Principal entry');
 if (select saldo from public.stock_balances where stock_item_id=item and location_id=main)<>24 then raise exception 'Entry did not reach principal';end if;
 -- Existing principal history does not prevent initializing a new sector.
 perform public.inventory_operation(initial_inv,'OPEN',null,jsonb_build_object('kind','INITIAL','location_id',kitchen,'item_id',item,'descricao','Kitchen initial'));
 perform public.inventory_operation(initial_inv,'SAVE',0,jsonb_build_object('lines',(select jsonb_agg(jsonb_build_object('line_id',id,'contado',0)) from public.stock_inventory_lines where inventory_id=initial_inv)));
 perform public.inventory_operation(initial_inv,'CONFIRM',1,'{}');
 begin perform public.inventory_operation(gen_random_uuid(),'OPEN',null,jsonb_build_object('kind','INITIAL','location_id',kitchen,'item_id',item,'descricao','Repeated initial'));raise exception 'FAIL: initialized sector reused';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 perform public.transfer_stock(transfer,jsonb_build_object('origem_id',main,'destino_id',kitchen,'item_id',item,'quantidade',10));
 perform public.transfer_stock(transfer,jsonb_build_object('origem_id',main,'destino_id',kitchen,'item_id',item,'quantidade',10));
 if (select saldo from public.stock_items where id=item)<>24 or (select saldo from public.stock_balances where stock_item_id=item and location_id=kitchen)<>10 then raise exception 'Transfer or retry changed total';end if;
 begin perform public.transfer_stock(transfer,jsonb_build_object('origem_id',main,'destino_id',kitchen,'item_id',item,'quantidade',9));raise exception 'FAIL: request reused with another quantity';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 product:=public.save_product_with_stock(null,jsonb_build_object('nome','Fixture sector product','stock_location_id',kitchen),jsonb_build_array(jsonb_build_object('stock_item_id',item,'quantidade',1)));
 if (product->>'stock_location_id')::uuid is distinct from kitchen then raise exception 'Product sector was lost';end if;
 perform public.record_stock_movement(gen_random_uuid(),'SAIDA',null,(product->>'codigo_produto')::bigint,12,1,'Kitchen sale');
 if (select saldo from public.stock_balances where stock_item_id=item and location_id=kitchen)<>-2 or (select saldo from public.stock_balances where stock_item_id=item and location_id=main)<>14 then raise exception 'Sale depleted wrong sector';end if;
 update public.stock_items set bloquear_estoque_negativo=true where id=item;
 begin perform public.record_stock_movement(gen_random_uuid(),'SAIDA',null,(product->>'codigo_produto')::bigint,1,1,'Blocked kitchen sale');raise exception 'FAIL: aggregate allowed blocked local sale';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 perform public.inventory_operation(local_inv,'OPEN',null,jsonb_build_object('kind','COUNT','location_id',main,'item_id',item,'descricao','Principal count'));
 perform public.inventory_operation(local_inv,'SAVE',0,jsonb_build_object('lines',(select jsonb_agg(jsonb_build_object('line_id',id,'contado',15)) from public.stock_inventory_lines where inventory_id=local_inv)));
 -- Activity in another sector must not invalidate this count.
 update public.stock_items set bloquear_estoque_negativo=false where id=item;
 perform public.record_stock_movement(gen_random_uuid(),'SAIDA',null,(product->>'codigo_produto')::bigint,1,1,'Independent kitchen sale');
 perform public.inventory_operation(local_inv,'CONFIRM',1,'{}');
 if (select saldo from public.stock_balances where stock_item_id=item and location_id=main)<>15 then raise exception 'Sector count failed';end if;
 perform public.inventory_operation(inv,'OPEN',null,jsonb_build_object('kind','COUNT','item_id',item,'descricao','General sectors'));
 if (select count(*) from public.stock_inventory_lines where inventory_id=inv)<>2 then raise exception 'General count did not split locations';end if;
 select jsonb_agg(jsonb_build_object('line_id',id,'contado',case when location_id=main then 20 else 3 end)) into lines from public.stock_inventory_lines where inventory_id=inv;
 perform public.inventory_operation(inv,'SAVE',0,jsonb_build_object('lines',lines));
 perform public.inventory_operation(inv,'CONFIRM',1,'{}');
 if (select saldo from public.stock_items where id=item)<>23 then raise exception 'Consolidation after general inventory failed';end if;
 begin update public.stock_balances set saldo=500 where stock_item_id=item;raise exception 'FAIL: direct local balance edit';exception when insufficient_privilege then null;end;
 begin perform public.stock_location_operation(main,'{"nome":"Principal","ativo":false}');raise exception 'FAIL: principal deactivated';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
end $$;
reset role;
update app_private.account_directory set role='OPERATOR' where id=(select account_id from public.app_profiles where auth_user_id=auth.uid());
set local role authenticated;
do $$begin
 begin perform public.stock_location_operation(gen_random_uuid(),'{"nome":"Forbidden sector","ativo":true}');raise exception 'FAIL: operator changed locations';exception when insufficient_privilege then null;end;
 perform public.transfer_stock(gen_random_uuid(),jsonb_build_object('origem_id',(select id from public.stock_locations where principal),'destino_id',(select id from public.stock_locations where nome='Fixture cozinha'),'item_id',(select id from public.stock_items where nome='Fixture sector cola'),'quantidade',1));
end $$;
reset role;
do $$begin perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);end $$;
set local role authenticated;
do $$begin
 if exists(select 1 from public.stock_locations) or exists(select 1 from public.stock_balances) then raise exception 'FAIL: unauthorized stock read';end if;
 begin perform public.transfer_stock(gen_random_uuid(),'{}');raise exception 'FAIL: unauthorized transfer';exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'sector entry, conversion, transfer retry, product depletion, local negative blocking, independent and general counts passed' as result;
