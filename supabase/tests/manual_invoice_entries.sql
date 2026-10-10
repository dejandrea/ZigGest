begin;
do $$ begin perform set_config('request.jwt.claim.sub',(select id::text from auth.users where lower(email)='dejandrea@gmail.com'),true);end $$;
set local role authenticated;
do $$
declare item uuid; request uuid:=gen_random_uuid(); h jsonb:='{"numero":"123","serie":"1","emitente_nome":"Fixture manual supplier","emitente_documento":"12345678000195","emitida_em":"2026-01-01T10:00:00-03:00","total":96}'; lines jsonb; count_before bigint;
begin
 insert into public.stock_items(nome,unidade) values('Fixture manual cola','UN') returning id into item;
 lines:=jsonb_build_array(jsonb_build_object('n_item',1,'stock_item_id',item,'descricao','Cola packs','unidade','PCT','codigo','','quantidade_nf',2,'valor_unitario',48,'valor_total',96,'quantidade',2,'fator',12));
 perform public.record_manual_stock_invoice(request,h,lines,now()-interval '1 day','Manual entry');
 if (select saldo from public.stock_items where id=item)<>24 then raise exception '2x12 should be 24';end if;
 if not exists(select 1 from public.stock_invoices where id=request and origem='MANUAL' and chave is null and xml_original is null) then raise exception 'Manual source not preserved';end if;
 perform public.record_manual_stock_invoice(request,h,lines,now()-interval '1 day','Manual entry');
 if (select saldo from public.stock_items where id=item)<>24 then raise exception 'Retry duplicated stock';end if;
 begin perform public.record_manual_stock_invoice(gen_random_uuid(),h||'{"numero":"000123","serie":"001"}',lines);raise exception 'FAIL: duplicate manual note';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 begin perform public.record_manual_stock_invoice(request,h||'{"total":97}',lines,now()-interval '1 day','Manual entry');raise exception 'FAIL: changed request';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 select count(*) into count_before from public.stock_invoices;
 update public.stock_items set ativo=false where id=item;
 begin perform public.record_manual_stock_invoice(gen_random_uuid(),h||'{"numero":"124"}',lines);raise exception 'FAIL: inactive item';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 if (select count(*) from public.stock_invoices)<>count_before or (select saldo from public.stock_items where id=item)<>24 then raise exception 'Failed note was partially saved';end if;
 begin perform public.record_manual_stock_invoice(gen_random_uuid(),h||'{"numero":"125"}',lines,now()+interval '1 day');raise exception 'FAIL: future arrival';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 begin update public.stock_invoices set numero='999' where id=request;raise exception 'FAIL: invoice editable';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000000',true);end $$;
set local role authenticated;
do $$ begin
 if exists(select 1 from public.stock_invoices) then raise exception 'Unauthorized read';end if;
 begin perform public.record_manual_stock_invoice(gen_random_uuid(),'{}','[]');raise exception 'FAIL: unauthorized RPC';exception when insufficient_privilege then null;end;
end $$;
reset role;set local role anon;
do $$ begin
 begin perform public.record_manual_stock_invoice(gen_random_uuid(),'{}','[]');raise exception 'FAIL: anon RPC';exception when insufficient_privilege then null;end;
end $$;
reset role;rollback;
select 'Manual invoices: no XML/key, 2x12=24, retry, duplicates, rollback and access protection passed; fixtures reverted' as resultado;
