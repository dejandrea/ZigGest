begin;
do $$ begin perform set_config('request.jwt.claim.sub',(select id::text from auth.users where lower(email)='dejandrea@gmail.com'),true);end $$;
set local role authenticated;
do $$
declare request uuid:=gen_random_uuid(); reply jsonb; body jsonb; item uuid; product uuid; code bigint; qty numeric; pack jsonb; ingredient jsonb; cake jsonb; legacy jsonb; linked jsonb;
begin
 body:=jsonb_build_object('produto',true,'insumo',true,'product',jsonb_build_object('nome','Fixture unified cola','unidade','UN','preco_venda',6),'stock',jsonb_build_object('estoque_minimo',10),'components','[]'::jsonb,'suppliers','[]'::jsonb);
 reply:=public.save_registered_item(request,null,null,body);
 item:=(reply->'stock'->>'id')::uuid;product:=(reply->'product'->>'id')::uuid;code:=(reply->'product'->>'codigo_produto')::bigint;
 if reply->'product'->>'nome'<>'FIXTURE UNIFIED COLA' or reply->'product'->>'stock_item_id'<>item::text then raise exception 'Unified registration failed';end if;
 if not exists(select 1 from public.product_components where product_id=product and stock_item_id=item and quantidade=1) then raise exception 'Self recipe is not 1:1';end if;
 if public.save_registered_item(request,null,null,body)<>reply then raise exception 'Retry changed the result';end if;
 begin perform public.save_registered_item(request,null,null,body||'{"insumo":false}');raise exception 'FAIL request reuse';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
 perform public.record_stock_movement(gen_random_uuid(),'ENTRADA',item,null,24,1,'Fixture entry');
 perform public.record_stock_movement(gen_random_uuid(),'SAIDA',null,code,1,1,'Fixture sale');
 if (select saldo from public.stock_items where id=item)<>23 then raise exception 'Unit sale did not consume 1';end if;
 pack:=public.save_registered_item(gen_random_uuid(),null,null,jsonb_build_object('produto',true,'insumo',false,'product',jsonb_build_object('nome','Fixture unified pack','unidade','PCT','preco_venda',60),'stock','{}'::jsonb,'components',jsonb_build_array(jsonb_build_object('stock_item_id',item,'quantidade',12)),'suppliers','[]'::jsonb));
 perform public.record_stock_movement(gen_random_uuid(),'SAIDA',null,(pack->'product'->>'codigo_produto')::bigint,1,1,'Fixture wholesale');
 if (select saldo from public.stock_items where id=item)<>11 then raise exception 'Wholesale did not consume 12';end if;
 ingredient:=public.save_registered_item(gen_random_uuid(),null,null,'{"produto":false,"insumo":true,"product":{},"stock":{"nome":"Fixture flour","unidade":"KG"},"components":[],"suppliers":[]}');
 if ingredient->'product'<>'null'::jsonb then raise exception 'Stock-only item is sellable';end if;
 perform public.record_stock_movement(gen_random_uuid(),'ENTRADA',(ingredient->'stock'->>'id')::uuid,null,10,1,'Fixture ingredients');
 cake:=public.save_registered_item(gen_random_uuid(),null,null,jsonb_build_object('produto',true,'insumo',false,'product',jsonb_build_object('nome','Fixture cake','unidade','UN'),'stock','{}'::jsonb,'components',jsonb_build_array(jsonb_build_object('stock_item_id',item,'quantidade',1),jsonb_build_object('stock_item_id',ingredient->'stock'->>'id','quantidade',0.5)),'suppliers','[]'::jsonb));
 perform public.record_stock_movement(gen_random_uuid(),'SAIDA',null,(cake->'product'->>'codigo_produto')::bigint,2,1,'Fixture recipe');
 if (select saldo from public.stock_items where id=item)<>9 or (select saldo from public.stock_items where id=(ingredient->'stock'->>'id')::uuid)<>9 then raise exception 'Recipe consumption failed';end if;
 legacy:=public.save_registered_item(gen_random_uuid(),null,null,'{"produto":true,"insumo":false,"product":{"nome":"Fixture flour retail","unidade":"KG"},"stock":{},"components":[],"suppliers":[]}');
 linked:=public.save_registered_item(gen_random_uuid(),(legacy->'product'->>'codigo_produto')::bigint,(ingredient->'stock'->>'codigo_insumo')::bigint,'{"produto":true,"insumo":true,"product":{"nome":"Fixture flour linked","unidade":"KG"},"stock":{},"components":[],"suppliers":[]}');
 if linked->'stock'->>'id'<>ingredient->'stock'->>'id' or linked->'product'->>'id'<>legacy->'product'->>'id' or (select saldo from public.stock_items where id=(ingredient->'stock'->>'id')::uuid)<>9 then raise exception 'Linking changed IDs or balances';end if;
 update public.stock_items set nome='Fixture metadata update' where id=item;
 if (select nome from public.products where id=product)<>'Fixture metadata update' then raise exception 'Metadata not synchronised';end if;
 begin perform public.save_registered_item(gen_random_uuid(),code,(reply->'stock'->>'codigo_insumo')::bigint,body||'{"product_updated_at":"2000-01-01T00:00:00Z"}');raise exception 'FAIL stale edit';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
 -- Older recipe editors must not change a direct item's consumption.
 begin
  perform public.save_product_with_stock(code,'{}'::jsonb,jsonb_build_array(jsonb_build_object('stock_item_id',item,'quantidade',2)));
  set constraints all immediate;
  raise exception 'FAIL direct recipe protection';
 exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
 if (select quantidade from public.product_components where product_id=product)<>1 then raise exception 'Rejected edit was not rolled back';end if;
 -- Failure after creating the stock part must roll back the whole registration.
 begin
  perform public.save_registered_item(gen_random_uuid(),null,null,'{"produto":true,"insumo":true,"product":{"nome":"Fixture rollback","unidade":"UN","preco_venda":-1},"stock":{},"components":[],"suppliers":[]}');
  raise exception 'FAIL invalid price';
 exception when check_violation or raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
 if exists(select 1 from public.stock_items where nome='FIXTURE ROLLBACK') then raise exception 'Partial stock registration survived';end if;
 set constraints all immediate;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.save_registered_item(uuid,bigint,bigint,jsonb)','EXECUTE')
  or has_column_privilege('authenticated','public.products','stock_item_id','UPDATE')
  or has_table_privilege('authenticated','app_private.item_registration_requests','SELECT') then raise exception 'Registration grants broadened';end if;
end $$;
rollback;
