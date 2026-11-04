-- Grand Line Tracker – účty, Report a limity proti zneužitiu (4. 11. 2026)
-- Spustiť v Supabase: projekt onepiece-tracker → SQL Editor → vložiť celý súbor → Run.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- 1) prezývky: nikdy nie z e-mailu, 3–24 znakov, bez ohľadu na veľkosť písmen jedinečné
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare base text; candidate text; i int := 0;
begin
  base := left(trim(regexp_replace(coalesce(new.raw_user_meta_data->>'username', ''), '[@<>[:cntrl:]]', '', 'g')), 20);
  if char_length(base) < 3 then
    base := 'Hrac' || left(replace(new.id::text, '-', ''), 6);
  end if;
  candidate := base;
  while exists (select 1 from public.profiles where lower(username) = lower(candidate)) loop
    i := i + 1; candidate := base || i::text;
  end loop;
  insert into public.profiles (id, username) values (new.id, candidate) on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create unique index if not exists profiles_username_lower_key on public.profiles (lower(username));
alter table public.profiles drop constraint if exists profiles_username_valid;
alter table public.profiles add constraint profiles_username_valid
  check (char_length(username) between 3 and 24 and username !~ '[@<>[:cntrl:]]') not valid;

-- 2) zmazanie vlastného účtu (dáta zmažú cudzie kľúče on delete cascade)
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Nie si prihlásený.'; end if;
  delete from auth.users where id = uid;
end $$;
revoke execute on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;

-- 3) Report: spätná väzba od používateľov (poslať môže aj neprihlásený, čítať len správca v Supabase)
create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid default auth.uid() references auth.users on delete set null,
  kind text not null default 'bug' check (kind in ('bug', 'idea', 'other')),
  message text not null check (char_length(message) between 5 and 2000),
  page text check (char_length(page) <= 200),
  contact text check (char_length(contact) <= 120),
  user_agent text check (char_length(user_agent) <= 300),
  status text not null default 'new' check (status in ('new', 'seen', 'done'))
);
create index if not exists feedback_user_idx on public.feedback (user_id, created_at desc);
create index if not exists feedback_created_idx on public.feedback (created_at desc);
alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
grant insert (kind, message, page, contact, user_agent) on public.feedback to anon, authenticated;
drop policy if exists "feedback_insert" on public.feedback;
create policy "feedback_insert" on public.feedback for insert to anon, authenticated
  with check (user_id is not distinct from (select auth.uid()));

create or replace function public.feedback_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.feedback where created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Práve prišlo veľa hlásení, skús to neskôr.';
  end if;
  if new.user_id is null then
    if (select count(*) from public.feedback where user_id is null and created_at > now() - interval '1 hour') >= 20 then
      raise exception 'Práve prišlo veľa hlásení, skús to neskôr alebo sa prihlás.';
    end if;
  elsif (select count(*) from public.feedback where user_id = new.user_id and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Za hodinu môžeš poslať najviac 5 hlásení.';
  end if;
  return new;
end $$;
revoke execute on function public.feedback_limit() from public, anon, authenticated;
drop trigger if exists feedback_limit on public.feedback;
create trigger feedback_limit before insert on public.feedback
  for each row execute function public.feedback_limit();

-- 4) limity počtu riadkov na používateľa (kontrola raz za príkaz, aby import zostal rýchly)
create or replace function public.enforce_user_row_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare lim int := TG_ARGV[0]::int; over_limit boolean;
begin
  execute format(
    'select exists (select 1 from %I.%I t where t.user_id in (select user_id from new_rows) group by t.user_id having count(*) > $1)',
    TG_TABLE_SCHEMA, TG_TABLE_NAME
  ) into over_limit using lim;
  if over_limit then
    raise exception 'Dosiahol si maximum záznamov (%).', lim;
  end if;
  return null;
end $$;
revoke execute on function public.enforce_user_row_limit() from public, anon, authenticated;

drop trigger if exists row_limit on public.collection;
create trigger row_limit after insert on public.collection
  referencing new table as new_rows for each statement execute function public.enforce_user_row_limit('20000');
drop trigger if exists row_limit on public.decks;
create trigger row_limit after insert on public.decks
  referencing new table as new_rows for each statement execute function public.enforce_user_row_limit('100');
drop trigger if exists row_limit on public.trade_listings;
create trigger row_limit after insert on public.trade_listings
  referencing new table as new_rows for each statement execute function public.enforce_user_row_limit('300');
drop trigger if exists row_limit on public.watchlist;
create trigger row_limit after insert on public.watchlist
  referencing new table as new_rows for each statement execute function public.enforce_user_row_limit('500');

-- 5) limity veľkosti (not valid = staré riadky sa nekontrolujú, platí pre nové a menené)
alter table public.collection drop constraint if exists collection_size;
alter table public.collection add constraint collection_size
  check (char_length(card_id) <= 60 and qty between 0 and 9999) not valid;
alter table public.decks drop constraint if exists decks_size;
alter table public.decks add constraint decks_size
  check (char_length(name) <= 100 and char_length(coalesce(notes, '')) <= 5000 and octet_length(cards::text) <= 20000) not valid;

-- 6) hlásenia z hry: najviac 10 za hodinu a 300 kB
create or replace function public.game_report_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.game_reports where user_id = new.user_id and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Za hodinu môžeš poslať najviac 10 hlásení.';
  end if;
  if octet_length(row_to_json(new)::text) > 300000 then
    raise exception 'Hlásenie je príliš veľké.';
  end if;
  return new;
end $$;
revoke execute on function public.game_report_limit() from public, anon, authenticated;
drop trigger if exists game_report_limit on public.game_reports;
create trigger game_report_limit before insert on public.game_reports
  for each row execute function public.game_report_limit();

commit;
