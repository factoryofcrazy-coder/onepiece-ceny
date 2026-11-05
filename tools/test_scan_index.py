#!/usr/bin/env python3
"""Testy priraďovania oficiálnych obrázkov k verziám kariet. Spustenie: python3 tools/test_scan_index.py"""
import os, sys, unittest
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import scan_index as si


class Base(unittest.TestCase):
    def test_code(self):
        for a, b in [("OP06-115_r1", "OP06-115"), ("P-089-pr6", "P-089"), ("ST23-004-r1", "ST23-004"), ("OP04-016_P1", "OP04-016"),
                     ("OP01-016", "OP01-016"), ("DON-041", "DON-041"), ("EB03_OP05-006_p1", "OP05-006")]:
            self.assertEqual(si.base_code(a), b)


class Match(unittest.TestCase):
    def setUp(self):
        v = lambda *x: np.clip(np.round(np.array(x, np.float32) / np.linalg.norm(x) * 127), -127, 127).astype(np.int8)
        self.ids = ["OP01-016", "OP01-016_p1", "OP01-016_p2", "OP02-001"]
        self.idx = np.stack([v(1, 0, 0), v(0, 1, 0), v(0, 0, 1), v(1, 1, 1)])

    def test_zamenene_cislovanie(self):
        # oficiálny _p1 vyzerá ako náš _p2 → patrí k _p2
        z = np.array([0, 0.1, 1], np.float32); z /= np.linalg.norm(z)
        self.assertEqual(si.match_version(z, "OP01-016_p1", self.ids, self.idx), "OP01-016_p2")

    def test_len_v_ramci_karty(self):
        # podobný je obrázok inej karty → tá sa nesmie vybrať
        z = np.array([1, 1, 1], np.float32); z /= np.linalg.norm(z)
        self.assertIn(si.match_version(z, "OP01-016", self.ids, self.idx), self.ids[:3])

    def test_bez_zhody(self):
        z = np.array([-1, -1, -1], np.float32); z /= np.linalg.norm(z)
        self.assertIsNone(si.match_version(z, "OP01-016", self.ids, self.idx))

    def test_neznama_karta(self):
        z = np.array([1, 0, 0], np.float32)
        self.assertIsNone(si.match_version(z, "OP99-001", self.ids, self.idx))


if __name__ == "__main__":
    unittest.main()
