// Import kolekcie z HoloDex (CSV export z appky) – čítanie a párovanie na karty z OPTCG API.
import type { Card } from "./data";

export type HdRow = {
  set: string;
  name: string;
  code: string;
  rarity: string;
  qty: number;
  usd: number | null; // HoloDex dáva cenu v centoch → prepočítané na doláre
  line: number;
};

export type Match = {
  row: HdRow;
  card: Card | null;
  sure: boolean; // false = odhad (viac možností, žiadna jasná stopa)
  note?: string;
};

/** Jednoduchý CSV parser (úvodzovky, "" vo vnútri, čiarky a nové riadky v poliach). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let f = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') (f += '"'), i++;
      else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") row.push(f), (f = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(f), rows.push(row), (row = []), (f = "");
    } else f += c;
  }
  if (f || row.length) row.push(f), rows.push(row);
  return rows.filter((r) => r.some((x) => x.trim()));
}

export function readHolodex(text: string): { rows: HdRow[]; error?: string } {
  const t = parseCsv(text.replace(/^﻿/, ""));
  if (!t.length) return { rows: [], error: "Súbor je prázdny." };
  const h = t[0].map((x) => x.trim().toLowerCase());
  const col = (name: string) => h.findIndex((x) => x.startsWith(name));
  const iCat = col("category"), iSet = col("set"), iName = col("product name"), iNum = col("card number");
  const iRar = col("rarity"), iQty = col("quantity"), iPrice = col("market price");
  if (iNum < 0 || iQty < 0) return { rows: [], error: "Toto nevyzerá ako export z HoloDex (chýba Card Number alebo Quantity)." };
  const rows: HdRow[] = [];
  t.slice(1).forEach((r, k) => {
    if (iCat >= 0 && r[iCat] && !/one piece/i.test(r[iCat])) return;
    const code = (r[iNum] || "").trim().toUpperCase();
    const qty = parseInt(r[iQty] || "0", 10);
    if (!code || !(qty > 0)) return;
    const cents = parseFloat(r[iPrice] || "");
    rows.push({
      set: (r[iSet] || "").trim(),
      name: (r[iName] || "").trim(),
      code,
      rarity: (r[iRar] || "").trim(),
      qty,
      usd: isNaN(cents) || cents <= 0 ? null : cents / 100,
      line: k + 2,
    });
  });
  return { rows };
}

// označenia variantov, ktoré HoloDex píše do zátvoriek v názve
const HINTS = ["super alternate art", "alternate art", "wanted poster", "manga", "parallel", "reprint", "sp", "treasure", "gold"];

function hintOf(name: string): string | null {
  const parts = [...name.matchAll(/\(([^()]*)\)/g)].map((m) => m[1].trim().toLowerCase());
  for (const p of parts) for (const h of HINTS) if (p === h || p.includes(h)) return h;
  return null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function matchRows(rows: HdRow[], cards: Card[]): Match[] {
  const byCode = new Map<string, Card[]>();
  cards.forEach((c) => {
    const l = byCode.get(c.code);
    l ? l.push(c) : byCode.set(c.code, [c]);
  });
  return rows.map((row) => {
    const cands = byCode.get(row.code) ?? [];
    if (!cands.length) return { row, card: null, sure: false, note: "Kartu s týmto číslom v databáze nemáme." };
    if (cands.length === 1) {
      const only = cands[0];
      const hint = hintOf(row.name);
      const odd = (hint && !only.v.toLowerCase().includes(hint)) || /event|promo|pre-?release/i.test(row.set);
      return { row, card: only, sure: !odd, note: odd ? "Túto verziu nemáme – pridané k základnej karte." : undefined };
    }
    const hint = hintOf(row.name);
    const rowSet = norm(row.set);
    let best: Card | null = null;
    let bestScore = -Infinity;
    let second = -Infinity;
    for (const c of cands) {
      const v = c.v.toLowerCase();
      let s = 0;
      if (hint) s += v.includes(hint) ? 6 : -4;
      else s += v ? -1 : 2;
      if (hint === "alternate art" && v.includes("super")) s -= 3; // „Alternate Art“ ≠ „Super Alternate Art“
      const cs = norm(c.setName);
      if (rowSet && cs && (cs === rowSet || cs.includes(rowSet) || rowSet.includes(cs))) s += 3;
      if (row.usd && c.usd) s -= Math.min(4, Math.abs(Math.log(c.usd / row.usd))) * 1.5;
      if (s > bestScore) (second = bestScore), (bestScore = s), (best = c);
      else if (s > second) second = s;
    }
    const sure = bestScore - second >= 2;
    return { row, card: best, sure, note: sure ? undefined : "Odhad podľa ceny – skontroluj verziu." };
  });
}
