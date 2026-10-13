alter table public.suppliers
 add column inscricao_estadual text not null default ''
 constraint suppliers_ie_length check (char_length(inscricao_estadual)<=50);

comment on column public.suppliers.inscricao_estadual is 'Optional state registration; preserves leading zeros and accepts ISENTO.';
notify pgrst, 'reload schema';
