begin;
do $$ begin
 perform set_config('request.jwt.claim.sub',
  (select id::text from auth.users where lower(email)='dejandrea@gmail.com'),true);
end $$;
set local role authenticated;
do $$
declare supplier uuid;
begin
 if not has_column_privilege('authenticated','public.suppliers','inscricao_estadual','INSERT')
  or not has_column_privilege('authenticated','public.suppliers','inscricao_estadual','UPDATE') then
  raise exception 'IE is missing from the editable column allowlist';
 end if;
 insert into public.suppliers(nome,inscricao_estadual)
  values('Fixture supplier IE permissions','001234') returning id into supplier;
 update public.suppliers set nome='Fixture supplier IE edited',inscricao_estadual='ISENTO' where id=supplier;
 if not exists(select 1 from public.suppliers where id=supplier and inscricao_estadual='ISENTO') then
  raise exception 'Authenticated supplier edit failed';
 end if;
 if has_column_privilege('anon','public.suppliers','inscricao_estadual','UPDATE')
  or has_column_privilege('authenticated','public.suppliers','codigo_fornecedor','UPDATE') then
  raise exception 'Supplier grants were broadened beyond editable fields';
 end if;
end $$;
rollback;
