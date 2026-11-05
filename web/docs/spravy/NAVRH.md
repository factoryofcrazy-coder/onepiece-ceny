# Súkromné správy: návrh

Stav: vo vývoji vo vetve `sukromne-spravy`, na produkcii zatiaľ nie je. Postup je v [POSTUP.md](POSTUP.md), testy v [TESTOVANIE.md](TESTOVANIE.md), spustenie v [NASADENIE.md](NASADENIE.md).

## Rozhodnutia

| Téma | Rozhodnutie |
|---|---|
| Kto môže písať | Hocikto hocikomu. Od cudzieho príde žiadosť s jednou správou, notifikácia je bez textu. |
| Začiatok konverzácie | Trhovisko (ponuka sa priloží) a hľadanie podľa prezývky |
| Dostupnosť | Hneď po prihlásení na každom zariadení, s hľadaním v celej histórii |
| Šifrovanie | Na serveri, nie end-to-end |
| Uchovávanie | 12 mesiacov, potom automatické zmazanie |
| Webové upozornenie | Ikona s počtom v hornej lište |
| Mobil | Notifikácia s menom a textom, web pridaný na plochu (PWA) |
| Obsah prvej verzie | Text, karta alebo ponuka, Prečítané, Píše… |
| Správca | Pri nahlásení vidí správu a najviac 5 správ pred ňou a 5 po nej. Rozhranie na čítanie celých konverzácií neexistuje. |

## Čo sa dá a nedá sľúbiť

Text je v databáze šifrovaný a kľúč je mimo nej, takže samotný únik databázy text neprezradí.

Prevádzkovateľ má však kľúč aj databázu, takže by správy technicky vedel otvoriť. `/sukromie` preto hovorí „šifrované na serveri“ a nikdy nie „nikto si ich neprečíta“. Metadáta (kto, komu, kedy, prečítané) sú v databáze nešifrované.

## Architektúra

1. Prehliadač pošle správu cez HTTPS funkcii `dm` s prihlasovacím tokenom.
2. Funkcia overí používateľa a vstup a zašifruje text.
3. Databázová funkcia `dm_insert` v jednej transakcii skontroluje členstvo, žiadosť, blokovanie a limity a uloží šifru.
4. Zápis zmení riadok v `dm_members`, Realtime pošle druhému signál bez textu.
5. Prehliadač si dotiahne správu cez funkciu `dm`, tá ju rozšifruje.

### Prečo vlastná funkcia bez sťahovania kódu

Funkcia `game` si kód sťahuje z webu. Funkcia `dm` drží šifrovací kľúč, preto má kód zabalený priamo v sebe (`supabase/functions/dm/dist/index.js`). Napadnutie webu tak samo osebe nevedie k spusteniu cudzieho kódu vedľa kľúča.

## Šifrovanie (`lib/dm/crypto.ts`)

- Algoritmus AES-256-GCM cez WebCrypto, pre každú správu náhodný 96-bitový IV.
- Hlavné kľúče sú v tajnej premennej `DM_KEYS` vo formáte `1:base64,2:base64`. Nové správy používajú najvyššiu verziu.
- Kľúč konverzácie sa odvodzuje cez HKDF-SHA-256 s id konverzácie ako soľou.
- Doplnkové dáta (AAD) sú `konverzácia|odosielateľ|správa`. Správa presunutá alebo podvrhnutá priamo v databáze neprejde overením.
- Text sa nezapisuje do logov ani do chybových hlásení.

## Dáta (`supabase/migrations/20261111_direct_messages.sql`)

| Tabuľka | Obsah | Prístup klienta |
|---|---|---|
| `dm_conversations` | dvojica hráčov, stav žiadosti | žiadny |
| `dm_members` | neprečítané, posledné prečítanie | čítanie len členom, pre počty a Realtime |
| `dm_messages` | šifra, IV, verzia kľúča, odosielateľ, čas | žiadny |
| `dm_blocks` | kto koho zablokoval | žiadny |
| `dm_reports` | šifrovaná kópia nahlásenej správy, dôvod, stav | žiadny |

Databázové funkcie `dm_*` smie volať len `service_role`. Výnimky:
- `dm_is_member` a `dm_can_signal` pre pravidlá prístupu,
- `dm_cleanup`, ktorá len maže staré dáta a volá ju denne `/api/ping`.

