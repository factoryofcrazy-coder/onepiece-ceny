-- Graf ceny v detaile karty: história jednej karty pre každého návštevníka. Sú to verejné trhové ceny, tabuľky ostávajú bez priameho prístupu.
-- through = posledný deň úspešného denného behu. Do histórie ide len zmena, takže bez tohto dátumu by graf nevedel, dokedy cena platí.
create or replace function public.card_price_series(p_card text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'through', (select max(day) from public.db_usage_log),
    'points', coalesce((
      select jsonb_agg(jsonb_build_object('day', h.day, 'cm', h.cm, 'usd', h.usd) order by h.day)
      from public.card_price_history h
      join public.card_price_latest l on l.id = h.card
      where l.card_id = p_card
    ), '[]'::jsonb)
  );
$$;
revoke execute on function public.card_price_series(text) from public;
grant execute on function public.card_price_series(text) to anon, authenticated, service_role;
