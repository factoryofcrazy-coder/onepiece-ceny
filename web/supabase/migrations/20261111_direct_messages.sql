-- Súkromné správy. Text je v dm_messages šifrovaný funkciou "dm", kľúč je mimo databázy.
-- Klient číta priamo len dm_members (počty neprečítaných a Realtime signály bez textu),
-- všetko ostatné ide cez Edge Function "dm" a funkcie nižšie, ktoré smie volať len service_role.
-- Chyby začínajúce "DM: " sa zobrazujú používateľovi. Podrobnosti: web/docs/spravy/NAVRH.md

create table if not exists public.dm_conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users on delete cascade,
  user_b uuid not null references auth.users on delete cascade,
  requested_by uuid not null references auth.users on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);
create index if not exists dm_conversations_requester_idx on public.dm_conversations (requested_by, created_at desc);

create table if not exists public.dm_members (
  conversation_id uuid not null references public.dm_conversations on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  unread int not null default 0,
  last_read_at timestamptz,
  last_message_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists dm_members_user_idx on public.dm_members (user_id, last_message_at desc);

create table if not exists public.dm_messages (
  id uuid primary key,
  conversation_id uuid not null references public.dm_conversations on delete cascade,
  sender_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  ciphertext text not null check (char_length(ciphertext) <= 12000),
  iv text not null check (char_length(iv) <= 40),
  key_version smallint not null
);
create index if not exists dm_messages_conv_idx on public.dm_messages (conversation_id, created_at desc);
create index if not exists dm_messages_sender_idx on public.dm_messages (sender_id, created_at desc);
create index if not exists dm_messages_created_idx on public.dm_messages (created_at);

create table if not exists public.dm_blocks (
  blocker uuid not null references auth.users on delete cascade,
  blocked uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);
create index if not exists dm_blocks_blocked_idx on public.dm_blocks (blocked);

-- kópia šifrovanej správy, aby nahlásenie prežilo zmazanie správy; sender_id je zámerne bez cudzieho kľúča,
-- lebo je súčasťou overenia šifry
create table if not exists public.dm_reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  message_id uuid not null,
  conversation_id uuid not null,
  sender_id uuid not null,
  message_at timestamptz not null,
  reporter uuid references auth.users on delete set null,
  ciphertext text not null,
  iv text not null,
  key_version smallint not null,
  reason text check (char_length(reason) <= 300),
  status text not null default 'new' check (status in ('new', 'done')),
  resolved_at timestamptz,
  unique (message_id, reporter)
);
create index if not exists dm_reports_reporter_idx on public.dm_reports (reporter, created_at desc);

alter table public.dm_conversations enable row level security;
alter table public.dm_members enable row level security;
alter table public.dm_messages enable row level security;
alter table public.dm_blocks enable row level security;
alter table public.dm_reports enable row level security;
revoke all on public.dm_conversations, public.dm_members, public.dm_messages, public.dm_blocks, public.dm_reports from anon, authenticated;
grant all on public.dm_conversations, public.dm_members, public.dm_messages, public.dm_blocks, public.dm_reports to service_role;

create or replace function public.dm_is_member(p_conv uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.dm_members where conversation_id = p_conv and user_id = auth.uid());
$$;
revoke execute on function public.dm_is_member(uuid) from public, anon, authenticated;
grant execute on function public.dm_is_member(uuid) to authenticated, service_role;

grant select (conversation_id, user_id, unread, last_read_at, last_message_at) on public.dm_members to authenticated;
drop policy if exists "dm_members_read" on public.dm_members;
create policy "dm_members_read" on public.dm_members for select to authenticated using (public.dm_is_member(conversation_id));

-- signály "píše" cez súkromný Realtime kanál dm:<id konverzácie>, len v prijatej konverzácii bez blokovania
create or replace function public.dm_can_signal(p_topic text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare conv uuid; me uuid := auth.uid();
begin
  if me is null or p_topic !~ '^dm:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  conv := substring(p_topic from 4)::uuid;
  return exists (
    select 1 from public.dm_conversations c
    where c.id = conv and c.status = 'accepted' and me in (c.user_a, c.user_b)
      and not exists (
        select 1 from public.dm_blocks b
        where (b.blocker = c.user_a and b.blocked = c.user_b) or (b.blocker = c.user_b and b.blocked = c.user_a)
      )
  );
end $$;
revoke execute on function public.dm_can_signal(text) from public, anon, authenticated;
grant execute on function public.dm_can_signal(text) to authenticated, service_role;

drop policy if exists "dm_signal_read" on realtime.messages;
create policy "dm_signal_read" on realtime.messages for select to authenticated
  using (extension = 'broadcast' and public.dm_can_signal(realtime.topic()));
drop policy if exists "dm_signal_write" on realtime.messages;
create policy "dm_signal_write" on realtime.messages for insert to authenticated
  with check (extension = 'broadcast' and public.dm_can_signal(realtime.topic()));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'dm_members') then
    alter publication supabase_realtime add table public.dm_members;
  end if;
