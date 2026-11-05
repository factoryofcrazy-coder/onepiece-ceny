#!/usr/bin/env python3
"""Šifrované zálohy databázy Grand Line na vlastný stroj. Návod: web/docs/zalohy.md

  backup_db.py run            záloha hneď
  backup_db.py if-stale       záloha, ak je posledná staršia ako 20 hodín (volá cron každú hodinu)
  backup_db.py status         stav posledných záloh
  backup_db.py restore-test   obnoví poslednú zálohu do dočasnej databázy a spočíta riadky

Heslo k databáze a heslo k zálohám sú v súboroch s právami 600, nikdy nie v argumentoch príkazov ani v logu.
"""
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

HOME = Path.home()
ENV_FILE = Path(os.environ.get("GRAND_LINE_BACKUP_ENV", HOME / ".config/grand-line/backup.env"))
PG_ROOT = HOME / ".local/pg18"
NAME = re.compile(r"^grand-line-(\d{4}-\d{2}-\d{2})\.dump\.gpg$")
# schémy spravované Supabase sa nezálohujú, obsahujú len ich interné dáta
SKIP_SCHEMAS = ["realtime", "pgbouncer", "graphql", "graphql_public", "vault", "extensions", "net"]
REQUIRED = ["auth users", "public profiles", "public collection", "public dm_messages"]
COUNT_TABLES = ["auth.users", "public.profiles", "public.collection", "public.decks", "public.games", "public.trade_listings", "public.feedback", "public.dm_messages"]
MIN_BYTES = 10_000
STALE_HOURS = 20


class BackupError(Exception):
    pass


def keep_dates(dates, today):
    """14 denných, 8 týždenných (prvá v týždni), 12 mesačných (prvá v mesiaci)."""
    uniq = sorted(set(d for d in dates if d <= today), reverse=True)
    keep = set(uniq[:14])
    weeks, months = {}, {}
    for d in sorted(uniq):
        weeks.setdefault(tuple(d.isocalendar())[:2], d)
        months.setdefault((d.year, d.month), d)
    keep.update(sorted(weeks.values(), reverse=True)[:8])
    keep.update(sorted(months.values(), reverse=True)[:12])
    return keep


def read_env(path):
    if not path.exists():
        raise BackupError(f"chýba súbor s nastavením {path}")
    if path.stat().st_mode & 0o077:
        raise BackupError(f"{path} musí mať práva 600")
    out = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    for k in ["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE", "BACKUP_DIR", "BACKUP_PASSFILE"]:
        if not out.get(k):
            raise BackupError(f"v nastavení chýba {k}")
    return out


def tool(name):
    found = PG_ROOT / "usr/lib/postgresql/18/bin" / name
    return str(found) if found.exists() else name


def child_env(cfg=None):
    env = {k: v for k, v in os.environ.items() if not k.startswith("PG")}
    lib = PG_ROOT / "usr/lib/x86_64-linux-gnu"
    if lib.exists():
        env["LD_LIBRARY_PATH"] = str(lib)
    if cfg:
        env.update({k: cfg[k] for k in ["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE"]})
        env["PGSSLMODE"] = cfg.get("PGSSLMODE", "require")
        env["PGCONNECT_TIMEOUT"] = "30"
    return env


def scrub(text, cfg):
    secret = (cfg or {}).get("PGPASSWORD")
    if secret:
        text = text.replace(secret, "***")
    return re.sub(r"postgres(ql)?://\S+", "postgresql://***", text)[-600:]


def run(cmd, env, cfg=None, what="príkaz", timeout=1800):
    r = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=timeout)
    if r.returncode:
        raise BackupError(f"{what} zlyhal: {scrub(r.stderr, cfg)}")
    return r.stdout


def gpg_home():
    return tempfile.mkdtemp(prefix="gl-gpg-")


