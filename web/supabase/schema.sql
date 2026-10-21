-- Grand Line Tracker – databáza v Supabase (projekt onepiece-tracker, wpmarrzqzcfugtfjitot)
-- Už je nasadená (migrácie init_tables, init_auth_policies, revoke_trigger_fn). Tento súbor je len záznam.

-- tabuľky -------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique,
  created_at timestamptz not null default now()
);
-- card_id = ID varianty z OPTCG API: "OP01-001", "OP01-001_p1" (parallel)…
create table if not exists public.collection (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  card_id text not null check (char_length(card_id) <= 40),
  qty int not null default 0 check (qty >= 0 and qty <= 999),
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id)
);
-- cards = {"OP01-016": 4, ...} podľa herného kódu, leader zvlášť
create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null default 'Nový deck' check (char_length(name) <= 120),
  leader_id text,
  cards jsonb not null default '{}'::jsonb,
  notes text check (char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists decks_user_idx on public.decks (user_id);
create table if not exists public.watchlist (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  product text not null,
  max_eur numeric(10,2),
  created_at timestamptz not null default now(),
  primary key (user_id, product)
);
alter table public.profiles   enable row level security;
alter table public.collection enable row level security;
alter table public.decks      enable row level security;
alter table public.watchlist  enable row level security;

-- profil pri registrácii ----------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare base text; candidate text; i int := 0;
begin
  base := coalesce(nullif(trim(new.raw_user_meta_data->>'username'), ''), split_part(new.email, '@', 1));
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    i := i + 1; candidate := base || i::text;
  end loop;
  insert into public.profiles (id, username) values (new.id, candidate) on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
create or replace trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- prístupy: prihlásení vidia kolekcie/decky všetkých, meniť môžu len svoje --
grant usage on schema public to authenticated, anon;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.collection, public.decks, public.watchlist to authenticated;

create policy "profiles_read" on public.profiles for select to authenticated using (true);
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "collection_read" on public.collection for select to authenticated using (true);
create policy "collection_insert_own" on public.collection for insert to authenticated with check (user_id = (select auth.uid()));
create policy "collection_update_own" on public.collection for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "collection_delete_own" on public.collection for delete to authenticated using (user_id = (select auth.uid()));
create policy "decks_read" on public.decks for select to authenticated using (true);
create policy "decks_insert_own" on public.decks for insert to authenticated with check (user_id = (select auth.uid()));
create policy "decks_update_own" on public.decks for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "decks_delete_own" on public.decks for delete to authenticated using (user_id = (select auth.uid()));
create policy "watchlist_all_own" on public.watchlist for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- keepalive (Vercel cron /api/ping) -----------------------------------------
create or replace function public.ping() returns text language sql stable set search_path = '' as $$ select 'pong'::text $$;
grant execute on function public.ping() to anon, authenticated;

-- =========================================================== online hra + rebríček
-- Stav hry drží a mení len edge function `game` (service role). Hráč číta len svoj pohľad (game_views)
-- a verejné metadáta hry (games). Celý stav so skrytými kartami je v game_private (bez prístupu z klienta).
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open','playing','done','cancelled')),
  host uuid not null references auth.users on delete cascade,
  guest uuid references auth.users on delete set null,
  host_name text not null, guest_name text,
  host_leader text not null, guest_leader text,
  host_deck_name text not null, guest_deck_name text,
  turn int not null default 0,
  to_move uuid, winner uuid, end_reason text,
  rated boolean not null default true,
  version int not null default 0,
  elo_delta int
);
create table if not exists public.game_private (
  game_id uuid primary key references public.games on delete cascade,
  host_deck jsonb not null, guest_deck jsonb, state jsonb
);
create table if not exists public.game_views (
  game_id uuid not null references public.games on delete cascade,
  player uuid not null references auth.users on delete cascade,
  seat smallint not null, version int not null, view jsonb not null,
  primary key (game_id, player)
);
create table if not exists public.ratings (
  user_id uuid primary key references auth.users on delete cascade,
  elo int not null default 1000, wins int not null default 0, losses int not null default 0, games int not null default 0,
  streak int not null default 0, best_elo int not null default 1000, updated_at timestamptz not null default now()
);
alter table public.games enable row level security;
alter table public.game_private enable row level security;
alter table public.game_views enable row level security;
alter table public.ratings enable row level security;
create policy "games readable by signed-in" on public.games for select to authenticated using (true);
create policy "own view" on public.game_views for select to authenticated using (player = (select auth.uid()));
create policy "ratings readable by signed-in" on public.ratings for select to authenticated using (true);
revoke all on public.game_private from anon, authenticated;
revoke insert, update, delete on public.games, public.game_views, public.ratings from anon, authenticated;
alter publication supabase_realtime add table public.games, public.game_views;
-- game_commit(p_id, p_version, p_patch, p_state, p_views): atomický zápis ťahu s optimistickým zámkom (version),
-- pri konci hodnotenej hry zavolá game_rate (ELO, K = 32). Obe funkcie: security definer, execute len service_role.
-- Plné znenie: migrácie online_games a online_games_functions v Supabase.
