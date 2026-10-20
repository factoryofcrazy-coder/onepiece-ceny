"use client";
import { useEffect, useState } from "react";

export type Card = {
  id: string; // ID varianty (OP01-001_p1)
  code: string; // herné ID (OP01-001)
  name: string;
  v: string; // "" = základná verzia, inak názov varianty (Parallel, Manga…)
  set: string;
  setName: string;
  rarity: string;
  type: string; // Leader | Character | Event | Stage
  colors: string[];
  cost: number | null;
  power: number | null;
  counter: number | null;
  life: number | null;
  attr: string;
  traits: string;
  text: string;
  img: string;
  usd: number | null;
};
export type CardsDb = { updated: string; sets: { id: string; name: string }[]; cards: Card[]; byId: Map<string, Card> };

// [shop, name, code, kind, lang, eur, inStock, url, price, currency, msrpEur, packs, preorder, shipping, cmUrl, img, rawEur]
export type Offer = [
  string, string, string, string, string, number, boolean, string, number, string,
  number | null, number | null, boolean, number | null, string, string | null, number | null,
];
export type PricesDb = {
  offers: Offer[];
  shops: Record<string, string>;
  pickup: Record<string, string>;
  status: Record<string, { ts: string; ok: boolean; error?: string; pc?: boolean }>;
  updated: string;
  th: Record<string, number>;
  fx?: { USD?: number; CZK?: number; JPY?: number };
};

const cache: Record<string, Promise<any>> = {};

function load<T>(file: string, prep?: (d: any) => T): Promise<T> {
  if (!cache[file])
    cache[file] = fetch(`/api/${file}`).then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      return prep ? prep(d) : d;
    });
  return cache[file];
}

function useData<T>(file: string, prep?: (d: any) => T) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    load<T>(file, prep).then(
      (d) => live && setData(d),
      (e) => {
        delete cache[file];
        live && setError(String(e.message || e));
      },
    );
    return () => {
      live = false;
    };
  }, [file]);
  return { data, error };
}

export const useCards = () =>
  useData<CardsDb>("cards", (d) => ({ ...d, byId: new Map((d.cards as Card[]).map((c) => [c.id, c])) }));
export const usePrices = () => useData<PricesDb>("prices");

export type MetaDeck = {
  leader: string;
  leaderName: string;
  player: string;
  placing: number;
  tournament: string;
  tournamentId: string;
  date: string;
  players: number;
  cards: Record<string, number>;
};
export type MetaDb = { updated: string; tournaments: number; decks: MetaDeck[] };
export const useMeta = () => useData<MetaDb>("meta");

export const COLORS = ["Red", "Green", "Blue", "Purple", "Black", "Yellow"];
export const COLOR_SK: Record<string, string> = {
  Red: "Červená", Green: "Zelená", Blue: "Modrá", Purple: "Fialová", Black: "Čierna", Yellow: "Žltá",
};
export const TYPE_SK: Record<string, string> = { Leader: "Leader", Character: "Postava", Event: "Event", Stage: "Stage" };

export function eur(v: number | null | undefined, digits = 2) {
  if (v == null || isNaN(v)) return "–";
  return v.toLocaleString("sk-SK", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + " €";
}

/** Cena karty v EUR (OPTCG API dáva TCGplayer market price v USD). */
export function cardEur(c: Card | undefined, usdRate = 1.12) {
  return c?.usd != null ? c.usd / usdRate : null;
}

/** Setový kód z ID karty: OP01-001 → OP-01, ST10-002 → ST-10, EB01 → EB-01, PRB01 → PRB-01 */
export function setOrder(id: string) {
  const m = id.match(/^([A-Z]+)-?(\d+)/);
  const pre = m?.[1] ?? id;
  const n = m ? parseInt(m[2]) : 0;
  const rank: Record<string, number> = { OP: 0, EB: 1, PRB: 2, ST: 3, P: 4 };
  return [rank[pre] ?? 5, -n] as const;
}
/** booster = OP, EB, PRB; starter = ST; ostatné = promo a pod. */
export function setKind(id: string): "booster" | "starter" | "other" {
  if (/^(OP|EB|PRB)/.test(id)) return "booster";
  if (/^ST/.test(id)) return "starter";
  return "other";
}
export const SET_KIND_SK = { booster: "Booster sety", starter: "Starter decky", other: "Ostatné" } as const;

export function sortSets<T extends { id: string }>(sets: T[]) {
  return [...sets].sort((a, b) => {
    const x = setOrder(a.id), y = setOrder(b.id);
    return x[0] - y[0] || x[1] - y[1] || a.id.localeCompare(b.id);
  });
}
