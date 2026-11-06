-- Novinky: krátke príspevky od správcu (nové sety, updaty, dôležité info), verejne čitateľné.
create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null check (char_length(title) between 1 and 200),
  body text check (char_length(body) <= 4000),
  url text check (char_length(url) <= 500),
  image text check (char_length(image) <= 500),
  author_id uuid default auth.uid() references auth.users(id) on delete set null
);
alter table public.news enable row level security;

-- čítať môže každý, aj neprihlásený
create policy "news_read_public" on public.news for select to anon, authenticated using (true);
-- pridávať, upravovať a mazať môže len správca
create policy "news_admin_insert" on public.news for insert to authenticated with check (public.is_admin());
create policy "news_admin_update" on public.news for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "news_admin_delete" on public.news for delete to authenticated using (public.is_admin());

create index if not exists news_created_idx on public.news (created_at desc);
