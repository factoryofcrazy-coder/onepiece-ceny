# Zálohy databázy

Šifrované zálohy databázy Supabase na stroj gamdel do `/data/zalohy/grand-line/`. Kód: `tools/backup_db.py`, nastavenie: `tools/backup_setup.py`, testy: `python3 -m unittest tools/test_backup_db.py`.

## Ako to funguje

- Cron každú hodinu spustí kontrolu. Ak je posledná záloha staršia ako 20 hodín, spraví novú, takže po vypnutí stroja sa dobehne.
- `pg_dump` cez Session pooler (stroj nemá IPv6), potom kontrola veľkosti a kľúčových tabuliek, šifrovanie AES-256 (GPG), kontrolný súčet.
- Uchováva sa 14 denných, 8 týždenných a 12 mesačných záloh.
- Pri chybe príde najviac jedno upozornenie denne na Discord, bez detailov. Chyba je v `~/logs/grand-line-backup.log`. Stará záloha sa chybou nepokazí.
- Nástroje PostgreSQL 18 sú v `~/.local/pg18`, netreba systémovú inštaláciu.

## Čo v zálohe je a nie je

Je: `public`, `auth` (účty, hashované heslá), `private`, `storage` a história migrácií. Pozor, `private` obsahuje adresu Discord webhooku, aj preto je záloha šifrovaná.

Nie je: interné schémy Supabase, súbory z úložiska (zatiaľ žiadne), tajné hodnoty Edge Functions.

**Na prečítanie súkromných správ treba aj `DM_KEYS`, ktorý v zálohe nie je.** Patrí do správcu hesiel spolu s heslom k zálohám.

## Nastavenie

Vo vlastnom termináli, nie cez chat:

```bash
cd ~/dev/onepiece-ceny && python3 tools/backup_setup.py
```

Pripojenie: Supabase, tlačidlo Connect, Session pooler. Heslo k databáze sa dá v prípade potreby nastaviť nanovo v Project Settings, Database. Web a funkcie ním nie sú dotknuté, používajú vlastné kľúče.

Heslo k zálohám sa vypíše raz a treba ho uložiť do správcu hesiel. Na stroji je v `~/.config/grand-line/backup.pass`.

## Príkazy

```bash
python3 ~/bin/grand_line_backup.py status        # zoznam záloh
python3 ~/bin/grand_line_backup.py run           # záloha hneď
python3 ~/bin/grand_line_backup.py restore-test  # skúšobná obnova do dočasnej databázy
```

Po zmene skriptu v repozitári treba znova skopírovať `tools/backup_db.py` do `~/bin/grand_line_backup.py`.

## Obnova na ostro

Toto prepíše dáta. Najprv si ich pozri v skúšobnej obnove.

1. Rozšifruj zálohu: `gpg --decrypt --output db.dump grand-line-DATUM.dump.gpg`.
2. Do nového projektu Supabase obnov dáta cez `pg_restore --no-owner --no-privileges` s pripojením Session pooler.
3. Znova spusti migrácie z `web/supabase/migrations`, lebo politika nad `realtime.messages` je v schéme, ktorá sa nezálohuje.
4. Nastav tajné hodnoty Edge Functions, hlavne pôvodný `DM_KEYS`, a nasaď funkcie.

Tento celý postup na novom projekte Supabase zatiaľ nebol vyskúšaný, overená je obnova do čistého Postgresu.

## Známe obmedzenia

- Záloha je na tom istom stroji. Chráni pred chybou v databáze alebo na Supabase, nie pred stratou stroja. Treba doplniť kópiu mimo domu.
- Heslo k zálohám je kvôli automatickému behu aj na stroji. Šifrovanie chráni najmä kópie mimo stroja a samotný disk.
