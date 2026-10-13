create table public.invoice_recipients(
 id uuid primary key default gen_random_uuid(),codigo_destinatario bigserial unique not null,
 nome text not null check(length(btrim(nome)) between 1 and 200),nome_fantasia text not null default '' check(length(nome_fantasia)<=500),
 documento text not null unique check(documento ~ '^([0-9]{11}|[0-9]{14})$'),
 inscricao_estadual text not null default '' check(length(inscricao_estadual)<=50),
 contato text not null default '' check(length(contato)<=500),telefone text not null default '' check(length(telefone)<=500),
 email text not null default '' check(length(email)<=500),endereco text not null default '' check(length(endereco)<=500),
 observacoes text not null default '' check(length(observacoes)<=2000),ativo boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.invoice_recipients enable row level security;
revoke all on public.invoice_recipients from public,anon,authenticated;
revoke all on sequence public.invoice_recipients_codigo_destinatario_seq from public,anon,authenticated;
grant select on public.invoice_recipients to authenticated;
grant insert(nome,nome_fantasia,documento,inscricao_estadual,contato,telefone,email,endereco,observacoes,ativo),update(nome,nome_fantasia,documento,inscricao_estadual,contato,telefone,email,endereco,observacoes,ativo) on public.invoice_recipients to authenticated;
grant usage on sequence public.invoice_recipients_codigo_destinatario_seq to authenticated;
create policy recipient_access on public.invoice_recipients for all to authenticated
 using((select app_private.app_role()) in ('MASTER','ADMIN','OPERATOR')) with check((select app_private.app_role()) in ('MASTER','ADMIN','OPERATOR'));
create trigger recipients_updated_at before update on public.invoice_recipients for each row execute function app_private.touch_updated_at();
create trigger recipients_audit after insert or update or delete on public.invoice_recipients for each row execute function app_private.audit_operation();
alter table public.stock_invoices add column recipient_id uuid references public.invoice_recipients(id) on delete restrict;
create index stock_invoice_recipient_idx on public.stock_invoices(recipient_id);
create function app_private.normalize_invoice_recipient() returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.nome:=btrim(new.nome);new.documento:=regexp_replace(new.documento,'[^0-9]','','g');
 if tg_op='UPDATE' and new.documento<>old.documento and exists(select 1 from public.stock_invoices where recipient_id=old.id) then
  raise exception 'O documento de um destinatário com notas vinculadas não pode ser alterado. Cadastre outro destinatário.';end if;
 return new;
end $$;
create function app_private.link_invoice_recipient() returns trigger language plpgsql security definer set search_path='' as $$
begin
 select id into new.recipient_id from public.invoice_recipients where documento=regexp_replace(coalesce(new.destinatario_documento,''),'[^0-9]','','g');
 return new;
end $$;
create function app_private.link_existing_recipient_invoices() returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Attach earlier invoices by document without rewriting their fiscal snapshots.
 update public.stock_invoices set recipient_id=new.id where recipient_id is null and regexp_replace(destinatario_documento,'[^0-9]','','g')=new.documento;
 return new;
end $$;
revoke all on function app_private.normalize_invoice_recipient(),app_private.link_invoice_recipient(),app_private.link_existing_recipient_invoices() from public,anon,authenticated;
create trigger normalize_invoice_recipient before insert or update on public.invoice_recipients for each row execute function app_private.normalize_invoice_recipient();
create trigger link_invoice_recipient before insert or update of destinatario_documento,recipient_id on public.stock_invoices for each row execute function app_private.link_invoice_recipient();
create trigger link_existing_recipient_invoices after insert or update of documento on public.invoice_recipients for each row execute function app_private.link_existing_recipient_invoices();
notify pgrst,'reload schema';