end $$;

-- ===== funkcie pre Edge Function, p_me je používateľ overený funkciou =====

create or replace function public.dm_blocked_between(p_a uuid, p_b uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.dm_blocks
    where (blocker = p_a and blocked = p_b) or (blocker = p_b and blocked = p_a)
  );
$$;

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

  select now() - created_at into age from auth.users where id = p_me;
  day_limit := case when age < interval '24 hours' then 3 else 10 end;
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

create or replace function public.dm_insert(p_id uuid, p_conv uuid, p_me uuid, p_ciphertext text, p_iv text, p_key_version smallint)
returns jsonb language plpgsql set search_path = '' as $$
declare
  c public.dm_conversations;
  other uuid;
  prior public.dm_messages;
  was_pending boolean;
  at_time timestamptz;
begin
  select * into c from public.dm_conversations where id = p_conv for update;
  if not found or p_me not in (c.user_a, c.user_b) then raise exception 'DM: Konverzácia sa nenašla.'; end if;
  other := case when p_me = c.user_a then c.user_b else c.user_a end;

  select * into prior from public.dm_messages where id = p_id;
  if found then
    if prior.conversation_id = p_conv and prior.sender_id = p_me then
      return jsonb_build_object('id', prior.id, 'created_at', prior.created_at, 'duplicate', true, 'recipient', other);
    end if;
    raise exception 'DM: Správu sa nepodarilo odoslať.';
  end if;

  if exists (select 1 from public.chat_bans where user_id = p_me) then raise exception 'DM: Máš zablokované písanie.'; end if;
  if public.dm_blocked_between(p_me, other) then raise exception 'DM: Tomuto hráčovi sa teraz nedá napísať.'; end if;

  if p_me = c.requested_by and c.status <> 'accepted' then
    if c.status = 'declined' or exists (select 1 from public.dm_messages where conversation_id = p_conv) then
      raise exception 'DM: Počkaj, kým hráč prijme tvoju žiadosť.';
    end if;
  end if;
  was_pending := c.status <> 'accepted' and p_me = c.requested_by;

  if (select count(*) from public.dm_messages where sender_id = p_me and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'DM: Píšeš priveľmi rýchlo. Počkaj chvíľu.';
  end if;
  if (select count(*) from public.dm_messages where sender_id = p_me and created_at > now() - interval '1 hour') >= 300 then
    raise exception 'DM: Za túto hodinu si poslal priveľa správ. Skús to neskôr.';
  end if;

  at_time := clock_timestamp();
  insert into public.dm_messages (id, conversation_id, sender_id, created_at, ciphertext, iv, key_version)
    values (p_id, p_conv, p_me, at_time, p_ciphertext, p_iv, p_key_version);
  -- odpoveď druhej strany zároveň prijme žiadosť
  update public.dm_conversations
    set last_message_at = at_time, status = case when was_pending then status else 'accepted' end
    where id = p_conv;
  update public.dm_members set last_message_at = at_time, unread = 0, last_read_at = coalesce(case when was_pending then last_read_at else at_time end, last_read_at)
    where conversation_id = p_conv and user_id = p_me;
  update public.dm_members set last_message_at = at_time, unread = unread + 1
    where conversation_id = p_conv and user_id = other;

  return jsonb_build_object('id', p_id, 'created_at', at_time, 'duplicate', false, 'recipient', other, 'is_request', was_pending);
end $$;

create or replace function public.dm_list(p_me uuid)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(r order by r.last_message_at desc), '[]'::jsonb) from (
    select
      c.id,
      -- odosielateľovi sa odmietnutie neukazuje
      case when c.status = 'declined' then 'pending' else c.status end as status,
      c.status = 'pending' and c.requested_by <> p_me as incoming_request,
      o.user_id as other_id,
      coalesce(p.username, 'Hráč') as other_name,
      m.unread,
      o.last_read_at as other_last_read_at,
      c.last_message_at,
      exists (select 1 from public.dm_blocks b where b.blocker = p_me and b.blocked = o.user_id) as blocked_by_me,
      (select jsonb_build_object('id', x.id, 'sender_id', x.sender_id, 'created_at', x.created_at, 'ciphertext', x.ciphertext, 'iv', x.iv, 'key_version', x.key_version)
         from public.dm_messages x where x.conversation_id = c.id order by x.created_at desc limit 1) as last_message
    from public.dm_members m
    join public.dm_conversations c on c.id = m.conversation_id
    join public.dm_members o on o.conversation_id = c.id and o.user_id <> p_me
    left join public.profiles p on p.id = o.user_id
    where m.user_id = p_me
      and not (c.status = 'declined' and c.requested_by <> p_me)
      and (c.requested_by = p_me or exists (select 1 from public.dm_messages x where x.conversation_id = c.id))
    order by c.last_message_at desc
    limit 100
  ) r;
