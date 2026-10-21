# Herný engine One Piece TCG – návrh

Cieľ: hra pre dvoch hráčov s **automatickými pravidlami a efektmi kariet**, kde aj reťaze ako
„DON!! −2 → leader reaguje na vrátenie DON!! → ďalšia karta počíta vrátené DON!! tento ťah“
fungujú presne podľa oficiálnych pravidiel (Comprehensive Rules, Bandai).

## Princípy

1. **Stav je čisté dáta** (`GameState`, serializovateľný JSON). Žiadne funkcie ani closures v stave →
   dá sa poslať po sieti, uložiť, prehrať, otestovať.
2. **Všetko je udalosť.** Stav sa mení len cez primitívy, ktoré zároveň vydajú udalosť
   (`DonReturned`, `CardDrawn`, `KO`, `LifeDamage`…). Udalosti idú do záznamu (`log`) a počúvajú ich karty.
3. **Efekty sú dáta (DSL), nie kód.** Karta = zoznam schopností; schopnosť = spúšťač + podmienky +
   cena + kroky. Kroky sú malé kocky (`draw`, `ko`, `addDon`, `power`…). Novú kocku naprogramujeme raz,
   používajú ju všetky karty.
4. **Cena ≠ efekt.** `DON!! −2: K.O. …` = najprv sa celá cena zaplatí (udalosti `DonReturned`),
   až potom efekt. Ak sa cena zaplatiť nedá alebo ju hráč odmietne, efekt sa nevykoná.
5. **Reakcie čakajú vo fronte.** Karty s „keď sa stane X“ sa pri udalosti nevykonajú hneď – zaradia sa
   do `pending`. Po dokončení aktuálneho efektu sa spracujú: najprv hráč na ťahu, potom súper. Každá
   vykonaná reakcia môže vyrobiť ďalšie udalosti → ďalšie reakcie. Engine pokračuje, kým fronta nie je prázdna.
6. **Hodnoty sa prepočítavajú, nepamätajú.** Power/cost/kľúčové slová = základ + dočasné modifikátory
   (do konca ťahu, počas súboja, do konca súperovej End fázy) + **trvalé efekty vyhodnotené práve teraz**
   (`[DON!! x1] [Your Turn] +1000`). Keď DON!! odíde, bonus zmizne sám.
7. **Rozhodnutia zastavia engine.** Keď treba voľbu (ktoré DON!! vrátiť, cieľ, či zaplatiť cenu, blocker,
   counter, poradie reakcií), engine nastaví `prompt` a čaká na odpoveď správneho hráča.
   Vykonávanie efektov beží na **zásobníku rámcov** (`stack`), ktorý je tiež čisté dáta → dá sa prerušiť a obnoviť.
8. **Kontrola pravidiel** po každom dokončenom efekte: prehra pri zásahu s 0 Life, prehra pri ťahaní
   z prázdneho balíčka, max. 5 postáv, max. 10 DON!!.
9. **Skryté informácie.** `viewFor(state, hráč)` skryje súperovu ruku, balíčky a Life. Na sieti bude
   stav držať server (ťahy overuje a mieša on), klient dostane len svoj pohľad.
10. **Deterministické.** Miešanie cez seedovaný RNG v stave → rovnaké akcie = rovnaký výsledok (testy, replaye).

## Tok jednej akcie

```
applyAction(state, akcia)
  ├─ overí, či je akcia legálna (hráč, fáza, prompt)
  ├─ vykoná ju (napr. zahraj kartu → zaplať cost → presuň na pole → udalosť CardPlayed)
  │     └─ udalosti → listeners → pending (reakcie, On Play, When Attacking…)
  └─ run(): kým nie je prompt:
        1. vrch zásobníka má kroky → vykonaj ďalší krok (môže nastaviť prompt → stop)
        2. zásobník prázdny, pending neprázdny → vezmi ďalšiu reakciu (turn player prvý) → push rámec
        3. všetko prázdne → kontrola pravidiel → pokračuj v súboji / čakaj na akciu hráča
```

## Príklad: DON!! −2 a leader OP09-061

```
Nico Robin ST26-003 [On Play] DON!! −2: pridaj 1 DON!! aktívny.
Leader Luffy OP09-061 [Your Turn][Once Per Turn] keď sa 2+ DON!! vrátia: +1 aktívny, +1 rest.

1. Zahráš Robin (cost 3 → 3 DON rest) → CardPlayed → On Play do fronty
2. Fronta: Robin On Play → prompt „zaplatiť DON!! −2?“ → áno → prompt „ktoré DON!!“ (aktívne/rest/pripojené)
3. payDon → udalosť DonReturned(n=2) → leader počúva (2+, môj ťah, ešte nepoužité) → do fronty
4. Efekt Robin: addDon 1 aktívny
5. Fronta: leader → addDon 1 aktívny + 1 rest, označí Once Per Turn
6. Fronta prázdna → kontrola pravidiel → späť do Main fázy
```

## Moduly (`web/lib/engine/`)

| súbor | čo robí |
|---|---|
| `types.ts` | typy stavu, kariet, schopností, krokov DSL, udalostí, promptov, akcií |
| `rng.ts` | seedovaný generátor (mulberry32) |
| `cards.ts` | skripty efektov kariet (DSL) + „vanilla“ definície z databázy kariet |
| `engine.ts` | setup, fázy ťahu, akcie, interpret DSL, fronta reakcií, súboj, kontrola pravidiel, prepočty |
| `engine.test.ts` | scenáre pre pravidlá a karty + náhodné simulované hry (invarianty) |

## DSL – kocky (rozširuje sa podľa potreby)

- **ceny:** `payDon {n, atLeast?}`, `restSelf`, `trashFromHand {n}`
- **voľby:** `choose {var, from, side, filter, min, max}`
- **akcie:** `draw`, `ko`, `rest`, `setActive`, `bounce` (do ruky), `power {amount, until}`,
  `setBasePower`, `addDon {state}`, `giveDon {n, rested}`, `restOppDon`, `noBlocker` (súboj),
  `playSelf` (Trigger: zahraj túto kartu), `runMain` (Trigger: aktivuj [Main] efekt)
- **podmienky:** `donAttached ≥ n`, `turn mine/opp`, `donOnField ≥ n`, `oppDonOnField ≥ n`,
  `leaderMulticolor`, `hasCharacter {trait/name, minBasePower}`, `lifeAtMost`
- **spúšťače:** `static`, `onPlay`, `whenAttacking`, `onKO`, `activateMain`, `main` (event),
  `counter` (event), `trigger` (Life), `onEvent {event, side, min}`, `endOfTurn`

## Testy

- scenár = pripravený stav → akcie → očakávaný stav (počty DON!!, power, zóny, Once Per Turn)
- náhodné hry: tisíce zápasov s náhodnými legálnymi akciami, kontrola invariantov
  (súčet DON!! = 10 na hráča, každá karta práve v jednej zóne, žiadne záporné hodnoty, hra skončí)

## Ďalšie kroky

1. jadro + ST-01 / ST-26 (hotové v prvej verzii)
2. hracia plocha – hra na jednom zariadení, potom online cez Supabase (server drží stav)
3. skripty kariet z vašich a turnajových deckov
4. AI prevod textov kariet do DSL + automatické testy pre všetky karty
5. „sprievodcovský režim“ pre karty bez overeného skriptu
