begin;
do $$ begin
 perform set_config('request.jwt.claim.sub',(select id::text from auth.users where lower(email)='dejandrea@gmail.com'),true);
end $$;
set local role authenticated;
do $$
declare fixture uuid; affected integer;
begin
 insert into public.suppliers(nome,documento) values ('Fixture fornecedor transacional','TEST-ROLLBACK-20261009') returning id into fixture;
 if not exists(select 1 from public.suppliers where id=fixture) then raise exception 'Leitura autorizada falhou'; end if;
 update public.suppliers set ativo=false where id=fixture;
 get diagnostics affected=row_count;
 if affected<>1 then raise exception 'Edicao autorizada falhou'; end if;
 begin
  insert into public.suppliers(nome,documento) values ('Duplicado','testrollback20261009');
  raise exception 'Documento duplicado foi aceito';
 exception when unique_violation then null;
 end;
 begin
  update public.suppliers set codigo_fornecedor=999999 where id=fixture;
  raise exception 'Codigo protegido foi alterado';
 exception when insufficient_privilege then null;
 end;
 begin
  delete from public.suppliers where id=fixture;
  raise exception 'Exclusao foi permitida';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
do $$ begin perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000000',true); end $$;
set local role authenticated;
do $$ begin
 if exists(select 1 from public.suppliers) then raise exception 'Usuario nao autorizado leu dados'; end if;
 begin
  insert into public.suppliers(nome) values ('Nao autorizado');
  raise exception 'Usuario nao autorizado inseriu dados';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin
  perform 1 from public.suppliers;
  raise exception 'Anon leu fornecedores';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
rollback;
select 'Fornecedores: CRUD permitido, exclusao/codigo protegidos, duplicacao/anon/nao autorizado bloqueados; fixtures revertidas' as resultado;