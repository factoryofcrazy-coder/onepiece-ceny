#!/usr/bin/env python3
"""Jednorazové nastavenie záloh na gamdel. Spúšťaj vo vlastnom termináli, nie cez chat. Návod: web/docs/zalohy.md"""
import getpass
import os
import secrets
import base64
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse

HOME = Path.home()
CONFIG = HOME / ".config/grand-line"
ENV_FILE = CONFIG / "backup.env"
PASS_FILE = CONFIG / "backup.pass"
BACKUP_DIR = Path("/data/zalohy/grand-line")
SCRIPT = HOME / "bin/grand_line_backup.py"
CRON = '41 * * * * /usr/bin/python3 $HOME/bin/grand_line_backup.py if-stale >> $HOME/logs/grand-line-backup.log 2>&1'


def parse_uri(uri):
    """pripojenie Session pooler zo Supabase; heslo sa nikdy nevypisuje"""
    u = urlparse(uri.strip())
    if u.scheme not in ("postgres", "postgresql") or not u.hostname or not u.username or not u.password:
        raise ValueError("Toto nevyzerá ako pripojenie k databáze. Skopíruj ho zo Supabase: Connect, Session pooler.")
    if "YOUR" in u.password.upper() or u.password.startswith("["):
        raise ValueError("V pripojení je ešte zástupný text. Nahraď ho skutočným heslom k databáze.")
    if "pooler.supabase.com" not in u.hostname:
        raise ValueError("Tento stroj nemá IPv6, treba adresu Session pooler (…pooler.supabase.com).")
    if u.port == 6543:
        raise ValueError("Port 6543 je Transaction pooler. Treba Session pooler na porte 5432.")
    return {"PGHOST": u.hostname, "PGPORT": str(u.port or 5432), "PGUSER": unquote(u.username), "PGPASSWORD": unquote(u.password), "PGDATABASE": (u.path or "/postgres").lstrip("/") or "postgres"}


def write_private(path, text):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(text)
    os.chmod(path, 0o600)


def add_cron():
    now = subprocess.run(["crontab", "-l"], capture_output=True, text=True).stdout
    if "grand_line_backup.py" in now:
        return
    subprocess.run(["crontab", "-"], input=now.rstrip("\n") + "\n# Grand Line: šifrovaná záloha databázy, ak je posledná staršia ako 20 hodín\n" + CRON + "\n", text=True, check=True)


def main():
    print("1/5 Priečinok na zálohy (pýta heslo k sudo)")
    user = getpass.getuser()
    subprocess.run(["sudo", "install", "-d", "-o", user, "-g", user, "-m", "700", "/data/zalohy", str(BACKUP_DIR)], check=True)

    print("2/5 Pripojenie k databáze: Supabase, Connect, Session pooler, celý riadok s heslom. Text sa pri písaní nezobrazuje.")
    cfg = parse_uri(getpass.getpass("Pripojenie: "))
    cfg |= {"BACKUP_DIR": str(BACKUP_DIR), "BACKUP_PASSFILE": str(PASS_FILE)}
    write_private(ENV_FILE, "".join(f"{k}={v}\n" for k, v in cfg.items()))

    print("3/5 Heslo k zálohám")
    if PASS_FILE.exists():
        print("    Už existuje, ostáva bez zmeny.")
    else:
        value = base64.b64encode(secrets.token_bytes(32)).decode()
        write_private(PASS_FILE, value)
        print("\n    ULOŽ SI TOTO HESLO DO SPRÁVCU HESIEL. Neposielaj ho nikomu ani do chatu. Bez neho sa záloha nedá obnoviť:\n")
        print("    " + value + "\n")
        input("    Po uložení stlač Enter… ")
        print("\033[F\033[K\033[3A\033[J", end="")

    print("4/5 Skript a cron")
    SCRIPT.parent.mkdir(exist_ok=True)
    shutil.copy(Path(__file__).with_name("backup_db.py"), SCRIPT)
    (HOME / "logs").mkdir(exist_ok=True)
    add_cron()

    print("5/5 Prvá záloha a skúšobná obnova")
    if subprocess.run([sys.executable, str(SCRIPT), "run"]).returncode:
        sys.exit("Záloha zlyhala. Chybu vyššie mi môžeš poslať, heslá v nej nie sú.")
    subprocess.run([sys.executable, str(SCRIPT), "restore-test"])
    print("\nHotovo. Záloha beží automaticky. Stav: python3 ~/bin/grand_line_backup.py status")


if __name__ == "__main__":
    main()
