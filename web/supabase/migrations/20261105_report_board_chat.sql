-- Grand Line Tracker – nástenka úloh z reportov a spoločný chat (4. 11. 2026)
-- Spustiť v Supabase: projekt onepiece-tracker → SQL Editor → vložiť celý súbor → Run.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- 1) admini (zmena: insert/delete v tejto tabuľke cez SQL Editor)
create table if not exists public.admins (
  user_id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;
insert into public.admins (user_id) select id from public.profiles where username = 'hobo' on conflict do nothing;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- 2) report ako úloha: verejne len text a stav, kontakt a prehliadač vidí len admin
alter table public.feedback add column if not exists admin_reply text check (char_length(admin_reply) <= 1000);
alter table public.feedback add column if not exists hidden boolean not null default false;
alter table public.feedback add column if not exists updated_at timestamptz not null default now();
alter table public.feedback add column if not exists source text not null default 'web' check (source in ('web', 'game'));
alter table public.feedback add column if not exists game_report_id bigint unique references public.game_reports on delete set null;
alter table public.feedback drop constraint if exists feedback_status_check;
update public.feedback set status = 'new' where status = 'seen';
alter table public.feedback add constraint feedback_status_check check (status in ('new', 'doing', 'done', 'rejected'));
create index if not exists feedback_status_idx on public.feedback (status, created_at desc);

grant select (id, created_at, updated_at, kind, message, page, status, admin_reply, source) on public.feedback to anon, authenticated;
drop policy if exists "feedback_read_public" on public.feedback;
create policy "feedback_read_public" on public.feedback for select to anon, authenticated using (not hidden);

create or replace function public.feedback_admin_list()
returns table (id bigint, created_at timestamptz, kind text, message text, page text, contact text, user_agent text,
               status text, admin_reply text, hidden boolean, source text, username text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Na toto nemáš oprávnenie.'; end if;
  return query
    select f.id, f.created_at, f.kind, f.message, f.page, f.contact, f.user_agent, f.status, f.admin_reply, f.hidden, f.source, p.username
    from public.feedback f left join public.profiles p on p.id = f.user_id
    order by f.created_at desc limit 300;
end $$;
revoke execute on function public.feedback_admin_list() from public, anon;
grant execute on function public.feedback_admin_list() to authenticated;

create or replace function public.feedback_admin_update(p_id bigint, p_status text, p_reply text, p_hidden boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Na toto nemáš oprávnenie.'; end if;
  update public.feedback set status = p_status, admin_reply = nullif(trim(p_reply), ''), hidden = p_hidden, updated_at = now() where id = p_id;
  if not found then raise exception 'Hlásenie sa nenašlo.'; end if;
end $$;
revoke execute on function public.feedback_admin_update(bigint, text, text, boolean) from public, anon;
grant execute on function public.feedback_admin_update(bigint, text, text, boolean) to authenticated;

-- 3) hlásenie z hry vytvorí úlohu; keby úloha zlyhala (limit), hlásenie z hry sa aj tak uloží
create or replace function public.game_report_to_task()
returns trigger language plpgsql security definer set search_path = '' as $$
declare txt text := trim(coalesce(new.message, ''));
begin
  if char_length(txt) < 5 then txt := 'Hlásenie z hry bez popisu'; end if;
  begin
    insert into public.feedback (user_id, kind, message, page, source, game_report_id)
    values (new.user_id, 'bug', left(txt, 2000), 'Hra', 'game', new.id);
  exception when others then
    null;
  end;
  return null;
end $$;
revoke execute on function public.game_report_to_task() from public, anon, authenticated;
drop trigger if exists game_report_to_task on public.game_reports;
create trigger game_report_to_task after insert on public.game_reports
  for each row execute function public.game_report_to_task();

-- staré hlásenia z hry vznikli pred verejnou nástenkou → skryté, kým ich admin nezverejní
insert into public.feedback (created_at, user_id, kind, message, page, source, game_report_id, hidden)
select r.created_at, r.user_id, 'bug',
       case when char_length(trim(coalesce(r.message, ''))) < 5 then 'Hlásenie z hry bez popisu' else left(trim(r.message), 2000) end,
       'Hra', 'game', r.id, true
from public.game_reports r
where not exists (select 1 from public.feedback f where f.game_report_id = r.id);

-- 4) chat: spoločná miestnosť pre prihlásených
create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  username text not null default '',
  body text not null check (char_length(body) between 1 and 500),
  deleted_at timestamptz
);
create index if not exists chat_messages_created_idx on public.chat_messages (created_at desc);
create index if not exists chat_messages_user_idx on public.chat_messages (user_id, created_at desc);
alter table public.chat_messages enable row level security;
revoke all on public.chat_messages from anon, authenticated;
grant select on public.chat_messages to authenticated;
grant insert (body) on public.chat_messages to authenticated;
drop policy if exists "chat_read" on public.chat_messages;
create policy "chat_read" on public.chat_messages for select to authenticated using (true);
drop policy if exists "chat_insert_own" on public.chat_messages;
create policy "chat_insert_own" on public.chat_messages for insert to authenticated with check (user_id = (select auth.uid()));

