begin;
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
declare item uuid; note uuid:=gen_random_uuid(); payable uuid:=gen_random_uuid(); xml_note uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); header jsonb; lines jsonb; original_xml text; before_count bigint;
begin
 insert into public.stock_items(nome,unidade) values('Fixture adjustment cola','UN') returning id into item;
 header:='{"numero":"910998","serie":"1","emitente_nome":"Fixture adjustment supplier","emitente_documento":"12345678000195","emitida_em":"2026-01-01T13:00:00Z","total":109,"frete":10,"descontos":3,"impostos":4,"acrescimos":2}';
 lines:=jsonb_build_array(jsonb_build_object('n_item',1,'stock_item_id',item,'descricao','Cola packs','unidade','PCT','quantidade_nf',2,'valor_unitario',48,'valor_total',96,'quantidade',2,'fator',12));
 perform public.record_manual_stock_invoice(note,header,lines);
 if not exists(select 1 from public.stock_invoices where id=note and frete=10 and descontos=3 and impostos=4 and acrescimos=2 and total=109) then raise exception 'Manual adjustments were not saved';end if;
 perform public.record_manual_stock_invoice(note,header,lines);
 begin perform public.record_manual_stock_invoice(note,header||'{"frete":11}',lines);raise exception 'FAIL: retry changed adjustment';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 if (select saldo from public.stock_items where id=item)<>24 then raise exception 'Fees changed stock quantity';end if;
 perform public.save_supplier_payable(payable,note,jsonb_build_object('fornecedor_nome','Fixture adjustment supplier','descricao','Original','total',109,'parcelas',jsonb_build_array(jsonb_build_object('numero',1,'vencimento','2026-11-01','valor',109))));
 header:=header||'{"total":120,"frete":21}';
 perform public.edit_stock_invoice(note,1,req,header,lines);
 if (select frete from public.stock_invoices where id=note)<>21 or (select total from public.supplier_payables where id=payable)<>120 or (select sum(valor) from public.supplier_payable_installments where payable_id=payable)<>120 then raise exception 'Adjustment edit or financial total failed';end if;
 perform public.edit_stock_invoice(note,1,req,header,lines);
 select count(*) into before_count from public.stock_movements;
 begin perform public.edit_stock_invoice(note,2,gen_random_uuid(),header||'{"descontos":-1}',lines);raise exception 'FAIL: negative adjustment';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 if (select count(*) from public.stock_movements)<>before_count then raise exception 'Invalid adjustment partially applied';end if;
 original_xml:=replace(replace(pg_temp.fixture_nfe(919002),'<vNF>96.00</vNF>','<vFrete>10.00</vFrete><vDesc>3.00</vDesc><vIPI>4.00</vIPI><vOutro>2.00</vOutro><vICMS>20.00</vICMS><vTotTrib>25.00</vTotTrib><vNF>109.00</vNF>'),'<vTotTrib>1.23</vTotTrib>','<vTotTrib>1.23</vTotTrib><PISST><vPIS>2.00</vPIS><indSomaPISST>0</indSomaPISST></PISST>');
 perform public.import_stock_invoice(xml_note,original_xml,jsonb_build_array(jsonb_build_object('n_item',1,'stock_item_id',item,'quantidade',2,'fator',12)));
 if not exists(select 1 from public.stock_invoices where id=xml_note and frete=10 and descontos=3 and impostos=4 and acrescimos=2 and xml_original=original_xml) then raise exception 'XML adjustments missing or included taxes counted twice';end if;
end $$;
reset role;rollback;
select 'Manual and XML adjustments, retries, financial synchronization, validation and included-tax exclusion passed; fixtures reverted' as resultado;
