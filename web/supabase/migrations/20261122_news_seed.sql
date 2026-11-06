-- Úvodné novinky (overené z oficiálnych zdrojov Bandai). Spusti po 20261121_news.sql.
-- Idempotentné: rovnaký nadpis sa nepridá druhýkrát.
insert into public.news (created_at, title, body, url)
select * from (values
  (
    timestamptz '2026-11-01 09:00:00+00',
    'Nový set OP-18 – The Dominance of God',
    E'Osemnásty booster set One Piece Card Game vychádza v anglickej verzii 20. novembra 2026 (japonská 21. novembra). Boxy sa už objavujú na trhu, ich hodnotu nájdeš v sekcii Hodnoty boxov.',
    'https://en.onepiece-cardgame.com/products/'
  ),
  (
    timestamptz '2026-10-30 09:00:00+00',
    'Extra Booster EB-05 – Heroines Edition Vol. 2',
    E'Druhý diel Heroines Edition vyšiel v anglickej verzii 30. októbra 2026. Je to extra booster zameraný na ženské postavy.',
    'https://en.onepiece-cardgame.com/products/'
  ),
  (
    timestamptz '2026-10-12 09:00:00+00',
    'Ban list od 12. októbra 2026: Mihawk zakázaný',
    E'Od 12. októbra 2026 je podľa oficiálneho zoznamu zakázaná karta Dracule Mihawk (OP14-020), a to vrátane parallel verzií. Pred turnajom si vždy over aktuálny zoznam priamo u Bandai.',
    'https://en.onepiece-cardgame.com/news/restriction-261001.html'
  )
) as v(created_at, title, body, url)
where not exists (select 1 from public.news n where n.title = v.title);
