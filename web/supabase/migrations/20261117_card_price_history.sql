-- História cien kariet a sledovanie naplnenia databázy. Zapisuje len denná úloha cards.yml (service_role), z prehliadača sa to nečíta.
-- Ceny sú v centoch. Do histórie ide len zmena, teda riadok znamená „od tohto dňa platia tieto ceny“.
create table if not exists public.card_price_latest (
  id int generated always as identity primary key,
  card_id text not null unique check (char_length(card_id) <= 80),
  day date,
  cm int, cm_low int, cm_jp int, usd int
);
create table if not exists public.card_price_history (
  card int not null references public.card_price_latest on delete cascade,
  day date not null,
  cm int, cm_low int, cm_jp int, usd int,
  primary key (card, day)
);
create table if not exists public.db_usage_log (
  day date primary key,
  bytes bigint not null,
  level smallint not null default 0   -- najvyššia prekročená hranica v %, slúži na jediné upozornenie pri prekročení
);
alter table public.card_price_latest enable row level security;
alter table public.card_price_history enable row level security;
alter table public.db_usage_log enable row level security;
revoke all on public.card_price_latest, public.card_price_history, public.db_usage_log from anon, authenticated;

-- p_rows: [{"id":"OP01-001","cm":123,"low":90,"jp":null,"usd":150}, …]
create or replace function public.record_card_prices(p_day date, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  known int;
  incoming int;
  n int;
begin
  create temp table price_in on commit drop as
    select distinct on (x.id) x.id, x.cm, x.low, x.jp, x.usd
    from jsonb_to_recordset(p_rows) as x(id text, cm int, low int, jp int, usd int)
    where x.id is not null;

  -- výpadok zdroja nesmie vyzerať ako zmiznutie cien
  select count(*) into known from public.card_price_latest where cm is not null;
  select count(*) into incoming from price_in where cm is not null;
  if known > 100 and incoming < known * 0.7 then
    raise exception 'podozrivo málo cien: % oproti %', incoming, known;
  end if;

  insert into public.card_price_latest (card_id)
    select i.id from price_in i
    where not exists (select 1 from public.card_price_latest l where l.card_id = i.id);

  with changed as (
    select l.id as card, i.cm, i.low, i.jp, i.usd
    from price_in i join public.card_price_latest l on l.card_id = i.id
    where (i.cm, i.low, i.jp, i.usd) is distinct from (l.cm, l.cm_low, l.cm_jp, l.usd)
  ), saved as (
    insert into public.card_price_history (card, day, cm, cm_low, cm_jp, usd)
      select card, p_day, cm, low, jp, usd from changed
    on conflict (card, day) do update
      set cm = excluded.cm, cm_low = excluded.cm_low, cm_jp = excluded.cm_jp, usd = excluded.usd
    returning 1
  ), moved as (
    update public.card_price_latest l
      set day = p_day, cm = c.cm, cm_low = c.low, cm_jp = c.jp, usd = c.usd
      from changed c where l.id = c.card
    returning 1
  )
  select count(*) into n from saved;

  return jsonb_build_object('received', (select count(*) from price_in), 'changed', n);
end $$;

-- Hranice v %. „alert“ je true len v deň, keď sa prekročí vyššia hranica než naposledy.
create or replace function public.db_usage_check(p_limit bigint default 500000000)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
  size bigint;
  pct numeric;
  lvl smallint;
  last_lvl smallint;
  old_day date;
  old_bytes bigint;
  per_week bigint;
begin
  -- rovnaký výpočet ako prehľad Supabase, podľa neho sa stráži limit
  select sum(pg_database_size(datname))::bigint into size from pg_catalog.pg_database;
  pct := round(size * 100.0 / p_limit, 1);
  lvl := case when pct >= 95 then 95 when pct >= 85 then 85 when pct >= 70 then 70 when pct >= 50 then 50 else 0 end;

  select level into last_lvl from public.db_usage_log order by day desc limit 1;

  select day, bytes into old_day, old_bytes from public.db_usage_log
    where day >= today - 30 and day <= today - 7 order by day limit 1;
  if old_day is not null then
    per_week := greatest(0, (size - old_bytes) * 7 / (today - old_day));
  end if;

  insert into public.db_usage_log (day, bytes, level) values (today, size, lvl)
    on conflict (day) do update set bytes = excluded.bytes, level = excluded.level;

  return jsonb_build_object(
    'bytes', size,
    'limit', p_limit,
    'pct', pct,
    'level', lvl,
    'alert', lvl > 0 and lvl > coalesce(last_lvl, 0),
    'per_week', per_week,
    'history_bytes', pg_catalog.pg_total_relation_size('public.card_price_history')
  );
end $$;

revoke execute on function public.record_card_prices(date, jsonb) from public, anon, authenticated;
revoke execute on function public.db_usage_check(bigint) from public, anon, authenticated;
grant execute on function public.record_card_prices(date, jsonb) to service_role;
grant execute on function public.db_usage_check(bigint) to service_role;
