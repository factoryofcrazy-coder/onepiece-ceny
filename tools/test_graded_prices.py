import json, os, sys, tempfile, unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
import graded_prices as g


def sale(title, price, grade="10", grader="PSA", when="2026-10-01T00:00:00Z", graded=True):
    return {"search": "OP01-120", "title": title, "price": price, "grade": grade, "grader": grader, "graded": graded, "last_sold": when}


BASE = {"id": "OP01-120", "code": "OP01-120", "v": ""}
ALT = {"id": "OP01-120_p1", "code": "OP01-120", "v": "Parallel"}
MANGA = {"id": "OP01-120_p2", "code": "OP01-120", "v": "Alternate Art · Manga"}
PROMO = {"id": "OP01-120_cm1", "code": "OP01-120", "v": "Turnajové promo"}


class Rows(unittest.TestCase):
    def test_medián_po_verziách(self):
        sales = [sale("Shanks OP01-120 PSA 10", 100), sale("OP01-120 Shanks PSA 10", 200), sale("OP01-120 Shanks PSA 10", 900),
                 sale("Shanks OP01-120 Parallel Alt Art PSA 10", 500), sale("OP01-120 Manga Shanks PSA 10", 3000)]
        rows = {r["card"]: r for r in g.build_rows("OP01-120", [BASE, ALT, MANGA], sales)}
        self.assertEqual(rows["OP01-120"]["median"], 20000)
        self.assertEqual(rows["OP01-120"]["sales"], 3)
        self.assertEqual(rows["OP01-120_p1"]["median"], 50000)
        self.assertEqual(rows["OP01-120_p2"]["median"], 300000)

    def test_známky_sa_nemiešajú(self):
        rows = g.build_rows("OP01-120", [BASE], [sale("OP01-120 PSA 10", 100), sale("OP01-120 PSA 9", 40, "9")])
        self.assertEqual(sorted((r["grade"], r["median"]) for r in rows), [(9.0, 4000), (10.0, 10000)])

    def test_všetky_tri_firmy_zvlášť(self):
        rows = g.build_rows("OP01-120", [BASE], [sale("OP01-120 PSA 10", 100), sale("OP01-120 BGS 9.5", 80, "9.5", "BGS"), sale("OP01-120 CGC 10", 90, "10", "CGC")])
        self.assertEqual(sorted((r["grader"], r["grade"], r["median"]) for r in rows), [("BGS", 9.5, 8000), ("CGC", 10.0, 9000), ("PSA", 10.0, 10000)])

    def test_black_label_a_pristine_nekazia_medián(self):
        rows = g.build_rows("OP01-120", [BASE], [sale("OP01-120 BGS 10 Black Label", 9000, "10", "BGS"), sale("OP01-120 CGC Pristine 10", 5000, "10", "CGC"), sale("OP01-120 CGC 10", 90, "10", "CGC")])
        self.assertEqual([(r["grader"], r["median"]) for r in rows], [("CGC", 9000)])

    def test_vyradí_cudzie(self):
        sales = [sale("OP01-120 Japanese PSA 10", 1), sale("OP01-121 PSA 10", 2), sale("OP01-120 SGC 10", 3, grader="SGC"),
                 sale("OP01-120", 4, graded=False), sale("OP01-120 PSA", 5, grade=None), sale("OP01-120 PSA 10", 0), sale("OP01-120 AUTH", 6, grade="AUTH")]
        self.assertEqual(g.build_rows("OP01-120", [BASE], sales), [])

    def test_verzia_ktorú_nevieme_určiť_nedostane_cenu(self):
        self.assertEqual(g.build_rows("OP01-120", [PROMO], [sale("OP01-120 PSA 10", 100)]), [])

    def test_posledný_predaj(self):
        rows = g.build_rows("OP01-120", [BASE], [sale("OP01-120", 1, when="2026-09-01T00:00:00Z"), sale("OP01-120", 2, when="2026-10-05T00:00:00Z")])
        self.assertEqual(rows[0]["last_sold"], "2026-10-05")


class Main(unittest.TestCase):
    def run_main(self, env, fetch=None, rpc=None):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump({"cards": [BASE, ALT, {"id": "pk:x", "code": "pk:x", "v": ""}]}, f)
        with mock.patch.dict(os.environ, env, clear=True), mock.patch.object(sys, "argv", ["x", "--cards", f.name]), mock.patch.object(g, "fetch_sales", fetch or mock.Mock()) as fs, mock.patch.object(g, "rpc", rpc or mock.Mock()) as r, mock.patch.object(g, "discord") as d:
            code = g.main()
        os.unlink(f.name)
        return code, fs, r, d

    def test_bez_kľúča_sa_nič_nestiahne(self):
        code, fs, r, _ = self.run_main({})
        self.assertEqual(code, 0)
        fs.assert_not_called()
        r.assert_not_called()

    def test_uloží_a_označí_skontrolované(self):
        def rpc(name, body, key):
            return [{"code": "OP01-120"}, {"code": "NEZNAMY"}] if name == "graded_candidates" else 1
        calls = []
        def wrapped(name, body, key):
            calls.append((name, body))
            return rpc(name, body, key)
        fetch = mock.Mock(side_effect=lambda codes, t, c, grader: [sale("OP01-120 PSA 10", 100)] if grader == "PSA" else [])
        code, _, _, _ = self.run_main({"APIFY_TOKEN": "t", "SUPABASE_SERVICE_KEY": "k", "GRADED_BUDGET_USD": "1"}, fetch, wrapped)
        self.assertEqual(code, 0)
        self.assertEqual(fetch.call_args[0][0], ["OP01-120"])  # neznámy kód sa neplatí
        self.assertEqual([c[0][3] for c in fetch.call_args_list], ["PSA", "BGS", "CGC"])
        self.assertAlmostEqual(sum(c[0][2] for c in fetch.call_args_list), 1.0)
        saved = calls[-1][1]
        self.assertEqual(saved["p_codes"], ["OP01-120"])
        self.assertEqual(saved["p_rows"][0]["card"], "OP01-120")

    def test_strop_sa_delí_medzi_dávky(self):
        codes = [{"code": "OP01-120"}] * 10
        fetch = mock.Mock(return_value=[])
        self.run_main({"APIFY_TOKEN": "t", "SUPABASE_SERVICE_KEY": "k"}, fetch, lambda n, b, k: codes if n == "graded_candidates" else 0)
        self.assertEqual(fetch.call_count, 6)
        self.assertAlmostEqual(sum(c[0][2] for c in fetch.call_args_list), 1.0)

    def test_zlyhanie_ohlási_bez_detailov(self):
        code, _, _, d = self.run_main({"APIFY_TOKEN": "tajne", "SUPABASE_SERVICE_KEY": "k"}, None, mock.Mock(side_effect=RuntimeError("tajne")))
        self.assertEqual(code, 1)
        self.assertNotIn("tajne", d.call_args[0][0])


if __name__ == "__main__":
    unittest.main()
