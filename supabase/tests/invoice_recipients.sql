begin;
do $$begin perform set_config('request.jwt.claim.sub',(select id::text from auth.users where lower(email)='dejandrea@gmail.com'),true);end $$;
set local role authenticated;
do $$
declare item jsonb;first_id uuid:=gen_random_uuid();second_id uuid:=gen_random_uuid();a uuid;b uuid;h jsonb;lines jsonb;result jsonb;
begin
 item:=public.save_registered_item(gen_random_uuid(),null,null,'{"produto":false,"insumo":true,"product":{},"stock":{"nome":"Fixture recipient stock","unidade":"UN"},"components":[],"suppliers":[]}');
 h:='{"numero":"88771","serie":"99","emitente_nome":"Fixture supplier","emitente_documento":"12345678000195","emitida_em":"2026-01-01T12:00:00Z","total":10,"destinatario_nome":"Fiscal original A","destinatario_documento":"19131243000197"}';
 lines:=jsonb_build_array(jsonb_build_object('n_item',1,'codigo','1','descricao','Fixture stock','unidade','UN','quantidade_nf',1,'valor_unitario',10,'valor_total',10,'stock_item_id',item->'stock'->>'id','quantidade',1,'fator',1));
 result:=public.record_manual_stock_invoice(first_id,h,lines);
 if (select recipient_id from public.stock_invoices where id=first_id) is not null then raise exception 'Unexpected recipient mapping';end if;
 insert into public.invoice_recipients(nome,documento,inscricao_estadual) values('Fixture recipient A','19.131.243/0001-97','00123') returning id into a;
 if (select recipient_id from public.stock_invoices where id=first_id)<>a or (select destinatario_nome from public.stock_invoices where id=first_id)<>'Fiscal original A' then raise exception 'Historical link or fiscal snapshot failed';end if;
 begin update public.invoice_recipients set documento='11111111000191' where id=a;raise exception 'FAIL recipient identity rewrite';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
 begin insert into public.invoice_recipients(nome,documento) values('Fixture duplicate','19131243000197');raise exception 'FAIL duplicate recipient';exception when unique_violation then null;end;
 insert into public.invoice_recipients(nome,documento) values('Fixture recipient B','41.817.328/0001-09') returning id into b;
 result:=public.record_manual_stock_invoice(second_id,h||'{"numero":"88772","destinatario_nome":"Fiscal original B","destinatario_documento":"41817328000109"}',lines);
 if (select recipient_id from public.stock_invoices where id=second_id)<>b then raise exception 'New invoice was not linked';end if;
 update public.invoice_recipients set nome='Fixture recipient renamed' where id=a;
 if (select destinatario_nome from public.stock_invoices where id=first_id)<>'Fiscal original A' then raise exception 'Recipient rename changed fiscal document';end if;
 result:=public.edit_stock_invoice(first_id,(select revision from public.stock_invoices where id=first_id),gen_random_uuid(),h||'{"destinatario_nome":"Fiscal original B","destinatario_documento":"41817328000109"}',lines);
 if (select count(*) from public.stock_invoices where recipient_id=b)<>2 then raise exception 'Editing recipient did not update the link';end if;
 if (select saldo from public.stock_items where id=(item->'stock'->>'id')::uuid)<>2 then raise exception 'Recipient mapping changed stock';end if;
 perform set_config('request.jwt.claim.sub','',true);
 if exists(select 1 from public.invoice_recipients) then raise exception 'Unauthorized recipient read';end if;
 begin insert into public.invoice_recipients(nome,documento) values('Unauthorized','11111111000191');raise exception 'FAIL unauthorized recipient write';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin
 if has_table_privilege('anon','public.invoice_recipients','SELECT') or has_table_privilege('authenticated','public.invoice_recipients','DELETE') or has_column_privilege('authenticated','public.stock_invoices','recipient_id','UPDATE') then raise exception 'Recipient grants are too broad';end if;
end $$;
rollback;
