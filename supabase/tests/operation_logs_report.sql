begin;
set local statement_timeout='60s';
select set_config('request.jwt.claim.sub',(select p.auth_user_id::text from public.app_profiles p
 join app_private.account_directory d on d.id=p.account_id join auth.users u on u.id=p.auth_user_id
 where d.role in ('MASTER','ADMIN') and d.enabled and u.email_confirmed_at is not null limit 1),true);

do $$declare response jsonb;first_id bigint;next_id bigint;detail jsonb;secret_id bigint;customer_id uuid;old_name text;
begin
 if auth.uid() is null then raise exception 'Admin fixture unavailable';end if;
 select id,nome into customer_id,old_name from public.customers order by codigo_cliente limit 1;
 update public.customers set nome=old_name||' [verificação de auditoria]' where id=customer_id;
 select max(id) into first_id from app_private.operation_logs where entity='public.customers' and record_id=customer_id::text;
 detail:=public.operation_logs_report(jsonb_build_object('id',first_id::text));
 if detail->'before'->>'nome'<>old_name or detail->'after'->>'nome'<>old_name||' [verificação de auditoria]' or detail->>'action'<>'UPDATE' then
  raise exception 'CRUD audit snapshots incorrect';end if;
 response:=public.operation_logs_report('{"entity":"public.customers","action":"UPDATE","search":"[verificação de auditoria]"}');
 if jsonb_array_length(response->'rows')<>1 or response->'rows'->0->>'id'<>first_id::text then raise exception 'Filters failed';end if;
 response:=public.operation_logs_report('{}');
 if jsonb_array_length(response->'rows')<>50 or response->>'nextCursor' is null then raise exception 'Page size failed';end if;
 if response->'rows'->0 ? 'before' or response->'rows'->0 ? 'after' then raise exception 'Snapshots exposed in list';end if;
 next_id:=(response->>'nextCursor')::bigint;
 response:=public.operation_logs_report(jsonb_build_object('before',next_id::text));
 if exists(select 1 from jsonb_array_elements(response->'rows') row where (row->>'id')::bigint>=next_id) then raise exception 'Cursor overlap';end if;
 insert into app_private.operation_logs(entity,record_id,action,occurred_at,after_data)
 values('public.customers','audit-test','INSERT','2026-10-16T02:30:00Z',
  '{"nome":"Teste sigiloso de auditoria","password":"segredo","senha":"segredo","xml_original":"conteúdo","payload":{"secret":"segredo"}}') returning id into secret_id;
 detail:=public.operation_logs_report(jsonb_build_object('id',secret_id::text));
 if detail->'after' ?| array['password','senha','xml_original','payload'] then raise exception 'Sensitive data leaked';end if;
 response:=public.operation_logs_report('{"from":"2026-10-16","to":"2026-10-16","search":"Teste sigiloso de auditoria"}');
 if jsonb_array_length(response->'rows')<>0 then raise exception 'Bahia date boundary failed';end if;
 response:=public.operation_logs_report('{"from":"2026-10-15","to":"2026-10-15","actor":"SYSTEM","search":"Teste sigiloso de auditoria"}');
 if jsonb_array_length(response->'rows')<>1 then raise exception 'Date or system actor filter failed';end if;
 begin perform public.operation_logs_report('{"from":"2026-10-16","to":"2026-10-15"}');raise exception 'Invalid dates accepted';exception when invalid_parameter_value then null;end;
end $$;

set local role authenticated;
do $$begin
 perform public.operation_logs_report('{}');
 begin perform count(*) from app_private.operation_logs;raise exception 'Audit table exposed';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
do $$begin
 begin perform public.operation_logs_report('{}');raise exception 'Unknown user authorized';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$begin
 begin perform public.operation_logs_report('{}');raise exception 'Anonymous user authorized';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
