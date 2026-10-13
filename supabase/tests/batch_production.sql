begin;
do $$begin perform set_config('request.jwt.claim.sub',(select id::text from auth.users where lower(email)='dejandrea@gmail.com'),true);end $$;
set local role authenticated;
do $$
declare flour jsonb;milk jsonb;cup jsonb;small jsonb;large jsonb;fixture_recipe uuid:=gen_random_uuid();batch_id uuid:=gen_random_uuid();request uuid:=gen_random_uuid();recipe jsonb;batch jsonb;body jsonb;input_rows jsonb;output_rows jsonb;origin uuid;tmp jsonb;balance numeric;
begin
 flour:=public.save_registered_item(gen_random_uuid(),null,null,'{"produto":false,"insumo":true,"product":{},"stock":{"nome":"Production fixture flour","unidade":"KG","bloquear_estoque_negativo":true},"components":[],"suppliers":[]}');
 milk:=public.save_registered_item(gen_random_uuid(),null,null,'{"produto":false,"insumo":true,"product":{},"stock":{"nome":"Production fixture milk","unidade":"L"},"components":[],"suppliers":[]}');
 cup:=public.save_registered_item(gen_random_uuid(),null,null,'{"produto":true,"insumo":true,"supply_mode":"PRODUCTION","product":{"nome":"Production fixture cupcake","unidade":"UN","preco_venda":5},"stock":{},"components":[],"suppliers":[]}');
 small:=public.save_registered_item(gen_random_uuid(),null,null,'{"produto":true,"insumo":true,"supply_mode":"PRODUCTION","product":{"nome":"Production fixture small","unidade":"UN"},"stock":{},"components":[],"suppliers":[]}');
 large:=public.save_registered_item(gen_random_uuid(),null,null,'{"produto":true,"insumo":true,"supply_mode":"PRODUCTION","product":{"nome":"Production fixture large","unidade":"UN"},"stock":{},"components":[],"suppliers":[]}');
 if cup->'product'->>'supply_mode'<>'PRODUCTION' then raise exception 'Supply mode missing';end if;
 origin:=gen_random_uuid();perform public.stock_location_operation(origin,'{"nome":"Production fixture kitchen","ativo":true}');
 perform public.record_stock_movement(gen_random_uuid(),'ENTRADA',(flour->'stock'->>'id')::uuid,null,10,1,'Fixture');
 perform public.record_stock_movement(gen_random_uuid(),'ENTRADA',(milk->'stock'->>'id')::uuid,null,10,1,'Fixture');
 perform public.transfer_stock(gen_random_uuid(),jsonb_build_object('origem_id',(select id from public.stock_locations where principal),'destino_id',origin,'item_id',flour->'stock'->>'id','quantidade',10));
 perform public.transfer_stock(gen_random_uuid(),jsonb_build_object('origem_id',(select id from public.stock_locations where principal),'destino_id',origin,'item_id',milk->'stock'->>'id','quantidade',10));
 input_rows:=jsonb_build_array(jsonb_build_object('item_id',flour->'stock'->>'id','quantidade',2,'custo_unitario',5),jsonb_build_object('item_id',milk->'stock'->>'id','quantidade',1,'custo_unitario',3));
 output_rows:=jsonb_build_array(jsonb_build_object('product_id',cup->'product'->>'id','quantidade',10),jsonb_build_object('product_id',small->'product'->>'id','quantidade',3),jsonb_build_object('product_id',large->'product'->>'id','quantidade',1));
 recipe:=public.production_operation(gen_random_uuid(),fixture_recipe,'RECIPE',null,jsonb_build_object('nome','Fixture shared cake batter','inputs',input_rows,'outputs',output_rows));
 body:=jsonb_build_object('recipe_id',fixture_recipe,'multiplier',2,'location_id',origin,'extra_cost',4,'outputs',jsonb_build_array(jsonb_build_object('product_id',cup->'product'->>'id','quantidade',22),jsonb_build_object('product_id',small->'product'->>'id','quantidade',4),jsonb_build_object('product_id',large->'product'->>'id','quantidade',0)));
 batch:=public.production_operation(request,batch_id,'PRODUCE',0,body);
 if (batch->>'total_cost')::numeric<>30 or batch->'outputs'->0->>'previsto'<>'20' then raise exception 'Cost / expected yield failed';end if;
 if public.production_operation(request,batch_id,'PRODUCE',0,body)<>batch then raise exception 'Production retry changed result';end if;
 if (select saldo from public.stock_items where id=(flour->'stock'->>'id')::uuid)<>6 or (select saldo from public.stock_balances where stock_item_id=(flour->'stock'->>'id')::uuid and location_id=origin)<>6 then raise exception 'Wrong ingredient consumption / sector';end if;
 if (select saldo from public.stock_items where id=(cup->'stock'->>'id')::uuid)<>22 or (select saldo from public.stock_items where id=(large->'stock'->>'id')::uuid)<>0 then raise exception 'Wrong finished stock';end if;
 -- Sales consume the finished goods only, never the recipe a second time.
 perform public.record_stock_movement(gen_random_uuid(),'SAIDA',null,(cup->'product'->>'codigo_produto')::bigint,1,1,'Fixture cake sale');
 if (select saldo from public.stock_items where id=(cup->'stock'->>'id')::uuid)<>21 or (select saldo from public.stock_items where id=(flour->'stock'->>'id')::uuid)<>6 then raise exception 'Sale consumed ingredients again';end if;
 begin perform public.production_operation(gen_random_uuid(),batch_id,'REVERSE',null,'{"motivo":"Fixture undo"}');raise exception 'FAIL sold goods undo';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
 -- A failed production must roll back all consumption and output.
 begin perform public.production_operation(gen_random_uuid(),gen_random_uuid(),'PRODUCE',0,body||'{"multiplier":100}');raise exception 'FAIL insufficient ingredients';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
 if (select saldo from public.stock_items where id=(flour->'stock'->>'id')::uuid)<>6 or (select count(*) from public.production_batches where recipe_id=fixture_recipe)<>1 then raise exception 'Failed production partially committed';end if;
 -- Snapshot survives recipe edits; old recipe revision is rejected.
 tmp:=public.production_operation(gen_random_uuid(),fixture_recipe,'RECIPE',0,jsonb_build_object('nome','Fixture edited cake','inputs',input_rows,'outputs',output_rows));
 if (select recipe_nome from public.production_batches where id=batch_id)<>'FIXTURE SHARED CAKE BATTER' then raise exception 'History changed after editing recipe';end if;
 begin perform public.production_operation(gen_random_uuid(),gen_random_uuid(),'PRODUCE',0,body);raise exception 'FAIL stale recipe';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
 perform public.record_stock_movement(gen_random_uuid(),'ENTRADA',(cup->'stock'->>'id')::uuid,null,1,1,'Fixture returned sale');
 tmp:=public.production_operation(gen_random_uuid(),batch_id,'REVERSE',null,'{"motivo":"Fixture correction"}');
 if tmp->>'status'<>'REVERSED' or (select saldo from public.stock_items where id=(flour->'stock'->>'id')::uuid)<>10 or (select saldo from public.stock_items where id=(cup->'stock'->>'id')::uuid)<>0 then raise exception 'Undo did not restore stock';end if;
 -- An existing direct recipe can be converted to stocked production.
 tmp:=public.save_registered_item(gen_random_uuid(),null,null,jsonb_build_object('produto',true,'insumo',false,'product',jsonb_build_object('nome','Production fixture converted','unidade','UN'),'stock','{}'::jsonb,'components',jsonb_build_array(jsonb_build_object('stock_item_id',flour->'stock'->>'id','quantidade',2)),'suppliers','[]'::jsonb));
 tmp:=public.save_registered_item(gen_random_uuid(),(tmp->'product'->>'codigo_produto')::bigint,null,'{"produto":true,"insumo":true,"supply_mode":"PRODUCTION","product":{"nome":"Production fixture converted","unidade":"UN"},"stock":{},"components":[],"suppliers":[]}');
 if tmp->'product'->>'supply_mode'<>'PRODUCTION' or tmp->'product'->'componentes'->0->>'quantidade'<>'1' then raise exception 'Recipe conversion failed';end if;
 -- A signed-in role without an authorized profile cannot register production.
 perform set_config('request.jwt.claim.sub','',true);
 if exists(select 1 from public.production_recipes) or exists(select 1 from public.production_batches) then raise exception 'Unauthorized role can read production data';end if;
 begin perform public.production_operation(gen_random_uuid(),gen_random_uuid(),'RECIPE',null,'{}');raise exception 'FAIL unauthorized production';exception when insufficient_privilege then null;end;
 set constraints all immediate;
end $$;
reset role;
do $$begin
 if has_function_privilege('anon','public.production_operation(uuid,uuid,text,integer,jsonb)','EXECUTE') or has_table_privilege('authenticated','public.production_batches','INSERT') or has_table_privilege('authenticated','app_private.production_requests','SELECT') then raise exception 'Production grants are too broad';end if;
end $$;
rollback;
