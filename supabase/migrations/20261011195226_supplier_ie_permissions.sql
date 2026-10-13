-- Extend the existing editable-column allowlist; keep RLS and other grants intact.
grant insert(inscricao_estadual), update(inscricao_estadual)
 on public.suppliers to authenticated;
notify pgrst, 'reload schema';
