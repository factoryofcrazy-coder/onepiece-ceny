-- Denný kurz SPY (ETF na index S&P 500) na porovnanie s trhovým indexom One Piece. Verejne čitateľné.
create table if not exists public.market_spy (
  day date primary key,
  close numeric not null
);
alter table public.market_spy enable row level security;
drop policy if exists "market_spy_read" on public.market_spy;
create policy "market_spy_read" on public.market_spy for select to anon, authenticated using (true);

create or replace function public.record_spy(p_rows jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  insert into public.market_spy (day, close)
  select (x->>'day')::date, (x->>'close')::numeric from jsonb_array_elements(p_rows) x
  on conflict (day) do update set close = excluded.close;
  get diagnostics n = row_count;
  return n;
end; $$;
revoke execute on function public.record_spy(jsonb) from public, anon, authenticated;
grant execute on function public.record_spy(jsonb) to service_role;
