-- Trhový index One Piece: denný bod vývoja trhu. Ukladá sa priemerná trend cena koša (karty + boxy) v eurách;
-- web z toho počíta index so základom 1000 na prvý zaznamenaný deň. Verejne čitateľné, zapisuje len služobný kľúč.
create table if not exists public.market_index (
  day date primary key,
  value numeric not null,   -- priemerná trend cena koša v eurách
  items integer not null,   -- počet položiek v koši
  updated_at timestamptz not null default now()
);
alter table public.market_index enable row level security;
drop policy if exists "market_index_read" on public.market_index;
create policy "market_index_read" on public.market_index for select to anon, authenticated using (true);

create or replace function public.record_market_index(p_day date, p_value numeric, p_items integer)
returns void language sql security definer set search_path = '' as $$
  insert into public.market_index (day, value, items, updated_at)
  values (p_day, p_value, p_items, now())
  on conflict (day) do update set value = excluded.value, items = excluded.items, updated_at = now();
$$;
revoke execute on function public.record_market_index(date, numeric, integer) from public, anon, authenticated;
grant execute on function public.record_market_index(date, numeric, integer) to service_role;
