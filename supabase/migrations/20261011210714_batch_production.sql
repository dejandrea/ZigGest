-- Production consumes the recipe once and stores finished goods. Sales keep
-- using the existing direct 1:1 components of each finished product.
alter table public.products add column supply_mode text not null default 'DIRECT'
 check(supply_mode in ('DIRECT','PRODUCTION'));
alter table public.products add constraint production_requires_stock check(supply_mode<>'PRODUCTION' or stock_item_id is not null);
create table public.production_recipes(
 id uuid primary key,numero bigserial unique not null,nome text not null check(length(btrim(nome)) between 1 and 200),
 inputs jsonb not null,outputs jsonb not null,ativo boolean not null default true,observacoes text not null default '',
 revision integer not null default 0,actor_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.production_batches(
 id uuid primary key,numero bigserial unique not null,recipe_id uuid not null references public.production_recipes(id),
 recipe_nome text not null,recipe_revision integer not null,location_id uuid not null references public.stock_locations(id),
 multiplier numeric(18,3) not null,status text not null default 'CONFIRMED' check(status in ('CONFIRMED','REVERSED')),
 inputs jsonb not null,outputs jsonb not null,extra_cost numeric(12,2) not null,total_cost numeric(12,2) not null,
 observacoes text not null,ocorrido_em timestamptz not null,actor_id uuid not null references auth.users(id),actor_nome text not null,
 movement_id uuid not null references public.stock_movements(id),payload jsonb not null,
 reverse_movement_id uuid references public.stock_movements(id),reverse_reason text,reverse_actor uuid references auth.users(id),
 created_at timestamptz not null default now(),reversed_at timestamptz
);
create index production_batches_recipe_idx on public.production_batches(recipe_id);
create index production_batches_location_idx on public.production_batches(location_id);
create index production_batches_actor_idx on public.production_batches(actor_id);
create index production_batches_date_idx on public.production_batches(ocorrido_em desc);
create index production_batches_movement_idx on public.production_batches(movement_id);
create index production_batches_reverse_idx on public.production_batches(reverse_movement_id) where reverse_movement_id is not null;
create index production_batches_reverse_actor_idx on public.production_batches(reverse_actor) where reverse_actor is not null;
create table app_private.production_requests(id uuid primary key,actor_id uuid not null references auth.users(id),payload jsonb not null,result jsonb not null);
alter table app_private.production_requests enable row level security;
revoke all on app_private.production_requests from public,anon,authenticated;
do $$declare t text;begin
 foreach t in array array['production_recipes','production_batches'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy production_read on public.%I for select to authenticated using ((select app_private.app_role()) in (''MASTER'',''ADMIN'',''OPERATOR''))',t);
  execute format('create trigger production_audit after insert or update or delete on public.%I for each row execute function app_private.audit_operation()',t);
 end loop;
end $$;
revoke all on sequence public.production_recipes_numero_seq,public.production_batches_numero_seq from public,anon,authenticated;
alter table public.stock_movements drop constraint stock_movements_tipo_check;
alter table public.stock_movements add constraint stock_movements_tipo_check check(tipo in ('ENTRADA','SAIDA','AJUSTE','TRANSFERENCIA','PRODUCAO','ESTORNO_PRODUCAO'));

-- Extend the atomic item registration; preserve its request replay protection.
do $$declare d text;begin
 d:=pg_get_functiondef('app_private.save_registered_item(uuid,bigint,bigint,jsonb)'::regprocedure);
 d:=replace(d,'''product_updated_at'',''stock_updated_at''','''product_updated_at'',''stock_updated_at'',''supply_mode''');
 d:=replace(d,'if not is_product and not is_stock then',
  'if coalesce(p_data->>''supply_mode'',''DIRECT'') not in (''DIRECT'',''PRODUCTION'') or (p_data->>''supply_mode''=''PRODUCTION'' and (not is_product or not is_stock)) then raise exception ''Produtos abastecidos por produção precisam de estoque próprio (Produto e Insumo).'';end if;'||chr(10)||' if not is_product and not is_stock then');
 d:=replace(d,'answer:=jsonb_build_object(''product'',product_data,''stock'',stock_data);',
  'if is_product then update public.products set supply_mode=coalesce(p_data->>''supply_mode'',''DIRECT'') where id=p.id returning * into p; product_data:=product_data||jsonb_build_object(''supply_mode'',p.supply_mode,''updated_at'',p.updated_at);end if;'||chr(10)||' answer:=jsonb_build_object(''product'',product_data,''stock'',stock_data);');
 if position('Produtos abastecidos' in d)=0 or position('set supply_mode=' in d)=0 then raise exception 'Item registration definition mismatch';end if;
 execute d;
end $$;

create function app_private.production_operation(p_request uuid,p_id uuid,p_action text,p_revision integer,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();role_name text:=app_private.app_role();previous app_private.production_requests;
 recipe public.production_recipes;batch public.production_batches;payload jsonb;answer jsonb;
 line jsonb;source public.stock_items;product public.products;qty numeric;price numeric;factor numeric;
 input_rows jsonb:='[]';output_rows jsonb:='[]';seen uuid[]:='{}';sid uuid;movement uuid:=gen_random_uuid();
 origin uuid;cost numeric:=0;extras numeric;expected numeric;occurred timestamptz;
begin
 if actor is null or coalesce(role_name,'') not in ('MASTER','ADMIN','OPERATOR') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if p_request is null or p_id is null or p_action is null or p_action not in ('RECIPE','PRODUCE','REVERSE') or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Operação de produção inválida.';end if;
 payload:=jsonb_build_object('id',p_id,'action',p_action,'revision',p_revision,'data',p_data);
 perform pg_advisory_xact_lock(hashtextextended('production-request:'||p_request::text,0));
 select * into previous from app_private.production_requests where id=p_request;
 if found then
  if previous.actor_id<>actor or previous.payload<>payload then raise exception 'Pedido já utilizado em outra operação.';end if;
  return previous.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('production:'||p_id::text,0));
 if p_action='RECIPE' then
  select * into recipe from public.production_recipes where id=p_id for update;
  if found and p_revision is distinct from recipe.revision then raise exception 'Ficha alterada em outra sessão. Atualize antes de salvar.';end if;
  if length(btrim(coalesce(p_data->>'nome',''))) not between 1 and 200 or length(coalesce(p_data->>'observacoes',''))>2000
   or jsonb_typeof(p_data->'inputs') is distinct from 'array' or jsonb_typeof(p_data->'outputs') is distinct from 'array'
   or jsonb_array_length(p_data->'inputs') not between 1 and 50 or jsonb_array_length(p_data->'outputs') not between 1 and 50 then raise exception 'Informe nome, ingredientes e produtos da ficha.';end if;
  for line in select value from jsonb_array_elements(p_data->'inputs') loop
   sid:=(line->>'item_id')::uuid;qty:=(line->>'quantidade')::numeric;price:=coalesce((line->>'custo_unitario')::numeric,0);
   select * into source from public.stock_items where id=sid;
   if not found or not source.ativo or sid=any(seen) or qty is null or qty<=0 or qty>999999999.999 or qty<>round(qty,3) or price<0 or price>9999999.99 or price<>round(price,2) then raise exception 'Ingrediente, quantidade ou custo inválido.';end if;
   seen:=array_append(seen,sid);
   input_rows:=input_rows||jsonb_build_array(jsonb_build_object('item_id',sid,'quantidade',qty,'custo_unitario',price));
  end loop;
  seen:='{}';
  for line in select value from jsonb_array_elements(p_data->'outputs') loop
   select * into product from public.products where id=(line->>'product_id')::uuid;
   qty:=(line->>'quantidade')::numeric;
   if not found or not product.ativo or product.supply_mode<>'PRODUCTION' or product.id=any(seen) or qty is null or qty<=0 or qty>999999999.999 or qty<>round(qty,3) then raise exception 'Escolha produtos ativos abastecidos por produção e um rendimento válido.';end if;
   if exists(select 1 from jsonb_array_elements(input_rows) i where i->>'item_id'=product.stock_item_id::text) then raise exception 'O produto acabado não pode ser ingrediente da própria ficha.';end if;
   seen:=array_append(seen,product.id);output_rows:=output_rows||jsonb_build_array(jsonb_build_object('product_id',product.id,'quantidade',qty));
  end loop;
  insert into public.production_recipes(id,nome,inputs,outputs,ativo,observacoes,actor_id)
   values(p_id,upper(btrim(p_data->>'nome')),input_rows,output_rows,coalesce((p_data->>'ativo')::boolean,true),coalesce(p_data->>'observacoes',''),actor)
   on conflict(id) do update set nome=excluded.nome,inputs=excluded.inputs,outputs=excluded.outputs,ativo=excluded.ativo,observacoes=excluded.observacoes,revision=production_recipes.revision+1,updated_at=clock_timestamp() returning * into recipe;
  answer:=to_jsonb(recipe);
 elsif p_action='PRODUCE' then
  if exists(select 1 from public.production_batches where id=p_id) then raise exception 'Produção já registrada.';end if;
  select * into recipe from public.production_recipes where id=(p_data->>'recipe_id')::uuid for share;
  if not found or not recipe.ativo then raise exception 'Ficha técnica indisponível.';end if;
  if p_revision is distinct from recipe.revision then raise exception 'A ficha foi alterada. Atualize antes de produzir.';end if;
  factor:=(p_data->>'multiplier')::numeric;origin:=coalesce((p_data->>'location_id')::uuid,app_private.main_stock_location());
  extras:=coalesce((p_data->>'extra_cost')::numeric,0);occurred:=coalesce((p_data->>'ocorrido_em')::timestamptz,now());
  if factor is null or factor<=0 or factor>999999 or factor<>round(factor,3) or extras<0 or extras>9999999999.99 or extras<>round(extras,2)
   or occurred>now()+interval '5 minutes' or length(coalesce(p_data->>'observacoes',''))>2000
   or jsonb_typeof(p_data->'outputs') is distinct from 'array' or jsonb_array_length(p_data->'outputs') not between 1 and 50 then raise exception 'Informe lotes, quantidades produzidas, data e custos válidos.';end if;
  if not exists(select 1 from public.stock_locations where id=origin and ativo) then raise exception 'Escolha um setor de consumo ativo.';end if;
  -- Lock products, then all stock metadata in UUID order, as sales do.
  perform id from public.products where id in(select (v->>'product_id')::uuid from jsonb_array_elements(recipe.outputs) v) order by id for update;
  perform id from public.stock_items where id in(select (v->>'item_id')::uuid from jsonb_array_elements(recipe.inputs) v union select stock_item_id from public.products where id in(select (v->>'product_id')::uuid from jsonb_array_elements(recipe.outputs) v)) order by id for update;
  for line in select value from jsonb_array_elements(recipe.inputs) loop
   select * into source from public.stock_items where id=(line->>'item_id')::uuid;
   qty:=(line->>'quantidade')::numeric*factor;
   if not source.ativo or qty<>round(qty,3) then raise exception 'Ingrediente inativo ou consumo fora da precisão: %.',source.nome;end if;
   price:=(line->>'custo_unitario')::numeric;cost:=cost+round(qty*price,2);
   input_rows:=input_rows||jsonb_build_array(jsonb_build_object('item_id',source.id,'nome',source.nome,'unidade',source.unidade,'quantidade',qty,'custo_unitario',price,'custo_total',round(qty*price,2)));
  end loop;
  for line in select value from jsonb_array_elements(p_data->'outputs') loop
   select * into product from public.products where id=(line->>'product_id')::uuid;
   select (v->>'quantidade')::numeric*factor into expected from jsonb_array_elements(recipe.outputs) v where v->>'product_id'=product.id::text;
   qty:=(line->>'quantidade')::numeric;
   if not found or expected is null or not product.ativo or product.supply_mode<>'PRODUCTION' or product.id=any(seen) or qty is null or qty<0 or qty>999999999.999 or qty<>round(qty,3)
    or not exists(select 1 from public.stock_items where id=product.stock_item_id and ativo) then raise exception 'Produto ou quantidade produzida inválidos.';end if;
   seen:=array_append(seen,product.id);
   output_rows:=output_rows||jsonb_build_array(jsonb_build_object('product_id',product.id,'item_id',product.stock_item_id,'nome',product.nome,'unidade',product.unidade,'previsto',expected,'quantidade',qty));
  end loop;
  if jsonb_array_length(output_rows)<>jsonb_array_length(recipe.outputs) or not exists(select 1 from jsonb_array_elements(output_rows) v where (v->>'quantidade')::numeric>0) then raise exception 'Informe todos os produtos da ficha, com ao menos um resultado maior que zero.';end if;
  insert into public.stock_movements(id,tipo,descricao,quantidade,fator,actor_id,payload,observacoes,ocorrido_em)
   values(movement,'PRODUCAO','Produção: '||recipe.nome,factor,1,actor,payload,coalesce(p_data->>'observacoes',''),occurred);
  for line in select value from jsonb_array_elements(input_rows) loop
   select * into source from public.stock_items where id=(line->>'item_id')::uuid;
   insert into public.stock_movement_lines(movement_id,stock_item_id,nome,unidade,quantidade,saldo_apos,location_id)
    values(movement,source.id,line->>'nome',line->>'unidade',-(line->>'quantidade')::numeric,source.saldo-(line->>'quantidade')::numeric,origin);
  end loop;
  for line in select value from jsonb_array_elements(output_rows) where (value->>'quantidade')::numeric>0 loop
   select * into source from public.stock_items where id=(line->>'item_id')::uuid;
   insert into public.stock_movement_lines(movement_id,stock_item_id,nome,unidade,quantidade,saldo_apos,location_id)
    values(movement,source.id,line->>'nome',line->>'unidade',(line->>'quantidade')::numeric,source.saldo+(line->>'quantidade')::numeric,app_private.main_stock_location());
  end loop;
  insert into public.production_batches(id,recipe_id,recipe_nome,recipe_revision,location_id,multiplier,inputs,outputs,extra_cost,total_cost,observacoes,ocorrido_em,actor_id,actor_nome,movement_id,payload)
   values(p_id,recipe.id,recipe.nome,recipe.revision,origin,factor,input_rows,output_rows,extras,cost+extras,coalesce(p_data->>'observacoes',''),occurred,actor,(select d.nome from app_private.account_directory d join public.app_profiles p on p.account_id=d.id where p.auth_user_id=actor),movement,payload) returning * into batch;
  answer:=to_jsonb(batch)-'payload';
 else
  if role_name not in ('MASTER','ADMIN') then raise exception 'Somente administradores podem estornar produções.' using errcode='42501';end if;
  select * into batch from public.production_batches where id=p_id for update;
  if not found or batch.status<>'CONFIRMED' then raise exception 'Produção inexistente ou já estornada.';end if;
  if length(btrim(coalesce(p_data->>'motivo',''))) not between 3 and 2000 then raise exception 'Informe o motivo do estorno.';end if;
  perform s.id from public.stock_items s where s.id in(select stock_item_id from public.stock_movement_lines where movement_id=batch.movement_id) order by s.id for update;
  -- An undo must not consume goods that have already been sold or transferred.
  if exists(select 1 from public.stock_movement_lines l join public.stock_balances b using(stock_item_id,location_id) where l.movement_id=batch.movement_id and l.quantidade>0 and b.saldo<l.quantidade) then raise exception 'Estorno indisponível: produtos já vendidos, consumidos ou transferidos. Reponha o saldo no principal antes de estornar.';end if;
  insert into public.stock_movements(id,tipo,descricao,quantidade,fator,actor_id,payload,observacoes,ocorrido_em)
   values(movement,'ESTORNO_PRODUCAO','Estorno de produção #'||batch.numero,1,1,actor,payload,btrim(p_data->>'motivo'),now());
  insert into public.stock_movement_lines(movement_id,stock_item_id,nome,unidade,quantidade,saldo_apos,location_id)
   select movement,l.stock_item_id,l.nome,l.unidade,-l.quantidade,s.saldo-l.quantidade,l.location_id from public.stock_movement_lines l join public.stock_items s on s.id=l.stock_item_id where l.movement_id=batch.movement_id order by l.stock_item_id,l.location_id;
  update public.production_batches set status='REVERSED',reverse_movement_id=movement,reverse_reason=btrim(p_data->>'motivo'),reverse_actor=actor,reversed_at=now() where id=p_id returning * into batch;
  answer:=to_jsonb(batch)-'payload';
 end if;
 insert into app_private.production_requests(id,actor_id,payload,result) values(p_request,actor,payload,answer);
 return answer;
end $$;
create function public.production_operation(p_request uuid,p_id uuid,p_action text,p_revision integer,p_data jsonb)
returns jsonb language sql security invoker set search_path='' as $$select app_private.production_operation(p_request,p_id,p_action,p_revision,p_data)$$;
revoke all on function app_private.production_operation(uuid,uuid,text,integer,jsonb),public.production_operation(uuid,uuid,text,integer,jsonb) from public,anon;
grant execute on function app_private.production_operation(uuid,uuid,text,integer,jsonb),public.production_operation(uuid,uuid,text,integer,jsonb) to authenticated;
notify pgrst,'reload schema';
