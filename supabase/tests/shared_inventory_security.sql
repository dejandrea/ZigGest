begin;
do $$ begin perform set_config('request.jwt.claim.sub',(select id::text from auth.users where lower(email)='dejandrea@gmail.com'),true); end $$;
set local role authenticated;
do $$
declare cola uuid; bread uuid; unit_product jsonb; pack_product jsonb; recipe_product jsonb; request uuid:=gen_random_uuid(); movement jsonb; before_count bigint;
begin
 insert into public.stock_items(nome,unidade) values('Fixture Coca lata','UN') returning id into cola;
 insert into public.stock_items(nome,unidade) values('Fixture Pao','UN') returning id into bread;
 unit_product:=public.save_product_with_stock(null,'{"nome":"Fixture Coca unitaria","preco_venda":5}',jsonb_build_array(jsonb_build_object('stock_item_id',cola,'quantidade',1)));
 pack_product:=public.save_product_with_stock(null,'{"nome":"Fixture Pack 12","preco_venda":48}',jsonb_build_array(jsonb_build_object('stock_item_id',cola,'quantidade',12)));
 movement:=public.record_stock_movement(request,'ENTRADA',cola,null,12,12,'Fixture 12 packs de 12');
 if (select saldo from public.stock_items where id=cola)<>144 then raise exception '12 packs nao converteram para 144'; end if;
 perform public.record_stock_movement(request,'ENTRADA',cola,null,12,12,'Fixture 12 packs de 12');
 if (select saldo from public.stock_items where id=cola)<>144 or (select count(*) from public.stock_movements where id=request)<>1 then raise exception 'Retry duplicou entrada'; end if;
 begin
  perform public.record_stock_movement(request,'ENTRADA',cola,null,13,12,'Fixture 12 packs de 12');
  raise exception 'FAIL: pedido reutilizado alterado';
 exception when raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;
 perform public.record_stock_movement(gen_random_uuid(),'SAIDA',null,(unit_product->>'codigo_produto')::bigint,2,1,'Fixture 2 latas');
 perform public.record_stock_movement(gen_random_uuid(),'SAIDA',null,(pack_product->>'codigo_produto')::bigint,1,1,'Fixture 1 pack');
 if (select saldo from public.stock_items where id=cola)<>130 then raise exception 'Saldo compartilhado deveria ser 130'; end if;
 recipe_product:=public.save_product_with_stock(null,'{"nome":"Fixture receita"}',jsonb_build_array(jsonb_build_object('stock_item_id',cola,'quantidade',1),jsonb_build_object('stock_item_id',bread,'quantidade',1)));
 select count(*) into before_count from public.stock_movements;
 begin
  perform public.record_stock_movement(gen_random_uuid(),'SAIDA',null,(recipe_product->>'codigo_produto')::bigint,1,1,'Fixture sem pao');
  raise exception 'FAIL: saida sem saldo';
 exception when raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;
 if (select saldo from public.stock_items where id=cola)<>130 or (select saldo from public.stock_items where id=bread)<>0 or (select count(*) from public.stock_movements)<>before_count then raise exception 'Saida parcial nao reverteu'; end if;
 begin
  perform public.save_product_with_stock((pack_product->>'codigo_produto')::bigint,'{"nome":"Nao persistir"}',jsonb_build_array(jsonb_build_object('stock_item_id',cola,'quantidade',0)));
  raise exception 'FAIL: fator zero aceito';
 exception when raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;
 if (select nome from public.products where id=(pack_product->>'id')::uuid)<>'Fixture Pack 12' or (select quantidade from public.product_components where product_id=(pack_product->>'id')::uuid)<>12 then raise exception 'Produto/composicao nao foram atomicos'; end if;
 begin update public.stock_items set saldo=999 where id=cola; raise exception 'FAIL: saldo editavel'; exception when insufficient_privilege then null; end;
 begin update public.stock_items set unidade='KG' where id=cola; raise exception 'FAIL: unidade editavel'; exception when insufficient_privilege then null; end;
 begin delete from public.stock_movements where id=request; raise exception 'FAIL: historico apagavel'; exception when insufficient_privilege then null; end;
 update public.stock_items set ativo=false where id=cola;
 begin perform public.record_stock_movement(gen_random_uuid(),'SAIDA',null,(unit_product->>'codigo_produto')::bigint,1,1,'Inativo'); raise exception 'FAIL: item inativo baixou'; exception when raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;
 if (select saldo from public.stock_items where id=cola)<>130 then raise exception 'Item inativo alterou saldo'; end if;
end $$;
reset role;
do $$ begin perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000000',true); end $$;
set local role authenticated;
do $$ begin
 if exists(select 1 from public.stock_items) or exists(select 1 from public.stock_movements) or exists(select 1 from public.product_components) then raise exception 'Conta nao autorizada leu dados'; end if;
 begin perform public.record_stock_movement(gen_random_uuid(),'ENTRADA',gen_random_uuid(),null,1,1,'Sem acesso'); raise exception 'FAIL: RPC sem acesso'; exception when insufficient_privilege then null; end;
 begin perform public.save_product_with_stock(null,'{"nome":"Sem acesso"}','[]'); raise exception 'FAIL: produto sem acesso'; exception when insufficient_privilege then null; end;
end $$;
reset role;set local role anon;
do $$ begin
 begin perform 1 from public.stock_items; raise exception 'FAIL: anon leu'; exception when insufficient_privilege then null; end;
 begin perform public.record_stock_movement(gen_random_uuid(),'ENTRADA',gen_random_uuid(),null,1,1,'Anon'); raise exception 'FAIL: anon movimentou'; exception when insufficient_privilege then null; end;
end $$;
reset role;rollback;
select 'Estoque compartilhado: 144 -> 130, retry sem duplicacao, receita atomica, saldo/historico/unidade protegidos e acesso bloqueado; fixtures revertidas' as resultado;
