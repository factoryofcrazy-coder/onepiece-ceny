"use client";
// Kusy v zbierke s nákupnou cenou a stavom. Tabuľka je súkromná, RLS púšťa len vlastníka.
import { sb } from "./supabase";

export const CONDS = ["NM", "LP", "MP", "HP", "DMG"] as const;
export const GRADERS = ["PSA", "CGC", "BGS", "TAG", "Iný"] as const;

export type Copy = {
  id: string;
  card_id: string;
  paid: number | null;
  own_value: number | null;
  bought_on: string | null;
  cond: (typeof CONDS)[number] | null;
  grader: (typeof GRADERS)[number] | null;
  grade: number | null;
  cert: string | null;
  note: string | null;
};
export type NewCopy = Omit<Copy, "id">;

const COLS = "id, card_id, paid, own_value, bought_on, cond, grader, grade, cert, note";

/** null = tabuľka ešte nie je v databáze alebo sa nedá čítať, funkciu vtedy treba skryť. */
export async function loadCopies(cardId?: string): Promise<Copy[] | null> {
  const out: Copy[] = [];
  for (let from = 0; ; from += 1000) {
    let q = sb().from("collection_copies").select(COLS).order("created_at").range(from, from + 999);
    if (cardId) q = q.eq("card_id", cardId);
    const { data, error } = await q;
    if (error) return null;
    // numeric prichádza ako číslo alebo text podľa veľkosti
    out.push(...(data as any[]).map((r) => ({ ...r, paid: num(r.paid), own_value: num(r.own_value), grade: num(r.grade) })));
    if (data.length < 1000) return out;
  }
}
const num = (v: unknown) => (v == null ? null : Number(v));

export async function addCopy(c: NewCopy): Promise<Copy | string> {
  const { data, error } = await sb().from("collection_copies").insert(c).select(COLS).single();
  if (error) return error.message.includes("maximum") ? "Dosiahol si limit zapísaných kusov." : "Kus sa nepodarilo uložiť.";
  return { ...(data as any), paid: num((data as any).paid), own_value: num((data as any).own_value), grade: num((data as any).grade) };
}

export async function removeCopy(id: string): Promise<boolean> {
  const { error } = await sb().from("collection_copies").delete().eq("id", id);
  return !error;
}

/** Overenie na stránke grading firmy. Len pri tých, kde adresu poznáme, číslo ide až po kliknutí používateľa. */
export function certUrl(c: Pick<Copy, "grader" | "cert">): string | null {
  if (!c.cert) return null;
  const n = encodeURIComponent(c.cert);
  if (c.grader === "PSA") return `https://www.psacard.com/cert/${n}`;
  if (c.grader === "CGC") return `https://www.cgccards.com/certlookup/${n}/`;
  return null;
}

/** Skutočné predaje na eBay: otvára ich používateľ, dáta neťaháme ani neukladáme. */
export function soldSearchUrl(code: string, grader: string, grade: number | string) {
  const q = encodeURIComponent(`${code} ${grader} ${grade}`).replace(/%20/g, "+");
  return `https://www.ebay.com/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1`;
}

/** Číslo z obalu: bez medzier, len znaky, ktoré databáza pustí. null = nezadané, undefined = neplatné. */
export function parseCert(v: string): string | null | undefined {
  const t = v.replace(/\s/g, "");
  if (!t) return null;
  return /^[A-Za-z0-9-]{1,30}$/.test(t) ? t : undefined;
}

/** Hodnotené kusy podľa firmy, najpočetnejšia prvá. */
export function gradedCounts(copies: Pick<Copy, "grader">[]): [string, number][] {
  const m = new Map<string, number>();
  for (const c of copies) if (c.grader) m.set(c.grader, (m.get(c.grader) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]);
}

/** Suma z formulára, aj s desatinnou čiarkou. "" = nezadané, undefined = neplatné. */
export function parseMoney(v: string): number | null | undefined {
  const t = v.trim().replace(/\s|€/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return isFinite(n) && n >= 0 && n <= 1000000 ? Math.round(n * 100) / 100 : undefined;
}

export const copyLabel = (c: Pick<Copy, "grader" | "grade" | "cond">) => (c.grader ? `${c.grader} ${c.grade}` : c.cond ?? "Bez stavu");

/** Hodnota kusu: čo si človek zapísal, inak predaje rovnakej známky. Cena negradovanej karty by gradovaný kus skresľovala. */
export function copyValue(c: Pick<Copy, "own_value" | "grader">, market: number | null, graded: number | null = null): number | null {
  if (c.own_value != null) return c.own_value;
  return c.grader ? graded : market;
}

/** Zisk a strata len z kusov, kde poznáme nákup aj hodnotu. Ostatné sa len spočítajú, aby výsledok nebol zavádzajúci. */
export function portfolio(copies: Copy[], marketOf: (cardId: string) => number | null, gradedOf: (c: Copy) => number | null = () => null) {
  let paid = 0, value = 0, counted = 0, noPaid = 0, noValue = 0;
  for (const c of copies) {
    const v = copyValue(c, marketOf(c.card_id), gradedOf(c));
    if (c.paid == null) noPaid++;
    else if (v == null) noValue++;
    else {
      paid += c.paid;
      value += v;
      counted++;
    }
  }
  return { paid, value, diff: value - paid, pct: paid > 0 ? Math.round((value / paid - 1) * 100) : null, counted, noPaid, noValue };
}
