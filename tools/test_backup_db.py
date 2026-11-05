"""Testy záloh: python3 -m unittest tools/test_backup_db.py. Celý beh ide cez dočasný Postgres, ak sú nástroje v ~/.local/pg18."""
import datetime as dt
import importlib.util
import os
import shutil
import subprocess
import tempfile
import time
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("backup_db", Path(__file__).parent / "backup_db.py")
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)


setup_spec = importlib.util.spec_from_file_location("backup_setup", Path(__file__).parent / "backup_setup.py")
setup = importlib.util.module_from_spec(setup_spec)
setup_spec.loader.exec_module(setup)


class SetupUri(unittest.TestCase):
    def test_parses_session_pooler_with_special_password(self):
        c = setup.parse_uri(" postgresql://postgres.abc:he%40slo%2F1@aws-0-eu-west-1.pooler.supabase.com:5432/postgres\n")
        self.assertEqual((c["PGUSER"], c["PGPASSWORD"], c["PGHOST"], c["PGPORT"], c["PGDATABASE"]), ("postgres.abc", "he@slo/1", "aws-0-eu-west-1.pooler.supabase.com", "5432", "postgres"))

    def test_rejects_wrong_connections_without_showing_password(self):
        for uri in ["nie", "postgresql://u:[YOUR-PASSWORD]@x.pooler.supabase.com:5432/postgres", "postgresql://u:TAJNE@db.abc.supabase.co:5432/postgres", "postgresql://u:TAJNE@x.pooler.supabase.com:6543/postgres"]:
            with self.assertRaises(ValueError) as e:
                setup.parse_uri(uri)
            self.assertNotIn("TAJNE", str(e.exception))


class Retention(unittest.TestCase):
    def test_keeps_daily_weekly_monthly(self):
        today = dt.date(2026, 11, 5)
        days = [today - dt.timedelta(days=i) for i in range(800)]
        keep = b.keep_dates(days, today)
        self.assertTrue(all(today - dt.timedelta(days=i) in keep for i in range(14)))
        self.assertIn(dt.date(2026, 1, 1), keep)
        self.assertNotIn(dt.date(2024, 9, 15), keep)
        self.assertLessEqual(len(keep), 34)

    def test_never_deletes_the_only_backups(self):
        days = [dt.date(2020, 1, 1)]
        self.assertEqual(b.keep_dates(days, dt.date(2026, 1, 1)), set(days))


