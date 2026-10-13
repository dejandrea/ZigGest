-- Converting a direct recipe to stocked production changes future sales only;
-- previously recorded consumption remains immutable in the stock history.
do $$declare d text;begin
 d:=pg_get_functiondef('app_private.save_registered_item(uuid,bigint,bigint,jsonb)'::regprocedure);
 d:=replace(d,'if is_stock and is_product and p.id is not null and p.stock_item_id is null',
  'if coalesce(p_data->>''supply_mode'',''DIRECT'')<>''PRODUCTION'' and is_stock and is_product and p.id is not null and p.stock_item_id is null');
 if position('''PRODUCTION'' and is_stock and is_product' in d)=0 then raise exception 'Recipe conversion definition mismatch';end if;
 execute d;
end $$;
notify pgrst,'reload schema';
