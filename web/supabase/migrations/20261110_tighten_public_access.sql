-- Rebríček a trhovisko si môže pozrieť aj neprihlásený návštevník, ale nič nezmení a kontakt nevidí.

-- anon z profilu vidí len id a prezývku, a to len pri hráčoch z rebríčka alebo trhoviska
revoke select on public.profiles from anon;
grant select (id, username) on public.profiles to anon;

grant select on public.trade_listings, public.ratings, public.user_xp to anon;

drop policy if exists "trade_read_anon" on public.trade_listings;
create policy "trade_read_anon" on public.trade_listings for select to anon using (true);
drop policy if exists "ratings_read_anon" on public.ratings;
create policy "ratings_read_anon" on public.ratings for select to anon using (true);
drop policy if exists "xp_read_anon" on public.user_xp;
create policy "xp_read_anon" on public.user_xp for select to anon using (true);
drop policy if exists "profiles_read_anon" on public.profiles;
create policy "profiles_read_anon" on public.profiles for select to anon using (
  exists (select 1 from public.ratings r where r.user_id = profiles.id)
  or exists (select 1 from public.trade_listings t where t.user_id = profiles.id)
);

-- zápis nemá anon nikde, TRUNCATE nepotrebuje nikto z webu
revoke insert, update, delete, truncate on public.collection, public.decks, public.profiles, public.trade_listings, public.watchlist from anon;
revoke truncate on public.collection, public.decks, public.game_reports, public.game_views, public.games,
  public.profiles, public.ratings, public.trade_listings, public.watchlist from authenticated;
