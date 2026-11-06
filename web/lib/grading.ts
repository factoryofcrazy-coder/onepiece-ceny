// Oplatí sa dať kartu na grading? Bez vymyslenej šance na PSA 10: počíta zisk pri 10 a pri 9 a šancu, ktorá sa musí splniť, aby to vyšlo.
import { sb } from "./supabase";

export type GradedPrice = { card_id: string; grader: string; grade: number; median: number; p25: number; p75: number; sales: number; last_sold: string | null; fetched_on: string };

/** Pod týmto počtom predajov je medián len náhoda, odporúčanie nedávame. */
export const MIN_SALES = 3;

export async function loadGraded(ids: string[]): Promise<Map<string, GradedPrice[]>> {
  const out = new Map<string, GradedPrice[]>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb().from("card_graded_prices").select("*").in("card_id", ids.slice(i, i + 200));
    if (error) return out;
    for (const r of data as any[]) {
      const row = { ...r, grade: Number(r.grade) };
      out.set(r.card_id, [...(out.get(r.card_id) ?? []), row]);
    }
  }
  return out;
}

export const gradedEur = (rows: GradedPrice[] | undefined, grader: string, grade: number, usdRate: number) => {
  const r = rows?.find((x) => x.grader === grader && x.grade === grade);
  return r ? { eur: r.median / 100 / usdRate, sales: r.sales, last_sold: r.last_sold } : null;
};

/** Známka, na ktorú sa pri odovzdaní mieri, a tá o stupeň nižšie. Pri Beckette je bežný cieľ 9,5, desiatka je vzácna. */
export const GRADERS = { PSA: { top: 10, next: 9 }, BGS: { top: 9.5, next: 9 }, CGC: { top: 10, next: 9 } } as const;
export type Grader = keyof typeof GRADERS;
export const GRADER_SK: Record<Grader, string> = { PSA: "PSA", BGS: "Beckett (BGS)", CGC: "CGC" };

const TOP_LABELS: Record<string, string> = { "BGS-BL": "BGS 10 Black Label", "CGC-PR": "CGC 10 Pristine", "CGC-PF": "CGC 10 Perfect" };
export const gradedLabel = (g: Pick<GradedPrice, "grader" | "grade">) => TOP_LABELS[g.grader] ?? `${g.grader} ${g.grade}`;

export type Costs = { fee: number; sellPct: number };
export type Verdict = "good" | "maybe" | "perfect" | "no" | "unknown";
export type Advice = { grader: Grader; top: number; next: number; verdict: Verdict; vTop: number; vNext: number | null; gainTop: number; gainNext: number; needed: number | null; salesTop: number; salesNext: number };

/** Keď nižšiu známku nepoznáme, rátame, že sa kus predá ako negradovaný: je to opatrnejšie než si cenu domýšľať. */
export function adviseGrading(raw: number, rows: GradedPrice[] | undefined, usdRate: number, c: Costs, grader: Grader = "PSA"): Advice | null {
  const { top, next } = GRADERS[grader];
  const pTop = gradedEur(rows, grader, top, usdRate);
  if (!pTop) return null;
  const pNext = gradedEur(rows, grader, next, usdRate);
  const usable = pNext && pNext.sales >= MIN_SALES ? pNext.eur : null;
  const net = (v: number) => v * (1 - c.sellPct / 100);
  const cost = raw + c.fee;
  const gainTop = net(pTop.eur) - cost;
  const gainNext = net(usable ?? raw) - cost;
  const spread = net(pTop.eur) - net(usable ?? raw);
  const needed = gainTop <= 0 ? null : gainNext >= 0 ? 0 : spread > 0 ? Math.min(1, -gainNext / spread) : null;
  let verdict: Verdict;
  if (pTop.sales < MIN_SALES) verdict = "unknown";
  else if (gainTop <= 0 || needed == null) verdict = "no";
  else if (needed <= 0.3) verdict = "good";
  else if (needed <= 0.6) verdict = "maybe";
  else verdict = "perfect";
  return { grader, top, next, verdict, vTop: pTop.eur, vNext: usable, gainTop, gainNext, needed, salesTop: pTop.sales, salesNext: pNext?.sales ?? 0 };
}

export const VERDICT_SK: Record<Verdict, string> = {
  good: "Dobrý kandidát",
  maybe: "Zváž podľa stavu",
  perfect: "Len pri dokonalom stave",
  no: "Neoplatí sa",
  unknown: "Málo predajov",
};
export const VERDICT_ORDER: Verdict[] = ["good", "maybe", "perfect", "unknown", "no"];
