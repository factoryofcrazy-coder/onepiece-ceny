import { describe, expect, it } from "vitest";
import { adviseGrading, GradedPrice, gradedLabel } from "./grading";

const row = (grade: number, usd: number, sales = 8, grader = "PSA"): GradedPrice => ({ card_id: "A", grader, grade, median: usd * 100, p25: 0, p75: 0, sales, last_sold: null, fetched_on: "2026-11-06" });
const cost = { fee: 50, sellPct: 10 };

describe("oplatí sa grading", () => {
  it("bez ceny PSA 10 nič neodporúča", () => expect(adviseGrading(10, [row(9, 100)], 1, cost)).toBeNull());
  it("dobrý kandidát: pri 9 je v pluse", () => {
    const a = adviseGrading(20, [row(10, 500), row(9, 200)], 1, cost)!;
    expect(a.verdict).toBe("good");
    expect(a.gainTop).toBeCloseTo(380);
    expect(a.gainNext).toBeCloseTo(110);
    expect(a.needed).toBe(0);
  });
  it("potrebná šanca: príklad 60 € karta, 180 € PSA 10, 90 € PSA 9, poplatok 80", () => {
    const a = adviseGrading(60, [row(10, 180), row(9, 90)], 1, { fee: 80, sellPct: 0 })!;
    expect(a.needed).toBeCloseTo(50 / 90);
    expect(a.verdict).toBe("maybe");
  });
  it("vysoká potrebná šanca je len pri dokonalom stave", () => {
    expect(adviseGrading(100, [row(10, 200), row(9, 60)], 1, { fee: 50, sellPct: 0 })!.verdict).toBe("perfect");
  });
  it("ani PSA 10 sa nevyplatí", () => {
    const a = adviseGrading(100, [row(10, 150), row(9, 120)], 1, cost)!;
    expect(a.verdict).toBe("no");
    expect(a.needed).toBeNull();
  });
  it("málo predajov nedá verdikt, ale čísla ostanú", () => {
    const a = adviseGrading(10, [row(10, 500, 2)], 1, cost)!;
    expect(a.verdict).toBe("unknown");
    expect(a.salesTop).toBe(2);
  });
  it("neznáma alebo riedka PSA 9 sa ráta ako negradovaná", () => {
    const a = adviseGrading(20, [row(10, 500), row(9, 400, 1)], 1, { fee: 50, sellPct: 0 })!;
    expect(a.vNext).toBeNull();
    expect(a.gainNext).toBeCloseTo(-50);
  });
  it("Beckett mieri na 9,5 a CGC na 10, firmy sa nemiešajú", () => {
    const rows = [row(10, 900), row(9.5, 300, 8, "BGS"), row(9, 120, 8, "BGS"), row(10, 400, 8, "CGC"), row(9, 100, 8, "CGC")];
    const bgs = adviseGrading(20, rows, 1, { fee: 50, sellPct: 0 }, "BGS")!;
    expect([bgs.top, bgs.vTop, bgs.next, bgs.vNext]).toEqual([9.5, 300, 9, 120]);
    const cgc = adviseGrading(20, rows, 1, { fee: 50, sellPct: 0 }, "CGC")!;
    expect([cgc.top, cgc.vTop, cgc.vNext]).toEqual([10, 400, 100]);
    expect(adviseGrading(20, [row(10, 900)], 1, cost, "BGS")).toBeNull();
  });
  it("Black Label a Pristine majú vlastný názov a nemenia odporúčanie", () => {
    expect(gradedLabel({ grader: "BGS-BL", grade: 10 })).toBe("BGS 10 Black Label");
    expect(gradedLabel({ grader: "CGC-PR", grade: 10 })).toBe("CGC 10 Pristine");
    expect(gradedLabel({ grader: "PSA", grade: 9 })).toBe("PSA 9");
    expect(adviseGrading(20, [row(10, 9000, 8, "BGS-BL"), row(9.5, 300, 8, "BGS")], 1, cost, "BGS")!.vTop).toBe(300);
  });
  it("prepočet z dolárov", () => expect(adviseGrading(10, [row(10, 112)], 1.12, { fee: 0, sellPct: 0 })!.vTop).toBeCloseTo(100));
});
