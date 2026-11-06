import { sb } from "@/lib/supabase";

export type IndexPoint = { day: string; value: number; items: number };
export type SpyPoint = { day: string; close: number };

export async function loadMarketIndex(): Promise<IndexPoint[]> {
  const { data } = await sb().from("market_index").select("day, value, items").order("day", { ascending: true }).limit(400);
  return (data as IndexPoint[]) ?? [];
}

export async function loadSpy(): Promise<SpyPoint[]> {
  const { data } = await sb().from("market_spy").select("day, close").order("day", { ascending: true }).limit(400);
  return (data as SpyPoint[]) ?? [];
}

/** SPY zarovnané na dni indexu (víkend = posledný známy kurz), prepočítané na základ 1000 na prvý deň indexu. */
export function spyAligned(indexDays: string[], spy: SpyPoint[]): (number | null)[] {
  if (indexDays.length === 0 || spy.length === 0) return indexDays.map(() => null);
  const sorted = [...spy].sort((a, b) => a.day.localeCompare(b.day));
  const closeAt = (day: string) => {
    let c: number | null = null;
    for (const p of sorted) {
      if (p.day <= day) c = p.close;
      else break;
    }
    return c;
  };
  const base = closeAt(indexDays[0]);
  if (!base) return indexDays.map(() => null);
  return indexDays.map((d) => {
    const c = closeAt(d);
    return c ? (1000 * c) / base : null;
  });
}

/** Body prepočítané na index so základom 1000 na prvý deň. */
export function indexed(points: IndexPoint[]) {
  if (points.length === 0) return [];
  const base = points[0].value || 1;
  return points.map((p) => ({ day: p.day, idx: (1000 * p.value) / base, items: p.items }));
}
