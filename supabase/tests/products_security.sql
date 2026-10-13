begin;
do $$ begin
 perform set_config('request.jwt.claim.sub',(select id::text from auth.users where lower(email)='dejandrea@gmail.com'),true);
end $$;
set local role authenticated;
do $$
declare fixture uuid; second_fixture uuid; barcode text := '00TEST-'||gen_random_uuid()::text; affected integer;
begin
 insert into public.products(nome) values ('Fixture produto sem codigo') returning id into fixture;
 insert into public.products(nome) values ('Outra fixture sem codigo') returning id into second_fixture;
 if not exists(select 1 from public.products where id=fixture and codigo_barras is null) then raise exception 'Produto sem codigo falhou'; end if;
 update public.products set codigo_barras=barcode,custo=5.50,preco_venda=8.25,ativo=false where id=fixture;
 get diagnostics affected=row_count;
 if affected<>1 or not exists(select 1 from public.products where id=fixture and codigo_barras=barcode and preco_venda=8.25 and not ativo) then raise exception 'Edicao falhou'; end if;
 begin
  update public.products set codigo_barras=barcode where id=second_fixture;
  raise exception 'Codigo duplicado foi aceito';
 exception when unique_violation then null;
 end;
 update public.products set codigo_barras=null where id=fixture;
 if not exists(select 1 from public.products where id=fixture and codigo_barras is null) then raise exception 'Limpeza do codigo falhou'; end if;
 begin
  update public.products set custo=-1 where id=fixture;
  raise exception 'Valor negativo foi aceito';
 exception when check_violation then null;
 end;
 begin
  update public.products set codigo_produto=999999 where id=fixture;
  raise exception 'Codigo interno protegido foi alterado';
 exception when insufficient_privilege then null;
 end;
 begin
  delete from public.products where id=fixture;
  raise exception 'Exclusao foi permitida';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
do $$ begin perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000000',true); end $$;
set local role authenticated;
do $$ declare affected integer; begin
 if exists(select 1 from public.products) then raise exception 'Conta nao autorizada leu produtos'; end if;
 update public.products set ativo=false;
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Conta nao autorizada editou produtos'; end if;
 begin
  insert into public.products(nome) values ('Nao autorizado');
  raise exception 'Conta nao autorizada cadastrou';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform 1 from public.products; raise exception 'Anon leu produtos'; exception when insufficient_privilege then null; end;
 begin insert into public.products(nome) values ('Anon'); raise exception 'Anon inseriu'; exception when insufficient_privilege then null; end;
 begin update public.products set ativo=false; raise exception 'Anon editou'; exception when insufficient_privilege then null; end;
 begin delete from public.products; raise exception 'Anon excluiu'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'Produtos: cadastro sem barras, edicao, limpeza, unicidade, valores e acesso validados; fixtures revertidas' as resultado;
