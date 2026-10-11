-- Normalize a derived average cost to six decimals before storing it.
do $migration$
declare definition text;updated text;
begin
 definition:=pg_get_functiondef('app_private.edit_stock_invoice(uuid,integer,uuid,jsonb,jsonb,timestamp with time zone,text)'::regprocedure);
 updated:=replace(definition,'sum(valor_total)/sum(quantidade_estoque)','round(sum(valor_total)/sum(quantidade_estoque),6)');
 if updated=definition then raise exception 'Invoice average cost patch failed';end if;
 execute updated;
end $migration$;
notify pgrst,'reload schema';
