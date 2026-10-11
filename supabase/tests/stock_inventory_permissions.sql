begin;
do $$begin perform set_config('request.jwt.claim.sub',(select id::text from auth.users where lower(email)='dejandrea@gmail.com'),true);end $$;
update app_private.account_directory set role='OPERATOR' where id=(select account_id from public.app_profiles where auth_user_id=auth.uid());
set local role authenticated;
do $$
declare item uuid;inv uuid:=gen_random_uuid();
begin
 insert into public.stock_items(nome,unidade) values('Fixture operator inventory','UN') returning id into item;
 perform public.inventory_operation(inv,'OPEN',null,jsonb_build_object('kind','COUNT','item_id',item,'descricao','Operator count'));
 perform public.inventory_operation(inv,'SAVE',0,jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('item_id',item,'contado',5))));
 begin perform public.inventory_operation(inv,'CONFIRM',1,'{}');raise exception 'FAIL: operator confirmation';exception when insufficient_privilege then null;end;
 begin perform public.inventory_operation(inv,'CANCEL',1,'{}');raise exception 'FAIL: operator cancellation';exception when insufficient_privilege then null;end;
 if (select saldo from public.stock_items where id=item)<>0 then raise exception 'Operator changed stock';end if;
end $$;
rollback;
select 'inventory operator permissions passed' as result;
