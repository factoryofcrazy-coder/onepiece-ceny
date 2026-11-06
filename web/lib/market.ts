import { sb } from "@/lib/supabase";

export type IndexPoint = { day: string; value: number; items: number };

export async function loadMarketIndex(): Promise<IndexPoint[]> {
  const { data } = await sb().from("market_index").select("day, value, items").order("day", { ascending: true }).limit(400);
  return (data as IndexPoint[]) ?? [];
}

/** Body prepočítané na index so základom 1000 na prvý deň. */
export function indexed(points: IndexPoint[]) {
  if (points.length === 0) return [];
  const base = points[0].value || 1;
  return points.map((p) => ({ day: p.day, idx: (1000 * p.value) / base, items: p.items }));
}
