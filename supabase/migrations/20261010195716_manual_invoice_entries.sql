alter table public.stock_invoices alter column chave drop not null, alter column xml_original drop not null;
alter table public.stock_invoices add column origem text not null default 'XML' check(origem in ('XML','MANUAL'));
alter table public.stock_invoices add constraint stock_invoice_source_check check(
 (origem='XML' and chave is not null and xml_original is not null) or (origem='MANUAL' and chave is null and xml_original is null));
-- Number and series also identify a note entered before its XML becomes available.
create unique index stock_invoice_identity_key on public.stock_invoices(emitente_documento,
 (coalesce(nullif(ltrim(numero,'0'),''),'0')),(coalesce(nullif(ltrim(serie,'0'),''),'0')));

create function app_private.record_manual_stock_invoice(p_request uuid,p_header jsonb,p_lines jsonb,p_ocorrido_em timestamptz default null,p_observacoes text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); h record; l record; stock public.stock_items; payload jsonb; previous public.stock_movements; identity text; delta numeric; count_lines integer;
begin
 if actor is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if p_request is null or jsonb_typeof(p_header) is distinct from 'object' or jsonb_typeof(p_lines) is distinct from 'array' or length(coalesce(p_observacoes,''))>2000 then raise exception 'Dados da nota inválidos.';end if;
 if p_ocorrido_em is not null and (not isfinite(p_ocorrido_em) or p_ocorrido_em>clock_timestamp()) then raise exception 'Data de entrada inválida ou futura.';end if;
 select * into h from jsonb_to_record(p_header) as r(numero text,serie text,emitente_nome text,emitente_documento text,emitida_em timestamptz,total numeric,destinatario_nome text,destinatario_documento text);
 if h.numero is null or h.numero !~ '^[0-9]{1,9}$' or h.numero::bigint<1 or h.serie is null or h.serie !~ '^[0-9]{1,3}$' or
    length(btrim(coalesce(h.emitente_nome,''))) not between 1 and 200 or h.emitente_documento is null or h.emitente_documento !~ '^([0-9]{11}|[0-9]{14})$' or
    h.emitida_em is null or not isfinite(h.emitida_em) or h.emitida_em>clock_timestamp() or
    h.total is null or not(h.total>=0 and h.total<=999999999999.99) or h.total<>round(h.total,2) or
    length(coalesce(h.destinatario_nome,''))>200 or (coalesce(h.destinatario_documento,'')<>'' and h.destinatario_documento !~ '^([0-9]{11}|[0-9]{14})$') then raise exception 'Preencha os dados obrigatórios da nota.';end if;
 h.numero:=h.numero::bigint::text;h.serie:=h.serie::integer::text;h.emitente_nome:=btrim(h.emitente_nome);
 count_lines:=jsonb_array_length(p_lines);
 if count_lines not between 1 and 990 then raise exception 'Adicione entre 1 e 990 itens.';end if;
 if exists(select 1 from jsonb_to_recordset(p_lines) as r(n_item integer,stock_item_id uuid,descricao text,unidade text,codigo text,quantidade_nf numeric,valor_unitario numeric,valor_total numeric,quantidade numeric,fator numeric)
  where r.n_item is null or r.n_item not between 1 and 990 or r.stock_item_id is null or length(btrim(coalesce(r.descricao,''))) not between 1 and 200 or length(btrim(coalesce(r.unidade,''))) not between 1 and 10 or length(coalesce(r.codigo,''))>100 or
    r.quantidade_nf is null or not(r.quantidade_nf>0 and r.quantidade_nf<=999999999999.999) or r.quantidade_nf<>round(r.quantidade_nf,3) or
    r.valor_unitario is null or not(r.valor_unitario>=0 and r.valor_unitario<=999999999999.99) or r.valor_unitario<>round(r.valor_unitario,2) or
    r.valor_total is null or not(r.valor_total>=0 and r.valor_total<=999999999999.99) or r.valor_total<>round(r.valor_total,2) or
    r.quantidade is null or not(r.quantidade>0 and r.quantidade<=999999999999.999) or r.quantidade<>round(r.quantidade,3) or
    r.fator is null or not(r.fator>0 and r.fator<=999999999999.999) or r.fator<>round(r.fator,3)) or
   (select count(distinct n_item) from jsonb_to_recordset(p_lines) as r(n_item integer))<>count_lines then raise exception 'Itens ou conversões inválidos.';end if;
 select jsonb_build_object('header',to_jsonb(h),'lines',jsonb_agg(to_jsonb(r) order by r.n_item),'ocorrido_em',p_ocorrido_em,'observacoes',coalesce(p_observacoes,'')) into payload
 from jsonb_to_recordset(p_lines) as r(n_item integer,stock_item_id uuid,descricao text,unidade text,codigo text,quantidade_nf numeric,valor_unitario numeric,valor_total numeric,quantidade numeric,fator numeric);
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into previous from public.stock_movements where id=p_request;
 if found then
  if previous.actor_id<>actor or previous.payload<>payload then raise exception 'Identificador já utilizado em outra movimentação.';end if;
  return to_jsonb(previous)-'payload';
 end if;
 identity:=h.emitente_documento||':'||h.numero||':'||h.serie;
 perform pg_advisory_xact_lock(hashtextextended('manual-nfe:'||identity,0));
 if exists(select 1 from public.stock_invoices where emitente_documento=h.emitente_documento and coalesce(nullif(ltrim(numero,'0'),''),'0')=h.numero and coalesce(nullif(ltrim(serie,'0'),''),'0')=h.serie) then raise exception 'Esta nota já foi registrada no estoque.';end if;
 perform s.id from public.stock_items s join (select distinct stock_item_id from jsonb_to_recordset(p_lines) as r(stock_item_id uuid)) r on r.stock_item_id=s.id order by s.id for update of s;
 insert into public.stock_invoices(id,numero,serie,emitente_nome,emitente_documento,destinatario_nome,destinatario_documento,emitida_em,total,actor_id,origem)
 values(p_request,h.numero,h.serie,h.emitente_nome,h.emitente_documento,coalesce(h.destinatario_nome,''),coalesce(h.destinatario_documento,''),h.emitida_em,h.total,actor,'MANUAL');
 for l in select * from jsonb_to_recordset(p_lines) as r(n_item integer,stock_item_id uuid,descricao text,unidade text,codigo text,quantidade_nf numeric,valor_unitario numeric,valor_total numeric,quantidade numeric,fator numeric) order by n_item loop
  select * into stock from public.stock_items where id=l.stock_item_id;
  if not found or not stock.ativo then raise exception 'Insumo indisponível ou inativo no item %.',l.n_item;end if;
  delta:=l.quantidade*l.fator;
  if delta<>round(delta,3) or not(delta>0 and delta<=999999999999999.999) then raise exception 'Conversão fora da precisão suportada.';end if;
  insert into public.stock_invoice_items(invoice_id,n_item,codigo,descricao,unidade_nf,quantidade_nf,valor_unitario,valor_total,stock_item_id,insumo_nome,unidade_estoque,quantidade_recebida,fator,quantidade_estoque)
  values(p_request,l.n_item,coalesce(l.codigo,''),btrim(l.descricao),btrim(l.unidade),l.quantidade_nf,l.valor_unitario,l.valor_total,stock.id,stock.nome,stock.unidade,l.quantidade,l.fator,delta);
 end loop;
 insert into public.stock_movements(id,tipo,descricao,quantidade,fator,actor_id,payload,observacoes,ocorrido_em,invoice_id)
 values(p_request,'ENTRADA','NF-e manual '||h.numero||' / '||h.serie||' · '||h.emitente_nome,1,1,actor,payload,coalesce(p_observacoes,''),coalesce(p_ocorrido_em,clock_timestamp()),p_request);
 for l in select stock_item_id,sum(quantidade_estoque) as delta from public.stock_invoice_items where invoice_id=p_request group by stock_item_id order by stock_item_id loop
  update public.stock_items set saldo=saldo+l.delta where id=l.stock_item_id returning * into stock;
  insert into public.stock_movement_lines(movement_id,stock_item_id,nome,unidade,quantidade,saldo_apos) values(p_request,stock.id,stock.nome,stock.unidade,l.delta,stock.saldo);
 end loop;
 return (select to_jsonb(m)-'payload' from public.stock_movements m where id=p_request);
end $$;
revoke all on function app_private.record_manual_stock_invoice(uuid,jsonb,jsonb,timestamptz,text) from public,anon;
grant execute on function app_private.record_manual_stock_invoice(uuid,jsonb,jsonb,timestamptz,text) to authenticated;
create function public.record_manual_stock_invoice(p_request uuid,p_header jsonb,p_lines jsonb,p_ocorrido_em timestamptz default null,p_observacoes text default '') returns jsonb
language sql security invoker set search_path='' as $$select app_private.record_manual_stock_invoice(p_request,p_header,p_lines,p_ocorrido_em,p_observacoes)$$;
revoke all on function public.record_manual_stock_invoice(uuid,jsonb,jsonb,timestamptz,text) from public,anon;
grant execute on function public.record_manual_stock_invoice(uuid,jsonb,jsonb,timestamptz,text) to authenticated;
