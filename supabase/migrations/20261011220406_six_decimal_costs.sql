-- Preserve six decimal places for costs and financial records. Sale prices remain two decimals.
drop view public.v_customer_balance;
alter table public.products alter column custo type numeric;
alter table public.products add constraint products_custo_six_decimals check (custo=round(custo,6));
alter table public.stock_movements alter column total_entrada type numeric;
alter table public.stock_movements add constraint stock_movements_total_entrada_six_decimals check (total_entrada=round(total_entrada,6));
alter table public.stock_invoices alter column total type numeric;
alter table public.stock_invoices add constraint stock_invoices_total_six_decimals check (total=round(total,6));
alter table public.stock_invoices alter column frete type numeric;
alter table public.stock_invoices add constraint stock_invoices_frete_six_decimals check (frete=round(frete,6));
alter table public.stock_invoices alter column descontos type numeric;
alter table public.stock_invoices add constraint stock_invoices_descontos_six_decimals check (descontos=round(descontos,6));
alter table public.stock_invoices alter column impostos type numeric;
alter table public.stock_invoices add constraint stock_invoices_impostos_six_decimals check (impostos=round(impostos,6));
alter table public.stock_invoices alter column acrescimos type numeric;
alter table public.stock_invoices add constraint stock_invoices_acrescimos_six_decimals check (acrescimos=round(acrescimos,6));
alter table public.production_batches alter column extra_cost type numeric;
alter table public.production_batches add constraint production_batches_extra_cost_six_decimals check (extra_cost=round(extra_cost,6));
alter table public.production_batches alter column total_cost type numeric;
alter table public.production_batches add constraint production_batches_total_cost_six_decimals check (total_cost=round(total_cost,6));
alter table public.stock_item_suppliers alter column ultimo_preco type numeric;
alter table public.stock_item_suppliers add constraint stock_item_suppliers_ultimo_preco_six_decimals check (ultimo_preco=round(ultimo_preco,6));
alter table public.financial_operations alter column valor type numeric;
alter table public.financial_operations add constraint financial_operations_valor_six_decimals check (valor=round(valor,6));
alter table public.financial_entries alter column valor type numeric;
alter table public.financial_entries add constraint financial_entries_valor_six_decimals check (valor=round(valor,6));
alter table public.supplier_payables alter column total type numeric;
alter table public.supplier_payables add constraint supplier_payables_total_six_decimals check (total=round(total,6));
alter table public.supplier_payable_installments alter column valor type numeric;
alter table public.supplier_payable_installments add constraint supplier_payable_installments_valor_six_decimals check (valor=round(valor,6));
alter table public.customer_ledger alter column amount type numeric;
alter table public.customer_ledger add constraint customer_ledger_amount_six_decimals check (amount=round(amount,6));
alter table public.customers alter column total_pendente type numeric;
alter table public.customers add constraint customers_total_pendente_six_decimals check (total_pendente=round(total_pendente,6));
create view public.v_customer_balance with (security_invoker=true) as
select c.id customer_id,c.codigo_cliente,c.nome,
coalesce(sum(case when l.entry_type='DEBIT' then l.amount else 0 end),0) total_debitos,
coalesce(sum(case when l.entry_type='CREDIT' then l.amount else 0 end),0) total_creditos,
coalesce(sum(case when l.entry_type='DEBIT' then l.amount else -l.amount end),0) saldo
from public.customers c left join public.customer_ledger l on l.customer_codigo=c.codigo_cliente group by c.id,c.codigo_cliente,c.nome;
revoke all on public.v_customer_balance from public,anon;
grant select on public.v_customer_balance to authenticated;

-- edit_stock_invoice: precision only; authorization and transaction rules preserved.
CREATE OR REPLACE FUNCTION app_private.edit_stock_invoice(p_id uuid, p_revision integer, p_request uuid, p_header jsonb, p_lines jsonb, p_ocorrido_em timestamp with time zone DEFAULT NULL::timestamp with time zone, p_observacoes text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); h record; l record; stock public.stock_items; n public.stock_invoices; m public.stock_movements; pay public.supplier_payables;
 count_lines integer; correction uuid; delta numeric; supplier uuid; minimum numeric; excess bigint; allocated bigint:=0; cents bigint; share bigint; weight numeric; total_weight numeric; last_id uuid; edit jsonb;
