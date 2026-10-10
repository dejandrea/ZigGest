create table public.stock_invoices (
 id uuid primary key, chave text unique not null check(chave ~ '^[0-9]{44}$'),
 numero text not null, serie text not null, emitente_nome text not null, emitente_documento text not null,
 destinatario_nome text not null, destinatario_documento text not null,
 emitida_em timestamptz not null, total numeric(18,2) not null check(total>=0),
 xml_original text not null check(octet_length(xml_original)<=2097152),
 actor_id uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create index stock_invoices_actor_idx on public.stock_invoices(actor_id);
create table public.stock_invoice_items (
 id uuid primary key default gen_random_uuid(), invoice_id uuid not null references public.stock_invoices(id),
 n_item integer not null check(n_item between 1 and 990), codigo text not null, descricao text not null,
 unidade_nf text not null, quantidade_nf numeric not null check(quantidade_nf>0),
 valor_unitario numeric not null check(valor_unitario>=0), valor_total numeric not null check(valor_total>=0),
 stock_item_id uuid not null references public.stock_items(id), insumo_nome text not null, unidade_estoque text not null,
 quantidade_recebida numeric(18,3) not null check(quantidade_recebida>0), fator numeric(18,3) not null check(fator>0),
 quantidade_estoque numeric(18,3) not null check(quantidade_estoque>0),
 unique(invoice_id,n_item)
);
create index stock_invoice_items_stock_idx on public.stock_invoice_items(stock_item_id);
alter table public.stock_movements add column invoice_id uuid unique references public.stock_invoices(id);
alter table public.stock_invoices enable row level security;
alter table public.stock_invoice_items enable row level security;
revoke all on public.stock_invoices,public.stock_invoice_items from public,anon,authenticated;
grant select on public.stock_invoices,public.stock_invoice_items to authenticated;
create policy app_invoice_read on public.stock_invoices for select to authenticated
 using ((select app_private.app_role()) in ('MASTER','ADMIN','OPERATOR'));
create policy app_invoice_item_read on public.stock_invoice_items for select to authenticated
 using ((select app_private.app_role()) in ('MASTER','ADMIN','OPERATOR'));

create function app_private.import_stock_invoice(p_request uuid,p_xml text,p_lines jsonb,p_ocorrido_em timestamptz default null,p_observacoes text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); doc xml; header record; protocol record; line record; mapping record; stock public.stock_items;
 payload jsonb; previous public.stock_movements; key text; sum_digits integer:=0; weight integer:=2; digit integer; i integer;
 line_count integer; delta numeric; qty numeric; factor numeric; created uuid;
begin
 if actor is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501'; end if;
 if p_request is null or p_xml is null or octet_length(p_xml)>2097152 or p_xml ~* '<!(DOCTYPE|ENTITY)' or
    jsonb_typeof(p_lines) is distinct from 'array' or length(coalesce(p_observacoes,''))>2000 then raise exception 'Dados da entrada inválidos.'; end if;
 if p_ocorrido_em is not null and (not isfinite(p_ocorrido_em) or p_ocorrido_em>clock_timestamp()) then raise exception 'Data de entrada inválida ou futura.'; end if;
 -- Parse decoded text; retain the complete uploaded XML separately for future consultation.
 doc:=xmlparse(document regexp_replace(p_xml,'^\s*<\?xml[^?]*\?>','','i'));
 if cardinality(xpath('/n:nfeProc/n:NFe/n:infNFe',doc,array[array['n','http://www.portalfiscal.inf.br/nfe']]))<>1 or
    cardinality(xpath('/n:nfeProc/n:protNFe/n:infProt',doc,array[array['n','http://www.portalfiscal.inf.br/nfe']]))<>1 then
  raise exception 'Importe o XML completo da NF-e com protocolo de autorização.';
 end if;
 select * into header from xmltable(xmlnamespaces('http://www.portalfiscal.inf.br/nfe' as n),
  '/n:nfeProc/n:NFe/n:infNFe' passing doc columns
  id text path '@Id', modelo text path 'n:ide/n:mod', ambiente text path 'n:ide/n:tpAmb',
  numero text path 'n:ide/n:nNF', serie text path 'n:ide/n:serie', emitida text path 'n:ide/n:dhEmi',
  emitente text path 'n:emit/n:xNome', emitente_doc text path 'n:emit/n:CNPJ',
  destinatario text path 'n:dest/n:xNome', destinatario_doc text path 'n:dest/n:CNPJ', destinatario_cpf text path 'n:dest/n:CPF',
  total numeric path 'n:total/n:ICMSTot/n:vNF');
 select * into protocol from xmltable(xmlnamespaces('http://www.portalfiscal.inf.br/nfe' as n),
  '/n:nfeProc/n:protNFe/n:infProt' passing doc columns chave text path 'n:chNFe', ambiente text path 'n:tpAmb', status text path 'n:cStat');
 key:=substring(header.id from 4);
 if header.id is null or header.id<>'NFe'||key or key !~ '^[0-9]{44}$' or substring(key from 21 for 2)<>'55' or
    header.modelo is distinct from '55' or protocol.chave is distinct from key then raise exception 'Chave ou modelo da NF-e inválido.'; end if;
 for i in reverse 43..1 loop
  sum_digits:=sum_digits+substring(key from i for 1)::integer*weight;
  weight:=case when weight=9 then 2 else weight+1 end;
 end loop;
 digit:=case when sum_digits%11<2 then 0 else 11-sum_digits%11 end;
 if substring(key from 44)::integer<>digit then raise exception 'Dígito verificador da chave inválido.'; end if;
 if header.ambiente is distinct from '1' or protocol.ambiente is distinct from '1' or coalesce(protocol.status,'') not in ('100','150') then raise exception 'NF-e sem autorização de produção.'; end if;
 if coalesce(header.emitente,'')='' or header.emitente_doc !~ '^[0-9]{14}$' or header.emitente_doc is null or
    substring(key from 7 for 14)<>header.emitente_doc or coalesce(header.destinatario,'')='' or
    coalesce(header.destinatario_doc,header.destinatario_cpf,'') !~ '^([0-9]{14}|[0-9]{11})$' or
    header.numero is null or header.serie is null or header.total is null or not(header.total>=0 and header.total<=9999999999999999.99) or
    header.emitida is null or not isfinite(header.emitida::timestamptz) or header.emitida::timestamptz>clock_timestamp() then
  raise exception 'Cabeçalho da NF-e inválido.';
 end if;
 line_count:=cardinality(xpath('/n:nfeProc/n:NFe/n:infNFe/n:det',doc,array[array['n','http://www.portalfiscal.inf.br/nfe']]));
 if line_count not between 1 and 990 or jsonb_array_length(p_lines)<>line_count then raise exception 'Vincule todos os itens da NF-e.'; end if;
 if exists(select 1 from jsonb_to_recordset(p_lines) as l(n_item integer,stock_item_id uuid,quantidade numeric,fator numeric)
  where l.n_item is null or l.stock_item_id is null or l.quantidade is null or l.fator is null or
   not(l.quantidade>0 and l.quantidade<=999999999999.999) or l.quantidade<>round(l.quantidade,3) or
   not(l.fator>0 and l.fator<=999999999999.999) or l.fator<>round(l.fator,3)) or
  (select count(distinct n_item) from jsonb_to_recordset(p_lines) as l(n_item integer))<>line_count then raise exception 'Vínculos ou quantidades inválidos.'; end if;
 -- Normalize order and allowed fields so retry comparison is independent of JSON ordering.
 select jsonb_build_object('xml',p_xml,'lines',jsonb_agg(to_jsonb(l) order by l.n_item),'ocorrido_em',p_ocorrido_em,'observacoes',coalesce(p_observacoes,''))
 into payload from jsonb_to_recordset(p_lines) as l(n_item integer,stock_item_id uuid,quantidade numeric,fator numeric);
 -- Same lock namespace as manual stock movements. A second lock serializes different requests for one NF-e.
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into previous from public.stock_movements where id=p_request;
 if found then
  if previous.actor_id<>actor or previous.payload<>payload then raise exception 'Identificador já utilizado em outra movimentação.'; end if;
  return to_jsonb(previous)-'payload';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('nfe:'||key,0));
 if exists(select 1 from public.stock_invoices where chave=key) then raise exception 'Esta NF-e já foi registrada no estoque.'; end if;
 perform s.id from public.stock_items s join
  (select distinct stock_item_id from jsonb_to_recordset(p_lines) as l(stock_item_id uuid)) l on l.stock_item_id=s.id order by s.id for update of s;
 insert into public.stock_invoices(id,chave,numero,serie,emitente_nome,emitente_documento,destinatario_nome,destinatario_documento,emitida_em,total,xml_original,actor_id)
 values(p_request,key,header.numero,header.serie,header.emitente,header.emitente_doc,header.destinatario,coalesce(header.destinatario_doc,header.destinatario_cpf),header.emitida::timestamptz,header.total,p_xml,actor);
 for line in select * from xmltable(xmlnamespaces('http://www.portalfiscal.inf.br/nfe' as n),
  '/n:nfeProc/n:NFe/n:infNFe/n:det' passing doc columns n_item integer path '@nItem', codigo text path 'n:prod/n:cProd',
  descricao text path 'n:prod/n:xProd', unidade text path 'n:prod/n:uCom', quantidade numeric path 'n:prod/n:qCom',
  valor_unitario numeric path 'n:prod/n:vUnCom', valor_total numeric path 'n:prod/n:vProd') loop
  select * into mapping from jsonb_to_recordset(p_lines) as l(n_item integer,stock_item_id uuid,quantidade numeric,fator numeric) where l.n_item=line.n_item;
  if not found then raise exception 'Item % sem vínculo de estoque.',line.n_item; end if;
  select * into stock from public.stock_items where id=mapping.stock_item_id;
  if not found or not stock.ativo then raise exception 'Insumo indisponível ou inativo no item %.',line.n_item; end if;
  qty:=mapping.quantidade;factor:=mapping.fator;delta:=qty*factor;
  if delta<>round(delta,3) or delta>999999999999999.999 or delta<=0 then raise exception 'Conversão fora da precisão suportada no item %.',line.n_item; end if;
  if line.quantidade is null or not(line.quantidade>0 and line.quantidade<=999999999999.9999) or
     line.valor_unitario is null or not(line.valor_unitario>=0 and line.valor_unitario<=999999999999.9999999999) or
     line.valor_total is null or not(line.valor_total>=0 and line.valor_total<=999999999999.99) or
     coalesce(line.codigo,'')='' or coalesce(line.descricao,'')='' or coalesce(line.unidade,'')='' then raise exception 'Item da NF-e inválido.'; end if;
  insert into public.stock_invoice_items(invoice_id,n_item,codigo,descricao,unidade_nf,quantidade_nf,valor_unitario,valor_total,stock_item_id,insumo_nome,unidade_estoque,quantidade_recebida,fator,quantidade_estoque)
  values(p_request,line.n_item,line.codigo,line.descricao,line.unidade,line.quantidade,line.valor_unitario,line.valor_total,stock.id,stock.nome,stock.unidade,qty,factor,delta);
 end loop;
 insert into public.stock_movements(id,tipo,descricao,quantidade,fator,actor_id,payload,observacoes,ocorrido_em,invoice_id)
 values(p_request,'ENTRADA','NF-e '||header.numero||' / '||header.serie||' · '||header.emitente,1,1,actor,payload,coalesce(p_observacoes,''),coalesce(p_ocorrido_em,clock_timestamp()),p_request) returning id into created;
 -- Several invoice products can feed the same insumo. Aggregate before updating its balance.
 for mapping in select stock_item_id,sum(quantidade_estoque) as delta from public.stock_invoice_items where invoice_id=p_request group by stock_item_id order by stock_item_id loop
  update public.stock_items set saldo=saldo+mapping.delta where id=mapping.stock_item_id returning * into stock;
  insert into public.stock_movement_lines(movement_id,stock_item_id,nome,unidade,quantidade,saldo_apos)
  values(created,stock.id,stock.nome,stock.unidade,mapping.delta,stock.saldo);
 end loop;
 return (select to_jsonb(m)-'payload' from public.stock_movements m where id=created);
end $$;
revoke all on function app_private.import_stock_invoice(uuid,text,jsonb,timestamptz,text) from public,anon;
grant execute on function app_private.import_stock_invoice(uuid,text,jsonb,timestamptz,text) to authenticated;
create function public.import_stock_invoice(p_request uuid,p_xml text,p_lines jsonb,p_ocorrido_em timestamptz default null,p_observacoes text default '') returns jsonb
language sql security invoker set search_path='' as $$select app_private.import_stock_invoice(p_request,p_xml,p_lines,p_ocorrido_em,p_observacoes)$$;
revoke all on function public.import_stock_invoice(uuid,text,jsonb,timestamptz,text) from public,anon;
grant execute on function public.import_stock_invoice(uuid,text,jsonb,timestamptz,text) to authenticated;
