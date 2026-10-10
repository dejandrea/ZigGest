begin;
-- Synthetic fixtures. All data, functions and stock changes are rolled back.
create function pg_temp.fixture_nfe(n integer,items integer default 1) returns text language plpgsql as $fixture$
declare base text:='2926011234567800019555001'||lpad(n::text,9,'0')||'1'||'00000001'; key text; s integer:=0; w integer:=2; i integer; lines text:='';
begin
 for i in reverse 43..1 loop s:=s+substring(base from i for 1)::integer*w;w:=case when w=9 then 2 else w+1 end;end loop;
 key:=base||case when s%11<2 then 0 else 11-s%11 end;
 for i in 1..items loop lines:=lines||format('<det nItem="%s"><prod><cProd>COLA-%s</cProd><xProd>Cola pacote %s</xProd><uCom>PCT</uCom><qCom>2.0000</qCom><vUnCom>48.00</vUnCom><vProd>96.00</vProd></prod><imposto><vTotTrib>1.23</vTotTrib></imposto></det>',i,i,i);end loop;
 return format('<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe%s"><ide><mod>55</mod><tpAmb>1</tpAmb><nNF>%s</nNF><serie>1</serie><dhEmi>2026-01-01T10:30:00-03:00</dhEmi></ide><emit><CNPJ>12345678000195</CNPJ><xNome>Fixture supplier &amp; Drinks</xNome></emit><dest><CNPJ>98765432000100</CNPJ><xNome>Fixture customer</xNome></dest>%s<total><ICMSTot><vNF>%s.00</vNF></ICMSTot></total></infNFe></NFe><protNFe><infProt><tpAmb>1</tpAmb><chNFe>%s</chNFe><cStat>100</cStat></infProt></protNFe></nfeProc>',key,n,lines,items*96,key);
end $fixture$;
do $$ begin perform set_config('request.jwt.claim.sub',(select id::text from auth.users where lower(email)='dejandrea@gmail.com'),true);end $$;
set local role authenticated;
do $$
declare item uuid; inactive uuid; request uuid:=gen_random_uuid(); req2 uuid:=gen_random_uuid(); xml text:=pg_temp.fixture_nfe(1); doc2 text:=pg_temp.fixture_nfe(2,2); links jsonb; links2 jsonb; product jsonb; before_count bigint; arrival timestamptz:=now()-interval '1 day';
begin
 insert into public.stock_items(nome,unidade) values('Fixture invoice cola','UN') returning id into item;
 insert into public.stock_items(nome,unidade,ativo) values('Fixture inactive','UN',false) returning id into inactive;
 links:=jsonb_build_array(jsonb_build_object('n_item',1,'stock_item_id',item,'quantidade',2,'fator',12));
 links2:=links||jsonb_build_array(jsonb_build_object('n_item',2,'stock_item_id',inactive,'quantidade',2,'fator',12));
 -- A failure on any invoice line must roll back all headers, links and inventory.
 select count(*) into before_count from public.stock_invoices;
 begin perform public.import_stock_invoice(req2,doc2,links2,arrival,'Inactive test');raise exception 'FAIL: inactive mapped item';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 if (select count(*) from public.stock_invoices)<>before_count or (select saldo from public.stock_items where id=item)<>0 or exists(select 1 from public.stock_invoice_items where invoice_id=req2) then raise exception 'Partial invoice persisted';end if;
 begin perform public.import_stock_invoice(gen_random_uuid(),xml,'[]',arrival,'Missing link');raise exception 'FAIL: unmapped item';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 begin perform public.import_stock_invoice(gen_random_uuid(),replace(xml,'<cStat>100','<cStat>110'),links,arrival,'Denied');raise exception 'FAIL: denied invoice';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 begin perform public.import_stock_invoice(gen_random_uuid(),replace(xml,'<tpAmb>1','<tpAmb>2'),links,arrival,'Homologation');raise exception 'FAIL: test invoice';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 begin perform public.import_stock_invoice(gen_random_uuid(),'<!DOCTYPE nfeProc>'||xml,links,arrival,'DOCTYPE');raise exception 'FAIL: entities accepted';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 begin perform public.import_stock_invoice(gen_random_uuid(),xml,links,now()+interval '1 day','Future');raise exception 'FAIL: future entry';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 product:=public.save_product_with_stock(null,'{"nome":"Fixture invoice sale"}',jsonb_build_array(jsonb_build_object('stock_item_id',item,'quantidade',1)));
 perform public.record_stock_movement(gen_random_uuid(),'SAIDA',null,(product->>'codigo_produto')::bigint,5,1,'Sold before invoice');
 perform public.import_stock_invoice(request,xml,links,arrival,'Invoice arrival');
 if (select saldo from public.stock_items where id=item)<>19 then raise exception '2 packs x 12 should reconcile -5 to 19';end if;
 if (select emitente_nome from public.stock_invoices where id=request)<>'Fixture supplier & Drinks' or (select xml_original from public.stock_invoices where id=request)<>xml then raise exception 'Original invoice not preserved';end if;
 if (select ocorrido_em from public.stock_movements where id=request)<>arrival then raise exception 'Retroactive arrival lost';end if;
 perform public.import_stock_invoice(request,xml,links,arrival,'Invoice arrival');
 if (select saldo from public.stock_items where id=item)<>19 then raise exception 'Retry duplicated stock';end if;
 begin perform public.import_stock_invoice(gen_random_uuid(),xml,links,arrival,'Duplicate key');raise exception 'FAIL: duplicate NF-e';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 begin perform public.import_stock_invoice(request,xml,links,arrival-interval '1 day','Invoice arrival');raise exception 'FAIL: changed request';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 -- Two lines mapped to one insumo, one received quantity adjusted: 24+12=36.
 links2:=links||jsonb_build_array(jsonb_build_object('n_item',2,'stock_item_id',item,'quantidade',1,'fator',12));
 perform public.import_stock_invoice(req2,doc2,links2,arrival,'Adjusted quantity');
 if (select saldo from public.stock_items where id=item)<>55 or (select count(*) from public.stock_movement_lines where movement_id=req2)<>1 then raise exception 'Shared mapping not aggregated';end if;
 if not exists(select 1 from public.stock_invoice_items where invoice_id=req2 and n_item=2 and quantidade_nf=2 and quantidade_recebida=1 and quantidade_estoque=12) then raise exception 'Original vs received quantities lost';end if;
 begin update public.stock_invoices set total=1 where id=request;raise exception 'FAIL: invoice editable';exception when insufficient_privilege then null;end;
 begin delete from public.stock_invoice_items where invoice_id=request;raise exception 'FAIL: invoice lines deletable';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000000',true);end $$;
set local role authenticated;
do $$ begin
 if exists(select 1 from public.stock_invoices) or exists(select 1 from public.stock_invoice_items) then raise exception 'Unauthorized invoice access';end if;
 begin perform public.import_stock_invoice(gen_random_uuid(),'not xml','[]');raise exception 'FAIL: unauthorized RPC';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform 1 from public.stock_invoices;raise exception 'FAIL: anon invoice read';exception when insufficient_privilege then null;end;
 begin perform public.import_stock_invoice(gen_random_uuid(),'not xml','[]');raise exception 'FAIL: anon RPC';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'Invoice import passed: 2x12=24, negative reconciliation, adjusted quantities, atomic rollback, safe retries, duplicates and unauthorized access blocked; fixtures reverted' as resultado;
