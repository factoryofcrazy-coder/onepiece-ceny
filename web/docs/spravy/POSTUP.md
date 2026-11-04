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

## 4. 11. 2026: 2. časť, rozhranie

- stránka `/spravy` (`components/dm/Messages.tsx`), klient `lib/dm/client.tsx`, spracovanie textu `lib/dm/text.ts`,
- ikona v lište, položka v menu, tlačidlo Napísať na trhovisku, v rebríčku a chate,
- žiadosti, karta alebo ponuka, hľadanie, Prečítané, Píše…, opakované odoslanie,
- prepínač `NEXT_PUBLIC_DM_ENABLED`, predvolene vypnutý.

Oprava pri testovaní: dve polia mali rovnaký popis pre čítačku obrazovky.

## 4. 11. 2026: 3. a 4. časť, notifikácie, nastavenia, správca

- Web Push bez knižnice `lib/dm/push.ts`, service worker `public/sw.js`, klient `lib/dm/push-client.ts`,
- nastavenia: notifikácie, text v notifikácii, zablokovaní hráči, nahlásené správy pre správcu,
- text na `/sukromie` (zobrazí sa až po zapnutí), skript na tajné hodnoty `scripts/dm-keys.mjs`.

Rozhodnutia v priebehu práce, ktoré treba potvrdiť:
- Na trhovisku pri zapnutých správach nahrádza Napísať tlačidlo Kontakt.
- Správca vidí len nahlásené správy (používateľ nemal preferenciu, zvolila sa prísnejšia možnosť).

## Stav

Hotové a otestované automaticky a v prehliadači so simuláciou. Ostáva spustenie podľa [NASADENIE.md](NASADENIE.md) a [ručný test](TESTOVANIE.md). Do `main` nezlúčené, na produkcii nič.
