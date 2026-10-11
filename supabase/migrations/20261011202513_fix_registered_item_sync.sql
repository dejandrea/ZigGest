create or replace function app_private.sync_registered_item() returns trigger
language plpgsql security definer set search_path='' as $$
declare s public.stock_items;
begin
 if pg_trigger_depth()>1 then return new; end if;
 -- Each branch has a distinct NEW record type; inspect the table first.
 if tg_table_name='products' then
  if new.stock_item_id is not null then
   select * into s from public.stock_items where id=new.stock_item_id;
   if new.unidade<>s.unidade then raise exception 'A unidade do item com estoque não pode ser alterada.';end if;
   update public.stock_items set nome=new.nome,observacoes=new.observacoes,ativo=new.ativo
    where id=s.id and (nome,observacoes,ativo) is distinct from (new.nome,new.observacoes,new.ativo);
  end if;
 elsif tg_table_name='stock_items' then
  update public.products set nome=new.nome,observacoes=new.observacoes,ativo=new.ativo
   where stock_item_id=new.id and (nome,observacoes,ativo) is distinct from (new.nome,new.observacoes,new.ativo);
 end if;
 return new;
end $$;
