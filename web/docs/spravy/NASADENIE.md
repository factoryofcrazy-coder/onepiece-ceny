# Súkromné správy: spustenie

Tajné kľúče nepatria do repozitára ani do chatu. Tento repozitár je verejný.

## 1. Vytvorenie kľúča

Na vlastnom počítači:

```bash
openssl rand -base64 32
```

Hodnotu ulož do správcu hesiel. **Strata kľúča znamená trvalú stratu všetkých správ.**

## 2. Tajná premenná v Supabase

Edge Functions → Secrets, názov `DM_KEYS`, hodnota `1:<kľúč z kroku 1>`.

## 3. Migrácia

SQL Editor: `web/supabase/migrations/20261111_direct_messages.sql`. Súčasnému webu neublíži, pridáva len nové tabuľky.

## 4. Funkcia

Nasadí sa zostavený súbor `supabase/functions/dm/dist/index.js` (`npm run build:fn:dm`) ako funkcia `dm`.

Kontrola: požiadavka `{"op":"health"}` vráti `{"ok":true}`.

## 5. Rotácia kľúča

Pridaj novú verziu za pôvodnú, napríklad `1:<starý>,2:<nový>`. Nové správy používajú verziu 2, staré sa čítajú verziou 1. Starý kľúč nemaž, kým existujú ním šifrované správy.
