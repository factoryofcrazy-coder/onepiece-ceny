-- Grand Line Tracker – levely za aktivitu (4. 11. 2026). Rank sa počíta z ELO v tabuľke ratings.
-- XP počíta len databáza, klient ich nevie zapísať. Spustiť v SQL Editore: vložiť celý súbor → Run.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

create table if not exists public.user_xp (
  user_id uuid primary key references auth.users on delete cascade,
  xp int not null default 0 check (xp >= 0),
  updated_at timestamptz not null default now()
);
create table if not exists public.xp_log (
  user_id uuid not null references auth.users on delete cascade,
  day date not null default ((now() at time zone 'Europe/Bratislava')::date),
  source text not null,
  points int not null default 0,
  last_at timestamptz not null default now(),
  primary key (user_id, day, source)
);
alter table public.user_xp enable row level security;
alter table public.xp_log enable row level security;
revoke all on public.user_xp, public.xp_log from anon, authenticated;
grant select on public.user_xp, public.xp_log to authenticated;
drop policy if exists "xp_read" on public.user_xp;
create policy "xp_read" on public.user_xp for select to authenticated using (true);
drop policy if exists "xp_log_own" on public.xp_log;
create policy "xp_log_own" on public.xp_log for select to authenticated using (user_id = (select auth.uid()));

-- body, denný strop a najkratší odstup medzi udelením pre každú aktivitu
create or replace function public.award_xp(p_user uuid, p_source text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  pts int; cap int; gap interval;
  today date := (now() at time zone 'Europe/Bratislava')::date;
  have int; last timestamptz; give int;
begin
  if p_user is null then return; end if;
  case p_source
    when 'chat' then pts := 2; cap := 30; gap := interval '20 seconds';
    when 'game' then pts := 20; cap := 100; gap := interval '0';
    when 'training' then pts := 5; cap := 25; gap := interval '3 minutes';
    when 'collection' then pts := 2; cap := 20; gap := interval '10 seconds';
    when 'trade' then pts := 5; cap := 15; gap := interval '0';
    when 'report' then pts := 5; cap := 10; gap := interval '0';
    when 'daily' then pts := 10; cap := 10; gap := interval '0';
    else return;
  end case;
  select points, last_at into have, last from public.xp_log where user_id = p_user and day = today and source = p_source for update;
  have := coalesce(have, 0);
  if have >= cap or (last is not null and now() - last < gap) then return; end if;
  give := least(pts, cap - have);
  insert into public.xp_log (user_id, day, source, points, last_at) values (p_user, today, p_source, give, now())
    on conflict (user_id, day, source) do update set points = public.xp_log.points + give, last_at = now();
  insert into public.user_xp (user_id, xp) values (p_user, give)
    on conflict (user_id) do update set xp = public.user_xp.xp + give, updated_at = now();
end $$;
revoke execute on function public.award_xp(uuid, text) from public, anon, authenticated;

-- denné prihlásenie a dohraný tréning hlási klient, preto majú prísny strop a odstup
create or replace function public.xp_daily() returns void language sql security definer set search_path = '' as $$
  select public.award_xp(auth.uid(), 'daily');
$$;
create or replace function public.xp_training() returns void language sql security definer set search_path = '' as $$
  select public.award_xp(auth.uid(), 'training');
$$;
revoke execute on function public.xp_daily(), public.xp_training() from public, anon;
grant execute on function public.xp_daily(), public.xp_training() to authenticated;

create or replace function public.xp_from_row() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.award_xp(new.user_id, TG_ARGV[0]);
  return null;
end $$;
revoke execute on function public.xp_from_row() from public, anon, authenticated;
drop trigger if exists xp_chat on public.chat_messages;
create trigger xp_chat after insert on public.chat_messages for each row execute function public.xp_from_row('chat');
drop trigger if exists xp_trade on public.trade_listings;
create trigger xp_trade after insert on public.trade_listings for each row execute function public.xp_from_row('trade');
drop trigger if exists xp_report on public.feedback;
create trigger xp_report after insert on public.feedback for each row execute function public.xp_from_row('report');

-- import zbierky môže vložiť tisíce riadkov naraz, ráta sa ako jedna aktivita
create or replace function public.xp_collection() returns trigger language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  for u in select distinct user_id from new_rows loop
    perform public.award_xp(u, 'collection');
  end loop;
  return null;
end $$;
revoke execute on function public.xp_collection() from public, anon, authenticated;
drop trigger if exists xp_collection on public.collection;
create trigger xp_collection after insert on public.collection
  referencing new table as new_rows for each statement execute function public.xp_collection();

-- dohraná online hra: XP pre oboch, ale len keď sa odohralo aspoň 6 ťahov (nie hneď vzdaná hra s kamošom)
create or replace function public.xp_game() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' and coalesce(new.turn, 0) >= 6 and new.guest is not null then
    perform public.award_xp(new.host, 'game');
    perform public.award_xp(new.guest, 'game');
  end if;
  return null;
end $$;
revoke execute on function public.xp_game() from public, anon, authenticated;
drop trigger if exists xp_game on public.games;
create trigger xp_game after update on public.games for each row execute function public.xp_game();

commit;
