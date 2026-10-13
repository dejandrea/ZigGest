insert into public.app_profiles (auth_user_id, account_id)
select u.id, d.id from auth.users u
join app_private.account_directory d on d.email = lower(u.email)
where not exists (select 1 from public.app_profiles p where p.auth_user_id=u.id or p.account_id=d.id);