class Secrets(unittest.TestCase):
    def test_scrub(self):
        t = b.scrub("chyba hesloXYZ postgresql://u:hesloXYZ@h/db", {"PGPASSWORD": "hesloXYZ"})
        self.assertNotIn("hesloXYZ", t)

    def test_env_file_needs_600(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "e"
            p.write_text("PGHOST=x\n")
            p.chmod(0o644)
            with self.assertRaisesRegex(b.BackupError, "600"):
                b.read_env(p)
            p.chmod(0o600)
            with self.assertRaisesRegex(b.BackupError, "chýba"):
                b.read_env(p)


@unittest.skipUnless((b.PG_ROOT / "usr/lib/postgresql/18/bin/postgres").exists(), "chýba Postgres")
class EndToEnd(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="gl-test-")
        cls.env = b.child_env()
        tmp = Path(cls.tmp)
        cls.data, cls.sock = tmp / "src", tmp / "s"
        cls.sock.mkdir()
        subprocess.run([b.tool("initdb"), "-D", str(cls.data), "-U", "postgres", "-A", "trust", "--no-sync", "-E", "UTF8"], env=cls.env, check=True, capture_output=True)
        subprocess.run([b.tool("pg_ctl"), "-D", str(cls.data), "-w", "-l", str(tmp / "l"), "-o", f"-k {cls.sock} -c listen_addresses='' -c fsync=off", "start"], env=cls.env, check=True, capture_output=True)
        sql = """
        create schema auth; create table auth.users (id int primary key, email text);
        insert into auth.users values (1, 'tajny@email.sk');
        create table public.profiles (id int primary key, username text); insert into profiles select i, 'hrac' || i from generate_series(1, 4000) i;
        create table public.collection (id int); insert into collection values (1), (2), (3);
        create table public.dm_messages (id int, ciphertext text); insert into dm_messages values (1, 'SIFRA');
        create table public.decks (id int); create table public.games (id int); create table public.trade_listings (id int); create table public.feedback (id int);
        create schema vault; create table vault.secrets (x text); insert into vault.secrets values ('NEZALOHOVAT');
        """
        subprocess.run([b.tool("psql"), "-h", str(cls.sock), "-U", "postgres", "-d", "postgres", "-c", sql], env=cls.env, check=True, capture_output=True)

    @classmethod
    def tearDownClass(cls):
        subprocess.run([b.tool("pg_ctl"), "-D", str(cls.data), "-m", "immediate", "stop"], env=cls.env, capture_output=True)
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(dir=self.tmp))
        self.pass_file = Path(self.tmp) / "pass"
        self.pass_file.write_text("dlhe-testovacie-heslo")
        self.pass_file.chmod(0o600)
        self.cfg = {"PGHOST": str(self.sock), "PGPORT": "5432", "PGUSER": "postgres", "PGPASSWORD": "x", "PGDATABASE": "postgres", "PGSSLMODE": "disable", "BACKUP_DIR": str(self.dir), "BACKUP_PASSFILE": str(self.pass_file)}

    def test_backup_is_encrypted_and_restores(self):
        target, _ = b.do_backup(self.cfg, dt.date(2026, 11, 5))
        raw = target.read_bytes()
        for word in [b"tajny@email", b"hrac1", b"profiles", b"PGDMP"]:
            self.assertNotIn(word, raw)
        self.assertEqual(target.stat().st_mode & 0o077, 0)
        self.assertEqual(subprocess.run(["sha256sum", "--check", "--status", target.name + ".sha256"], cwd=self.dir).returncode, 0)
        r = b.restore_test(self.cfg)
        self.assertEqual(r["counts"]["public.profiles"], 4000)
        self.assertEqual(r["counts"]["auth.users"], 1)
        self.assertEqual(r["counts"]["public.dm_messages"], 1)
        plain = Path(self.tmp) / "plain.dump"
        b.decrypt(target, plain, self.pass_file)
        self.assertNotIn(b"NEZALOHOVAT", plain.read_bytes())
        plain.unlink()

    def test_wrong_passphrase_fails(self):
        target, _ = b.do_backup(self.cfg, dt.date(2026, 11, 5))
        bad = Path(self.tmp) / "bad"
        bad.write_text("ine-heslo")
        bad.chmod(0o600)
        with self.assertRaises(b.BackupError):
            b.decrypt(target, Path(self.tmp) / "x.dump", bad)

    def test_failed_backup_keeps_old_and_leaks_nothing(self):
        target, _ = b.do_backup(self.cfg, dt.date(2026, 11, 4))
        before = target.read_bytes()
        cfg = dict(self.cfg, PGHOST="/neexistuje", PGPASSWORD="tajneheslo123")
        with self.assertRaises(b.BackupError) as e:
            b.do_backup(cfg, dt.date(2026, 11, 4))
        self.assertNotIn("tajneheslo123", str(e.exception))
        self.assertEqual(target.read_bytes(), before)
        self.assertEqual([p.name for p in self.dir.iterdir() if p.name.startswith(".tmp")], [])

    def test_small_or_incomplete_backup_is_rejected(self):
        with self.assertRaisesRegex(b.BackupError, "malá"):
            b.do_backup(dict(self.cfg, MIN_BYTES="100000000"), dt.date(2026, 11, 5))
        self.assertEqual(b.backups(self.dir), {})

    def test_stale_and_prune(self):
        self.assertTrue(b.is_stale(self.dir))
        target, _ = b.do_backup(self.cfg, dt.date(2026, 11, 5))
        self.assertFalse(b.is_stale(self.dir))
        old = time.time() - 21 * 3600
        os.utime(target, (old, old))
        self.assertTrue(b.is_stale(self.dir))
        for i in range(1, 40):
            d = dt.date(2026, 11, 5) - dt.timedelta(days=i)
            (self.dir / f"grand-line-{d}.dump.gpg").write_text("x")
        b.prune(self.dir, dt.date(2026, 11, 5))
        left = b.backups(self.dir)
        self.assertLess(len(left), 25)
        self.assertIn(dt.date(2026, 11, 5), left)


if __name__ == "__main__":
    unittest.main()
