# One Piece TCG – ceny v SK obchodoch + MSRP + Discord upozornenia

Sleduje ceny One Piece booster boxov a packov v obchodoch **Card Empire, Pikazard,
Veselý drak, iHRYsko, Najáda, Tolarie, Černý rytíř, Nekonečno, Pokemon4U a Hra na netu**, porovnáva ich s **MSRP** a keď nájde výhodnú ponuku,
pošle upozornenie na **Discord**. Smarty.sk blokuje automatické sťahovanie
(Cloudflare), preto je na stránke len odkaz naň.

## Ako to beží

**Online (GitHub Actions + Pages)** – každé 2 hodiny automaticky stiahne **Veselý drak, iHRYsko,
Najádu, Tolarie, Černého rytíře a Hru na netu**,
pošle upozornenia na Discord a obnoví stránku **https://factoryofcrazy-coder.github.io/onepiece-ceny/**.
Tlačidlo Fetch na online stránke otvorí GitHub Actions → *Run workflow*.

**Card Empire, Pikazard, Nekonečno a Pokemon4U** (Shoptet) blokujú servery GitHubu, preto sa sťahujú z tvojho PC:
dvojklik na **`spustit.bat`** → hneď stiahne všetky obchody, pošle upozornenia,
**nahrá dáta na GitHub** (online stránka ich ukáže ako „z PC“) a otvorí lokálnu stránku.

Jednorazové nastavenie na PC:
1. **GitHub token**: github.com → Settings → Developer settings → Personal access tokens →
   *Fine-grained tokens* → **Generate new token**
   - Repository access: *Only select repositories* → `onepiece-ceny`
   - Permissions → Repository permissions → **Contents: Read and write**
   - token ulož do súboru **`github_token.txt`** v tomto priečinku (na GitHub sa nenahrá)
2. **Discord**: URL webhooku ulož do súboru **`discord_webhook.txt`** (na GitHub sa nenahrá),
   test: `python onepiece_ceny.py --test-discord`

Na GitHube (raz): Settings → Secrets and variables → Actions → secret `DISCORD_WEBHOOK_URL`;
Settings → Pages → Branch `main`, priečinok `/docs`.

Ďalšie príkazy:
```bash
python onepiece_ceny.py --watch 2       # nechá stránku bežať a sťahuje každé 2 hodiny
python onepiece_ceny.py --once          # raz stiahne + nahrá, bez stránky (napr. pre Plánovač úloh)
python onepiece_ceny.py --no-fetch      # len otvorí stránku, nesťahuje
```

## Novinky
- **Upozornenia len na dostupný tovar** – cena/watchlist/nový produkt chodia iba keď je tovar skladom;
  výnimkou je 🆕 **spustená predobjednávka** boxu (dá sa objednať; vypneš `"preorders": false`).
- **Denný súhrn** na Discord raz denne po 8:00 – top EN a JP boxy skladom vs MSRP + zmeny za 24 h
  (`"digest"` v `config.json`).
- **Doprava** – `config.json → shipping`: cena Packety na SK a hranica dopravy zdarma; tabuľka ukáže
  „s dopr.“ cenu. Overené: Veselý drak 2,36 € (zdarma od 80 €), Card Empire 3,50 € (zdarma od 200 €),
  Nekonečno osobný odber v Bratislave (Eurovea, Bory Mall). Ostatné doplň podľa košíka obchodu.
- **Cardmarket** – pri každom produkte odkaz na vyhľadávanie na Cardmarkete (reálna trhová cena).
- **Smarty.sk** – web blokuje roboty, legálna cesta je ich affiliate **XML feed** (eHUB → program
  Smarty.sk → „XML feed na vyžiadanie u affiliate managera“). URL feedu ulož do GitHub secretu
  `SMARTY_FEED_URL` (a na PC do `smarty_feed.txt`) – Smarty sa potom zapne automaticky.

## MSRP (`msrp.json`)
- **EN**: oficiálna US cena Bandai za balíček v USD (OP-01–03 $4.19, OP-04–09 a EB-01 $4.49,
  OP-10+ a EB-02+ $4.99, PRB $5.49), box = 24 balíčkov.
- **JP**: oficiálna japonská cena v JPY s 10 % daňou (OP-01–03 ¥198, OP-04–16 a EB-01–04 ¥220,
  od OP-17 ¥240, PRB ¥550 / 10 balíčkov v boxe).
- Prepočet: aktuálny kurz ECB + **23 % DPH**, aby sa to dalo porovnať so slovenskými cenami.
- Pozor: JP MSRP je japonská domáca cena (box ~35 €); na Slovensku sa JP boxy predávajú
  2–5× drahšie, preto je pri JP prah upozornení vyšší.
- Vlastnú hodnotu pre konkrétny produkt dáš do `override_eur`, napr. `"OP16 Box EN": 150`.

## Upozornenia (`config.json`)
- **blízko MSRP**: EN box skladom najviac 30 % nad MSRP (`"EN": 30`), JP box do +150 % (`"JP": 150`).
- **watchlist**: vlastné cieľové ceny, napr. `{"product": "OP09 Box JP", "max_eur": 120}`
  – upozorní pod touto cenou aj keď sa produkt vráti na sklad.
- **nový produkt**: obchod pridal nový box/pack (napr. predobjednávky novej edície).
- Rovnakú ponuku nepošle znova, kým cena neklesne o ďalšie 3 % (`realert_drop_pct`).

Na GitHube sa `config.json` dá upraviť priamo v prehliadači (ikona ceruzky).

## Dáta
- `data/current.json` – aktuálny stav každého obchodu (ak obchod zlyhá, ostanú posledné dáta s varovaním)
- `data/history.csv` – len **zmeny** cien a dostupnosti (súbor rastie pomaly)
- `docs/index.html` – vygenerovaná stránka

## Keď niečo prestane fungovať
Ak pri obchode vypíše „0 produktov“ alebo chybu, obchod zmenil web alebo URL kategórie –
URL sú v skripte v `SHOPS`. Obchod, ktorý blokuje servery GitHubu, označ v `SHOPS` ako `"cloud": False`
– bude sa sťahovať len z PC.