begin
 if actor is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if p_id is null or p_revision is null or p_request is null or jsonb_typeof(p_header) is distinct from 'object' or jsonb_typeof(p_lines) is distinct from 'array' or length(coalesce(p_observacoes,''))>2000 then raise exception 'Dados da nota inválidos.';end if;
 if p_ocorrido_em is not null and (not isfinite(p_ocorrido_em) or p_ocorrido_em>clock_timestamp()) then raise exception 'Data de entrada inválida ou futura.';end if;
 p_header:=p_header||app_private.invoice_adjustments(p_header);
 select * into h from jsonb_to_record(p_header) as r(numero text,serie text,emitente_nome text,emitente_documento text,emitida_em timestamptz,total numeric,destinatario_nome text,destinatario_documento text,frete numeric,descontos numeric,impostos numeric,acrescimos numeric);
 if h.numero is null or h.numero !~ '^[0-9]{1,9}$' or h.numero::bigint<1 or h.serie is null or h.serie !~ '^[0-9]{1,3}$' or
    length(btrim(coalesce(h.emitente_nome,''))) not between 1 and 200 or h.emitente_documento is null or h.emitente_documento !~ '^([0-9]{11}|[0-9]{14})$' or
    h.emitida_em is null or not isfinite(h.emitida_em) or h.emitida_em>clock_timestamp() or
    h.total is null or not(h.total>=0 and h.total<=999999999999.99) or h.total<>round(h.total,6) or
    length(coalesce(h.destinatario_nome,''))>200 or (coalesce(h.destinatario_documento,'')<>'' and h.destinatario_documento !~ '^([0-9]{11}|[0-9]{14})$') then raise exception 'Preencha os dados obrigatórios da nota.';end if;
 h.numero:=h.numero::bigint::text;h.serie:=h.serie::integer::text;h.emitente_nome:=btrim(h.emitente_nome);
 count_lines:=jsonb_array_length(p_lines);
 if count_lines not between 1 and 990 then raise exception 'Adicione entre 1 e 990 itens.';end if;
 if exists(select 1 from jsonb_to_recordset(p_lines) as r(n_item integer,stock_item_id uuid,descricao text,unidade text,codigo text,quantidade_nf numeric,valor_unitario numeric,valor_total numeric,quantidade numeric,fator numeric)
  where r.n_item is null or r.n_item not between 1 and 990 or r.stock_item_id is null or length(btrim(coalesce(r.descricao,''))) not between 1 and 200 or length(btrim(coalesce(r.unidade,''))) not between 1 and 10 or length(coalesce(r.codigo,''))>100 or
    r.quantidade_nf is null or not(r.quantidade_nf>0 and r.quantidade_nf<=999999999999.999) or r.quantidade_nf<>round(r.quantidade_nf,4) or
    r.valor_unitario is null or not(r.valor_unitario>=0 and r.valor_unitario<=999999999999.99) or r.valor_unitario<>round(r.valor_unitario,10) or
    r.valor_total is null or not(r.valor_total>=0 and r.valor_total<=999999999999.99) or r.valor_total<>round(r.valor_total,6) or
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
  select sum(greatest(0.000001,coalesce((select sum(o.valor) from public.financial_operations o where o.parcela_id=i.id and o.tipo='PAYMENT' and not exists(select 1 from public.financial_operations r where r.estorno_de=o.id)),0))) into minimum from public.supplier_payable_installments i where i.payable_id=pay.id;
  if h.total<minimum then raise exception 'O total deve cobrir os valores já pagos e manter ao menos R$ 0,000001 por parcela. Mínimo: %.',minimum;end if;
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
 update public.stock_invoices set numero=h.numero,serie=h.serie,emitente_nome=h.emitente_nome,emitente_documento=h.emitente_documento,emitida_em=h.emitida_em,total=h.total,destinatario_nome=coalesce(h.destinatario_nome,''),destinatario_documento=coalesce(h.destinatario_documento,''),frete=h.frete,descontos=h.descontos,impostos=h.impostos,acrescimos=h.acrescimos,revision=revision+1,last_edit=edit where id=p_id;
 update public.stock_movements set descricao='NF-e '||h.numero||' / '||h.serie||' · '||h.emitente_nome,ocorrido_em=coalesce(p_ocorrido_em,m.ocorrido_em),observacoes=coalesce(p_observacoes,''),fornecedor_id=supplier,total_entrada=h.total where id=m.id;
 insert into public.stock_item_suppliers(stock_item_id,supplier_id,origem,ultimo_preco,ultima_entrada)
 select stock_item_id,supplier,'ENTRADA',sum(valor_total)/sum(quantidade_estoque),coalesce(p_ocorrido_em,m.ocorrido_em) from public.stock_invoice_items where invoice_id=p_id group by stock_item_id
 on conflict(stock_item_id,supplier_id) do update set ultimo_preco=excluded.ultimo_preco,ultima_entrada=excluded.ultima_entrada;
 if pay.id is not null then
  -- Preserve installment UUIDs and settled amounts. Redistribute the remaining balance.
  excess:=round((h.total-minimum)*1000000);
  select sum(greatest(i.valor-coalesce((select sum(o.valor) from public.financial_operations o where o.parcela_id=i.id and o.tipo='PAYMENT' and not exists(select 1 from public.financial_operations r where r.estorno_de=o.id)),0),0)) into total_weight from public.supplier_payable_installments i where payable_id=pay.id;
  select id into last_id from public.supplier_payable_installments where payable_id=pay.id order by numero desc limit 1;
  for l in select i.*,coalesce((select sum(o.valor) from public.financial_operations o where o.parcela_id=i.id and o.tipo='PAYMENT' and not exists(select 1 from public.financial_operations r where r.estorno_de=o.id)),0) paid from public.supplier_payable_installments i where payable_id=pay.id order by numero loop
   weight:=greatest(l.valor-l.paid,0);
   share:=case when l.id=last_id then excess-allocated when total_weight>0 then floor(excess*weight/total_weight) else 0 end;
   allocated:=allocated+share;
   update public.supplier_payable_installments set valor=greatest(l.paid,0.000001)+share/1000000.0 where id=l.id;
  end loop;
  update public.supplier_payables set fornecedor_id=supplier,fornecedor_nome=h.emitente_nome,fornecedor_documento=h.emitente_documento,descricao='NF-e '||h.numero||' / Série '||h.serie,total=h.total,updated_at=clock_timestamp(),payload=jsonb_build_object('invoice_revision',n.revision+1,'source',m.id,'data',payload->'data') where id=pay.id;
 end if;
 return jsonb_build_object('id',m.id,'revision',n.revision+1);
end $function$;


-- finance_config: precision only; authorization and transaction rules preserved.
CREATE OR REPLACE FUNCTION app_private.finance_config(p_kind text, p_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare h record;res jsonb;opening numeric;row_id uuid;new_account boolean;
begin
 if auth.uid() is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN') then raise exception 'Somente administradores podem configurar o financeiro.' using errcode='42501';end if;
 if p_id is null or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Cadastro inválido.';end if;
 select * into h from jsonb_to_record(p_data) as r(nome text,tipo text,natureza text,ativo boolean,conta_padrao_id uuid,prazo_dias integer,max_parcelas integer,usar_pdv boolean,saldo_inicial numeric,data date);
 if length(btrim(coalesce(h.nome,''))) not between 1 and 100 or h.ativo is null then raise exception 'Informe nome e situação.';end if;
 perform pg_advisory_xact_lock(hashtextextended('finance-config:'||p_id::text,0));
 if p_kind='accounts' then
  if h.tipo is null or h.tipo not in ('CASH','BANK','CARD','WALLET') then raise exception 'Tipo de conta inválido.';end if;
  new_account:=not exists(select 1 from public.financial_accounts where id=p_id);
  opening:=coalesce(h.saldo_inicial,0);
  if not new_account and opening<>0 and exists(select 1 from public.financial_operations o join public.financial_accounts a on a.id=o.conta_id where a.id=p_id and o.tipo='OPENING' and o.payload=p_data and a.nome=btrim(h.nome) and a.tipo=h.tipo and a.ativo=h.ativo) then return (select to_jsonb(a) from public.financial_accounts a where id=p_id);end if;
  if not(abs(opening)<=999999999999.99) or opening<>round(opening,6) or (not new_account and opening<>0) then raise exception 'Saldo inicial somente ao cadastrar a conta. Para corrigir, registre movimentação.';end if;
  if new_account and opening<>0 and (h.data is null or not isfinite(h.data) or h.data>(now() at time zone 'America/Bahia')::date) then raise exception 'Data do saldo inicial inválida.';end if;
  insert into public.financial_accounts(id,nome,tipo,ativo) values(p_id,btrim(h.nome),h.tipo,h.ativo) on conflict(id) do update set nome=excluded.nome,tipo=excluded.tipo,ativo=excluded.ativo returning to_jsonb(financial_accounts) into res;
  if new_account and opening<>0 then
   row_id:=gen_random_uuid();
   insert into public.financial_operations(id,tipo,valor,data,descricao,conta_id,actor_id,payload) values(row_id,'OPENING',abs(opening),h.data,'Saldo inicial: '||h.nome,p_id,auth.uid(),p_data);
   insert into public.financial_entries(operation_id,conta_id,valor) values(row_id,p_id,opening);
  end if;
 elsif p_kind='categories' then
  if h.natureza is null or h.natureza not in ('INCOME','EXPENSE','BOTH') then raise exception 'Natureza inválida.';end if;
  insert into public.financial_categories(id,nome,natureza,ativo) values(p_id,btrim(h.nome),h.natureza,h.ativo) on conflict(id) do update set nome=excluded.nome,natureza=excluded.natureza,ativo=excluded.ativo returning to_jsonb(financial_categories) into res;
 elsif p_kind='methods' then
  if h.tipo is null or h.tipo not in ('CASH','PIX','CREDIT_CARD','DEBIT_CARD','TRANSFER','BOLETO','DEFERRED','OTHER') or h.prazo_dias is null or h.prazo_dias not between 0 and 365 or h.max_parcelas is null or h.max_parcelas not between 1 and 120 or h.usar_pdv is null then raise exception 'Confira tipo, prazo e parcelamento.';end if;
  if h.conta_padrao_id is not null and not exists(select 1 from public.financial_accounts where id=h.conta_padrao_id) then raise exception 'Conta padrão não encontrada.';end if;
  insert into public.financial_payment_methods(id,nome,tipo,ativo,conta_padrao_id,prazo_dias,max_parcelas,usar_pdv) values(p_id,btrim(h.nome),h.tipo,h.ativo,h.conta_padrao_id,h.prazo_dias,h.max_parcelas,h.usar_pdv) on conflict(id) do update set nome=excluded.nome,tipo=excluded.tipo,ativo=excluded.ativo,conta_padrao_id=excluded.conta_padrao_id,prazo_dias=excluded.prazo_dias,max_parcelas=excluded.max_parcelas,usar_pdv=excluded.usar_pdv returning to_jsonb(financial_payment_methods) into res;
 else raise exception 'Cadastro financeiro inválido.';end if;
 return res;
end $function$;


-- finance_operation_base: precision only; authorization and transaction rules preserved.
CREATE OR REPLACE FUNCTION app_private.finance_operation_base(p_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid();h record;prior public.financial_operations;original public.financial_operations;debit public.customer_ledger;credit public.customer_ledger;
 paid numeric;remaining numeric;customer_balance numeric;parent uuid;entry record;payload jsonb;ledger_kind text;
begin
 if actor is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if p_id is null or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Movimentação inválida.';end if;
 select * into h from jsonb_to_record(p_data) as r(tipo text,valor numeric,data date,descricao text,conta_id uuid,destino_id uuid,categoria_id uuid,forma_id uuid,parcela_id uuid,debito_id uuid,credito_id uuid,estorno_de uuid,motivo text);
 if h.tipo is null or h.tipo not in ('PAYMENT','RECEIPT','TRANSFER','INCOME','EXPENSE','ALLOCATION','REVERSAL') or h.data is null or not isfinite(h.data) or h.data>(now() at time zone 'America/Bahia')::date or length(btrim(coalesce(h.descricao,''))) not between 1 and 200 or length(coalesce(h.motivo,''))>2000 then raise exception 'Confira tipo, descrição e data (atual ou passada).';end if;
 perform pg_advisory_xact_lock(hashtextextended('finance-request:'||p_id::text,0));
 select * into prior from public.financial_operations where id=p_id;
 if found then
  if prior.payload<>p_data or prior.actor_id<>actor then raise exception 'Identificador já utilizado em outra movimentação.';end if;
  return to_jsonb(prior)-'payload';
 end if;
 if h.tipo='REVERSAL' then
  if coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN') then raise exception 'Somente administradores podem estornar.' using errcode='42501';end if;
  if length(btrim(coalesce(h.motivo,'')))<3 or h.estorno_de is null then raise exception 'Informe o lançamento e o motivo do estorno.';end if;
  select * into original from public.financial_operations where id=h.estorno_de for update;
  if not found or original.tipo='REVERSAL' then raise exception 'Lançamento não pode ser estornado.';end if;
  if exists(select 1 from public.financial_operations where estorno_de=original.id) then raise exception 'Lançamento já estornado.';end if;
  if h.data<original.data then raise exception 'Estorno não pode ser anterior ao lançamento.';end if;
  h.valor:=original.valor;h.conta_id:=original.conta_id;h.destino_id:=original.destino_id;h.categoria_id:=original.categoria_id;h.forma_id:=original.forma_id;h.parcela_id:=original.parcela_id;h.debito_id:=original.debito_id;h.credito_id:=original.credito_id;
 else
  if h.estorno_de is not null then raise exception 'Origem de estorno inválida.';end if;
  if h.valor is null or not(h.valor>0 and h.valor<=999999999999.99) or h.valor<>round(h.valor,6) then raise exception 'Valor inválido.';end if;
  if h.tipo='PAYMENT' and (h.parcela_id is null or h.debito_id is not null or h.credito_id is not null) or h.tipo='RECEIPT' and (h.debito_id is null or h.parcela_id is not null or h.credito_id is not null) or h.tipo='ALLOCATION' and (h.debito_id is null or h.credito_id is null or h.parcela_id is not null) or h.tipo in ('TRANSFER','INCOME','EXPENSE') and (h.parcela_id is not null or h.debito_id is not null or h.credito_id is not null) then raise exception 'Vínculos da movimentação inválidos.';end if;
  if h.tipo='ALLOCATION' then
   if h.conta_id is not null or h.destino_id is not null or h.forma_id is not null or h.categoria_id is not null then raise exception 'Vincular crédito não movimenta contas financeiras.';end if;
  else
   if h.conta_id is null or not exists(select 1 from public.financial_accounts where id=h.conta_id and ativo) then raise exception 'Selecione uma conta financeira ativa.';end if;
   if h.tipo='TRANSFER' then
    if h.destino_id is null or h.destino_id=h.conta_id or not exists(select 1 from public.financial_accounts where id=h.destino_id and ativo) or h.forma_id is not null or h.categoria_id is not null then raise exception 'Selecione contas diferentes e ativas para transferir.';end if;
   elsif h.destino_id is not null then raise exception 'Conta de destino somente em transferências.';end if;
   if h.tipo<>'TRANSFER' and (h.forma_id is null or not exists(select 1 from public.financial_payment_methods where id=h.forma_id and ativo)) then raise exception 'Selecione uma forma de pagamento ativa.';end if;
   if h.tipo in ('INCOME','EXPENSE') and h.categoria_id is null then raise exception 'Selecione a categoria.';end if;
   if h.categoria_id is not null and not exists(select 1 from public.financial_categories where id=h.categoria_id and ativo and (natureza='BOTH' or natureza=case when h.tipo in ('INCOME','RECEIPT') then 'INCOME' else 'EXPENSE' end)) then raise exception 'Categoria incompatível ou inativa.';end if;
  end if;
 end if;
 -- Serialize settlement with payable editing and all settlements of the same customer.
 if h.parcela_id is not null then
  select payable_id into parent from public.supplier_payable_installments where id=h.parcela_id;
  if parent is null then raise exception 'Parcela não encontrada.';end if;
  perform pg_advisory_xact_lock(hashtextextended('payable:'||parent::text,0));
  select valor into remaining from public.supplier_payable_installments where id=h.parcela_id for update;
  if not found then raise exception 'Parcela alterada. Atualize a lista.';end if;
  select coalesce(sum(o.valor),0) into paid from public.financial_operations o where o.parcela_id=h.parcela_id and o.tipo='PAYMENT' and not exists(select 1 from public.financial_operations r where r.estorno_de=o.id);
  if h.tipo='PAYMENT' and h.valor>remaining-paid then raise exception 'Valor maior que o saldo da parcela. Atualize a lista.';end if;
 end if;
 if h.debito_id is not null then
  select * into debit from public.customer_ledger where id=h.debito_id;
  if not found or debit.entry_type<>'DEBIT' or debit.financial_operation_id is not null then raise exception 'Débito de cliente inválido.';end if;
  perform 1 from public.customers where codigo_cliente=debit.customer_codigo for update;
  select * into debit from public.customer_ledger where id=h.debito_id for update;
  select coalesce(sum(o.valor),0) into paid from public.financial_operations o where o.debito_id=debit.id and o.tipo in ('RECEIPT','ALLOCATION','SALE_VOID') and not exists(select 1 from public.financial_operations r where r.estorno_de=o.id);
  if h.tipo in ('RECEIPT','ALLOCATION','SALE_VOID') and h.valor>debit.amount-paid then raise exception 'Valor maior que o saldo do débito. Atualize a lista.';end if;
  if h.tipo='RECEIPT' then
   select coalesce(sum(case when entry_type='DEBIT' then amount else -amount end),0) into customer_balance from public.customer_ledger where customer_codigo=debit.customer_codigo;
   if h.valor>customer_balance then raise exception 'O cliente possui créditos. Vincule os créditos antes de receber este valor.';end if;
  elsif h.tipo='ALLOCATION' then
   select * into credit from public.customer_ledger where id=h.credito_id for update;
   if not found or credit.entry_type<>'CREDIT' or credit.customer_codigo<>debit.customer_codigo or credit.financial_operation_id is not null then raise exception 'Crédito inválido para este cliente.';end if;
   select coalesce(sum(o.valor),0) into paid from public.financial_operations o where o.credito_id=credit.id and o.tipo='ALLOCATION' and not exists(select 1 from public.financial_operations r where r.estorno_de=o.id);
   if h.valor>credit.amount-paid then raise exception 'Valor maior que o crédito disponível.';end if;
  end if;
 end if;
 -- Account balances are a sum of immutable entries. Lock account rows in UUID order.
 perform id from public.financial_accounts where id in (h.conta_id,h.destino_id) order by id for update;
 insert into public.financial_operations(id,tipo,valor,data,descricao,conta_id,destino_id,categoria_id,forma_id,parcela_id,debito_id,credito_id,estorno_de,motivo,actor_id,payload)
 values(p_id,h.tipo,h.valor,h.data,btrim(h.descricao),h.conta_id,h.destino_id,h.categoria_id,h.forma_id,h.parcela_id,h.debito_id,h.credito_id,h.estorno_de,coalesce(h.motivo,''),actor,p_data);
 if h.tipo='REVERSAL' then
  for entry in select * from public.financial_entries where operation_id=original.id loop
   insert into public.financial_entries(operation_id,conta_id,valor) values(p_id,entry.conta_id,-entry.valor);
  end loop;
 elsif h.tipo<>'ALLOCATION' then
  insert into public.financial_entries(operation_id,conta_id,valor) values(p_id,h.conta_id,case when h.tipo in ('PAYMENT','EXPENSE','TRANSFER') then -h.valor else h.valor end);
  if h.tipo='TRANSFER' then insert into public.financial_entries(operation_id,conta_id,valor) values(p_id,h.destino_id,h.valor);end if;
 end if;
 if h.tipo='RECEIPT' or h.tipo='REVERSAL' and original.tipo='RECEIPT' then
  ledger_kind:=case when h.tipo='RECEIPT' then 'CREDIT' else 'DEBIT' end;
  insert into public.customer_ledger(customer_codigo,entry_type,amount,issue_at,due_at,notes,financial_operation_id)
  values(debit.customer_codigo,ledger_kind,h.valor,h.data::timestamp at time zone 'America/Bahia',h.data::timestamp at time zone 'America/Bahia',h.descricao,p_id);
 end if;
 return (select to_jsonb(o)-'payload' from public.financial_operations o where id=p_id);
end $function$;


-- invoice_adjustments: precision only; authorization and transaction rules preserved.
CREATE OR REPLACE FUNCTION app_private.invoice_adjustments(p_header jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare key text; value numeric; output jsonb:='{}';
begin
 foreach key in array array['frete','descontos','impostos','acrescimos'] loop
  if coalesce(p_header->>key,'0') !~ '^[0-9]+(\.[0-9]{1,6})?$' then raise exception 'Valor inválido em %.',key;end if;
  value:=coalesce(p_header->>key,'0')::numeric;
  if value>999999999999.99 then raise exception 'Valor fora do limite em %.',key;end if;
  output:=output||jsonb_build_object(key,value);
 end loop;return output;
end $function$;


-- link_purchase_supplier: precision only; authorization and transaction rules preserved.
CREATE OR REPLACE FUNCTION app_private.link_purchase_supplier()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare supplier uuid;movement public.stock_movements;invoice public.stock_invoices;price numeric;arrival timestamptz;
begin
 select * into movement from public.stock_movements where id=new.movement_id;
 if movement.tipo<>'ENTRADA' then return new;end if;
 supplier:=movement.fornecedor_id;arrival:=movement.ocorrido_em;
 if movement.invoice_id is not null then
  select * into invoice from public.stock_invoices where id=movement.invoice_id;
  select id into supplier from public.suppliers where regexp_replace(documento,'[^0-9]','','g')=invoice.emitente_documento order by codigo_fornecedor limit 1;
  select round(sum(valor_total)/nullif(sum(quantidade_estoque),0),6) into price from public.stock_invoice_items where invoice_id=invoice.id and stock_item_id=new.stock_item_id;
 end if;
 if supplier is not null then
  insert into public.stock_item_suppliers(stock_item_id,supplier_id,origem,ultimo_preco,ultima_entrada) values(new.stock_item_id,supplier,'ENTRADA',price,arrival)
  on conflict(stock_item_id,supplier_id) do update set ultimo_preco=case when stock_item_suppliers.ultima_entrada is null or excluded.ultima_entrada>=stock_item_suppliers.ultima_entrada then coalesce(excluded.ultimo_preco,stock_item_suppliers.ultimo_preco) else stock_item_suppliers.ultimo_preco end,ultima_entrada=greatest(stock_item_suppliers.ultima_entrada,excluded.ultima_entrada);
 end if;return new;
end $function$;


-- production_operation: precision only; authorization and transaction rules preserved.
CREATE OR REPLACE FUNCTION app_private.production_operation(p_request uuid, p_id uuid, p_action text, p_revision integer, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid();role_name text:=app_private.app_role();previous app_private.production_requests;
 recipe public.production_recipes;batch public.production_batches;payload jsonb;answer jsonb;
 line jsonb;source public.stock_items;product public.products;qty numeric;price numeric;factor numeric;
 input_rows jsonb:='[]';output_rows jsonb:='[]';seen uuid[]:='{}';sid uuid;movement uuid:=gen_random_uuid();
 origin uuid;cost numeric:=0;extras numeric;expected numeric;occurred timestamptz;
begin
 if actor is null or coalesce(role_name,'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if p_request is null or p_id is null or p_action is null or p_action not in ('RECIPE','PRODUCE','REVERSE') or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Operação de produção inválida.';end if;
 payload:=jsonb_build_object('id',p_id,'action',p_action,'revision',p_revision,'data',p_data);
 perform pg_advisory_xact_lock(hashtextextended('production-request:'||p_request::text,0));
 select * into previous from app_private.production_requests where id=p_request;
 if found then
  if previous.actor_id<>actor or previous.payload<>payload then raise exception 'Pedido já utilizado em outra operação.';end if;
  return previous.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('production:'||p_id::text,0));
 if p_action='RECIPE' then
  select * into recipe from public.production_recipes where id=p_id for update;
  if found and p_revision is distinct from recipe.revision then raise exception 'Ficha alterada em outra sessão. Atualize antes de salvar.';end if;
  if length(btrim(coalesce(p_data->>'nome',''))) not between 1 and 200 or length(coalesce(p_data->>'observacoes',''))>2000
   or jsonb_typeof(p_data->'inputs') is distinct from 'array' or jsonb_typeof(p_data->'outputs') is distinct from 'array'
   or jsonb_array_length(p_data->'inputs') not between 1 and 50 or jsonb_array_length(p_data->'outputs') not between 1 and 50 then raise exception 'Informe nome, ingredientes e produtos da ficha.';end if;
  for line in select value from jsonb_array_elements(p_data->'inputs') loop
   sid:=(line->>'item_id')::uuid;qty:=(line->>'quantidade')::numeric;price:=coalesce((line->>'custo_unitario')::numeric,0);
   select * into source from public.stock_items where id=sid;
   if not found or not source.ativo or sid=any(seen) or qty is null or qty<=0 or qty>999999999.999 or qty<>round(qty,3) or price<0 or price>9999999.99 or price<>round(price,6) then raise exception 'Ingrediente, quantidade ou custo inválido.';end if;
   seen:=array_append(seen,sid);
   input_rows:=input_rows||jsonb_build_array(jsonb_build_object('item_id',sid,'quantidade',qty,'custo_unitario',price));
  end loop;
  seen:='{}';
  for line in select value from jsonb_array_elements(p_data->'outputs') loop
   select * into product from public.products where id=(line->>'product_id')::uuid;
   qty:=(line->>'quantidade')::numeric;
   if not found or not product.ativo or product.supply_mode<>'PRODUCTION' or product.id=any(seen) or qty is null or qty<=0 or qty>999999999.999 or qty<>round(qty,3) then raise exception 'Escolha produtos ativos abastecidos por produção e um rendimento válido.';end if;
   if exists(select 1 from jsonb_array_elements(input_rows) i where i->>'item_id'=product.stock_item_id::text) then raise exception 'O produto acabado não pode ser ingrediente da própria ficha.';end if;
   seen:=array_append(seen,product.id);output_rows:=output_rows||jsonb_build_array(jsonb_build_object('product_id',product.id,'quantidade',qty));
  end loop;
  insert into public.production_recipes(id,nome,inputs,outputs,ativo,observacoes,actor_id)
   values(p_id,upper(btrim(p_data->>'nome')),input_rows,output_rows,coalesce((p_data->>'ativo')::boolean,true),coalesce(p_data->>'observacoes',''),actor)
   on conflict(id) do update set nome=excluded.nome,inputs=excluded.inputs,outputs=excluded.outputs,ativo=excluded.ativo,observacoes=excluded.observacoes,revision=production_recipes.revision+1,updated_at=clock_timestamp() returning * into recipe;
  answer:=to_jsonb(recipe);
 elsif p_action='PRODUCE' then
  if exists(select 1 from public.production_batches where id=p_id) then raise exception 'Produção já registrada.';end if;
  select * into recipe from public.production_recipes where id=(p_data->>'recipe_id')::uuid for share;
  if not found or not recipe.ativo then raise exception 'Ficha técnica indisponível.';end if;
  if p_revision is distinct from recipe.revision then raise exception 'A ficha foi alterada. Atualize antes de produzir.';end if;
  factor:=(p_data->>'multiplier')::numeric;origin:=coalesce((p_data->>'location_id')::uuid,app_private.main_stock_location());
  extras:=coalesce((p_data->>'extra_cost')::numeric,0);occurred:=coalesce((p_data->>'ocorrido_em')::timestamptz,now());
  if factor is null or factor<=0 or factor>999999 or factor<>round(factor,3) or extras<0 or extras>9999999999.99 or extras<>round(extras,6)
   or occurred>now()+interval '5 minutes' or length(coalesce(p_data->>'observacoes',''))>2000
   or jsonb_typeof(p_data->'outputs') is distinct from 'array' or jsonb_array_length(p_data->'outputs') not between 1 and 50 then raise exception 'Informe lotes, quantidades produzidas, data e custos válidos.';end if;
  if not exists(select 1 from public.stock_locations where id=origin and ativo) then raise exception 'Escolha um setor de consumo ativo.';end if;
  -- Lock products, then all stock metadata in UUID order, as sales do.
  perform id from public.products where id in(select (v->>'product_id')::uuid from jsonb_array_elements(recipe.outputs) v) order by id for update;
  perform id from public.stock_items where id in(select (v->>'item_id')::uuid from jsonb_array_elements(recipe.inputs) v union select stock_item_id from public.products where id in(select (v->>'product_id')::uuid from jsonb_array_elements(recipe.outputs) v)) order by id for update;
  for line in select value from jsonb_array_elements(recipe.inputs) loop
   select * into source from public.stock_items where id=(line->>'item_id')::uuid;
   qty:=(line->>'quantidade')::numeric*factor;
   if not source.ativo or qty<>round(qty,3) then raise exception 'Ingrediente inativo ou consumo fora da precisão: %.',source.nome;end if;
   price:=(line->>'custo_unitario')::numeric;cost:=cost+round(qty*price,6);
   input_rows:=input_rows||jsonb_build_array(jsonb_build_object('item_id',source.id,'nome',source.nome,'unidade',source.unidade,'quantidade',qty,'custo_unitario',price,'custo_total',round(qty*price,6)));
  end loop;
  for line in select value from jsonb_array_elements(p_data->'outputs') loop
   select * into product from public.products where id=(line->>'product_id')::uuid;
   select (v->>'quantidade')::numeric*factor into expected from jsonb_array_elements(recipe.outputs) v where v->>'product_id'=product.id::text;
   qty:=(line->>'quantidade')::numeric;
   if not found or expected is null or not product.ativo or product.supply_mode<>'PRODUCTION' or product.id=any(seen) or qty is null or qty<0 or qty>999999999.999 or qty<>round(qty,3)
    or not exists(select 1 from public.stock_items where id=product.stock_item_id and ativo) then raise exception 'Produto ou quantidade produzida inválidos.';end if;
   seen:=array_append(seen,product.id);
   output_rows:=output_rows||jsonb_build_array(jsonb_build_object('product_id',product.id,'item_id',product.stock_item_id,'nome',product.nome,'unidade',product.unidade,'previsto',expected,'quantidade',qty));
  end loop;
  if jsonb_array_length(output_rows)<>jsonb_array_length(recipe.outputs) or not exists(select 1 from jsonb_array_elements(output_rows) v where (v->>'quantidade')::numeric>0) then raise exception 'Informe todos os produtos da ficha, com ao menos um resultado maior que zero.';end if;
  insert into public.stock_movements(id,tipo,descricao,quantidade,fator,actor_id,payload,observacoes,ocorrido_em)
   values(movement,'PRODUCAO','Produção: '||recipe.nome,factor,1,actor,payload,coalesce(p_data->>'observacoes',''),occurred);
  for line in select value from jsonb_array_elements(input_rows) loop
   select * into source from public.stock_items where id=(line->>'item_id')::uuid;
   insert into public.stock_movement_lines(movement_id,stock_item_id,nome,unidade,quantidade,saldo_apos,location_id)
    values(movement,source.id,line->>'nome',line->>'unidade',-(line->>'quantidade')::numeric,source.saldo-(line->>'quantidade')::numeric,origin);
  end loop;
  for line in select value from jsonb_array_elements(output_rows) where (value->>'quantidade')::numeric>0 loop
   select * into source from public.stock_items where id=(line->>'item_id')::uuid;
   insert into public.stock_movement_lines(movement_id,stock_item_id,nome,unidade,quantidade,saldo_apos,location_id)
    values(movement,source.id,line->>'nome',line->>'unidade',(line->>'quantidade')::numeric,source.saldo+(line->>'quantidade')::numeric,app_private.main_stock_location());
  end loop;
  insert into public.production_batches(id,recipe_id,recipe_nome,recipe_revision,location_id,multiplier,inputs,outputs,extra_cost,total_cost,observacoes,ocorrido_em,actor_id,actor_nome,movement_id,payload)
   values(p_id,recipe.id,recipe.nome,recipe.revision,origin,factor,input_rows,output_rows,extras,cost+extras,coalesce(p_data->>'observacoes',''),occurred,actor,(select d.nome from app_private.account_directory d join public.app_profiles p on p.account_id=d.id where p.auth_user_id=actor),movement,payload) returning * into batch;
  answer:=to_jsonb(batch)-'payload';
 else
  if role_name not in ('MASTER','ADMIN') then raise exception 'Somente administradores podem estornar produções.' using errcode='42501';end if;
  select * into batch from public.production_batches where id=p_id for update;
  if not found or batch.status<>'CONFIRMED' then raise exception 'Produção inexistente ou já estornada.';end if;
  if length(btrim(coalesce(p_data->>'motivo',''))) not between 3 and 2000 then raise exception 'Informe o motivo do estorno.';end if;
  perform s.id from public.stock_items s where s.id in(select stock_item_id from public.stock_movement_lines where movement_id=batch.movement_id) order by s.id for update;
  -- An undo must not consume goods that have already been sold or transferred.
  if exists(select 1 from public.stock_movement_lines l join public.stock_balances b using(stock_item_id,location_id) where l.movement_id=batch.movement_id and l.quantidade>0 and b.saldo<l.quantidade) then raise exception 'Estorno indisponível: produtos já vendidos, consumidos ou transferidos. Reponha o saldo no principal antes de estornar.';end if;
  insert into public.stock_movements(id,tipo,descricao,quantidade,fator,actor_id,payload,observacoes,ocorrido_em)
   values(movement,'ESTORNO_PRODUCAO','Estorno de produção #'||batch.numero,1,1,actor,payload,btrim(p_data->>'motivo'),now());
  insert into public.stock_movement_lines(movement_id,stock_item_id,nome,unidade,quantidade,saldo_apos,location_id)
   select movement,l.stock_item_id,l.nome,l.unidade,-l.quantidade,s.saldo-l.quantidade,l.location_id from public.stock_movement_lines l join public.stock_items s on s.id=l.stock_item_id where l.movement_id=batch.movement_id order by l.stock_item_id,l.location_id;
  update public.production_batches set status='REVERSED',reverse_movement_id=movement,reverse_reason=btrim(p_data->>'motivo'),reverse_actor=actor,reversed_at=now() where id=p_id returning * into batch;
  answer:=to_jsonb(batch)-'payload';
 end if;
 insert into app_private.production_requests(id,actor_id,payload,result) values(p_request,actor,payload,answer);
 return answer;
end $function$;


-- purchase_operation: precision only; authorization and transaction rules preserved.
CREATE OR REPLACE FUNCTION app_private.purchase_operation(p_id uuid, p_action text, p_revision integer, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.purchase_rounds;row jsonb;offer jsonb;part jsonb;stock public.stock_items;sid uuid;new_items jsonb:='[]';new_offers jsonb:='[]';assignments jsonb:='[]';ids uuid[]:='{}';sids uuid[]:='{}';seen uuid[];q numeric;price numeric;freight numeric;discount numeric;subtotal numeric;total numeric:=0;candidate numeric;chosen uuid;strategy text;request uuid;
begin
 if auth.uid() is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if p_id is null or p_action is null or p_action not in ('SAVE','DECIDE','CANCEL') or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Operação de compras inválida.';end if;
 perform pg_advisory_xact_lock(hashtextextended('purchase:'||p_id::text,0));
 select * into r from public.purchase_rounds where id=p_id for update;
 if found and r.status<>'DRAFT' then
  if p_action='DECIDE' and r.status='DECIDED' and r.decision->>'request_id'=p_data->>'request_id' then return to_jsonb(r);end if;
  if p_action='CANCEL' and r.status='CANCELLED' then return to_jsonb(r);end if;
  raise exception 'Cotação encerrada; abra uma nova cotação.';
 end if;
 if p_action='SAVE' and r.id is not null and r.last_save=p_data then return to_jsonb(r);end if;
 if r.id is not null and p_revision is distinct from r.revision then raise exception 'Cotação alterada em outra sessão. Atualize antes de continuar.';end if;
 if p_action='SAVE' then
  if length(btrim(coalesce(p_data->>'nome',''))) not between 1 and 200 or jsonb_typeof(p_data->'items') is distinct from 'array' or jsonb_array_length(p_data->'items') not between 1 and 200 or jsonb_typeof(p_data->'offers') is distinct from 'array' or jsonb_array_length(p_data->'offers')>50 then raise exception 'Informe nome, itens e fornecedores da cotação.';end if;
  for row in select value from jsonb_array_elements(p_data->'items') loop
   select * into stock from public.stock_items where id=(row->>'item_id')::uuid and ativo;
   if not found or stock.id=any(ids) then raise exception 'Insumo inválido ou repetido.';end if;
   ids:=array_append(ids,stock.id);q:=(row->>'quantidade')::numeric;
   if q is null or not(q>0 and q<=999999999999.999) or q<>round(q,3) then raise exception 'Quantidade de compra inválida.';end if;
   new_items:=new_items||jsonb_build_array(jsonb_build_object('item_id',stock.id,'nome',stock.nome,'unidade',stock.unidade,'quantidade',q));
  end loop;
  for offer in select value from jsonb_array_elements(p_data->'offers') loop
   sid:=(offer->>'supplier_id')::uuid;
   if sid is null or sid=any(sids) or not exists(select 1 from public.suppliers where id=sid and ativo) then raise exception 'Fornecedor inválido, inativo ou repetido.';end if;
   sids:=array_append(sids,sid);freight:=(offer->>'frete')::numeric;discount:=(offer->>'desconto')::numeric;
   if freight is null or discount is null or not(freight between 0 and 9999999999.99) or not(discount between 0 and 9999999999.99) or freight<>round(freight,6) or discount<>round(discount,6) or (offer->>'validade')::date is null or offer->>'prazo_dias' is null or (offer->>'prazo_dias')::integer not between 0 and 3650 or jsonb_typeof(offer->'items') is distinct from 'array' then raise exception 'Confira frete, desconto, validade e prazo da proposta.';end if;
   seen:='{}';subtotal:=0;
   for part in select value from jsonb_array_elements(offer->'items') loop
    chosen:=(part->>'item_id')::uuid;price:=(part->>'preco_unitario')::numeric;
    if chosen is null or not(chosen=any(ids)) or chosen=any(seen) or price is null or not(price>0 and price<=9999999999.9999) or price<>round(price,6) then raise exception 'Preço unitário ou item da proposta inválido.';end if;
    seen:=array_append(seen,chosen);select (value->>'quantidade')::numeric into q from jsonb_array_elements(new_items) where value->>'item_id'=chosen::text;subtotal:=subtotal+round(q*price,6);
   end loop;
   if discount>subtotal then raise exception 'O desconto não pode ultrapassar os itens cotados.';end if;
   if subtotal>9999999999.99 or subtotal+freight-discount>9999999999.99 then raise exception 'O valor da compra ultrapassa o limite permitido.';end if;
   new_offers:=new_offers||jsonb_build_array(jsonb_build_object('supplier_id',sid,'fornecedor_nome',(select nome from public.suppliers where id=sid),'frete',freight,'desconto',discount,'validade',(offer->>'validade')::date,'prazo_dias',(offer->>'prazo_dias')::integer,'items',offer->'items'));
  end loop;
  if r.id is null then
   if p_revision is not null then raise exception 'Cotação não encontrada.';end if;
   insert into public.purchase_rounds(id,nome,items,offers,actor_id,last_save) values(p_id,btrim(p_data->>'nome'),new_items,new_offers,auth.uid(),p_data) returning * into r;
  else update public.purchase_rounds set nome=btrim(p_data->>'nome'),items=new_items,offers=new_offers,last_save=p_data,revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into r;end if;
 elsif p_action='CANCEL' then
  if r.id is null then raise exception 'Cotação não encontrada.';end if;
  update public.purchase_rounds set status='CANCELLED',revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into r;
 else
  if r.id is null then raise exception 'Cotação não encontrada.';end if;
  strategy:=p_data->>'strategy';request:=(p_data->>'request_id')::uuid;
  if request is null or strategy is null or strategy not in ('TOTAL','ITEM') then raise exception 'Escolha o critério da compra.';end if;
  if strategy='TOTAL' then
   for offer in select value from jsonb_array_elements(r.offers) where (value->>'validade')::date>=(now() at time zone 'America/Bahia')::date and exists(select 1 from public.suppliers where id=(value->>'supplier_id')::uuid and ativo) loop
    if jsonb_array_length(offer->'items')<>jsonb_array_length(r.items) then continue;end if;
    select sum(round((i->>'quantidade')::numeric*(p->>'preco_unitario')::numeric,6)) into subtotal from jsonb_array_elements(r.items) i join jsonb_array_elements(offer->'items') p on p->>'item_id'=i->>'item_id';
    candidate:=subtotal+(offer->>'frete')::numeric-(offer->>'desconto')::numeric;
    if chosen is null or candidate<total then chosen:=(offer->>'supplier_id')::uuid;total:=candidate;end if;
   end loop;
   if chosen is null then raise exception 'Nenhum fornecedor possui proposta válida para a compra completa.';end if;
   select value into offer from jsonb_array_elements(r.offers) where value->>'supplier_id'=chosen::text;
   for row in select value from jsonb_array_elements(r.items) loop
    select (value->>'preco_unitario')::numeric into price from jsonb_array_elements(offer->'items') where value->>'item_id'=row->>'item_id';assignments:=assignments||jsonb_build_array(row||jsonb_build_object('supplier_id',chosen,'preco_unitario',price));
   end loop;
  else
   -- Select by unit price. Freight is counted once per selected supplier; discounts
   -- for a full basket apply only when its entire quoted basket is selected.
   for row in select value from jsonb_array_elements(r.items) loop
    select (o->>'supplier_id')::uuid,(p->>'preco_unitario')::numeric into chosen,price from jsonb_array_elements(r.offers) o cross join jsonb_array_elements(o->'items') p
     where p->>'item_id'=row->>'item_id' and (o->>'validade')::date>=(now() at time zone 'America/Bahia')::date and exists(select 1 from public.suppliers where id=(o->>'supplier_id')::uuid and ativo)
     order by (p->>'preco_unitario')::numeric,(o->>'supplier_id') limit 1;
    if chosen is null then raise exception 'Há insumo sem proposta válida.';end if;
    assignments:=assignments||jsonb_build_array(row||jsonb_build_object('supplier_id',chosen,'preco_unitario',price));
   end loop;
   total:=0;
   for offer in select value from jsonb_array_elements(r.offers) loop
    select sum(round((value->>'quantidade')::numeric*(value->>'preco_unitario')::numeric,6)) into subtotal from jsonb_array_elements(assignments) where value->>'supplier_id'=offer->>'supplier_id';
    if subtotal is not null then
     discount:=case when (select count(*) from jsonb_array_elements(assignments) where value->>'supplier_id'=offer->>'supplier_id')=jsonb_array_length(offer->'items') then (offer->>'desconto')::numeric else 0 end;
     total:=total+subtotal+(offer->>'frete')::numeric-discount;
    end if;
   end loop;
  end if;
  if exists(select 1 from jsonb_array_elements(r.items) i where not exists(select 1 from public.stock_items where id=(i->>'item_id')::uuid and ativo)) then raise exception 'Há insumo desativado. Revise a cotação.';end if;
  if total>9999999999.99 then raise exception 'O valor da compra ultrapassa o limite permitido.';end if;
  update public.purchase_rounds set status='DECIDED',decision=jsonb_build_object('request_id',request,'strategy',strategy,'items',assignments,'total',total,'decided_at',clock_timestamp(),'actor_id',auth.uid()),revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into r;
 end if;return to_jsonb(r);
end $function$;


-- record_manual_stock_invoice: precision only; authorization and transaction rules preserved.
CREATE OR REPLACE FUNCTION app_private.record_manual_stock_invoice(p_request uuid, p_header jsonb, p_lines jsonb, p_ocorrido_em timestamp with time zone DEFAULT NULL::timestamp with time zone, p_observacoes text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); h record; l record; stock public.stock_items; payload jsonb; previous public.stock_movements; identity text; delta numeric; count_lines integer;
begin
 if actor is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if p_request is null or jsonb_typeof(p_header) is distinct from 'object' or jsonb_typeof(p_lines) is distinct from 'array' or length(coalesce(p_observacoes,''))>2000 then raise exception 'Dados da nota inválidos.';end if;
 if p_ocorrido_em is not null and (not isfinite(p_ocorrido_em) or p_ocorrido_em>clock_timestamp()) then raise exception 'Data de entrada inválida ou futura.';end if;
 p_header:=p_header||app_private.invoice_adjustments(p_header);
 select * into h from jsonb_to_record(p_header) as r(numero text,serie text,emitente_nome text,emitente_documento text,emitida_em timestamptz,total numeric,destinatario_nome text,destinatario_documento text,frete numeric,descontos numeric,impostos numeric,acrescimos numeric);
 if h.numero is null or h.numero !~ '^[0-9]{1,9}$' or h.numero::bigint<1 or h.serie is null or h.serie !~ '^[0-9]{1,3}$' or
    length(btrim(coalesce(h.emitente_nome,''))) not between 1 and 200 or h.emitente_documento is null or h.emitente_documento !~ '^([0-9]{11}|[0-9]{14})$' or
    h.emitida_em is null or not isfinite(h.emitida_em) or h.emitida_em>clock_timestamp() or
    h.total is null or not(h.total>=0 and h.total<=999999999999.99) or h.total<>round(h.total,6) or
    length(coalesce(h.destinatario_nome,''))>200 or (coalesce(h.destinatario_documento,'')<>'' and h.destinatario_documento !~ '^([0-9]{11}|[0-9]{14})$') then raise exception 'Preencha os dados obrigatórios da nota.';end if;
 h.numero:=h.numero::bigint::text;h.serie:=h.serie::integer::text;h.emitente_nome:=btrim(h.emitente_nome);
 count_lines:=jsonb_array_length(p_lines);
 if count_lines not between 1 and 990 then raise exception 'Adicione entre 1 e 990 itens.';end if;
 if exists(select 1 from jsonb_to_recordset(p_lines) as r(n_item integer,stock_item_id uuid,descricao text,unidade text,codigo text,quantidade_nf numeric,valor_unitario numeric,valor_total numeric,quantidade numeric,fator numeric)
  where r.n_item is null or r.n_item not between 1 and 990 or r.stock_item_id is null or length(btrim(coalesce(r.descricao,''))) not between 1 and 200 or length(btrim(coalesce(r.unidade,''))) not between 1 and 10 or length(coalesce(r.codigo,''))>100 or
    r.quantidade_nf is null or not(r.quantidade_nf>0 and r.quantidade_nf<=999999999999.999) or r.quantidade_nf<>round(r.quantidade_nf,3) or
    r.valor_unitario is null or not(r.valor_unitario>=0 and r.valor_unitario<=999999999999.99) or r.valor_unitario<>round(r.valor_unitario,6) or
    r.valor_total is null or not(r.valor_total>=0 and r.valor_total<=999999999999.99) or r.valor_total<>round(r.valor_total,6) or
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
 insert into public.stock_invoices(id,numero,serie,emitente_nome,emitente_documento,destinatario_nome,destinatario_documento,emitida_em,total,actor_id,origem,frete,descontos,impostos,acrescimos)
 values(p_request,h.numero,h.serie,h.emitente_nome,h.emitente_documento,coalesce(h.destinatario_nome,''),coalesce(h.destinatario_documento,''),h.emitida_em,h.total,actor,'MANUAL',h.frete,h.descontos,h.impostos,h.acrescimos);
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
end $function$;


-- record_stock_entry: precision only; authorization and transaction rules preserved.
CREATE OR REPLACE FUNCTION app_private.record_stock_entry(p_request uuid, p_item uuid, p_quantidade numeric, p_fator numeric, p_observacoes text, p_ocorrido_em timestamp with time zone, p_supplier uuid, p_total numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid();previous public.stock_movements;res jsonb;
begin
 if actor is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if p_total is not null and (not(p_total>=0 and p_total<=999999999999.99) or p_total<>round(p_total,6)) then raise exception 'Valor total inválido.';end if;
 if p_supplier is not null and not exists(select 1 from public.suppliers where id=p_supplier and ativo) then raise exception 'Selecione um fornecedor ativo.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into previous from public.stock_movements where id=p_request;
 if found and (previous.fornecedor_id is distinct from p_supplier or previous.total_entrada is distinct from p_total) then raise exception 'Identificador já utilizado em outra entrada.';end if;
 res:=app_private.record_stock(p_request,'ENTRADA',p_item,null,p_quantidade,p_fator,p_observacoes,p_ocorrido_em);
 update public.stock_movements set fornecedor_id=p_supplier,total_entrada=p_total where id=p_request returning to_jsonb(stock_movements)-'payload' into res;
 return res;
end $function$;


-- save_supplier_payable_base: precision only; authorization and transaction rules preserved.
CREATE OR REPLACE FUNCTION app_private.save_supplier_payable_base(p_id uuid, p_source uuid, p_data jsonb, p_edit boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid();h record;previous public.supplier_payables;payload jsonb;source public.stock_movements;line_count integer;
begin
 if actor is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if p_id is null or p_edit is null or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Lançamento inválido.';end if;
 select * into h from jsonb_to_record(p_data) as r(fornecedor_id uuid,fornecedor_nome text,fornecedor_documento text,descricao text,total numeric,observacoes text,parcelas jsonb);
 if length(btrim(coalesce(h.fornecedor_nome,''))) not between 1 and 200 or length(coalesce(h.fornecedor_documento,''))>30 or length(btrim(coalesce(h.descricao,''))) not between 1 and 200 or
 h.total is null or not(h.total>0 and h.total<=999999999999.99) or h.total<>round(h.total,6) or length(coalesce(h.observacoes,''))>2000 or jsonb_typeof(h.parcelas) is distinct from 'array' then raise exception 'Confira fornecedor, descrição, total e parcelas.';end if;
 line_count:=jsonb_array_length(h.parcelas);
 if line_count not between 1 and 120 or exists(select 1 from jsonb_to_recordset(h.parcelas) as r(numero integer,referencia text,vencimento date,valor numeric,forma_pagamento text)
 where numero is null or numero not between 1 and line_count or length(coalesce(referencia,''))>50 or vencimento is null or not isfinite(vencimento) or valor is null or not(valor>0 and valor<=999999999999.99) or valor<>round(valor,6) or length(coalesce(forma_pagamento,''))>100) or
 (select count(distinct numero) from jsonb_to_recordset(h.parcelas) as r(numero integer))<>line_count or
 (select sum(valor) from jsonb_to_recordset(h.parcelas) as r(valor numeric))<>h.total then raise exception 'A soma das parcelas deve ser igual ao total; confira valores e vencimentos.';end if;
 if h.fornecedor_id is not null and not exists(select 1 from public.suppliers where id=h.fornecedor_id) then raise exception 'Fornecedor não encontrado.';end if;
 if p_source is not null then
  select * into source from public.stock_movements where id=p_source;
  if not found or source.tipo<>'ENTRADA' then raise exception 'Entrada de origem não encontrada.';end if;
  perform pg_advisory_xact_lock(hashtextextended('payable-source:'||p_source::text,0));
 end if;
 payload:=jsonb_build_object('source',p_source,'data',p_data);
 perform pg_advisory_xact_lock(hashtextextended('payable:'||p_id::text,0));
 select * into previous from public.supplier_payables where id=p_id for update;
 if found then
  if not p_edit then
   if previous.payload<>payload or previous.actor_id<>actor then raise exception 'Identificador já utilizado em outro lançamento.';end if;
   return to_jsonb(previous)-'payload';
  end if;
  if previous.stock_movement_id is distinct from p_source then raise exception 'A origem do lançamento não pode ser alterada.';end if;
 else
  if p_edit then raise exception 'Conta a pagar não encontrada.';end if;
  if p_source is not null and exists(select 1 from public.supplier_payables where stock_movement_id=p_source) then raise exception 'Esta entrada já possui lançamento no contas a pagar.';end if;
 end if;
 insert into public.supplier_payables(id,stock_movement_id,fornecedor_id,fornecedor_nome,fornecedor_documento,descricao,total,observacoes,actor_id,payload)
 values(p_id,p_source,h.fornecedor_id,btrim(h.fornecedor_nome),coalesce(h.fornecedor_documento,''),btrim(h.descricao),h.total,coalesce(h.observacoes,''),actor,payload)
 on conflict(id) do update set fornecedor_id=excluded.fornecedor_id,fornecedor_nome=excluded.fornecedor_nome,fornecedor_documento=excluded.fornecedor_documento,descricao=excluded.descricao,total=excluded.total,observacoes=excluded.observacoes,payload=excluded.payload,updated_at=now();
 delete from public.supplier_payable_installments where payable_id=p_id;
 insert into public.supplier_payable_installments(payable_id,numero,referencia,vencimento,valor,forma_pagamento)
 select p_id,numero,coalesce(referencia,numero::text),vencimento,valor,coalesce(forma_pagamento,'') from jsonb_to_recordset(h.parcelas) as r(numero integer,referencia text,vencimento date,valor numeric,forma_pagamento text);
 return (select to_jsonb(p)-'payload' from public.supplier_payables p where id=p_id);
end $function$;


-- Cash movements can also be reconciled with precise financial records.
alter table public.cash_movements alter column valor type numeric;
alter table public.cash_movements add constraint cash_movements_valor_six_decimals check (valor=round(valor,6));
alter table public.cash_sessions alter column opening_amount type numeric;
alter table public.cash_sessions add constraint cash_sessions_opening_amount_six_decimals check (opening_amount=round(opening_amount,6));
alter table public.cash_sessions alter column counted_amount type numeric;
alter table public.cash_sessions add constraint cash_sessions_counted_amount_six_decimals check (counted_amount=round(counted_amount,6));
alter table public.cash_sessions alter column expected_amount type numeric;
alter table public.cash_sessions add constraint cash_sessions_expected_amount_six_decimals check (expected_amount=round(expected_amount,6));
alter table public.cash_sessions alter column difference type numeric;
alter table public.cash_sessions add constraint cash_sessions_difference_six_decimals check (difference=round(difference,6));
CREATE OR REPLACE FUNCTION app_private.cash_operation_base(p_id uuid, p_action text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid();s public.cash_sessions;prior app_private.cash_requests;value numeric;balance numeric;expected numeric;counted numeric;variance numeric;op uuid;other uuid;request uuid;res jsonb;
begin
 if actor is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if p_id is null or p_action is null or p_action not in ('OPEN','CLOSE','WITHDRAW','SUPPLY') or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Operação de caixa inválida.';end if;
 perform pg_advisory_xact_lock(hashtextextended('cash-session-global',0));
 if p_action in ('WITHDRAW','SUPPLY') then
  request:=(p_data->>'request_id')::uuid;if request is null then raise exception 'Identificador da operação obrigatório.';end if;
  select * into prior from app_private.cash_requests where id=request;
  if found then
   if prior.entity_id<>p_id or prior.action<>p_action or prior.payload<>p_data or prior.actor_id<>actor then raise exception 'Identificador já utilizado.';end if;
   return prior.result;
  end if;
 end if;
 select * into s from public.cash_sessions where id=p_id for update;
 if p_action='OPEN' then
  if found then
   if s.opening_payload<>p_data or s.opened_by<>actor then raise exception 'Identificador já utilizado.';end if;
   return to_jsonb(s)-'opening_payload'-'closing_payload';
  end if;
  if exists(select 1 from public.cash_sessions where status='OPEN') then raise exception 'Já existe um caixa aberto.';end if;
  if not exists(select 1 from public.financial_accounts where id=(p_data->>'conta_id')::uuid and ativo and tipo='CASH') then raise exception 'Selecione uma conta de dinheiro / caixa ativa.';end if;
  if not exists(select 1 from public.financial_categories where id=(p_data->>'categoria_id')::uuid and ativo and natureza in ('INCOME','BOTH')) then raise exception 'Selecione uma categoria de receita ativa.';end if;
  if not exists(select 1 from public.financial_payment_methods where ativo) then raise exception 'Cadastre uma forma de pagamento ativa.';end if;
  value:=coalesce((p_data->>'valor_abertura')::numeric,0);
  if not(value>=0 and value<=999999999999.99) or value<>round(value,6) then raise exception 'Valor de abertura inválido.';end if;
  other:=(p_data->>'origem_id')::uuid;
  if other is not null then
   if value<=0 then raise exception 'Informe o valor do troco a transferir.';end if;
   if other=(p_data->>'conta_id')::uuid then raise exception 'A origem do troco deve ser outra conta.';end if;
   perform id from public.financial_accounts where id in(other,(p_data->>'conta_id')::uuid) order by id for update;
   select coalesce(sum(valor),0) into balance from public.financial_entries where conta_id=other;
   if balance<value then raise exception 'Saldo insuficiente na conta de origem do troco.';end if;
   op:=gen_random_uuid();
   perform app_private.finance_operation(op,jsonb_build_object('tipo','TRANSFER','valor',value,'data',(now() at time zone 'America/Bahia')::date,'descricao','Troco de abertura do caixa','conta_id',other,'destino_id',(p_data->>'conta_id')::uuid));
  else
   perform 1 from public.financial_accounts where id=(p_data->>'conta_id')::uuid for update;
   select coalesce(sum(valor),0) into balance from public.financial_entries where conta_id=(p_data->>'conta_id')::uuid;
   if balance<value then raise exception 'O valor de abertura supera o saldo financeiro. Selecione a origem do troco ou ajuste o saldo da conta antes de abrir.';end if;
  end if;
  select coalesce(sum(valor),0) into balance from public.financial_entries where conta_id=(p_data->>'conta_id')::uuid;
  insert into public.cash_sessions(id,conta_id,categoria_id,method_ids,opened_by,opening_payload,saldo_abertura,opening_amount)
  values(p_id,(p_data->>'conta_id')::uuid,(p_data->>'categoria_id')::uuid,array(select id from public.financial_payment_methods where ativo order by id),actor,p_data,balance,value) returning * into s;
  if value>0 then insert into public.cash_movements(id,cash_session_id,kind,valor,motivo,operation_id,actor_id) values(gen_random_uuid(),s.id,'OPENING',value,'Troco de abertura',op,actor);end if;
  update public.dining_tables set cash_session_id=s.id where status='aberta' and cash_session_id is null;
 else
  if not found then raise exception 'Caixa não encontrado.';end if;
  if p_action='CLOSE' and s.status='CLOSED' then
   if s.closing_payload is distinct from p_data or s.closed_by is distinct from actor then raise exception 'Caixa já fechado. A conferência não pode ser alterada.';end if;
   return to_jsonb(s)-'opening_payload'-'closing_payload';
  end if;
  if s.status<>'OPEN' then raise exception 'Caixa fechado. Não é possível movimentá-lo.';end if;
  expected:=app_private.cash_expected(s.id);
  if p_action='CLOSE' then
   if exists(select 1 from public.dining_tables where status='aberta') then raise exception 'Encerre todas as comandas abertas antes de fechar o caixa.';end if;
   if expected is distinct from (p_data->>'esperado')::numeric then raise exception 'Os movimentos do caixa mudaram. Atualize e confira os valores novamente.';end if;
   counted:=(p_data->>'contado')::numeric;
   if counted is null or not(counted>=0 and counted<=999999999999.99) or counted<>round(counted,6) then raise exception 'Informe o dinheiro contado no fechamento.';end if;
   variance:=counted-expected;
   if length(coalesce(p_data->>'motivo',''))>2000 then raise exception 'A justificativa deve ter até 2000 caracteres.';end if;
   if variance<>0 and length(btrim(coalesce(p_data->>'motivo','')))<3 then raise exception 'Justifique a diferença entre o dinheiro esperado e o contado.';end if;
   select coalesce(sum(valor),0) into balance from public.financial_entries where conta_id=s.conta_id;
   update public.cash_sessions set status='CLOSED',closed_at=clock_timestamp(),closed_by=actor,saldo_fechamento=balance,expected_amount=expected,counted_amount=counted,difference=variance,closing_payload=p_data where id=s.id returning * into s;
  else
   value:=(p_data->>'valor')::numeric;other:=(p_data->>'conta_id')::uuid;
   if value is null or not(value>0 and value<=999999999999.99) or value<>round(value,6) or length(btrim(coalesce(p_data->>'motivo','')))<3 or length(p_data->>'motivo')>2000 then raise exception 'Informe valor e motivo da movimentação.';end if;
   if other is null or other=s.conta_id or not exists(select 1 from public.financial_accounts where id=other and ativo) then raise exception 'Selecione outra conta financeira ativa.';end if;
   if p_action='WITHDRAW' and value>expected then raise exception 'Sangria maior que o dinheiro disponível no caixa.';end if;
   perform id from public.financial_accounts where id in(s.conta_id,other) order by id for update;
   select coalesce(sum(valor),0) into balance from public.financial_entries where conta_id=case when p_action='WITHDRAW' then s.conta_id else other end;
   if value>balance then raise exception 'Saldo financeiro insuficiente na conta de origem.';end if;
   op:=gen_random_uuid();
   perform app_private.finance_operation(op,jsonb_build_object('tipo','TRANSFER','valor',value,'data',(now() at time zone 'America/Bahia')::date,'descricao',case when p_action='WITHDRAW' then 'Sangria do caixa' else 'Suprimento do caixa' end,'motivo',p_data->>'motivo','conta_id',case when p_action='WITHDRAW' then s.conta_id else other end,'destino_id',case when p_action='WITHDRAW' then other else s.conta_id end));
   insert into public.cash_movements(id,cash_session_id,kind,valor,motivo,operation_id,actor_id) values(request,s.id,p_action,value,btrim(p_data->>'motivo'),op,actor);
   res:=jsonb_build_object('id',request,'expected_cash',app_private.cash_expected(s.id));
   insert into app_private.cash_requests(id,entity_id,action,payload,actor_id,result) values(request,p_id,p_action,p_data,actor,res);
   return res;
  end if;
 end if;
 return to_jsonb(s)-'opening_payload'-'closing_payload';
end $function$;

notify pgrst,'reload schema';
