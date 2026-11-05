-- Technický záznam: stránka skenera sa reštartovala počas skenovania (zrejme jej telefón odobral pamäť).
-- Zapisuje len prihlásený používateľ o sebe, čítať môže len správca cez databázu. Bez záberov a bez názvov kariet.
create table if not exists public.scan_crashes (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid default auth.uid() references auth.users on delete cascade,
  ran_s int check (ran_s between 0 and 864000),     -- ako dlho skener bežal pred reštartom
  frames int check (frames >= 0),                   -- koľko snímok spracoval
  cards_before int check (cards_before >= 0),       -- kariet v zozname pred reštartom
  cards_after int check (cards_after >= 0),         -- kariet v zozname po reštarte (rozdiel = stratené)
  engine text check (char_length(engine) <= 80),
  user_agent text check (char_length(user_agent) <= 300)
);
create index if not exists scan_crashes_user_idx on public.scan_crashes (user_id, created_at desc);
alter table public.scan_crashes enable row level security;
revoke all on public.scan_crashes from anon, authenticated;
grant insert (ran_s, frames, cards_before, cards_after, engine, user_agent) on public.scan_crashes to authenticated;
drop policy if exists "scan_crashes_insert_own" on public.scan_crashes;
create policy "scan_crashes_insert_own" on public.scan_crashes for insert to authenticated with check (user_id = (select auth.uid()));

-- najviac 30 záznamov denne od človeka, staršie ako 90 dní sa zmažú
create or replace function public.scan_crash_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.scan_crashes where user_id = new.user_id and created_at > now() - interval '1 day') >= 30 then
    return null;
  end if;
  delete from public.scan_crashes where created_at < now() - interval '90 days';
  return new;
end $$;
revoke execute on function public.scan_crash_before_insert() from public, anon, authenticated;
drop trigger if exists scan_crash_before_insert on public.scan_crashes;
create trigger scan_crash_before_insert before insert on public.scan_crashes
  for each row execute function public.scan_crash_before_insert();