def encrypt(src, dst, passfile):
    home = gpg_home()
    try:
        run(["gpg", "--homedir", home, "--batch", "--yes", "--no-symkey-cache", "--pinentry-mode", "loopback", "--passphrase-file", str(passfile), "--symmetric", "--cipher-algo", "AES256", "--compress-algo", "none", "--output", str(dst), str(src)], os.environ.copy(), what="šifrovanie")
    finally:
        shutil.rmtree(home, ignore_errors=True)


def decrypt(src, dst, passfile):
    home = gpg_home()
    try:
        run(["gpg", "--homedir", home, "--batch", "--yes", "--no-symkey-cache", "--pinentry-mode", "loopback", "--passphrase-file", str(passfile), "--decrypt", "--output", str(dst), str(src)], os.environ.copy(), what="rozšifrovanie")
    finally:
        shutil.rmtree(home, ignore_errors=True)


def backups(folder):
    out = {}
    if folder.exists():
        for f in folder.iterdir():
            m = NAME.match(f.name)
            if m:
                out[dt.date.fromisoformat(m.group(1))] = f
    return out


def prune(folder, today):
    files = backups(folder)
    keep = keep_dates(files.keys(), today)
    removed = []
    for d, f in files.items():
        if d not in keep:
            f.unlink()
            Path(str(f) + ".sha256").unlink(missing_ok=True)
            removed.append(f.name)
    return removed


def do_backup(cfg, today=None):
    today = today or dt.datetime.now(dt.timezone.utc).date()
    folder = Path(cfg["BACKUP_DIR"])
    passfile = Path(cfg["BACKUP_PASSFILE"])
    if not passfile.exists() or passfile.stat().st_mode & 0o077:
        raise BackupError("súbor s heslom k zálohám chýba alebo nemá práva 600")
    if not folder.is_dir() or not os.access(folder, os.W_OK):
        raise BackupError(f"do {folder} sa nedá zapisovať")
    with tempfile.TemporaryDirectory(prefix=".tmp-", dir=folder) as tmp:
        dump = Path(tmp) / "db.dump"
        cmd = [tool("pg_dump"), "--format=custom", "--no-owner", f"--file={dump}"] + [f"--exclude-schema={s}" for s in SKIP_SCHEMAS]
        run(cmd, child_env(cfg), cfg, "pg_dump")
        if dump.stat().st_size < int(cfg.get("MIN_BYTES", MIN_BYTES)):
            raise BackupError(f"záloha je podozrivo malá ({dump.stat().st_size} B)")
        listing = run([tool("pg_restore"), "--list", str(dump)], child_env(), cfg, "kontrola zálohy")
        missing = [t for t in REQUIRED if not re.search(rf"TABLE DATA {t.split()[0]} {t.split()[1]} ", listing)]
        if missing:
            raise BackupError(f"v zálohe chýbajú tabuľky: {', '.join(missing)}")
        enc = Path(tmp) / "out.gpg"
        encrypt(dump, enc, passfile)
        target = folder / f"grand-line-{today.isoformat()}.dump.gpg"
        digest = subprocess.run(["sha256sum", str(enc)], capture_output=True, text=True, check=True).stdout.split()[0]
        os.replace(enc, target)
        Path(str(target) + ".sha256").write_text(f"{digest}  {target.name}\n")
    os.chmod(target, 0o600)
    removed = prune(folder, today)
    return target, removed


def is_stale(folder, hours=STALE_HOURS, now=None):
    files = backups(folder)
    if not files:
        return True
    newest = max(f.stat().st_mtime for f in files.values())
    return (now or time.time()) - newest > hours * 3600


def alert(cfg, message):
    """najviac jedno upozornenie denne, bez detailov z chyby"""
    path = Path(cfg.get("DISCORD_WEBHOOK_FILE", HOME / "onepiece-ceny/discord_webhook.txt"))
    stamp = ENV_FILE.parent / ".backup-alert"
    today = dt.date.today().isoformat()
    if not path.exists() or (stamp.exists() and stamp.read_text() == today):
        return False
    url = path.read_text().strip()
    req = urllib.request.Request(url, data=json.dumps({"content": message}).encode(), headers={"Content-Type": "application/json", "User-Agent": "grand-line-backup"})
    try:
        urllib.request.urlopen(req, timeout=15)
    except Exception:
        return False
    stamp.write_text(today)
    return True


