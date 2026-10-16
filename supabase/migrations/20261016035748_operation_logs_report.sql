begin;
set local lock_timeout='5s';

create index operation_logs_entity_id_idx on app_private.operation_logs(entity,id desc);
create index operation_logs_actor_id_idx on app_private.operation_logs(actor_id,id desc);

-- Keep the audit table private and immutable. Only authorized report queries
-- can cross this boundary; list results never carry the full row snapshots.
create function app_private.operation_logs_report(p_filters jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 search_text text:=btrim(coalesce(p_filters->>'search',''));
 entity_filter text:=nullif(p_filters->>'entity','');
 action_filter text:=nullif(p_filters->>'action','');
 actor_filter text:=nullif(p_filters->>'actor','');
 from_date date:=nullif(p_filters->>'from','')::date;
 to_date date:=nullif(p_filters->>'to','')::date;
 cursor_id bigint:=nullif(p_filters->>'before','')::bigint;
 detail_id bigint:=nullif(p_filters->>'id','')::bigint;
 rows_data jsonb; entities_data jsonb; actors_data jsonb; detail_data jsonb;
 hidden_keys text[]:=array['password','senha','password_hash','xml','xml_original','payload',
   'access_token','refresh_token','secret','token','raw_user_meta_data','raw_app_meta_data'];
begin
 if auth.uid() is null or coalesce(app_private.app_role(),'') not in ('MASTER','ADMIN') then
  raise exception 'Sem permissão para consultar os registros de operações.' using errcode='42501';
 end if;
 if length(search_text)>200 or (from_date is not null and to_date is not null and from_date>to_date)
   or (action_filter is not null and action_filter not in ('INSERT','UPDATE','DELETE')) then
  raise exception 'Confira os filtros dos registros de operações.' using errcode='22023';
 end if;
 if detail_id is not null then
  select jsonb_build_object('id',l.id::text,'occurredAt',l.occurred_at,'actor',coalesce(d.nome,case when l.actor_id is null then 'Sistema / importação' else 'Usuário indisponível' end),
   'actorRole',l.actor_role,'entity',l.entity,'recordId',l.record_id,'action',l.action,
   'before',l.before_data-hidden_keys,'after',l.after_data-hidden_keys)
  into detail_data from app_private.operation_logs l
  left join public.app_profiles p on p.auth_user_id=l.actor_id
  left join app_private.account_directory d on d.id=p.account_id
  where l.id=detail_id and (l.entity like 'public.%' and l.entity<>'public.app_profiles' or l.entity='app_private.account_directory');
  if detail_data is null then raise exception 'Registro de operação não encontrado.' using errcode='P0002';end if;
  return detail_data;
 end if;
 with page as (
  select l.*,coalesce(d.nome,case when l.actor_id is null then 'Sistema / importação' else 'Usuário indisponível' end) actor_name,
   coalesce(l.after_data->>'nome',l.before_data->>'nome',l.after_data->>'descricao',l.before_data->>'descricao',
    l.after_data->>'fornecedor_nome',l.before_data->>'fornecedor_nome',l.after_data->>'nome_cliente',l.before_data->>'nome_cliente','') description,
   coalesce(l.after_data->>'codigo_conta',l.before_data->>'codigo_conta',l.after_data->>'codigo_cliente',l.before_data->>'codigo_cliente',
    l.after_data->>'codigo_produto',l.before_data->>'codigo_produto',l.after_data->>'codigo_insumo',l.before_data->>'codigo_insumo',
    l.after_data->>'codigo_fornecedor',l.before_data->>'codigo_fornecedor',l.after_data->>'codigo_mesa',l.before_data->>'codigo_mesa',l.after_data->>'numero',l.before_data->>'numero',l.record_id) reference
  from app_private.operation_logs l
  left join public.app_profiles p on p.auth_user_id=l.actor_id
  left join app_private.account_directory d on d.id=p.account_id
  where (l.entity like 'public.%' and l.entity<>'public.app_profiles' or l.entity='app_private.account_directory')
   and (entity_filter is null or l.entity=entity_filter)
   and (action_filter is null or l.action=action_filter)
   and (actor_filter is null or l.actor_id::text=actor_filter or actor_filter='SYSTEM' and l.actor_id is null)
   and (from_date is null or l.occurred_at>=from_date::timestamp at time zone 'America/Bahia')
   and (to_date is null or l.occurred_at<(to_date+1)::timestamp at time zone 'America/Bahia')
   and (cursor_id is null or l.id<cursor_id)
   and (search_text='' or strpos(lower(concat_ws(' ',d.nome,l.record_id,
    l.after_data->>'nome',l.before_data->>'nome',l.after_data->>'descricao',l.before_data->>'descricao',
    l.after_data->>'codigo_conta',l.before_data->>'codigo_conta',l.after_data->>'codigo_cliente',l.before_data->>'codigo_cliente',
    l.after_data->>'codigo_produto',l.before_data->>'codigo_produto',l.after_data->>'codigo_insumo',l.before_data->>'codigo_insumo',
    l.after_data->>'codigo_fornecedor',l.before_data->>'codigo_fornecedor',l.after_data->>'codigo_mesa',l.before_data->>'codigo_mesa',
    l.after_data->>'numero',l.before_data->>'numero')),lower(search_text))>0)
  order by l.id desc limit 51
 ) select coalesce(jsonb_agg(jsonb_build_object('id',id::text,'occurredAt',occurred_at,'actor',actor_name,
   'actorRole',actor_role,'entity',entity,'recordId',record_id,'action',action,'description',description,'reference',reference) order by id desc),'[]')
 into rows_data from page;
 select coalesce(jsonb_agg(entity order by entity),'[]') into entities_data from (
  select distinct entity from app_private.operation_logs where entity like 'public.%' and entity<>'public.app_profiles' or entity='app_private.account_directory'
 ) entities;
 select coalesce(jsonb_agg(jsonb_build_object('id',actor_id::text,'name',actor_name) order by actor_name),'[]') into actors_data from (
  select distinct l.actor_id,coalesce(d.nome,'Usuário indisponível') actor_name from app_private.operation_logs l
  left join public.app_profiles p on p.auth_user_id=l.actor_id left join app_private.account_directory d on d.id=p.account_id
  where l.actor_id is not null
 ) actors;
 return jsonb_build_object('rows',coalesce((select jsonb_agg(value order by ordinality) from jsonb_array_elements(rows_data) with ordinality where ordinality<=50),'[]'),
  'nextCursor',case when jsonb_array_length(rows_data)>50 then rows_data->49->>'id' else null end,
  'entities',entities_data,'actors',actors_data);
end $$;
revoke all on function app_private.operation_logs_report(jsonb) from public,anon;
grant execute on function app_private.operation_logs_report(jsonb) to authenticated;

create function public.operation_logs_report(p_filters jsonb default '{}') returns jsonb
language sql stable security invoker set search_path='' as $$
 select app_private.operation_logs_report(p_filters);
$$;
revoke all on function public.operation_logs_report(jsonb) from public,anon;
grant execute on function public.operation_logs_report(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
