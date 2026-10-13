-- One read-only snapshot for the global bell. Existing RLS protects every source.
create function public.system_notifications() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare today date:=(now() at time zone 'America/Bahia')::date;alerts jsonb;
begin
 if auth.uid() is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then
  raise exception 'Acesso não autorizado.' using errcode='42501';
 end if;
 with active_operations as (
  select o.* from public.financial_operations o
  where o.tipo<>'REVERSAL' and not exists(select 1 from public.financial_operations reversal where reversal.estorno_de=o.id)
 ), payable_settlements as (
  select parcela_id,sum(valor) paid from active_operations where tipo='PAYMENT' and parcela_id is not null group by parcela_id
 ), receivable_settlements as (
  select debito_id,sum(valor) paid from active_operations where tipo in ('RECEIPT','ALLOCATION','SALE_VOID') and debito_id is not null group by debito_id
 ), payable_balances as (
  select part.*,p.fornecedor_nome,p.descricao,p.stock_movement_id,greatest(part.valor-coalesce(s.paid,0),0) balance
  from public.supplier_payable_installments part join public.supplier_payables p on p.id=part.payable_id
  left join payable_settlements s on s.parcela_id=part.id
 ), receivable_balances as (
  select l.*,c.nome customer_name,c.total_pendente,greatest(l.amount-coalesce(s.paid,0),0) balance
  from public.customer_ledger l join public.customers c on c.codigo_cliente=l.customer_codigo
  left join receivable_settlements s on s.debito_id=l.id where l.entry_type='DEBIT'
 ), notifications as (
  select 'stock:'||id::text id,'LOW_STOCK' kind,'Estoque' category,1 priority,started_at occurred_at,
   jsonb_build_object('name',nome,'stockItemId',stock_item_id,'balance',saldo::text,'minimum',minimo::text,'unit',unidade) details
  from public.low_stock_alerts where ativo
  union all
  select 'cash:'||id::text,'CASH_OPEN_24H','Caixa',0,opened_at,
   jsonb_build_object('sessionId',id,'openedAt',opened_at)
  from public.cash_sessions where status='OPEN' and opened_at<now()-interval '24 hours'
  union all
  select 'payable:'||id::text,case when vencimento<today then 'PAYABLE_OVERDUE' else 'PAYABLE_DUE_SOON' end,'Contas a pagar',case when vencimento<today then 0 else 1 end,vencimento::timestamp at time zone 'America/Bahia',
   jsonb_build_object('installmentId',id,'supplier',fornecedor_nome,'description',descricao,'reference',coalesce(nullif(referencia,''),numero::text),'dueDate',vencimento,'balance',balance::text)
  from payable_balances where balance>0 and vencimento<=today+7
  union all
  select 'receivable:'||id::text,'RECEIVABLE_OVERDUE','Contas a receber',0,due_at,
   jsonb_build_object('entryId',id,'entryCode',codigo_conta,'customerCode',customer_codigo,'customer',customer_name,'dueDate',(due_at at time zone 'America/Bahia')::date,'balance',balance::text)
  from receivable_balances where balance>0 and total_pendente>0 and (due_at at time zone 'America/Bahia')::date<today
  union all
  select 'customer-limit:'||id::text,'CUSTOMER_OVER_LIMIT','Clientes',0,updated_at,
   jsonb_build_object('customerId',id,'customerCode',codigo_cliente,'customer',nome,'limit',limite::text,'balance',total_pendente::text,'excess',(total_pendente-limite)::text)
  from public.customers where ativo and total_pendente>limite
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'category',category,'severity',case when priority=0 then 'URGENT' else 'WARNING' end,'occurredAt',occurred_at,'details',details) order by priority,occurred_at,id),'[]') into alerts from notifications;
 return alerts;
end $$;
revoke all on function public.system_notifications() from public,anon;
grant execute on function public.system_notifications() to authenticated;
notify pgrst,'reload schema';
