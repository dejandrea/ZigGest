begin;
do $$
declare definition text;f record;
begin
 if current_setting('server_encoding')<>'UTF8' then raise exception 'Database must use UTF8';end if;
 if (select count(*) from public.financial_payment_methods where nome in (U&'Boleto banc\00e1rio',U&'Cart\00e3o de cr\00e9dito',U&'Cart\00e3o de d\00e9bito',U&'Transfer\00eancia banc\00e1ria'))<>4 then raise exception 'Default method names are not correct';end if;
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app_private') and p.prokind='f' loop
  definition:=pg_get_functiondef(f.oid);
  if definition ~ U&'[\00c3\00c2\00e2][\0080-\00bf\0192\2018\2019\201c\201d\20ac\0153\0161]' then raise exception 'Corrupt function: %',f.oid::regprocedure;end if;
 end loop;
end $$;
do $$ begin perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000000',true);end $$;
set local role authenticated;
do $$ begin
 begin perform public.finance_operation(gen_random_uuid(),'{}');raise exception 'FAIL: unauthorized call';
 exception when insufficient_privilege then if SQLERRM<>U&'Acesso n\00e3o autorizado.' then raise exception 'Incorrectly encoded error: %',SQLERRM;end if;end;
end $$;
reset role;
rollback;
select 'UTF-8 names, function messages and access protection verified.' as resultado;
