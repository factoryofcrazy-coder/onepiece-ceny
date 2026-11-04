-- Grand Line Tracker – súkromná zbierka + trhovisko (3. 11. 2026)
-- Spustiť v Supabase: projekt onepiece-tracker → SQL Editor → vložiť celý súbor → Run.

-- 1) zbierka je súkromná: čítať môže len vlastník (doteraz videli všetci prihlásení)
drop policy if exists "collection_read" on public.collection;
create policy "collection_read_own" on public.collection for select to authenticated
  using (user_id = (select auth.uid()));

-- 2) kontakt v profile (Discord, Instagram…) – ukazuje sa pri ponukách na trhovisku
alter table public.profiles add column if not exists contact text check (char_length(contact) <= 120);

-- 3) trhovisko: ponuky na výmenu (offer) a hľadané karty (want)
create table if not exists public.trade_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  card_id text not null check (char_length(card_id) <= 40),
  kind text not null check (kind in ('offer', 'want')),
  qty int not null default 1 check (qty between 1 and 99),
  price numeric(10,2) check (price is null or (price >= 0 and price <= 100000)),
  cond text not null default 'NM' check (cond in ('NM', 'LP', 'MP', 'HP', 'DMG')),
  lang text not null default 'EN' check (lang in ('EN', 'JP')),
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, card_id, kind, cond, lang)
);
create index if not exists trade_listings_card_idx on public.trade_listings (card_id);
create index if not exists trade_listings_user_idx on public.trade_listings (user_id);
alter table public.trade_listings enable row level security;
grant select, insert, update, delete on public.trade_listings to authenticated;
drop policy if exists "trade_read" on public.trade_listings;
drop policy if exists "trade_insert_own" on public.trade_listings;
drop policy if exists "trade_update_own" on public.trade_listings;
drop policy if exists "trade_delete_own" on public.trade_listings;
create policy "trade_read" on public.trade_listings for select to authenticated using (true);
create policy "trade_insert_own" on public.trade_listings for insert to authenticated with check (user_id = (select auth.uid()));
create policy "trade_update_own" on public.trade_listings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "trade_delete_own" on public.trade_listings for delete to authenticated using (user_id = (select auth.uid()));
