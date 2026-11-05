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

## 4. 11. 2026: spustenie na serveri

Používateľ pridal tajné hodnoty a spustil migráciu. Funkcia `dm` je nasadená: kontrola, odmietnutie bez prihlásenia a chybnej požiadavky prešli na ostro. Ručný test s dvoma účtami ešte čaká. Správy na preview sa zapínajú automaticky, lebo nastavenie premennej len pre Preview vo Verceli nešlo vybrať.

## 5. 11. 2026: chyba z ručného testu

Začatie konverzácie hlásilo „Správy sú dočasne nedostupné“. Funkcia `dm_open` čítala vek účtu z `auth.users`, kam `service_role` na Supabase nemá prístup. Test túto chybu nezachytil, lebo testovacia databáza ten prístup omylom povoľovala.

Oprava: vek účtu sa berie z `profiles` (migrácia `20261112_dm_open_fix.sql`), test už má rovnaké práva ako produkcia a kontroluje, že funkcie `auth.users` nečítajú. Do logov funkcie pribudol kód chyby bez obsahu správ. Ostatné funkcie som overil na ostro v role `service_role`, len na čítanie.

## 5. 11. 2026: úprava po teste

Začatie konverzácie po oprave funguje. Na želanie používateľa je Napísať len na trhovisku a cez hľadanie, z rebríčka a verejného chatu je odstránené.

## 5. 11. 2026: správca a okolité správy

Na rozhodnutie používateľa vidí správca pri nahlásení aj 5 správ pred ňou a 5 po nej. Upravená funkcia, rozhranie, `/sukromie` a dokumentácia.

## 5. 11. 2026: zlúčenie do main

Používateľ súhlasil so zlúčením, lebo preview sa na mobil zle inštaluje a notifikácie chce skúsiť na hlavnej adrese. Správy ostávajú na produkcii vypnuté, kým sa vo Verceli nenastaví `NEXT_PUBLIC_DM_ENABLED=1` pre Production. Spolu s tým pribudla grafika na domovskej stránke a v `/sukromie`.

Ručný test začatia konverzácie, prijatia, odoslania a Prečítané prešiel na preview. Notifikácie na telefóne ešte neboli vyskúšané.

## Stav

Hotové a otestované automaticky a v prehliadači so simuláciou. Ostáva [ručný test](TESTOVANIE.md). Zlúčené do `main`, na produkcii vypnuté prepínačom.
