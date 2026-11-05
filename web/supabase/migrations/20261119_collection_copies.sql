-- Kusy v zbierke: za koľko si kartu kúpil, v akom je stave a či je gradovaná. Súkromné, každý vidí len svoje, nikto iný ani správca cez web.
-- Počet kusov ostáva v tabuľke collection, tu sú len kusy, ku ktorým si niekto chce niečo zapísať.
create table if not exists public.collection_copies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  card_id text not null check (char_length(card_id) <= 60),
  paid numeric(10,2) check (paid is null or paid between 0 and 1000000),
  own_value numeric(10,2) check (own_value is null or own_value between 0 and 1000000), -- vlastný odhad, pri gradovanej karte trhovú cenu nepoznáme
  bought_on date,
  cond text check (cond in ('NM', 'LP', 'MP', 'HP', 'DMG')),
  grader text check (grader in ('PSA', 'CGC', 'BGS', 'TAG', 'Iný')),
  grade numeric(3,1) check (grade between 1 and 10),
  cert text check (cert ~ '^[A-Za-z0-9-]{1,30}$'), -- číslo certifikátu z obalu
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  check ((grader is null) = (grade is null)),
  check (grader is null or cond is null),
  check (cert is null or grader is not null)
);
create index if not exists collection_copies_user_idx on public.collection_copies (user_id, card_id);
alter table public.collection_copies enable row level security;
revoke all on public.collection_copies from anon;
grant select, insert, update, delete on public.collection_copies to authenticated;
drop policy if exists "copies_own" on public.collection_copies;
create policy "copies_own" on public.collection_copies for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop trigger if exists row_limit on public.collection_copies;
create trigger row_limit after insert on public.collection_copies
  referencing new table as new_rows for each statement execute function public.enforce_user_row_limit('5000');
