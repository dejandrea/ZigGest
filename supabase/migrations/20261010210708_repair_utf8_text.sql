-- This repair intentionally uses ASCII SQL so legacy PowerShell decoding cannot
-- corrupt the corrective literals. IDs, links, payloads and amounts are preserved.
update public.financial_payment_methods set nome=U&'Boleto banc\00e1rio' where nome=U&'Boleto banc\00c3\00a1rio';
update public.financial_payment_methods set nome=U&'Cart\00e3o de cr\00e9dito' where nome=U&'Cart\00c3\00a3o de cr\00c3\00a9dito';
update public.financial_payment_methods set nome=U&'Cart\00e3o de d\00e9bito' where nome=U&'Cart\00c3\00a3o de d\00c3\00a9bito';
update public.financial_payment_methods set nome=U&'Transfer\00eancia banc\00e1ria' where nome=U&'Transfer\00c3\00aancia banc\00c3\00a1ria';

-- Repair only reversible UTF-8 sequences decoded as Windows-1252 in application
-- function definitions. Replacing individual sequences also handles mixed text
-- without altering already-correct accents. CREATE OR REPLACE keeps ACLs/owners.
do $$
declare f record;original text;corrected text;broken text;point integer;
begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname in ('public','app_private') and p.prokind='f' and p.prolang in (select oid from pg_language where lanname in ('sql','plpgsql'))
 loop
  original:=pg_get_functiondef(f.oid);corrected:=original;
  for point in select generate_series(160,255) union all select unnest(array[8211,8212,8230,8364,8599]) loop
   begin broken:=convert_from(convert_to(chr(point),'UTF8'),'WIN1252');
   exception when character_not_in_repertoire or untranslatable_character then continue;end;
   corrected:=replace(corrected,broken,chr(point));
  end loop;
  if corrected<>original then execute corrected;end if;
 end loop;
end $$;
