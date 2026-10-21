// Klient online hry: volania edge function „game“ a typy riadkov z DB.
import { useEffect, useState } from "react";
import type { Card } from "./data";
import { DECK_ST01, DECK_ST26 } from "./engine/fixtures";
import { sb } from "./supabase";

export type GameRow = {
  id: string;
  created_at: string;
  updated_at: string;
  status: "open" | "playing" | "done" | "cancelled";
  host: string;
  guest: string | null;
  host_name: string;
  guest_name: string | null;
  host_leader: string;
  guest_leader: string | null;
  host_deck_name: string;
  guest_deck_name: string | null;
  turn: number;
  to_move: string | null;
  winner: string | null;
  end_reason: string | null;
  rated: boolean;
  version: number;
  elo_delta: number | null;
};
export type Rating = { user_id: string; elo: number; wins: number; losses: number; games: number; streak: number; best_elo: number };

export type DeckOpt = { id: string; name: string; leader: string; cards: string[]; preset?: boolean };
export const PRESETS: DeckOpt[] = [
  { id: "st26", ...DECK_ST26, name: "Starter: Fialový Luffy (ST-26)", preset: true },
  { id: "st01", ...DECK_ST01, name: "Starter: Červený Luffy (ST-01)", preset: true },
];
export const deckRef = (d: DeckOpt) => (d.preset ? { preset: d.id } : { id: d.id });

/** zavolá server; pri chybe vyhodí Error so slovenskou správou zo servera */
export async function gameCall<T = any>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().functions.invoke("game", { body });
  if (error) {
    let msg = "Server neodpovedá – skús to znova.";
    let status = 0;
    try {
      const res = (error as any).context as Response | undefined;
      status = res?.status ?? 0;
      const j = await res?.json();
      if (j?.error) msg = j.error;
    } catch {
      /* nič */
    }
    const e = new Error(msg) as Error & { status?: number };
    e.status = status;
    throw e;
  }
  return data as T;
}

/** moje hrateľné decky (leader + 40–50 kariet) + starter decky */
export function useMyDecks(userId: string | undefined) {
  const [decks, setDecks] = useState<DeckOpt[]>(PRESETS);
  useEffect(() => {
    if (!userId) return setDecks(PRESETS);
    sb()
      .from("decks")
      .select("id,name,leader_id,cards")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .then(({ data }) => {
        const mine = (data ?? [])
          .map((d: any) => ({
            id: d.id as string,
            name: d.name as string,
            leader: d.leader_id as string,
            cards: Object.entries((d.cards ?? {}) as Record<string, number>).flatMap(([c, n]) => Array(n).fill(c)),
          }))
          .filter((d) => d.leader && d.cards.length >= 40 && d.cards.length <= 50);
        setDecks([...mine, ...PRESETS]);
      });
  }, [userId]);
  return decks;
}

export async function loadRatings(ids?: string[]): Promise<Map<string, Rating>> {
  let q = sb().from("ratings").select("*");
  if (ids?.length) q = q.in("user_id", ids);
  const { data } = await q;
  return new Map(((data as Rating[]) ?? []).map((r) => [r.user_id, r]));
}

export const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "práve teraz";
  if (m < 60) return `pred ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `pred ${h} h`;
  return `pred ${Math.round(h / 24)} d`;
};

/** herný kód → karta (prednostne základná verzia, nie parallel) */
export function byCodeOf(cards: Card[] | undefined): Map<string, Card> {
  const m = new Map<string, Card>();
  cards?.forEach((c) => {
    const cur = m.get(c.code);
    if (!cur || (cur.v && !c.v)) m.set(c.code, c);
  });
  return m;
}
