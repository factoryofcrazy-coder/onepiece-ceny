-- Zapečatené produkty v zbierke (boxy, displaye, startery…): počet kusov na používateľa a produkt (Cardmarket idProduct).
-- Súkromné, každý vidí len svoje. Hodnota sa počíta z trend ceny Cardmarketu (sealed.json), tu je len počet.
create table if not exists public.collection_sealed (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  product_id integer not null,
  qty integer not null check (qty between 0 and 999),
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
alter table public.collection_sealed enable row level security;
revoke all on public.collection_sealed from anon;
grant select, insert, update, delete on public.collection_sealed to authenticated;
drop policy if exists "sealed_coll_own" on public.collection_sealed;
create policy "sealed_coll_own" on public.collection_sealed for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop trigger if exists row_limit on public.collection_sealed;
create trigger row_limit after insert on public.collection_sealed
  referencing new table as new_rows for each statement execute function public.enforce_user_row_limit('5000');
