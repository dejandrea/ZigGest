alter table public.stock_movements add column fornecedor_id uuid references public.suppliers(id), add column total_entrada numeric(14,2) check(total_entrada>=0);
create index stock_movements_fornecedor_idx on public.stock_movements(fornecedor_id) where fornecedor_id is not null;
create table public.supplier_payables(
 id uuid primary key, stock_movement_id uuid unique references public.stock_movements(id),
 fornecedor_id uuid references public.suppliers(id), fornecedor_nome text not null check(length(btrim(fornecedor_nome)) between 1 and 200),
 fornecedor_documento text not null default '' check(length(fornecedor_documento)<=30),
 descricao text not null check(length(btrim(descricao)) between 1 and 200),total numeric(14,2) not null check(total>0),
 observacoes text not null default '' check(length(observacoes)<=2000),actor_id uuid not null references auth.users(id),
 payload jsonb not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index supplier_payables_supplier_idx on public.supplier_payables(fornecedor_id);
create index supplier_payables_actor_idx on public.supplier_payables(actor_id);
create table public.supplier_payable_installments(
 id uuid primary key default gen_random_uuid(),payable_id uuid not null references public.supplier_payables(id) on delete cascade,
 numero integer not null check(numero between 1 and 120),referencia text not null check(length(referencia)<=50),
 vencimento date not null check(isfinite(vencimento)),valor numeric(14,2) not null check(valor>0),
 forma_pagamento text not null default '' check(length(forma_pagamento)<=100),unique(payable_id,numero)
);
create index supplier_payable_due_idx on public.supplier_payable_installments(vencimento);
alter table public.supplier_payables enable row level security;
alter table public.supplier_payable_installments enable row level security;
create policy supplier_payables_read on public.supplier_payables for select to authenticated using((select app_private.app_role()) in ('MASTER','ADMIN','OPERATOR'));
create policy supplier_payable_installments_read on public.supplier_payable_installments for select to authenticated using((select app_private.app_role()) in ('MASTER','ADMIN','OPERATOR'));
revoke all on public.supplier_payables,public.supplier_payable_installments from anon,authenticated;
grant select on public.supplier_payables,public.supplier_payable_installments to authenticated;

create function app_private.record_stock_entry(p_request uuid,p_item uuid,p_quantidade numeric,p_fator numeric,p_observacoes text,p_ocorrido_em timestamptz,p_supplier uuid,p_total numeric) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();previous public.stock_movements;res jsonb;
begin
 if actor is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if p_total is not null and (not(p_total>=0 and p_total<=999999999999.99) or p_total<>round(p_total,2)) then raise exception 'Valor total inválido.';end if;
 if p_supplier is not null and not exists(select 1 from public.suppliers where id=p_supplier and ativo) then raise exception 'Selecione um fornecedor ativo.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into previous from public.stock_movements where id=p_request;
 if found and (previous.fornecedor_id is distinct from p_supplier or previous.total_entrada is distinct from p_total) then raise exception 'Identificador já utilizado em outra entrada.';end if;
 res:=app_private.record_stock(p_request,'ENTRADA',p_item,null,p_quantidade,p_fator,p_observacoes,p_ocorrido_em);
 update public.stock_movements set fornecedor_id=p_supplier,total_entrada=p_total where id=p_request returning to_jsonb(stock_movements)-'payload' into res;
 return res;
end $$;
create function public.record_stock_entry(p_request uuid,p_item uuid,p_quantidade numeric,p_fator numeric,p_observacoes text default '',p_ocorrido_em timestamptz default null,p_supplier uuid default null,p_total numeric default null) returns jsonb
language sql security invoker set search_path='' as $$select app_private.record_stock_entry(p_request,p_item,p_quantidade,p_fator,p_observacoes,p_ocorrido_em,p_supplier,p_total)$$;

create function app_private.save_supplier_payable(p_id uuid,p_source uuid,p_data jsonb,p_edit boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();h record;previous public.supplier_payables;payload jsonb;source public.stock_movements;line_count integer;
begin
 if actor is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if p_id is null or p_edit is null or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Lançamento inválido.';end if;
 select * into h from jsonb_to_record(p_data) as r(fornecedor_id uuid,fornecedor_nome text,fornecedor_documento text,descricao text,total numeric,observacoes text,parcelas jsonb);
 if length(btrim(coalesce(h.fornecedor_nome,''))) not between 1 and 200 or length(coalesce(h.fornecedor_documento,''))>30 or length(btrim(coalesce(h.descricao,''))) not between 1 and 200 or
 h.total is null or not(h.total>0 and h.total<=999999999999.99) or h.total<>round(h.total,2) or length(coalesce(h.observacoes,''))>2000 or jsonb_typeof(h.parcelas) is distinct from 'array' then raise exception 'Confira fornecedor, descrição, total e parcelas.';end if;
 line_count:=jsonb_array_length(h.parcelas);
 if line_count not between 1 and 120 or exists(select 1 from jsonb_to_recordset(h.parcelas) as r(numero integer,referencia text,vencimento date,valor numeric,forma_pagamento text)
 where numero is null or numero not between 1 and line_count or length(coalesce(referencia,''))>50 or vencimento is null or not isfinite(vencimento) or valor is null or not(valor>0 and valor<=999999999999.99) or valor<>round(valor,2) or length(coalesce(forma_pagamento,''))>100) or
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
end $$;
create function public.save_supplier_payable(p_id uuid,p_source uuid,p_data jsonb,p_edit boolean default false) returns jsonb
language sql security invoker set search_path='' as $$select app_private.save_supplier_payable(p_id,p_source,p_data,p_edit)$$;
revoke all on function app_private.record_stock_entry(uuid,uuid,numeric,numeric,text,timestamptz,uuid,numeric),public.record_stock_entry(uuid,uuid,numeric,numeric,text,timestamptz,uuid,numeric),app_private.save_supplier_payable(uuid,uuid,jsonb,boolean),public.save_supplier_payable(uuid,uuid,jsonb,boolean) from public,anon;
grant execute on function app_private.record_stock_entry(uuid,uuid,numeric,numeric,text,timestamptz,uuid,numeric),public.record_stock_entry(uuid,uuid,numeric,numeric,text,timestamptz,uuid,numeric),app_private.save_supplier_payable(uuid,uuid,jsonb,boolean),public.save_supplier_payable(uuid,uuid,jsonb,boolean) to authenticated;