def restore_test(cfg, source=None):
    folder = Path(cfg["BACKUP_DIR"])
    files = backups(folder)
    source = Path(source) if source else (files[max(files)] if files else None)
    if not source:
        raise BackupError("žiadna záloha na obnovu")
    env = child_env()
    with tempfile.TemporaryDirectory(prefix="gl-restore-", dir=os.environ.get("TMPDIR") or "/tmp") as tmp:
        dump = Path(tmp) / "db.dump"
        decrypt(source, dump, Path(cfg["BACKUP_PASSFILE"]))
        data, sock = Path(tmp) / "data", Path(tmp) / "s"
        sock.mkdir()
        run([tool("initdb"), "-D", str(data), "-U", "postgres", "-A", "trust", "--no-sync", "-E", "UTF8"], env, what="initdb")
        run([tool("pg_ctl"), "-D", str(data), "-w", "-l", str(Path(tmp) / "pg.log"), "-o", f"-k {sock} -c listen_addresses='' -c fsync=off", "start"], env, what="štart databázy")
        try:
            psql = [tool("psql"), "-h", str(sock), "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=0", "-Atq"]
            setup = "\n".join(f'create role "{r}";' for r in ["anon", "authenticated", "service_role", "supabase_auth_admin", "supabase_admin", "supabase_storage_admin", "dashboard_user", "authenticator", "supabase_realtime_admin"])
            setup += '\ncreate schema extensions;\ncreate schema realtime;\ncreate extension if not exists pgcrypto schema extensions;\ncreate extension if not exists "uuid-ossp" schema extensions;'
            subprocess.run(psql, input=setup, env=env, capture_output=True, text=True)
            r = subprocess.run([tool("pg_restore"), "-h", str(sock), "-U", "postgres", "-d", "postgres", "--no-owner", "--no-privileges", str(dump)], env=env, capture_output=True, text=True)
            problems = [l for l in r.stderr.splitlines() if "error:" in l]
            counts = {}
            for t in COUNT_TABLES:
                o = subprocess.run(psql + ["-c", f"select count(*) from {t}"], env=env, capture_output=True, text=True)
                counts[t] = int(o.stdout.strip()) if o.stdout.strip().isdigit() else None
        finally:
            subprocess.run([tool("pg_ctl"), "-D", str(data), "-m", "immediate", "stop"], env=env, capture_output=True)
    return {"file": source.name, "counts": counts, "restore_errors": len(problems), "errors": [scrub(p, cfg)[:200] for p in problems[:8]]}


def main(argv):
    cmd = argv[1] if len(argv) > 1 else "if-stale"
    os.umask(0o077)
    cfg = None
    try:
        cfg = read_env(ENV_FILE)
        if cmd == "status":
            files = backups(Path(cfg["BACKUP_DIR"]))
            for d in sorted(files, reverse=True)[:40]:
                print(d, files[d].stat().st_size, "B")
            print("záloh:", len(files), "stará:", is_stale(Path(cfg["BACKUP_DIR"])))
            return 0
        if cmd == "restore-test":
            print(json.dumps(restore_test(cfg, argv[2] if len(argv) > 2 else None), ensure_ascii=False, indent=1))
            return 0
        if cmd == "if-stale" and not is_stale(Path(cfg["BACKUP_DIR"])):
            return 0
        if cmd not in ("run", "if-stale"):
            print(__doc__)
            return 2
        target, removed = do_backup(cfg)
        print(f"{dt.datetime.now(dt.timezone.utc):%F %T} OK {target.name} {target.stat().st_size} B, zmazané: {len(removed)}")
        return 0
    except Exception as e:
        print(f"{dt.datetime.now(dt.timezone.utc):%F %T} CHYBA {scrub(str(e), cfg)}", file=sys.stderr)
        if cfg:
            alert(cfg, "Záloha databázy Grand Line na gamdel zlyhala. Detail je v logu ~/logs/grand-line-backup.log.")
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
