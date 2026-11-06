// Pohľad zberateľa: pohyby cien v zozname aj v zbierke a export zbierky.
import { cardEur, type Card } from "./data";
import type { Copy } from "./copies";
import { copyLabel, copyValue } from "./copies";
import { salesChange } from "./price-series";

export type Move = { card: Card; pct: number; price: number };

/** Karty s najväčším pohybom v danom smere. minPrice odfiltruje lacné karty, ktorých percentá sú len šum. */
export function topMoves(cards: Card[], usdRate: number, dir: "up" | "down", minPrice: number): Move[] {
  const out: Move[] = [];
  for (const card of cards) {
    const s = salesChange(card);
    const price = card.cm;
    if (!s || price == null || price < minPrice) continue;
    if (dir === "up" ? s.pct <= 0 : s.pct >= 0) continue;
    out.push({ card, pct: s.pct, price: cardEur(card, usdRate) ?? price });
  }
  return out.sort((a, b) => (dir === "up" ? b.pct - a.pct : a.pct - b.pct) || b.price - a.price);
}

/** Zmena celej zbierky podľa priemerov: kusy × 7 dní oproti kusy × 30 dní, len z kariet, ktoré majú oba priemery. */
export function collectionChange(items: { card: Card; n: number }[]) {
  let week = 0, month = 0, counted = 0;
  for (const { card, n } of items) {
    if (!card.cm7 || !card.cm30) continue;
    week += card.cm7 * n;
    month += card.cm30 * n;
    counted++;
  }
  return counted ? { week, month, counted, pct: Math.round((week / month - 1) * 100) } : null;
}

// Vzorec na začiatku bunky by tabuľkový program spustil, názvy kariet a poznámky sú cudzie dáta.
const cell = (v: string | number | null | undefined) => {
  if (v == null) return "";
  if (typeof v === "number") return String(v).replace(".", ",");
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV pre Excel: bodkočiarka a desatinná čiarka ako v slovenskom nastavení, BOM kvôli diakritike. */
export function collectionCsv(items: { card: Card; n: number; unit: number | null }[], copies: Copy[]) {
  const by = new Map<string, Copy[]>();
  for (const c of copies) by.set(c.card_id, [...(by.get(c.card_id) ?? []), c]);
  const rows: (string | number | null)[][] = [["Kód", "Meno", "Verzia", "Set", "Kusy", "Cena za kus €", "Spolu €", "Stav", "Certifikát", "Nákup €", "Dátum nákupu", "Hodnota kusu €", "Poznámka"]];
  for (const { card, n, unit } of items) {
    const base = [card.code, card.name, card.v, card.set];
    const total = unit != null ? Math.round(unit * n * 100) / 100 : null;
    const mine = by.get(card.id) ?? [];
    if (!mine.length) rows.push([...base, n, unit, total, "", "", null, "", null, ""]);
    mine.forEach((c, i) => rows.push([...base, i === 0 ? n : null, unit, i === 0 ? total : null, copyLabel(c), c.cert ?? "", c.paid, c.bought_on ?? "", copyValue(c, unit), c.note ?? ""]));
  }
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
}
