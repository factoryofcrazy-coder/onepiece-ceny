-- Ceny hodnotených kariet z predajov na eBay, ceny sú v centoch USD. Zapisuje len týždenná úloha graded.yml, čítať môže každý, sú to verejné trhové ceny.
create table if not exists public.card_graded_prices (
  card_id text not null check (char_length(card_id) <= 80),
  grader text not null check (char_length(grader) <= 8),
  grade numeric(3,1) not null,
  median int not null check (median >= 0),
  p25 int not null,
  p75 int not null,
  sales int not null check (sales > 0),
  last_sold date,
  fetched_on date not null,
  primary key (card_id, grader, grade)
);
-- kedy sa kód karty naposledy zisťoval, aj keď sa nenašiel žiadny predaj, nech sa kredit neminie opakovane
create table if not exists public.card_graded_checked (
  code text primary key check (char_length(code) <= 40),
  checked_on date not null
);
alter table public.card_graded_prices enable row level security;
alter table public.card_graded_checked enable row level security;
revoke all on public.card_graded_prices, public.card_graded_checked from anon, authenticated;
grant select on public.card_graded_prices to anon, authenticated;
drop policy if exists "graded_read" on public.card_graded_prices;
create policy "graded_read" on public.card_graded_prices for select to anon, authenticated using (true);

-- Koho zisťovať: karty zo zbierok, potom najdrahšie. Vracia len kódy, žiadne údaje o tom, kto kartu má. Variant je súčasťou id: OP01-001_p1 → OP01-001.
create or replace function public.graded_candidates(p_limit int, p_min_cents int default 500, p_days int default 30)
returns table (code text) language sql stable security definer set search_path = '' as $$
  with priced as (
    select split_part(l.card_id, '_', 1) as code, max(l.cm) as cm from public.card_price_latest l where l.cm >= p_min_cents group by 1
  ), owned as (
    select split_part(c.card_id, '_', 1) as code, count(distinct c.user_id) as owners from public.collection c where c.qty > 0 group by 1
  )
  select p.code from priced p
    left join owned o on o.code = p.code
    left join public.card_graded_checked k on k.code = p.code
  where k.checked_on is null or k.checked_on < (now() at time zone 'utc')::date - p_days
  order by o.owners desc nulls last, p.cm desc
  limit least(p_limit, 200);
$$;

-- p_rows: [{"card":"OP01-120","grader":"PSA","grade":10,"median":41000,"p25":38000,"p75":45000,"sales":8,"last_sold":"2026-10-30"}, …]
create or replace function public.record_graded_prices(p_day date, p_codes text[], p_rows jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.card_graded_prices (card_id, grader, grade, median, p25, p75, sales, last_sold, fetched_on)
    select x.card, x.grader, x.grade, x.median, x.p25, x.p75, x.sales, x.last_sold, p_day
    from jsonb_to_recordset(p_rows) as x(card text, grader text, grade numeric, median int, p25 int, p75 int, sales int, last_sold date)
  on conflict (card_id, grader, grade) do update set median = excluded.median, p25 = excluded.p25, p75 = excluded.p75,
    sales = excluded.sales, last_sold = excluded.last_sold, fetched_on = excluded.fetched_on;
  get diagnostics n = row_count;
  insert into public.card_graded_checked (code, checked_on) select unnest(p_codes), p_day
    on conflict (code) do update set checked_on = excluded.checked_on;
  return n;
end $$;
revoke execute on function public.graded_candidates(int, int, int) from public, anon, authenticated;
revoke execute on function public.record_graded_prices(date, text[], jsonb) from public, anon, authenticated;
grant execute on function public.graded_candidates(int, int, int) to service_role;
grant execute on function public.record_graded_prices(date, text[], jsonb) to service_role;
