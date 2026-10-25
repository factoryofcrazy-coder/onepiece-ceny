"use client";
import { useEffect, useState } from "react";
import { load, useData } from "./data";

/** Pokémon karta. id = "pk:me02-013" (základná), "pk:me02-013_r" (reverse holo) – tak sa ukladá v kolekcii. */
export type PkCard = {
  id: string;
  code: string; // TCGdex ID (me02-013)
  name: string;
  num: string; // číslo v sete (013)
  v: string; // "" | "Holo" | "Reverse Holo" | "1st Edition"
  set: string;
  setName: string;
  rarity: string;
  type: string; // Pokemon | Trainer | Energy
  types: string[];
  hp: number | null;
  stage: string;
  illustrator: string;
  img: string;
  eur: number | null; // Cardmarket trend
};
export type PkSet = {
  id: string;
  name: string;
  series: string;
  seriesId?: string;
  date: string;
  total: number;
  official: number;
  logo: string;
  symbol?: string;
};
export type PkSetData = { updated: string; set: PkSet; cards: PkCard[] };
export type PkHit = { id: string; code: string; name: string; num: string; set: string; img: string };

export const PK_PREFIX = "pk:";
export const isPk = (id: string) => id.startsWith(PK_PREFIX);
/** set z ID v kolekcii: pk:me02-013_r → me02 */
export const pkSetOf = (id: string) => id.slice(PK_PREFIX.length).replace(/_r$/, "").replace(/-[^-]+$/, "");

export const usePkSets = () => useData<{ updated: string; sets: PkSet[] }>("pkcards");
export const usePkSet = (id: string | null) => useData<PkSetData>(id ? `pkcards?set=${encodeURIComponent(id)}` : null);
export const usePkSearch = (q: string) =>
  useData<{ cards: PkHit[] }>(q.trim().length >= 2 ? `pkcards?q=${encodeURIComponent(q.trim().toLowerCase())}` : null);

/** Načíta viac setov naraz (zbierka, master sety) – vráti mapu ID karty → karta a koľko setov sa ešte načítava. */
export function usePkSetsMany(ids: string[]) {
  const key = [...new Set(ids)].sort().join(",");
  const [state, setState] = useState<{ byId: Map<string, PkCard>; sets: Map<string, PkSetData>; pending: number; failed: string[] }>(
    { byId: new Map(), sets: new Map(), pending: 0, failed: [] },
  );
  useEffect(() => {
    const list = key ? key.split(",") : [];
    let live = true;
    const sets = new Map<string, PkSetData>();
    const failed: string[] = [];
    let pending = list.length;
    const publish = () => {
      if (!live) return;
      const byId = new Map<string, PkCard>();
      for (const d of sets.values()) for (const c of d.cards) byId.set(c.id, c);
      setState({ byId, sets: new Map(sets), pending, failed: [...failed] });
    };
    publish();
    // po 4 naraz – TCGdex je zadarmo, nepreťažujme ho
    let i = 0;
    const worker = async () => {
      while (i < list.length) {
        const id = list[i++];
        try {
          sets.set(id, await load<PkSetData>(`pkcards?set=${encodeURIComponent(id)}`));
        } catch {
          failed.push(id);
        }
        pending--;
        publish();
      }
    };
    Array.from({ length: Math.min(4, list.length) }, worker);
    return () => {
      live = false;
    };
  }, [key]);
  return state;
}

export const PK_TYPE_SK: Record<string, string> = { Pokemon: "Pokémon", Trainer: "Trainer", Energy: "Energia" };

export function cardmarketPk(c: { name: string; setName?: string }) {
  return `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(c.name)}`;
}
