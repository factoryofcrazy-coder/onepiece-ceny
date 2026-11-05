import { describe, expect, it } from "vitest";
import { dayNum, lastDay, niceTicks, notableMove, priceAt, salesChange, toSteps, viewOf } from "./price-series";

const series = {
  through: "2026-12-20",
  points: [
    { day: "2026-11-05", cm: 1000, usd: 1120 },
    { day: "2026-12-01", cm: 1500, usd: null },
    { day: "2026-12-15", cm: 1200, usd: 2240 },
  ],
};
const steps = toSteps(series, true, 1.12);
const to = lastDay(series, steps);

describe("percentá z priemerov", () => {
  it("porovnáva 7 dní s 30 dňami", () => expect(salesChange({ cm7: 12, cm30: 10 })).toEqual({ avg7: 12, avg30: 10, pct: 20 }));
  it("bez niektorého priemeru nič nevymýšľa", () => {
    expect(salesChange({ cm7: 12 })).toBeNull();
    expect(salesChange({ cm30: 12 })).toBeNull();
  });
  it("značka v mriežke len pri výraznom pohybe drahšej karty", () => {
    expect(notableMove({ cm: 5, cm7: 12, cm30: 10 })).toBe(20);
    expect(notableMove({ cm: 5, cm7: 8, cm30: 10 })).toBe(-20);
    expect(notableMove({ cm: 5, cm7: 11, cm30: 10 })).toBeNull();
    expect(notableMove({ cm: 0.5, cm7: 1, cm30: 0.5 })).toBeNull();
    expect(notableMove({ cm7: 12, cm30: 10 })).toBeNull();
  });
});

describe("výrez grafu", () => {
  it("koniec je posledný beh, nie posledná zmena", () => expect(to).toBe(dayNum("2026-12-20")));
  it("bez dátumu behu končí poslednou zmenou", () => expect(lastDay({ through: null, points: series.points }, steps)).toBe(dayNum("2026-12-15")));
  it("celá história", () => {
    const v = viewOf(steps, to, null)!;
    expect(v.from).toBe(dayNum("2026-11-05"));
    expect(v.steps.map((s) => s.eur)).toEqual([10, 15, 12]);
    expect(v.pct).toBe(20);
  });
  it("začiatok výrezu preberie cenu platnú v ten deň", () => {
    const v = viewOf(steps, to, 7)!;
    expect(v.from).toBe(dayNum("2026-12-13"));
    expect(v.steps).toEqual([{ day: dayNum("2026-12-13"), eur: 15 }, { day: dayNum("2026-12-15"), eur: 12 }]);
    expect(v.pct).toBe(-20);
  });
  it("kratšia história začína prvým záznamom, nie prázdnym miestom", () => expect(viewOf(steps, to, 365)!.from).toBe(dayNum("2026-11-05")));
  it("cena medzi záznamami je tá posledná", () => {
    expect(priceAt(steps, dayNum("2026-12-10"))).toBe(15);
    expect(priceAt(steps, dayNum("2026-11-01"))).toBeNull();
  });
  it("TCGplayer sa prepočíta a deň bez ceny ostane prázdny", () => {
    const [a, b, c] = toSteps(series, false, 1.12).map((s) => s.eur);
    expect(a).toBeCloseTo(10);
    expect(b).toBeNull();
    expect(c).toBeCloseTo(20);
  });
  it("výpadok ceny neovplyvní percentá", () => {
    const v = viewOf([{ day: 1, eur: 10 }, { day: 2, eur: null }, { day: 3, eur: 11 }], 3, null)!;
    expect(v.pct).toBe(10);
  });
  it("karta bez histórie", () => expect(viewOf([], to, 7)).toBeNull());
});

describe("os", () => {
  it("značky pokryjú rozsah a nejdú pod nulu", () => {
    for (const [a, b] of [[10, 15], [0.02, 0.05], [1200, 1210], [0.1, 500], [13, 13]]) {
      const t = niceTicks(a, b);
      expect(t[0]).toBeGreaterThanOrEqual(0);
      expect(t[0]).toBeLessThanOrEqual(a);
      expect(t[t.length - 1]).toBeGreaterThanOrEqual(b);
      expect(t.length).toBeLessThanOrEqual(6);
    }
  });
});
