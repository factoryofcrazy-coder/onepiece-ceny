-- Rola service_role nemá prístup k auth.users, vek účtu sa berie z profiles. Práva funkcie ostávajú.
create or replace function public.dm_open(p_me uuid, p_other uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare
  a uuid := least(p_me, p_other);
  b uuid := greatest(p_me, p_other);
  c public.dm_conversations;
  age interval;
  day_limit int;
begin
  if p_me = p_other then raise exception 'DM: Sám sebe napísať nemôžeš.'; end if;
  if not exists (select 1 from public.profiles where id = p_other) then raise exception 'DM: Hráč sa nenašiel.'; end if;
  if exists (select 1 from public.chat_bans where user_id = p_me) then raise exception 'DM: Máš zablokované písanie.'; end if;
  if public.dm_blocked_between(p_me, p_other) then raise exception 'DM: Tomuto hráčovi sa teraz nedá napísať.'; end if;

  select * into c from public.dm_conversations where user_a = a and user_b = b;
  if found then return jsonb_build_object('id', c.id, 'created', false); end if;

  select now() - created_at into age from public.profiles where id = p_me;
  day_limit := case when age is null or age < interval '24 hours' then 3 else 10 end;
  if (select count(*) from public.dm_conversations where requested_by = p_me and created_at > now() - interval '24 hours') >= day_limit then
    raise exception 'DM: Dnes si už oslovil priveľa nových hráčov. Skús to zajtra.';
  end if;

  insert into public.dm_conversations (user_a, user_b, requested_by) values (a, b, p_me)
    on conflict (user_a, user_b) do nothing returning * into c;
  if c.id is null then
    select * into c from public.dm_conversations where user_a = a and user_b = b;
    return jsonb_build_object('id', c.id, 'created', false);
  end if;
  insert into public.dm_members (conversation_id, user_id) values (c.id, a), (c.id, b);
  return jsonb_build_object('id', c.id, 'created', true);
end $$;