## Pravidlá

- **Žiadosť:** prvá správa od žiadateľa, ďalšia až po prijatí. Odpoveď druhej strany žiadosť prijme.
- **Odmietnutie:** skryje konverzáciu odmietajúcemu a žiadateľovi sa neprezradí. Odmietajúci môže neskôr napísať sám.
- **Prečítané:** pri žiadosti sa neukazuje.
- **Blokovanie:** platí oboma smermi, skryje hráča z hľadania a vypne Píše….
- **Limity:** 20 správ za minútu, 300 za hodinu, 10 nových hráčov denne (nový účet do 24 hodín 3), 20 nahlásení denne.
- **Správy:** najviac 1 000 znakov, riadiace znaky a skryté znaky smeru textu sa odstraňujú.
- **Ponuka:** cena a stav sa berú z databázy, nie od odosielateľa.
- **Ban v chate:** platí aj pre súkromné správy.
- **Nahlásenie:** vytvorí šifrovanú kópiu, ktorá prežije zmazanie správy, najviac 12 mesiacov. Okolité správy sa berú zo živej konverzácie (`20261113_dm_report_context.sql`), po zmazaní ostane len kópia.

## Rozhranie

- Stránka `/spravy`: na počítači zoznam a konverzácia vedľa seba, na mobile po jednom. Počet neprečítaných je na ikone v hornej lište a v bočnom menu.
- Tlačidlo **Napísať** je na trhovisku a priloží ponuku. Hráča sa dá nájsť aj cez **Nová správa**.
- Na trhovisku nahrádza **Napísať** pri zapnutých správach tlačidlo Kontakt. Pole kontaktu v profile ostáva, kým sa nerozhodne inak.
- Text sa vždy vykresľuje ako text. Klikateľné sú len `http` a `https` odkazy v prijatej konverzácii, s upozornením a `rel="noopener noreferrer nofollow ugc"`.
- Neodoslaná správa sa dá poslať znova s rovnakým id, takže sa nezdvojí.
- Prepínač: na preview zapnuté automaticky, na produkcii `NEXT_PUBLIC_DM_ENABLED=1`. Bez neho web nevolá funkciu `dm`, nečíta `dm_members` a neregistruje service worker.

## Notifikácie (`lib/dm/push.ts`, `public/sw.js`)

- Web Push bez knižnice: šifrovanie obsahu podľa RFC 8291, prihlásenie servera VAPID podľa RFC 8292.
- Google, Apple a Mozilla vidia len šifrovaný obsah. Text sa rozšifruje až v zariadení a na zamknutej obrazovke ho vidno, ak je to zapnuté v nastaveniach.
- Žiadosť od cudzieho je vždy bez textu.
- Server posiela len na známe notifikačné služby (`allowedEndpoint`), aby sa nedal zneužiť na volanie iných adries.
- Service worker sa registruje až po zapnutí notifikácií a nič neukladá do cache.
- Odhlásenie zruší zariadenie na serveri aj v prehliadači. Vypršané prihlásenie ho zruší v prehliadači.
- Pri otvorenej konverzácii sa notifikácia nezobrazí, odznak na ikone sa aktualizuje.
- Ako kontakt VAPID sa používa adresa webu, nie osobný e-mail.

## Hľadanie

Text je šifrovaný, preto funkcia `search` rozšifruje správy používateľa po dávkach (3 × 500 na požiadavku), porovnáva ich bez diakritiky a vracia ukazovateľ na pokračovanie. Pri veľkom objeme sa dá doplniť slepý index, to teraz netreba.

## Známe obmedzenia

- Kto má kľúč aj databázu, vie správy otvoriť.
- Strata `DM_KEYS` znamená trvalú stratu všetkých správ.
- Kompromitácia kľúča odhalí aj staršie správy. Nová verzia kľúča chráni len nové správy.
- Na iPhone fungujú notifikácie až po pridaní webu na plochu.
- Odstránenie notifikácií po vypršaní prihlásenia prebehne až pri ďalšej návšteve webu.
- Preview a produkcia zatiaľ zdieľajú databázu, testovacie správy z preview sú v ostrej databáze.
