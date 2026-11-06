// Výpočty k vývoju ceny: percentá z priemerov Cardmarketu a úseky grafu z našej histórie.
const DAY = 864e5;

export const dayNum = (iso: string) => Math.round(Date.parse(iso.slice(0, 10) + "T00:00:00Z") / DAY);
export const dayLabel = (n: number) => new Date(n * DAY).toLocaleDateString("sk-SK", { day: "numeric", month: "numeric", timeZone: "UTC" });

type Averages = { cm?: number; cm7?: number; cm30?: number };

/** Priemerný predaj za 7 dní oproti 30 dňom. Oba údaje sú predaje, trend s nimi porovnávať nejde, má iný výpočet. */
export function salesChange(c: Averages) {
  if (!c.cm7 || !c.cm30) return null;
  return { avg7: c.cm7, avg30: c.cm30, pct: Math.round((c.cm7 / c.cm30 - 1) * 100) };
}

/** Pohyb na značku v mriežke: lacné karty kolíšu náhodne a pod 20 % sa hýbe bežne každá štvrtá až polovica kariet. */
export function notableMove(c: Averages): number | null {
  const s = salesChange(c);
  return s && (c.cm ?? 0) >= 1 && Math.abs(s.pct) >= 20 ? s.pct : null;
}

export const formatPct = (pct: number) => (pct > 0 ? `▲ ${pct} %` : pct < 0 ? `▼ ${-pct} %` : "bez zmeny");

export type SeriesRow = { day: string; cm: number | null; usd: number | null };
export type Series = { through: string | null; points: SeriesRow[] };
/** Cena platí od svojho dňa po deň ďalšieho záznamu; null je deň bez ceny. */
export type Step = { day: number; eur: number | null };
export type View = { from: number; to: number; steps: Step[]; first: number | null; last: number | null; pct: number | null };

/** Rovnaký zdroj ako hlavná cena v detaile: Cardmarket, inak TCGplayer prepočítaný na eurá. */
export function toSteps(s: Series, useCm: boolean, usdRate: number): Step[] {
  return s.points.map((p) => {
    const cents = useCm ? p.cm : p.usd;
    return { day: dayNum(p.day), eur: cents == null ? null : useCm ? cents / 100 : cents / 100 / usdRate };
  });
}

export const lastDay = (s: Series, steps: Step[]) => Math.max(s.through ? dayNum(s.through) : 0, steps.length ? steps[steps.length - 1].day : 0);

/** Výrez grafu: days = null je celá história. Začiatok výrezu preberá cenu platnú v ten deň. */
export function viewOf(steps: Step[], to: number, days: number | null): View | null {
  if (!steps.length) return null;
  const from = days == null ? steps[0].day : Math.max(steps[0].day, to - days);
  const before = [...steps].reverse().find((s) => s.day <= from)!;
  const out: Step[] = [{ day: from, eur: before.eur }, ...steps.filter((s) => s.day > from && s.day <= to)];
  const priced = out.filter((s) => s.eur != null);
  const first = priced.length ? priced[0].eur : null;
  const last = priced.length ? priced[priced.length - 1].eur : null;
  return { from, to, steps: out, first, last, pct: first && last != null ? Math.round((last / first - 1) * 100) : null };
}

export const priceAt = (steps: Step[], day: number) => [...steps].reverse().find((s) => s.day <= day)?.eur ?? null;

/** Okrúhle značky osi: najviac 4 čiarky, nikdy pod nulou. Rovná cena dostane rozpätie okolo seba. */
export function niceTicks(min: number, max: number): number[] {
  const pad = max > min ? 0 : Math.max(max * 0.1, 0.01);
  const lo = min - pad, hi = max + pad;
  const raw = (hi - lo) / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((m) => m >= raw)!;
  const start = Math.max(0, Math.floor(lo / step) * step);
  const out: number[] = [];
  for (let v = start; v < hi + step * 0.999; v += step) out.push(Math.round(v * 1e4) / 1e4);
  return out;
}