$$;

create or replace function public.dm_history(p_me uuid, p_conv uuid, p_before timestamptz, p_limit int)
returns jsonb language plpgsql stable set search_path = '' as $$
begin
  if not exists (select 1 from public.dm_members where conversation_id = p_conv and user_id = p_me) then
    raise exception 'DM: Konverzácia sa nenašla.';
  end if;
  return (
    select coalesce(jsonb_agg(r order by r.created_at desc), '[]'::jsonb) from (
      select x.id, x.conversation_id, x.sender_id, x.created_at, x.ciphertext, x.iv, x.key_version
      from public.dm_messages x
      where x.conversation_id = p_conv and (p_before is null or x.created_at < p_before)
      order by x.created_at desc
      limit least(greatest(coalesce(p_limit, 50), 1), 100)
    ) r
  );
end $$;

-- správy zo všetkých konverzácií používateľa, po dávkach, na hľadanie vo funkcii
create or replace function public.dm_scan(p_me uuid, p_before timestamptz, p_limit int)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(r order by r.created_at desc), '[]'::jsonb) from (
    select x.id, x.conversation_id, x.sender_id, x.created_at, x.ciphertext, x.iv, x.key_version,
           coalesce(p.username, 'Hráč') as other_name
    from public.dm_members m
    join public.dm_conversations c on c.id = m.conversation_id
    join public.dm_messages x on x.conversation_id = c.id
    join public.dm_members o on o.conversation_id = c.id and o.user_id <> p_me
    left join public.profiles p on p.id = o.user_id
    where m.user_id = p_me
      and not (c.status = 'declined' and c.requested_by <> p_me)
      and (p_before is null or x.created_at < p_before)
    order by x.created_at desc
    limit least(greatest(coalesce(p_limit, 500), 1), 500)
  ) r;
$$;

create or replace function public.dm_mark_read(p_me uuid, p_conv uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare st text;
begin
  select c.status into st from public.dm_conversations c
    join public.dm_members m on m.conversation_id = c.id and m.user_id = p_me
    where c.id = p_conv;
  if st is null then raise exception 'DM: Konverzácia sa nenašla.'; end if;
  -- pri žiadosti cudzí nevidí, že si ju otvoril
  update public.dm_members
    set unread = 0, last_read_at = case when st = 'accepted' then now() else last_read_at end
    where conversation_id = p_conv and user_id = p_me;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.dm_respond(p_me uuid, p_conv uuid, p_accept boolean)
returns jsonb language plpgsql set search_path = '' as $$
declare c public.dm_conversations;
begin
  select * into c from public.dm_conversations where id = p_conv for update;
  if not found or p_me not in (c.user_a, c.user_b) or p_me = c.requested_by or c.status <> 'pending' then
    raise exception 'DM: Žiadosť sa nenašla.';
  end if;
  update public.dm_conversations set status = case when p_accept then 'accepted' else 'declined' end where id = p_conv;
  update public.dm_members set unread = 0 where conversation_id = p_conv and user_id = p_me;
  return jsonb_build_object('ok', true, 'status', case when p_accept then 'accepted' else 'declined' end);
end $$;

create or replace function public.dm_block(p_me uuid, p_other uuid, p_on boolean)
returns jsonb language plpgsql set search_path = '' as $$
begin
  if p_me = p_other then raise exception 'DM: Sám seba zablokovať nemôžeš.'; end if;
  if p_on then
    insert into public.dm_blocks (blocker, blocked) values (p_me, p_other) on conflict do nothing;
    update public.dm_conversations set status = 'declined'
      where status = 'pending' and requested_by = p_other and user_a = least(p_me, p_other) and user_b = greatest(p_me, p_other);
  else
    delete from public.dm_blocks where blocker = p_me and blocked = p_other;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.dm_block_list(p_me uuid)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.blocked, 'name', coalesce(p.username, 'Hráč'), 'created_at', b.created_at) order by b.created_at desc), '[]'::jsonb)
  from public.dm_blocks b left join public.profiles p on p.id = b.blocked
  where b.blocker = p_me;
