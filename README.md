# One Piece TCG – ceny v SK obchodoch + MSRP + Discord upozornenia

Sleduje ceny One Piece booster boxov a packov v obchodoch **Card Empire, Pikazard,
Veselý drak a iHRYsko**, porovnáva ich s **MSRP** a keď nájde výhodnú ponuku,
pošle upozornenie na **Discord**. Smarty.sk blokuje automatické sťahovanie
(Cloudflare), preto je na stránke len odkaz naň.

## Ako to beží

**Online (GitHub Actions + Pages)** – každé 2 hodiny automaticky stiahne **Veselý drak a iHRYsko**,
pošle upozornenia na Discord a obnoví stránku **https://factoryofcrazy-coder.github.io/onepiece-ceny/**.
Tlačidlo Fetch na online stránke otvorí GitHub Actions → *Run workflow*.

**Card Empire a Pikazard** (Shoptet) blokujú servery GitHubu, preto sa sťahujú z tvojho PC:
dvojklik na **`spustit.bat`** → hneď stiahne všetky 4 obchody, pošle upozornenia,
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
- **pod MSRP**: EN box skladom na MSRP alebo pod ním (`"EN": 0`), JP box do +150 % (`"JP": 150`).
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
