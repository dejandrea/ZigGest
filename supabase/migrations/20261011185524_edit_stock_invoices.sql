alter table public.stock_invoices add column revision integer not null default 1, add column last_edit jsonb;
-- Only this RPC stamps an invoice revision at the top level of the payable payload.
create or replace function app_private.protect_financial_payable() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('payable:'||old.id::text,0));
 if exists(select 1 from public.supplier_payable_installments i join public.financial_operations o on o.parcela_id=i.id where i.payable_id=old.id) and not (
  new.payload ? 'invoice_revision' and new.stock_movement_id=old.stock_movement_id and new.payload->>'invoice_revision' is distinct from old.payload->>'invoice_revision'
  and exists(select 1 from public.stock_movements m join public.stock_invoices n on n.id=m.invoice_id where m.id=new.stock_movement_id and n.revision=(new.payload->>'invoice_revision')::integer)
 ) then raise exception 'Conta com histórico de pagamentos. Estorne e registre os ajustes separadamente.';end if;
 return new;
end $$;
create function app_private.edit_stock_invoice(p_id uuid,p_revision integer,p_request uuid,p_header jsonb,p_lines jsonb,p_ocorrido_em timestamptz default null,p_observacoes text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); h record; l record; stock public.stock_items; n public.stock_invoices; m public.stock_movements; pay public.supplier_payables;
 count_lines integer; correction uuid; delta numeric; supplier uuid; minimum numeric; excess bigint; allocated bigint:=0; cents bigint; share bigint; weight numeric; total_weight numeric; last_id uuid; edit jsonb;
