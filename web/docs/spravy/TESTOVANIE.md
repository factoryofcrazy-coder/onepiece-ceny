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
| Správca | vidí nahlásenú správu a 5 správ okolo nej, nie viac a nie z inej konverzácie, bežný hráč nie je správca, kópia prežije zmazanie |
| Uchovávanie | zmazanie po 12 mesiacoch |

| Notifikácie | nezávislé rozšifrovanie podľa RFC 8291, overenie podpisu VAPID, povolené adresy, žiadosť bez textu, skrytie textu, neplatné zariadenie, service worker |
| Text | odkazy, `javascript:` a HTML sa nestanú odkazom |

## Test v prehliadači

Overené v Chromiu (Playwright) so simulovanou funkciou `dm` a databázou:

- zoznam, žiadosti, konverzácia, počet neprečítaných, Prečítané,
- HTML a `javascript:` v správe sa nespustia, poškodená správa sa zobrazí bez pádu,
- odoslanie, zlyhanie a opakovanie s rovnakým id, príloha karty, ponuka z trhoviska,
- prijatie žiadosti, blokovanie, nahlásenie, hľadanie, nová konverzácia, Napísať z rebríčka a chatu,
- nastavenia, zapnutie notifikácií, odhlásenie zruší zariadenie, správca a nahlásené správy,
- šírky 1440, 390 a 320 px bez pretekania, svetlejší vzhľad, neprihlásený návštevník,
- **pri vypnutom prepínači:** žiadna ikona, žiadne tlačidlo Napísať, žiadna požiadavka na správy, žiadny service worker.

Tieto testy nepoužili skutočné Supabase ani notifikačné služby.

## Čo sa dá overiť len na ostro

PGlite ani simulácia neoveria skutočný Realtime, Píše…, doručenie notifikácie na telefón ani nasadenú funkciu. Preto treba ručný test.

## Ručný test pred zlúčením

Treba dva účty (A, B), ideálne dva telefóny alebo telefón a počítač. Skúšobné správy z preview idú do ostrej databázy.

1. A: trhovisko, Napísať pri ponuke hráča B, poslať správu s priloženou ponukou.
2. B: ikona ukáže počet bez obnovenia stránky, správa je medzi Žiadosťami, odkaz nie je klikateľný.
3. A: druhá správa sa odmietne.
4. B: Prijať, odpovedať. A dostane správu naživo.
5. Obaja: písanie ukáže Píše…, po prečítaní sa ukáže Prečítané.
6. B: Nastavenia, zapnúť notifikácie. Android: priamo. iPhone: až po pridaní webu na plochu.
7. A: poslať správu pri zatvorenom webe u B. Prišla notifikácia s menom a textom, ťuknutie otvorí konverzáciu.
8. B: skryť text v notifikácii, overiť ďalšou správou.
9. Nový účet C napíše B: notifikácia je bez textu.
10. Hľadať slovo s diakritikou aj bez nej, aj na druhom zariadení.
11. B nahlási správu, správca ju vidí v Nastaveniach s najviac 5 správami pred ňou a po nej a nevidí zvyšok konverzácie.
12. B zablokuje A: A nemôže písať, Píše… zmizne. Odblokovať.
13. B sa odhlási: notifikácie na zariadení prestanú chodiť.
14. V Supabase overiť, že `dm_messages.ciphertext` je nečitateľný a v logoch funkcie nie je text.

Výsledok ručného testu zapísať do [POSTUP.md](POSTUP.md).
