begin;
do $$ begin perform set_config('request.jwt.claim.sub',(select id::text from auth.users where lower(email)='dejandrea@gmail.com'),true);end $$;
set local role authenticated;
do $$
declare method uuid:=gen_random_uuid();result jsonb;
begin
 if not exists(select 1 from public.financial_payment_methods where nome='A prazo' and tipo='DEFERRED' and ativo and usar_pdv) then raise exception 'Missing deferred method';end if;
 result:=public.finance_config('methods',method,'{"nome":"Fixture deferred","tipo":"DEFERRED","ativo":true,"prazo_dias":45,"max_parcelas":3,"usar_pdv":true}');
 if result->>'tipo'<>'DEFERRED' or (result->>'prazo_dias')::integer<>45 then raise exception 'Deferred configuration failed';end if;
 perform public.finance_config('methods',method,'{"nome":"Fixture deferred","tipo":"DEFERRED","ativo":true,"prazo_dias":60,"max_parcelas":6,"usar_pdv":true}');
 if (select max_parcelas from public.financial_payment_methods where id=method)<>6 then raise exception 'Deferred edit failed';end if;
end $$;
rollback;
select 'deferred payment method passed' as result;
