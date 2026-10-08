# One Piece TCG – ceny v SK obchodoch + MSRP + Discord upozornenia

Sleduje ceny One Piece booster boxov a packov v obchodoch **Card Empire, Pikazard,
Veselý drak a iHRYsko**, porovnáva ich s **MSRP** a keď nájde výhodnú ponuku,
pošle upozornenie na **Discord**. Smarty.sk blokuje automatické sťahovanie
(Cloudflare), preto je na stránke len odkaz naň.

## Dva spôsoby používania

### A) Online zadarmo (GitHub Actions + GitHub Pages) – odporúčané
Beží samo každé 2 hodiny aj pri vypnutom počítači, stránka je na
**https://factoryofcrazy-coder.github.io/onepiece-ceny/**.

1. Repozitár: https://github.com/factoryofcrazy-coder/onepiece-ceny (verejný).
2. **Settings → Secrets and variables → Actions → New repository secret**
   názov `DISCORD_WEBHOOK_URL`, hodnota = URL webhooku z Discordu.
3. **Settings → Pages** → Source: *Deploy from a branch*, Branch: `main`, priečinok `/docs` → Save.
4. **Actions** → *Fetch cien* → **Run workflow** (prvé spustenie).

Tlačidlo **Fetch** na stránke otvorí GitHub Actions → klikni *Run workflow*,
o ~2 minúty sú nové ceny na stránke.

### B) Lokálne na počítači
Dvojklik na `spustit.bat` (Windows) / `spustit.command` (Mac), alebo:

```bash
python onepiece_ceny.py                 # stránka http://localhost:8765 s tlačidlom Fetch
python onepiece_ceny.py --watch 2       # + automatický fetch každé 2 hodiny
python onepiece_ceny.py --once          # raz stiahne, pošle upozornenia, vytvorí docs/index.html
python onepiece_ceny.py --test-discord  # skúšobná správa na Discord
```
Pre Discord lokálne: vytvor súbor `discord_webhook.txt` s URL webhooku (na GitHub sa nenahrá).

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
URL sú v skripte v `SHOPS`. Ak GitHub Actions dostane od obchodu 403 (blokuje servery),
spúšťaj fetch lokálne alebo cez Plánovač úloh vo Windows.
