#!/usr/bin/env python3
"""Testy denného ukladania cien. Spustenie: python3 tools/test_price_history.py"""
import datetime, os, sys, unittest
sys.path.insert(0, os.path.dirname(__file__))
import price_history as ph

MON, TUE = datetime.date(2026, 11, 9), datetime.date(2026, 11, 10)
U = {"bytes": 355_000_000, "limit": 500_000_000, "pct": 71.0, "level": 70, "alert": False, "per_week": 2_000_000, "history_bytes": 120_000_000}


class Rows(unittest.TestCase):
    def test_centy_bez_chyby_zaokruhlenia(self):
        self.assertEqual(ph.cents(0.29), 29)
        self.assertEqual(ph.cents(1.15), 115)
        self.assertEqual(ph.cents(1234.56), 123456)
        self.assertEqual(ph.cents(0), 0)
        self.assertIsNone(ph.cents(None))

    def test_riadky(self):
        cards = [{"id": "OP01-001", "cm": 1.5, "cmLow": 0.9, "usd": 2}, {"id": "pk:me02-013", "cm": 3}, {"id": "P-001"}]
        self.assertEqual(ph.rows_from(cards), [
            {"id": "OP01-001", "cm": 150, "low": 90, "jp": None, "usd": 200},
            {"id": "P-001", "cm": None, "low": None, "jp": None, "usd": None},
        ])


class Messages(unittest.TestCase):
    def test_bezny_den_ticho(self):
        self.assertEqual(ph.messages(U, TUE), [])

    def test_pondelok_prehlad(self):
        m = ph.messages(U, MON)
        self.assertEqual(len(m), 1)
        self.assertIn("355 MB z 500 MB (71,0 %)", m[0])
        self.assertIn("2,0 MB za týždeň", m[0])
        self.assertIn("o 72 týždňov", m[0])

    def test_prekrocenie_aj_v_pondelok_len_raz(self):
        m = ph.messages({**U, "alert": True}, MON)
        self.assertEqual(len(m), 1)
        self.assertIn("prekročila 70 %", m[0])

    def test_bez_tempa(self):
        self.assertNotIn("Tempo", ph.usage_text({**U, "per_week": None}))


class Main(unittest.TestCase):
    def test_bez_kluca_preskoci(self):
        os.environ.pop("SUPABASE_SERVICE_KEY", None)
        sys.argv = ["x", "--cards", "/neexistuje"]
        self.assertEqual(ph.main(), 0)

    def test_chyba_oznami_bez_detailu_a_skonci_chybou(self):
        os.environ["SUPABASE_SERVICE_KEY"] = "k"
        sys.argv = ["x", "--cards", "/neexistuje"]
        sent = []
        orig, ph.discord = ph.discord, sent.append
        try:
            self.assertEqual(ph.main(), 1)
        finally:
            ph.discord = orig
            del os.environ["SUPABASE_SERVICE_KEY"]
        self.assertEqual(len(sent), 1)
        self.assertNotIn("neexistuje", sent[0])


if __name__ == "__main__":
    unittest.main()
