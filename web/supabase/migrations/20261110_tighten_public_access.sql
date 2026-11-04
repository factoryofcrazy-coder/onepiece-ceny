-- Kontakt z profilu vidia len prihlásení (tak to sľubuje /sukromie) a anon nemá práva na zápis.
revoke select on public.profiles from anon;
grant select (id, username, created_at) on public.profiles to anon;

revoke insert, update, delete, truncate on public.collection, public.decks, public.profiles, public.trade_listings, public.watchlist from anon;

revoke truncate on public.collection, public.decks, public.game_reports, public.game_views, public.games,
  public.profiles, public.ratings, public.trade_listings, public.watchlist from authenticated;
