begin;
create function pg_temp.fixture_nfe(n integer,items integer default 1) returns text language plpgsql as $fixture$
declare base text:='2926011234567800019555001'||lpad(n::text,9,'0')||'1'||'00000001'; key text; s integer:=0; w integer:=2; i integer; lines text:='';
begin
 for i in reverse 43..1 loop s:=s+substring(base from i for 1)::integer*w;w:=case when w=9 then 2 else w+1 end;end loop;
 key:=base||case when s%11<2 then 0 else 11-s%11 end;
 for i in 1..items loop lines:=lines||format('<det nItem="%s"><prod><cProd>COLA-%s</cProd><xProd>Cola pacote %s</xProd><uCom>PCT</uCom><qCom>2.0000</qCom><vUnCom>48.00</vUnCom><vProd>96.00</vProd></prod><imposto><vTotTrib>1.23</vTotTrib></imposto></det>',i,i,i);end loop;
 return format('<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe%s"><ide><mod>55</mod><tpAmb>1</tpAmb><nNF>%s</nNF><serie>1</serie><dhEmi>2026-01-01T10:30:00-03:00</dhEmi></ide><emit><CNPJ>12345678000195</CNPJ><xNome>Fixture supplier &amp; Drinks</xNome></emit><dest><CNPJ>98765432000100</CNPJ><xNome>Fixture customer</xNome></dest>%s<total><ICMSTot><vNF>%s.00</vNF></ICMSTot></total></infNFe></NFe><protNFe><infProt><tpAmb>1</tpAmb><chNFe>%s</chNFe><cStat>100</cStat></infProt></protNFe></nfeProc>',key,n,lines,items*96,key);
end $fixture$;
do $$begin perform set_config('request.jwt.claim.sub',(select id::text from auth.users where lower(email)='dejandrea@gmail.com'),true);end $$;
set local role authenticated;
do $$
declare item jsonb;stock uuid;product uuid;note uuid:=gen_random_uuid();older uuid:=gen_random_uuid();entry uuid:=gen_random_uuid();xml_note uuid:=gen_random_uuid();xml_text text;header jsonb;lines jsonb;goods jsonb;standalone uuid;
begin
 item:=public.save_registered_item(gen_random_uuid(),null,null,'{"produto":true,"insumo":true,"product":{"nome":"Purchase cost fixture","unidade":"UN","preco_venda":7},"stock":{},"components":[],"suppliers":[]}');
 stock:=(item->'stock'->>'id')::uuid;product:=(item->'product'->>'id')::uuid;
 header:=jsonb_build_object('numero',(100000000+floor(random()*800000000))::integer::text,'serie','99','emitente_nome','Cost supplier','emitente_documento','12345678000195','emitida_em','2026-01-01T12:00:00Z','total',96);
 lines:=jsonb_build_array(jsonb_build_object('n_item',1,'stock_item_id',stock,'descricao','Packages','unidade','PCT','quantidade_nf',2,'valor_unitario',48,'valor_total',96,'quantidade',2,'fator',12));
 perform public.record_manual_stock_invoice(note,header,lines,'2026-01-02T12:00:00Z');
 if (select custo from public.products where id=product)<>4 then raise exception 'Package cost was not converted to base units';end if;
 perform public.record_manual_stock_invoice(older,header||jsonb_build_object('numero',(100000000+floor(random()*800000000))::integer::text,'total',48),jsonb_set(lines,'{0,valor_total}','48'),'2026-01-01T12:00:00Z');
 if (select custo from public.products where id=product)<>4 then raise exception 'Retroactive entry replaced latest cost';end if;
 perform public.edit_stock_invoice(note,(select revision from public.stock_invoices where id=note),gen_random_uuid(),header||'{"total":120}',jsonb_set(lines,'{0,valor_total}','120'));
 if (select custo from public.products where id=product)<>5 then raise exception 'Invoice edit did not update cost';end if;
 perform public.record_stock_entry(entry,stock,2,12,'Precise manual entry','2026-01-04T12:00:00Z',null,2.962944);
 if (select custo from public.products where id=product)<>0.123456 then raise exception 'Manual entry lost six-decimal cost';end if;
 xml_text:=pg_temp.fixture_nfe((100000000+floor(random()*800000000))::integer);
 perform public.import_stock_invoice(xml_note,xml_text,jsonb_build_array(jsonb_build_object('n_item',1,'stock_item_id',stock,'quantidade',2,'fator',12)),'2026-01-05T12:00:00Z');
 if (select custo from public.products where id=product)<>4 or (select preco_venda from public.products where id=product)<>7 then raise exception 'XML cost or sale price incorrect';end if;
 update public.products set custo=9 where id=product;
 perform public.import_stock_invoice(xml_note,xml_text,jsonb_build_array(jsonb_build_object('n_item',1,'stock_item_id',stock,'quantidade',2,'fator',12)),'2026-01-05T12:00:00Z');
 if (select custo from public.products where id=product)<>9 then raise exception 'Retry unexpectedly overwrote manual cost';end if;
 -- Creating a product linked to previously received stock fills its missing cost.
 insert into public.stock_items(nome,unidade) values('Cost stock before product','UN') returning id into standalone;
 perform public.record_stock_entry(gen_random_uuid(),standalone,2,1,'Before registration','2026-01-01T12:00:00Z',null,6.246912);
 item:=public.save_registered_item(gen_random_uuid(),null,(select codigo_insumo from public.stock_items where id=standalone),'{"produto":true,"insumo":true,"product":{"nome":"Cost stock before product","unidade":"UN","preco_venda":7},"stock":{},"components":[],"suppliers":[]}');
 if (select custo from public.products where stock_item_id=standalone)<>3.123456 then raise exception 'Existing-stock registration missed purchase cost';end if;
 goods:=public.save_registered_item(gen_random_uuid(),null,null,'{"produto":true,"insumo":true,"supply_mode":"PRODUCTION","product":{"nome":"Cost produced fixture","unidade":"UN","custo":8,"preco_venda":10},"stock":{},"components":[],"suppliers":[]}');
 perform public.record_stock_entry(gen_random_uuid(),(goods->'stock'->>'id')::uuid,1,1,'Produced goods purchased','2026-01-01T12:00:00Z',null,2);
 if (select custo from public.products where id=(goods->'product'->>'id')::uuid)<>8 then raise exception 'Purchase overwrote production cost';end if;
end $$;
reset role;
do $$begin
 if has_function_privilege('authenticated','app_private.refresh_purchase_item_cost(uuid[])','EXECUTE') or has_function_privilege('anon','app_private.latest_stock_purchase_cost(uuid)','EXECUTE') then raise exception 'Internal cost function exposed';end if;
end $$;
rollback;
