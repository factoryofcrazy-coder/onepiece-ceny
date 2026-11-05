-- Registrácia: je prezývka voľná? Vráti len áno/nie, zoznam prezývok ostáva pre neprihlásených skrytý.
-- Rovnaké porovnanie ako v handle_new_user. Pri súbehu dvoch registrácií ostáva v platnosti pridanie čísla v handle_new_user.
create or replace function public.username_available(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(trim(p_name)));
$$;
revoke execute on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;
