begin;
alter table app_private.account_directory drop constraint account_directory_role_check;
alter table app_private.account_directory add constraint account_directory_role_check check(role in ('MASTER','ADMIN','OPERATOR'));
update app_private.account_directory set role='MASTER',enabled=true,updated_at=now() where email='dejandrea@gmail.com';
create or replace function public.admin_list_accounts()
returns table(id uuid,email text,nome text,role text,enabled boolean,registered boolean)
language plpgsql stable security definer set search_path=''
as $function$
begin
  if coalesce((select app_private.app_role()),'') not in ('MASTER','ADMIN') then
    raise exception 'Acesso administrativo necessario' using errcode='42501';
  end if;
  return query select d.id,d.email,d.nome,d.role,d.enabled,
    exists(select 1 from public.app_profiles p where p.account_id=d.id)
    from app_private.account_directory d where d.role <> 'MASTER' or (select app_private.app_role())='MASTER' order by d.nome,d.id;
end;
$function$;
create or replace function public.admin_save_account(p_id uuid,p_email text,p_nome text,p_role text,p_enabled boolean)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare result_id uuid; actor_account uuid;
begin
  if coalesce((select app_private.app_role()),'') not in ('MASTER','ADMIN') then
    raise exception 'Acesso administrativo necessario' using errcode='42501';
  end if;
  if p_role not in ('MASTER','ADMIN','OPERATOR') or p_role is null or p_enabled is null
    or length(btrim(coalesce(p_nome,'')))=0
    or btrim(coalesce(p_email,'')) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Dados de usuario invalidos' using errcode='22023';
  end if;
  if (select app_private.app_role()) <> 'MASTER' and (p_role='MASTER' or exists(select 1 from app_private.account_directory where id=p_id and role='MASTER')) then
    raise exception 'Somente master pode administrar acesso master' using errcode='42501';
  end if;
  select account_id into actor_account from public.app_profiles where auth_user_id=auth.uid();
  if p_id=actor_account and (not p_enabled or p_role<>(select app_private.app_role())) then
    raise exception 'Voce nao pode remover seu proprio acesso administrativo' using errcode='42501';
  end if;
  if p_id is null then
    insert into app_private.account_directory(email,nome,role,enabled)
    values(lower(btrim(p_email)),btrim(p_nome),p_role,p_enabled) returning id into result_id;
  else
    if exists(select 1 from public.app_profiles where account_id=p_id)
      and exists(select 1 from app_private.account_directory where id=p_id and email<>lower(btrim(p_email))) then
      raise exception 'Email de conta ja registrada nao pode ser alterado' using errcode='22023';
    end if;
    update app_private.account_directory set email=lower(btrim(p_email)),nome=btrim(p_nome),
      role=p_role,enabled=p_enabled,updated_at=now() where id=p_id returning id into result_id;
    if result_id is null then raise exception 'Usuario nao encontrado' using errcode='P0002'; end if;
  end if;
  insert into app_private.account_audit(actor,account_id,action)
    values(auth.uid(),result_id,case when p_id is null then 'CREATE' else 'UPDATE' end);
  return result_id;
end;
$function$;
alter policy app_customer_access on public.customers using ((select app_private.app_role()) in ('MASTER','ADMIN','OPERATOR')) with check ((select app_private.app_role()) in ('MASTER','ADMIN','OPERATOR'));
alter policy app_ledger_access on public.customer_ledger using ((select app_private.app_role()) in ('MASTER','ADMIN','OPERATOR')) with check ((select app_private.app_role()) in ('MASTER','ADMIN','OPERATOR'));
alter policy app_mesa_access on public.dining_tables using ((select app_private.app_role()) in ('MASTER','ADMIN','OPERATOR')) with check ((select app_private.app_role()) in ('MASTER','ADMIN','OPERATOR'));
alter policy app_mesa_item_access on public.dining_table_items using ((select app_private.app_role()) in ('MASTER','ADMIN','OPERATOR')) with check ((select app_private.app_role()) in ('MASTER','ADMIN','OPERATOR'));
commit;
