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
declare item uuid; second_item uuid; sector uuid:=gen_random_uuid(); note uuid:=gen_random_uuid(); payable uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); cash uuid:=gen_random_uuid(); part uuid; method uuid; payment uuid:=gen_random_uuid(); xml_note uuid:=gen_random_uuid(); xml_text text; xml_header jsonb; h jsonb; lines jsonb; before_count bigint;
begin
 insert into public.stock_items(nome,unidade) values('Fixture editable cola','UN') returning id into item;
 h:='{"numero":"713412","serie":"1","emitente_nome":"Fixture edit supplier","emitente_documento":"12345678000195","emitida_em":"2026-01-01T13:00:00Z","total":96}';
 lines:=jsonb_build_array(jsonb_build_object('n_item',1,'stock_item_id',item,'descricao','Cola packs','unidade','PCT','quantidade_nf',2,'valor_unitario',48,'valor_total',96,'quantidade',2,'fator',12));
 perform public.record_manual_stock_invoice(note,h,lines,'2026-01-02T13:00:00Z','Entry');
 perform public.save_supplier_payable(payable,note,jsonb_build_object('fornecedor_nome','Fixture edit supplier','descricao','Original','total',96,'parcelas',jsonb_build_array(jsonb_build_object('numero',1,'vencimento','2026-11-01','valor',48,'forma_pagamento','Pix'),jsonb_build_object('numero',2,'vencimento','2026-12-01','valor',48,'forma_pagamento','Boleto'))));
 select id into part from public.supplier_payable_installments where payable_id=payable and numero=1;
 perform public.finance_config('accounts',cash,'{"nome":"Fixture edit cash","tipo":"CASH","ativo":true,"saldo_inicial":1000,"data":"2026-01-01"}');
 select id into method from public.financial_payment_methods where tipo='CASH' limit 1;
 perform public.finance_operation(payment,jsonb_build_object('tipo','PAYMENT','valor',20,'data','2026-01-03','descricao','Paid installment','conta_id',cash,'forma_id',method,'parcela_id',part));
 h:=h||'{"total":144}';lines:=jsonb_set(jsonb_set(lines,'{0,quantidade}','3'),'{0,valor_total}','144');
 perform public.edit_stock_invoice(note,1,req,h,lines,'2026-01-02T13:00:00Z','Corrected');
 if (select saldo from public.stock_items where id=item)<>36 then raise exception 'Net correction failed';end if;
 if (select total from public.supplier_payables where id=payable)<>144 or (select sum(valor) from public.supplier_payable_installments where payable_id=payable)<>144 then raise exception 'Financial total not synchronized';end if;
 if not exists(select 1 from public.supplier_payable_installments where id=part and vencimento='2026-11-01' and forma_pagamento='Pix' and valor>=20) or not exists(select 1 from public.financial_operations where id=payment and parcela_id=part) then raise exception 'Payment history changed';end if;
 if (select sum(valor) from public.financial_entries where conta_id=cash)<>980 then raise exception 'Editing moved cash';end if;
 select count(*) into before_count from public.stock_movements;
 perform public.edit_stock_invoice(note,1,req,h,lines,'2026-01-02T13:00:00Z','Corrected');
 if (select count(*) from public.stock_movements)<>before_count or (select saldo from public.stock_items where id=item)<>36 then raise exception 'Retry duplicated correction';end if;
 begin perform public.edit_stock_invoice(note,1,gen_random_uuid(),h,lines);raise exception 'FAIL: stale revision';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 begin perform public.edit_stock_invoice(note,2,gen_random_uuid(),h||'{"total":10}',lines);raise exception 'FAIL: below paid';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 if (select revision from public.stock_invoices where id=note)<>2 or (select saldo from public.stock_items where id=item)<>36 then raise exception 'Rejected edit partially changed stock';end if;
 begin perform public.save_supplier_payable(payable,note,jsonb_build_object('fornecedor_nome','Supplier','descricao','Forged','total',10,'invoice_revision',3,'parcelas',jsonb_build_array(jsonb_build_object('numero',1,'vencimento','2026-11-01','valor',10))),true);raise exception 'FAIL: bypassed payable protection';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 update public.stock_items set bloquear_estoque_negativo=true where id=item;
 perform public.stock_location_operation(sector,'{"nome":"Fixture editing sector","ativo":true}');
 perform public.transfer_stock(gen_random_uuid(),jsonb_build_object('origem_id',(select id from public.stock_locations where principal),'destino_id',sector,'item_id',item,'quantidade',34));
 begin perform public.edit_stock_invoice(note,2,gen_random_uuid(),h,jsonb_set(lines,'{0,quantidade}','2'));raise exception 'FAIL: negative principal correction';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;
 if (select revision from public.stock_invoices where id=note)<>2 or (select total from public.supplier_payables where id=payable)<>144 or (select saldo from public.stock_items where id=item)<>36 then raise exception 'Negative correction was partially applied';end if;
 perform public.transfer_stock(gen_random_uuid(),jsonb_build_object('origem_id',sector,'destino_id',(select id from public.stock_locations where principal),'item_id',item,'quantidade',34));
 insert into public.stock_items(nome,unidade) values('Fixture corrected mapping','UN') returning id into second_item;
 perform public.edit_stock_invoice(note,2,gen_random_uuid(),h,jsonb_set(lines,'{0,stock_item_id}',to_jsonb(second_item)));
 if (select saldo from public.stock_items where id=item)<>0 or (select saldo from public.stock_items where id=second_item)<>36 then raise exception 'Changed mapping not reconciled';end if;
 xml_text:=pg_temp.fixture_nfe(913415);
 perform public.import_stock_invoice(xml_note,xml_text,jsonb_build_array(jsonb_build_object('n_item',1,'stock_item_id',item,'quantidade',2,'fator',12)));
 select jsonb_build_object('numero',numero,'serie',serie,'emitente_nome',emitente_nome,'emitente_documento',emitente_documento,'emitida_em',emitida_em,'total',120,'destinatario_nome',destinatario_nome,'destinatario_documento',destinatario_documento) into xml_header from public.stock_invoices where id=xml_note;
 lines:=jsonb_build_array(jsonb_build_object('n_item',1,'stock_item_id',item,'descricao','Cola packs','unidade','PCT','quantidade_nf',2.1234,'valor_unitario',45.123456789,'valor_total',96,'quantidade',1,'fator',12));
 perform public.edit_stock_invoice(xml_note,1,gen_random_uuid(),xml_header,lines);
 if (select saldo from public.stock_items where id=item)<>12 or (select xml_original from public.stock_invoices where id=xml_note)<>xml_text then raise exception 'XML correction changed original or failed stock adjustment';end if;
 if (select valor_unitario from public.stock_invoice_items where invoice_id=xml_note)<>45.123456789 then raise exception 'XML unit price precision lost';end if;
 begin perform public.edit_stock_invoice(xml_note,2,gen_random_uuid(),xml_header||'{"numero":"99"}',lines);raise exception 'FAIL: modified XML identity';exception when raise_exception then if SQLERRM like 'FAIL:%' then raise;end if;end;

end $$;
reset role;
do $$ begin perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000000',true);end $$;
set local role authenticated;
do $$ begin
 begin perform public.edit_stock_invoice(gen_random_uuid(),1,gen_random_uuid(),'{}','[]');raise exception 'FAIL: unauthorized';exception when insufficient_privilege then null;end;
end $$;
reset role;rollback;
select 'Invoice editing, stock differences, financial synchronization, payment preservation, retries and access checks passed; fixtures reverted' as resultado;
