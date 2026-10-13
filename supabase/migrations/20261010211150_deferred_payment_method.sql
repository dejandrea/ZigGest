-- A prazo is a distinct method for customer credit, without a boleto.
alter table public.financial_payment_methods drop constraint financial_payment_methods_tipo_check;
alter table public.financial_payment_methods add constraint financial_payment_methods_tipo_check
 check(tipo in ('CASH','PIX','CREDIT_CARD','DEBIT_CARD','TRANSFER','BOLETO','DEFERRED','OTHER'));

-- Preserve the existing function's permissions, guards and UTF-8 messages.
do $migration$
declare definition text; updated text;
begin
 definition:=pg_get_functiondef('app_private.finance_config(text,uuid,jsonb)'::regprocedure);
 updated:=replace(definition,'''TRANSFER'',''BOLETO'',''OTHER''','''TRANSFER'',''BOLETO'',''DEFERRED'',''OTHER''');
 if updated=definition then raise exception 'Payment method validation not found';end if;
 execute updated;
end $migration$;

insert into public.financial_payment_methods(nome,tipo,prazo_dias,max_parcelas,usar_pdv)
values('A prazo','DEFERRED',30,1,true)
on conflict(nome) do nothing;
