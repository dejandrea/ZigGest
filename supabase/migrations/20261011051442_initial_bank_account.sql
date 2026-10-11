alter table public.financial_accounts add column banco_inicial boolean not null default false;
create unique index financial_account_single_initial_bank on public.financial_accounts(banco_inicial) where banco_inicial;
-- The marker survives renaming. This account has no edit restrictions.
do $$declare account uuid;begin
 select id into account from public.financial_accounts where nome='Conta banco' and tipo='BANK';
 if account is null then
  insert into public.financial_accounts(nome,tipo,ativo,banco_inicial) values('Conta banco','BANK',true,true);
 else update public.financial_accounts set banco_inicial=true where id=account;end if;
 update public.financial_payment_methods set conta_padrao_id=(select id from public.financial_accounts where banco_inicial)
 where tipo in ('PIX','CREDIT_CARD','DEBIT_CARD','BOLETO') and conta_padrao_id is null;
end $$;
create function app_private.initial_payment_bank() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.tipo in ('PIX','CREDIT_CARD','DEBIT_CARD','BOLETO') and new.conta_padrao_id is null and (tg_op='INSERT' or new.tipo is distinct from old.tipo) then
  select id into new.conta_padrao_id from public.financial_accounts where banco_inicial;
 end if;
 return new;
end $$;
revoke all on function app_private.initial_payment_bank() from public,anon,authenticated;
create trigger initial_payment_bank before insert or update on public.financial_payment_methods for each row execute function app_private.initial_payment_bank();
create function app_private.payment_receiving_account(p_method uuid,p_cash uuid) returns uuid language sql stable set search_path='' as $$
 select case when m.tipo='CASH' then p_cash
  when m.tipo in ('PIX','CREDIT_CARD','DEBIT_CARD','BOLETO') then coalesce(m.conta_padrao_id,(select id from public.financial_accounts where banco_inicial))
  else coalesce(m.conta_padrao_id,p_cash) end
 from public.financial_payment_methods m where id=p_method
$$;
revoke all on function app_private.payment_receiving_account(uuid,uuid) from public,anon,authenticated;
-- Preserve the tested comanda payment lifecycle; only resolve its receiving account differently.
do $$declare definition text;updated text;begin
 definition:=pg_get_functiondef('app_private.comanda_operation_base(uuid,text,jsonb)'::regprocedure);
 updated:=replace(definition,'acc:=case when method.tipo=''CASH'' then s.conta_id else coalesce(method.conta_padrao_id,s.conta_id) end;','acc:=app_private.payment_receiving_account(method.id,s.conta_id);');
 if updated=definition then raise exception 'Receiving account resolution not found';end if;
 execute updated;
end $$;
notify pgrst,'reload schema';
