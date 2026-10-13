alter table public.stock_invoices
 add column frete numeric(18,2) not null default 0 check(frete>=0),
 add column descontos numeric(18,2) not null default 0 check(descontos>=0),
 add column impostos numeric(18,2) not null default 0 check(impostos>=0),
 add column acrescimos numeric(18,2) not null default 0 check(acrescimos>=0);
create function app_private.invoice_adjustments(p_header jsonb) returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare key text; value numeric; output jsonb:='{}';
begin
 foreach key in array array['frete','descontos','impostos','acrescimos'] loop
  if coalesce(p_header->>key,'0') !~ '^[0-9]+(\.[0-9]{1,2})?$' then raise exception 'Valor inválido em %.',key;end if;
  value:=coalesce(p_header->>key,'0')::numeric;
  if value>999999999999.99 then raise exception 'Valor fora do limite em %.',key;end if;
  output:=output||jsonb_build_object(key,value);
 end loop;return output;
end $$;
revoke all on function app_private.invoice_adjustments(jsonb) from public,anon,authenticated;
create function app_private.xml_invoice_adjustments(p_xml text) returns jsonb language sql immutable security invoker set search_path='' as $$
 select jsonb_build_object('frete',coalesce(frete,0),'descontos',coalesce(desconto,0)+coalesce(desoneracao,0),
 'impostos',coalesce(st,0)+coalesce(fcpst,0)+coalesce(ii,0)+coalesce(ipi,0)+coalesce(ipidevol,0)+coalesce(mono,0)+coalesce(pisst,0)+coalesce(cofinsst,0),
 'acrescimos',coalesce(seguro,0)+coalesce(outros,0)+coalesce(servicos,0))
 from xmltable(xmlnamespaces('http://www.portalfiscal.inf.br/nfe' as n),'/n:nfeProc/n:NFe/n:infNFe'
 passing xmlparse(document regexp_replace(p_xml,'^\s*<\?xml[^?]*\?>','','i')) columns
 frete numeric path 'n:total/n:ICMSTot/n:vFrete',desconto numeric path 'n:total/n:ICMSTot/n:vDesc',desoneracao numeric path 'n:total/n:ICMSTot/n:vICMSDeson',
 st numeric path 'n:total/n:ICMSTot/n:vST',fcpst numeric path 'n:total/n:ICMSTot/n:vFCPST',ii numeric path 'n:total/n:ICMSTot/n:vII',ipi numeric path 'n:total/n:ICMSTot/n:vIPI',ipidevol numeric path 'n:total/n:ICMSTot/n:vIPIDevol',mono numeric path 'n:total/n:ICMSTot/n:vICMSMonoReten',
 pisst numeric path 'sum(n:det/n:imposto/n:PISST[n:indSomaPISST="1"]/n:vPIS)',cofinsst numeric path 'sum(n:det/n:imposto/n:COFINSST[n:indSomaCOFINSST="1"]/n:vCOFINS)',
 seguro numeric path 'n:total/n:ICMSTot/n:vSeg',outros numeric path 'n:total/n:ICMSTot/n:vOutro',servicos numeric path 'n:total/n:ISSQNtot/n:vServ');
$$;
revoke all on function app_private.xml_invoice_adjustments(text) from public,anon,authenticated;
create function app_private.set_xml_invoice_adjustments() returns trigger language plpgsql security definer set search_path='' as $$
declare fees jsonb;
begin
 if new.origem='XML' then
  fees:=app_private.xml_invoice_adjustments(new.xml_original);
  new.frete:=(fees->>'frete')::numeric;new.descontos:=(fees->>'descontos')::numeric;new.impostos:=(fees->>'impostos')::numeric;new.acrescimos:=(fees->>'acrescimos')::numeric;
 end if;return new;
end $$;
revoke all on function app_private.set_xml_invoice_adjustments() from public,anon,authenticated;
create trigger invoice_xml_adjustments before insert on public.stock_invoices for each row execute function app_private.set_xml_invoice_adjustments();
-- Existing XMLs are decoded/validated at import and remain immutable original documents.
update public.stock_invoices n set frete=(a.fees->>'frete')::numeric,descontos=(a.fees->>'descontos')::numeric,impostos=(a.fees->>'impostos')::numeric,acrescimos=(a.fees->>'acrescimos')::numeric
 from (select id,app_private.xml_invoice_adjustments(xml_original) fees from public.stock_invoices where origem='XML') a where n.id=a.id;
-- Normalize historical retry payloads to preserve requests that predate these fields.
update public.stock_movements m set payload=jsonb_set(m.payload,'{header}',(m.payload->'header')||jsonb_build_object('frete',0,'descontos',0,'impostos',0,'acrescimos',0)) from public.stock_invoices n where n.id=m.invoice_id and n.origem='MANUAL' and m.payload ? 'header';
update public.stock_invoices set last_edit=jsonb_set(last_edit,'{header}',(last_edit->'header')||jsonb_build_object('frete',0,'descontos',0,'impostos',0,'acrescimos',0)) where last_edit is not null;
-- Extend the canonical header so retries also compare the four adjustment values.
do $$declare sig text;definition text;updated text;begin
 foreach sig in array array['app_private.record_manual_stock_invoice(uuid,jsonb,jsonb,timestamp with time zone,text)','app_private.edit_stock_invoice(uuid,integer,uuid,jsonb,jsonb,timestamp with time zone,text)'] loop
  definition:=pg_get_functiondef(sig::regprocedure);
  updated:=replace(definition,' select * into h from jsonb_to_record(p_header)',' p_header:=p_header||app_private.invoice_adjustments(p_header);'||chr(10)||' select * into h from jsonb_to_record(p_header)');
  updated:=replace(updated,'destinatario_documento text);','destinatario_documento text,frete numeric,descontos numeric,impostos numeric,acrescimos numeric);');
  if sig like '%record_manual%' then
   updated:=replace(updated,'actor_id,origem)','actor_id,origem,frete,descontos,impostos,acrescimos)');
   updated:=replace(updated,'actor,''MANUAL'');','actor,''MANUAL'',h.frete,h.descontos,h.impostos,h.acrescimos);');
  else
   updated:=replace(updated,'revision=revision+1,last_edit=edit','frete=h.frete,descontos=h.descontos,impostos=h.impostos,acrescimos=h.acrescimos,revision=revision+1,last_edit=edit');
  end if;
  if updated=definition or position('h.frete' in updated)=0 then raise exception 'Invoice RPC patch failed for %',sig;end if;
  execute updated;
 end loop;
end $$;
notify pgrst,'reload schema';
