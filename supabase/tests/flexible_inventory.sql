begin;
do $$ begin perform set_config('request.jwt.claim.sub',(select id::text from auth.users where lower(email)='dejandrea@gmail.com'),true); end $$;
set local role authenticated;
do $$
declare item uuid; product jsonb; sale uuid:=gen_random_uuid(); entry uuid:=gen_random_uuid(); arrival timestamptz:=now()-interval '2 days'; before_count bigint;
begin
 insert into public.stock_items(nome,unidade) values('Fixture flexible Coca','UN') returning id into item;
 if (select estoque_minimo is not null or bloquear_estoque_negativo from public.stock_items where id=item) then raise exception 'Optional settings should be disabled'; end if;
 product:=public.save_product_with_stock(null,'{"nome":"Fixture flexible sale"}',jsonb_build_array(jsonb_build_object('stock_item_id',item,'quantidade',1)));
 perform public.record_stock_movement(sale,'SAIDA',null,(product->>'codigo_produto')::bigint,5,1,'Sold before entry');
 if (select saldo from public.stock_items where id=item)<>-5 then raise exception 'Negative stock not allowed'; end if;
 update public.stock_items set bloquear_estoque_negativo=true where id=item;
 select count(*) into before_count from public.stock_movements;
 begin
  perform public.record_stock_movement(gen_random_uuid(),'SAIDA',null,(product->>'codigo_produto')::bigint,1,1,'Blocked sale');
  raise exception 'FAIL: opted-in block ignored';
 exception when raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;
 if (select saldo from public.stock_items where id=item)<>-5 or (select count(*) from public.stock_movements)<>before_count then raise exception 'Blocked sale changed inventory'; end if;
 -- Allow an entry that only partially repairs a negative balance even with blocking enabled.
 perform public.record_stock_movement(entry,'ENTRADA',item,null,2,1,'Backdated arrival',arrival);
 perform public.record_stock_movement(entry,'ENTRADA',item,null,2,1,'Backdated arrival',arrival);
 if (select saldo from public.stock_items where id=item)<>-3 then raise exception 'Entry duplicated or blocked while still negative'; end if;
 if (select ocorrido_em from public.stock_movements where id=entry)<>arrival then raise exception 'Arrival date lost'; end if;
 if (select created_at<=ocorrido_em from public.stock_movements where id=entry) then raise exception 'Registration date overwritten'; end if;
 if (select saldo_apos from public.stock_movement_lines where movement_id=sale)<>-5 then raise exception 'Sale history rewritten'; end if;
 begin
  perform public.record_stock_movement(entry,'ENTRADA',item,null,2,1,'Backdated arrival',arrival-interval '1 hour');
  raise exception 'FAIL: reused request with another date';
 exception when raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;
 begin
  perform public.record_stock_movement(gen_random_uuid(),'ENTRADA',item,null,2,1,'Future arrival',now()+interval '1 day');
  raise exception 'FAIL: future date accepted';
 exception when raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;
 perform public.record_stock_movement(gen_random_uuid(),'ENTRADA',item,null,10,1,'Remaining entry',arrival);
 if (select saldo from public.stock_items where id=item)<>7 then raise exception 'Balance not reconciled'; end if;
 update public.stock_items set estoque_minimo=0 where id=item;
 update public.stock_items set estoque_minimo=null where id=item;
 if (select estoque_minimo from public.stock_items where id=item) is not null then raise exception 'Cannot clear minimum'; end if;
 begin update public.stock_items set saldo=99 where id=item; raise exception 'FAIL: direct balance edit'; exception when insufficient_privilege then null; end;
 begin update public.stock_movements set ocorrido_em=arrival where id=sale; raise exception 'FAIL: history editable'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'Flexible inventory: negative sale, optional block, backdated reconciliation, safe retry and immutable history passed; fixtures rolled back' as resultado;
