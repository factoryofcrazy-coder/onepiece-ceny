# Súkromné správy: denník postupu

## 4. 11. 2026: návrh

Návrh a rozhodnutia sú v [NAVRH.md](NAVRH.md). Pôvodne sa zvažovalo šifrovanie medzi zariadeniami, používateľ zvolil dostupnosť po prihlásení a hľadanie v histórii, teda šifrovanie na serveri.

## 4. 11. 2026: 1. časť, databáza a funkcia

Hotové vo vetve `sukromne-spravy`:

- migrácia `20261111_direct_messages.sql`,
- šifrovanie `lib/dm/crypto.ts`,
- logika funkcie `lib/dm/server.ts`, vstup `supabase/functions/dm/index.ts`,
- denné mazanie cez `/api/ping`,
- testy `lib/dm/*.test.ts` nad skutočným Postgresom, nová vývojová závislosť `@electric-sql/pglite`.

Rozdiel oproti pôvodnej schéme: funkcia `dm` si nesťahuje kód z webu, lebo drží šifrovací kľúč.

Nespustené na produkcii: migrácia, tajný kľúč, nasadenie funkcie. Rozhranie zatiaľ neexistuje.

### Ďalej

2. Rozhranie správ, žiadosti, karta, hľadanie, Prečítané a Píše…
3. Ikona, service worker, notifikácie
4. Nahlasovanie a blokovanie v rozhraní, `/sukromie`, ručné testy