$$;

create or replace function public.dm_find_user(p_me uuid, p_q text)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(r order by r.name), '[]'::jsonb) from (
    select p.id, p.username as name
    from public.profiles p
    where p.id <> p_me and p.username is not null
      and char_length(p_q) >= 2
      and lower(p.username) like replace(replace(replace(lower(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      and not public.dm_blocked_between(p_me, p.id)
    order by p.username
    limit 10
  ) r;
$$;

create or replace function public.dm_listing(p_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  select to_jsonb(r) from (
    select t.id, t.user_id, t.card_id, t.kind, t.price, t.cond, t.lang from public.trade_listings t where t.id = p_id
  ) r;
$$;

create or replace function public.dm_report(p_me uuid, p_message uuid, p_reason text)
returns jsonb language plpgsql set search_path = '' as $$
declare x public.dm_messages;
begin
  select m.* into x from public.dm_messages m
    join public.dm_members mem on mem.conversation_id = m.conversation_id and mem.user_id = p_me
    where m.id = p_message;
  if not found or x.sender_id = p_me then raise exception 'DM: Správu sa nepodarilo nahlásiť.'; end if;
  if (select count(*) from public.dm_reports where reporter = p_me and created_at > now() - interval '24 hours') >= 20 then
    raise exception 'DM: Dnes si nahlásil priveľa správ. Skús to zajtra.';
  end if;
  insert into public.dm_reports (message_id, conversation_id, sender_id, message_at, reporter, ciphertext, iv, key_version, reason)
    values (x.id, x.conversation_id, x.sender_id, x.created_at, p_me, x.ciphertext, x.iv, x.key_version, left(p_reason, 300))
    on conflict (message_id, reporter) do nothing;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.dm_admin_reports(p_me uuid)
returns jsonb language plpgsql stable set search_path = '' as $$
begin
  if not exists (select 1 from public.admins where user_id = p_me) then raise exception 'DM: Na toto nemáš oprávnenie.'; end if;
  return (
    select coalesce(jsonb_agg(r order by r.created_at), '[]'::jsonb) from (
      select d.id, d.created_at, d.message_id, d.conversation_id, d.sender_id, d.message_at, d.ciphertext, d.iv, d.key_version, d.reason,
             coalesce(s.username, 'Hráč') as sender_name, coalesce(t.username, 'Hráč') as reporter_name
      from public.dm_reports d
      left join public.profiles s on s.id = d.sender_id
      left join public.profiles t on t.id = d.reporter
      where d.status = 'new'
      limit 100
    ) r
  );
end $$;

create or replace function public.dm_admin_resolve(p_me uuid, p_id bigint)
returns jsonb language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.admins where user_id = p_me) then raise exception 'DM: Na toto nemáš oprávnenie.'; end if;
  update public.dm_reports set status = 'done', resolved_at = now() where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'dm_blocked_between(uuid,uuid)', 'dm_open(uuid,uuid)', 'dm_insert(uuid,uuid,uuid,text,text,smallint)', 'dm_list(uuid)',
    'dm_history(uuid,uuid,timestamptz,int)', 'dm_scan(uuid,timestamptz,int)', 'dm_mark_read(uuid,uuid)', 'dm_respond(uuid,uuid,boolean)',
    'dm_block(uuid,uuid,boolean)', 'dm_block_list(uuid)', 'dm_find_user(uuid,text)', 'dm_listing(uuid)', 'dm_report(uuid,uuid,text)',
    'dm_admin_reports(uuid)', 'dm_admin_resolve(uuid,bigint)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- denné upratovanie po 12 mesiacoch, volá ho /api/ping; nič iné nerobí, preto ho smie spustiť ktokoľvek
create or replace function public.dm_cleanup()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.dm_messages where created_at < now() - interval '12 months';
  delete from public.dm_conversations where last_message_at < now() - interval '12 months';
  delete from public.dm_reports where created_at < now() - interval '12 months';
end $$;
revoke execute on function public.dm_cleanup() from public;
grant execute on function public.dm_cleanup() to anon, authenticated, service_role;