create table if not exists public.chat_bans (
  user_id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.chat_bans enable row level security;
revoke all on public.chat_bans from anon, authenticated;

create or replace function public.chat_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.chat_bans where user_id = new.user_id) then
    raise exception 'Máš zablokované písanie v chate.';
  end if;
  if (select count(*) from public.chat_messages where user_id = new.user_id and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'Píšeš priveľmi rýchlo. Počkaj chvíľu.';
  end if;
  if (select count(*) from public.chat_messages where created_at > now() - interval '1 hour') >= 1000 then
    raise exception 'V chate je teraz priveľa správ. Skús to o chvíľu.';
  end if;
  new.body := trim(new.body);
  new.username := coalesce((select username from public.profiles where id = new.user_id), 'Hráč');
  return new;
end $$;
revoke execute on function public.chat_before_insert() from public, anon, authenticated;
drop trigger if exists chat_before_insert on public.chat_messages;
create trigger chat_before_insert before insert on public.chat_messages
  for each row execute function public.chat_before_insert();

-- staré správy sa mažú priebežne pri každej novej (bez plánovača)
create or replace function public.chat_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.chat_messages where created_at < now() - interval '30 days';
  return null;
end $$;
revoke execute on function public.chat_cleanup() from public, anon, authenticated;
drop trigger if exists chat_cleanup on public.chat_messages;
create trigger chat_cleanup after insert on public.chat_messages
  for each statement execute function public.chat_cleanup();

create or replace function public.chat_delete_message(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Na toto nemáš oprávnenie.'; end if;
  update public.chat_messages set deleted_at = now(), body = '-' where id = p_id;
end $$;
revoke execute on function public.chat_delete_message(bigint) from public, anon;
grant execute on function public.chat_delete_message(bigint) to authenticated;

create or replace function public.chat_set_ban(p_user uuid, p_banned boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Na toto nemáš oprávnenie.'; end if;
  if p_banned then
    if exists (select 1 from public.admins where user_id = p_user) then raise exception 'Admina sa zablokovať nedá.'; end if;
    insert into public.chat_bans (user_id) values (p_user) on conflict do nothing;
  else
    delete from public.chat_bans where user_id = p_user;
  end if;
end $$;
revoke execute on function public.chat_set_ban(uuid, boolean) from public, anon;
grant execute on function public.chat_set_ban(uuid, boolean) to authenticated;

create or replace function public.chat_ban_list()
returns table (user_id uuid, username text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Na toto nemáš oprávnenie.'; end if;
  return query select b.user_id, p.username from public.chat_bans b left join public.profiles p on p.id = b.user_id order by p.username;
end $$;
revoke execute on function public.chat_ban_list() from public, anon;
grant execute on function public.chat_ban_list() to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

commit;
