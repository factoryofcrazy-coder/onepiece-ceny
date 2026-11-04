# Súkromné správy: testovanie

## Automatické testy

```bash
cd web
npx vitest run lib/dm        # len správy
npm test                     # celý projekt
```

`lib/dm/server.test.ts` spustí skutočnú migráciu v Postgrese (PGlite) a volá funkciu ako prehliadač. Testuje sa teda aj SQL a práva.

| Oblasť | Čo sa overuje |
|---|---|
| Šifrovanie | návrat textu, náhodnosť, pozmenená šifra, presun správy, zlý odosielateľ, rotácia kľúča, neplatné `DM_KEYS` |
| Prístup | bez prihlásenia, cudzí hráč, neznáma operácia, interná chyba bez detailov |
| Práva v databáze | klient nečíta ani nemení tabuľky a nevolá funkcie, člen vidí len svoje, zmazanie účtu |
| Žiadosti | jedna správa, prijatie, odmietnutie, odpoveď, Prečítané sa neprezradí |
| Blokovanie a limity | oba smery, hľadanie, ban v chate, 20 za minútu, 3 a 10 nových hráčov denne |
| Ponuky | cena z databázy, neexistujúca ponuka, karta bez textu |
| Hľadanie | diakritika, len vlastné konverzácie, odmietnuté žiadosti, krátky výraz |
| Správca | vidí len nahlásené, bežný hráč nie je správca, kópia prežije zmazanie |
| Uchovávanie | zmazanie po 12 mesiacoch |

Čo PGlite neoverí: skutočný Realtime, doručenie Web Push a správanie na produkcii. To je v ručnom teste.

## Ručný test pred zlúčením

Treba dva účty, ideálne na dvoch zariadeniach. Skúšobné správy z preview idú do ostrej databázy, kým neexistuje samostatný staging.

Doplní sa po dokončení rozhrania.
