alter table public.financial_accounts add column caixa_padrao boolean not null default false;
create unique index financial_account_single_cash_default on public.financial_accounts(caixa_padrao) where caixa_padrao;
alter table public.financial_accounts add constraint financial_account_cash_default_valid check(not caixa_padrao or (nome='Conta caixa' and tipo='CASH' and ativo));
-- Reuse an existing account with this exact name; never move past balances or sessions.
do $$
declare account uuid;
begin
 select id into account from public.financial_accounts where nome='Conta caixa' and tipo='CASH';
 if account is null then
  insert into public.financial_accounts(nome,tipo,ativo,caixa_padrao) values('Conta caixa','CASH',true,true);
 else update public.financial_accounts set ativo=true,caixa_padrao=true where id=account;end if;
end $$;
create function app_private.protect_default_cash_account() returns trigger language plpgsql set search_path='' as $$
begin
 if old.caixa_padrao and (tg_op='DELETE' or new.caixa_padrao is distinct from true or new.id is distinct from old.id or new.nome is distinct from 'Conta caixa' or new.tipo is distinct from 'CASH' or new.ativo is distinct from true) then
  raise exception 'A Conta caixa é padrão do sistema e não pode ser renomeada, desativada, excluída ou ter seu tipo alterado.';
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function app_private.protect_default_cash_account() from public,anon,authenticated;
create trigger protect_default_cash_account before update or delete on public.financial_accounts for each row execute function app_private.protect_default_cash_account();
alter function app_private.cash_operation(uuid,text,jsonb) rename to cash_operation_base;
revoke all on function app_private.cash_operation_base(uuid,text,jsonb) from public,anon,authenticated;
create function app_private.cash_operation(p_id uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare account uuid;
begin
 if auth.uid() is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('cash-session-global',0));
 if p_action='OPEN' then
  select conta_id into account from public.cash_sessions where id=p_id;
  if not found then
   select id into account from public.financial_accounts where caixa_padrao and ativo and tipo='CASH';
   if account is null then raise exception 'Conta caixa padrão não encontrada.';end if;
   if p_data->>'conta_id' is not null and (p_data->>'conta_id')::uuid<>account then raise exception 'Novos caixas devem usar a Conta caixa padrão.';end if;
  end if;
  if p_data->>'conta_id' is null then p_data:=p_data||jsonb_build_object('conta_id',account);end if;
 end if;
 return app_private.cash_operation_base(p_id,p_action,p_data);
end $$;
revoke all on function app_private.cash_operation(uuid,text,jsonb) from public,anon;
grant execute on function app_private.cash_operation(uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';