begin
 if actor is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if p_id is null or p_revision is null or p_request is null or jsonb_typeof(p_header) is distinct from 'object' or jsonb_typeof(p_lines) is distinct from 'array' or length(coalesce(p_observacoes,''))>2000 then raise exception 'Dados da nota inválidos.';end if;
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
    r.quantidade_nf is null or not(r.quantidade_nf>0 and r.quantidade_nf<=999999999999.999) or r.quantidade_nf<>round(r.quantidade_nf,4) or
    r.valor_unitario is null or not(r.valor_unitario>=0 and r.valor_unitario<=999999999999.99) or r.valor_unitario<>round(r.valor_unitario,10) or
    r.valor_total is null or not(r.valor_total>=0 and r.valor_total<=999999999999.99) or r.valor_total<>round(r.valor_total,2) or
    r.quantidade is null or not(r.quantidade>0 and r.quantidade<=999999999999.999) or r.quantidade<>round(r.quantidade,3) or
    r.fator is null or not(r.fator>0 and r.fator<=999999999999.999) or r.fator<>round(r.fator,3)) or
   (select count(distinct n_item) from jsonb_to_recordset(p_lines) as r(n_item integer))<>count_lines then raise exception 'Itens ou conversões inválidos.';end if;

 edit:=jsonb_build_object('request',p_request,'actor',actor,'header',p_header,'lines',p_lines,'date',p_ocorrido_em,'notes',p_observacoes);
 select * into n from public.stock_invoices where id=p_id for update;
 if not found then raise exception 'Nota não encontrada.';end if;
 if n.last_edit=edit then return jsonb_build_object('id',p_id,'revision',n.revision);end if;
 if n.revision<>p_revision then raise exception 'Esta nota foi alterada. Reabra a edição para atualizar os dados.';end if;
 if n.origem='XML' and (h.numero::bigint<>n.numero::bigint or h.serie::integer<>n.serie::integer or h.emitente_documento<>n.emitente_documento or h.emitente_nome<>n.emitente_nome or h.emitida_em<>n.emitida_em or coalesce(h.destinatario_nome,'')<>n.destinatario_nome or coalesce(h.destinatario_documento,'')<>n.destinatario_documento) then raise exception 'Dados fiscais do XML original não podem ser alterados.';end if;
 select * into m from public.stock_movements where invoice_id=p_id;
 if not found then raise exception 'Entrada não encontrada.';end if;
 perform pg_advisory_xact_lock(hashtextextended('payable-source:'||m.id::text,0));
 select * into pay from public.supplier_payables where stock_movement_id=m.id;
 if pay.id is not null then
  perform pg_advisory_xact_lock(hashtextextended('payable:'||pay.id::text,0));
  select * into pay from public.supplier_payables where id=pay.id for update;
  select sum(greatest(0.01,coalesce((select sum(o.valor) from public.financial_operations o where o.parcela_id=i.id and o.tipo='PAYMENT' and not exists(select 1 from public.financial_operations r where r.estorno_de=o.id)),0))) into minimum from public.supplier_payable_installments i where i.payable_id=pay.id;
  if h.total<minimum then raise exception 'O total deve cobrir os valores já pagos e manter ao menos R$ 0,01 por parcela. Mínimo: %.',minimum;end if;
 end if;
 perform s.id from public.stock_items s where s.id in(select stock_item_id from public.stock_invoice_items where invoice_id=p_id union select r.stock_item_id from jsonb_to_recordset(p_lines) as r(stock_item_id uuid)) order by s.id for update;
 for l in select * from jsonb_to_recordset(p_lines) as r(n_item integer,stock_item_id uuid,quantidade numeric,fator numeric) loop
  select * into stock from public.stock_items where id=l.stock_item_id;
  if not found or not stock.ativo then raise exception 'Insumo indisponível ou inativo no item %.',l.n_item;end if;
  delta:=l.quantidade*l.fator;
  if delta<>round(delta,3) or not(delta>0 and delta<=999999999999999.999) then raise exception 'Conversão fora da precisão suportada.';end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('invoice-supplier:'||h.emitente_documento,0));
 select id into supplier from public.suppliers where regexp_replace(documento,'[^0-9]','','g')=h.emitente_documento order by codigo_fornecedor limit 1;
 if supplier is null then insert into public.suppliers(nome,documento,ativo) values(h.emitente_nome,h.emitente_documento,true) returning id into supplier;end if;
 -- Apply net differences once, keeping the original entry and all later movements intact.
 correction:=gen_random_uuid();
 insert into public.stock_movements(id,tipo,descricao,quantidade,fator,actor_id,payload,observacoes,ocorrido_em)
 values(correction,'AJUSTE','Correção NF-e '||h.numero||' / '||h.serie,1,1,actor,jsonb_build_object('invoice_id',p_id,'revision',n.revision+1,'before',to_jsonb(n)-'last_edit','before_items',(select jsonb_agg(to_jsonb(i) order by n_item) from public.stock_invoice_items i where invoice_id=p_id),'edit',edit),coalesce(p_observacoes,''),clock_timestamp());
 for l in
  select stock_item_id,sum(qty) delta from (
   select stock_item_id,-quantidade_estoque qty from public.stock_invoice_items where invoice_id=p_id
   union all select r.stock_item_id,r.quantidade*r.fator from jsonb_to_recordset(p_lines) as r(stock_item_id uuid,quantidade numeric,fator numeric)
  ) q group by stock_item_id having sum(qty)<>0 order by stock_item_id
 loop
  insert into public.stock_movement_lines(movement_id,stock_item_id,nome,unidade,quantidade,saldo_apos,location_id)
  select correction,id,nome,unidade,l.delta,saldo+l.delta,app_private.main_stock_location() from public.stock_items where id=l.stock_item_id;
 end loop;
 delete from public.stock_invoice_items where invoice_id=p_id;
 insert into public.stock_invoice_items(invoice_id,n_item,codigo,descricao,unidade_nf,quantidade_nf,valor_unitario,valor_total,stock_item_id,insumo_nome,unidade_estoque,quantidade_recebida,fator,quantidade_estoque)
 select p_id,r.n_item,coalesce(r.codigo,''),btrim(r.descricao),btrim(r.unidade),r.quantidade_nf,r.valor_unitario,r.valor_total,s.id,s.nome,s.unidade,r.quantidade,r.fator,r.quantidade*r.fator
 from jsonb_to_recordset(p_lines) as r(n_item integer,stock_item_id uuid,descricao text,unidade text,codigo text,quantidade_nf numeric,valor_unitario numeric,valor_total numeric,quantidade numeric,fator numeric) join public.stock_items s on s.id=r.stock_item_id;
 update public.stock_invoices set numero=h.numero,serie=h.serie,emitente_nome=h.emitente_nome,emitente_documento=h.emitente_documento,emitida_em=h.emitida_em,total=h.total,destinatario_nome=coalesce(h.destinatario_nome,''),destinatario_documento=coalesce(h.destinatario_documento,''),revision=revision+1,last_edit=edit where id=p_id;
 update public.stock_movements set descricao='NF-e '||h.numero||' / '||h.serie||' · '||h.emitente_nome,ocorrido_em=coalesce(p_ocorrido_em,m.ocorrido_em),observacoes=coalesce(p_observacoes,''),fornecedor_id=supplier,total_entrada=h.total where id=m.id;
 insert into public.stock_item_suppliers(stock_item_id,supplier_id,origem,ultimo_preco,ultima_entrada)
 select stock_item_id,supplier,'ENTRADA',sum(valor_total)/sum(quantidade_estoque),coalesce(p_ocorrido_em,m.ocorrido_em) from public.stock_invoice_items where invoice_id=p_id group by stock_item_id
 on conflict(stock_item_id,supplier_id) do update set ultimo_preco=excluded.ultimo_preco,ultima_entrada=excluded.ultima_entrada;
 if pay.id is not null then
  -- Preserve installment UUIDs and settled amounts. Redistribute the remaining balance.
  excess:=round((h.total-minimum)*100);
  select sum(greatest(i.valor-coalesce((select sum(o.valor) from public.financial_operations o where o.parcela_id=i.id and o.tipo='PAYMENT' and not exists(select 1 from public.financial_operations r where r.estorno_de=o.id)),0),0)) into total_weight from public.supplier_payable_installments i where payable_id=pay.id;
  select id into last_id from public.supplier_payable_installments where payable_id=pay.id order by numero desc limit 1;
  for l in select i.*,coalesce((select sum(o.valor) from public.financial_operations o where o.parcela_id=i.id and o.tipo='PAYMENT' and not exists(select 1 from public.financial_operations r where r.estorno_de=o.id)),0) paid from public.supplier_payable_installments i where payable_id=pay.id order by numero loop
   weight:=greatest(l.valor-l.paid,0);
   share:=case when l.id=last_id then excess-allocated when total_weight>0 then floor(excess*weight/total_weight) else 0 end;
   allocated:=allocated+share;
   update public.supplier_payable_installments set valor=greatest(l.paid,0.01)+share/100.0 where id=l.id;
  end loop;
  update public.supplier_payables set fornecedor_id=supplier,fornecedor_nome=h.emitente_nome,fornecedor_documento=h.emitente_documento,descricao='NF-e '||h.numero||' / Série '||h.serie,total=h.total,updated_at=clock_timestamp(),payload=jsonb_build_object('invoice_revision',n.revision+1,'source',m.id,'data',payload->'data') where id=pay.id;
 end if;
 return jsonb_build_object('id',m.id,'revision',n.revision+1);
end $$;
create function public.edit_stock_invoice(p_id uuid,p_revision integer,p_request uuid,p_header jsonb,p_lines jsonb,p_ocorrido_em timestamptz default null,p_observacoes text default '') returns jsonb language sql security invoker set search_path='' as $$select app_private.edit_stock_invoice(p_id,p_revision,p_request,p_header,p_lines,p_ocorrido_em,p_observacoes)$$;
revoke all on function app_private.edit_stock_invoice(uuid,integer,uuid,jsonb,jsonb,timestamptz,text),public.edit_stock_invoice(uuid,integer,uuid,jsonb,jsonb,timestamptz,text) from public,anon;
grant execute on function app_private.edit_stock_invoice(uuid,integer,uuid,jsonb,jsonb,timestamptz,text),public.edit_stock_invoice(uuid,integer,uuid,jsonb,jsonb,timestamptz,text) to authenticated;
notify pgrst,'reload schema';
