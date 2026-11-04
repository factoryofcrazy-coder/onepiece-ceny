# Súkromné správy: spustenie

Tajné hodnoty nepatria do repozitára ani do chatu. Tento repozitár je verejný.

Poradie je zámerné: nič z krokov 1 až 4 nezmení živý web, kým sa nezapne prepínač v kroku 5.

## 1. Vytvorenie tajných hodnôt

Vo vlastnom termináli, nie cez chat:

```bash
cd web
node scripts/dm-keys.mjs
```

Výpis ulož do správcu hesiel. **Strata `DM_KEYS` znamená trvalú stratu všetkých správ.**

## 2. Tajné premenné v Supabase

Project Settings alebo Edge Functions → Secrets. Pridaj všetky štyri hodnoty z výpisu: `DM_KEYS`, `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUBJECT`.

## 3. Migrácia

SQL Editor: spusti `web/supabase/migrations/20261111_direct_messages.sql`. Pridáva len nové tabuľky a funkcie.

## 4. Funkcia

Nasadí sa zostavený súbor `supabase/functions/dm/dist/index.js` (`npm run build:fn:dm`) ako funkcia `dm`.

Kontrola: požiadavka `{"op":"health"}` vráti `{"ok":true}`.

## 5. Preview

Na preview sú správy zapnuté automaticky podľa `NEXT_PUBLIC_VERCEL_ENV`, netreba nič nastavovať. Preview používa ostrú databázu.

## 6. Ručný test

Podľa [TESTOVANIE.md](TESTOVANIE.md).

## 7. Zapnutie pre všetkých

Až po úspešnom teste a zlúčení do `main`: vo Verceli premenná `NEXT_PUBLIC_DM_ENABLED` = `1` pre Production a nové nasadenie. Vypnutie je jej odstránenie a nové nasadenie. Dáta sa tým nestratia.

## Rotácia kľúča

Pridaj novú verziu za pôvodnú, napríklad `1:<starý>,2:<nový>`. Nové správy používajú verziu 2, staré sa čítajú verziou 1. Starý kľúč nemaž, kým existujú ním šifrované správy.
