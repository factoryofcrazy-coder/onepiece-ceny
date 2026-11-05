import { describe, expect, it } from "vitest";
import { cardCode, Decider } from "./decide";

const hit = (id: string, score = 0.6, ...rest: [string, number][]) => [{ id, score }, ...rest.map(([id, score]) => ({ id, score }))];
/** Pustí snímky každých dt ms, vráti pridané karty s časom. */
function feed(d: Decider, frames: { id?: string; s?: number; alt?: [string, number][] }[], dt = 140, t0 = 0) {
  const out: { t: number; id: string; unsure: boolean }[] = [];
  frames.forEach((f, i) => {
    const t = t0 + i * dt;
    const r = d.frame(t, f.id ? hit(f.id, f.s, ...(f.alt ?? [])) : []);
    if (r) out.push({ t, id: r.id, unsure: r.unsure });
  });
  return out;
}
const rep = <T,>(x: T, n: number) => Array.from({ length: n }, () => x);

describe("cardCode", () => {
  it("odstráni verziu", () => {
    for (const [a, b] of [["OP06-115_r1", "OP06-115"], ["P-089-pr6", "P-089"], ["ST23-004-r1", "ST23-004"], ["OP04-016_P1", "OP04-016"], ["OP01-016", "OP01-016"], ["DON-041", "DON-041"], ["EB03_OP05-006_p1", "OP05-006"]])
      expect(cardCode(a)).toBe(b);
  });
});

describe("Decider", () => {
  it("pridá stabilnú kartu raz, nie hneď", () => {
    const a = feed(new Decider(), rep({ id: "OP01-001" }, 30));
    expect(a.length).toBe(1);
    expect(a[0].t).toBeGreaterThanOrEqual(600);
    expect(a[0].t).toBeLessThan(1000);
  });
  it("krátke mihnutie karty nepridá", () => {
    expect(feed(new Decider(), [...rep({}, 5), ...rep({ id: "OP01-001" }, 3), ...rep({}, 10)]).length).toBe(0);
  });
  it("prázdny záber nepridá nič", () => {
    expect(feed(new Decider(), rep({}, 50)).length).toBe(0);
    expect(feed(new Decider(), rep({ id: "OP01-001", s: 0.3 }, 50)).length).toBe(0);
  });
  it("skóre tesne pod prahom nepridá", () => {
    expect(feed(new Decider(), rep({ id: "OP01-001", s: 0.44 }, 50)).length).toBe(0);
  });
  it("preblikávanie medzi verziami tej istej karty kartu pridá (doteraz sa nepridala)", () => {
    const fr = Array.from({ length: 30 }, (_, i) => (i % 2 ? { id: "OP09-055", s: 0.6, alt: [["OP09-055_r1", 0.59]] as [string, number][] } : { id: "OP09-055_r1", s: 0.6, alt: [["OP09-055", 0.59]] as [string, number][] }));
    const a = feed(new Decider(), fr);
    expect(a.length).toBe(1);
    expect(a[0].unsure).toBe(true); // verzie sú tesne → treba skontrolovať
  });
  it("preblikávanie medzi rôznymi kartami nepridá nič", () => {
    const fr = Array.from({ length: 30 }, (_, i) => ({ id: i % 2 ? "OP01-001" : "OP02-002" }));
    expect(feed(new Decider(), fr).length).toBe(0);
  });
  it("výpadok detektora na jednu snímku nevadí", () => {
    const fr = Array.from({ length: 12 }, (_, i) => (i % 4 === 3 ? {} : { id: "OP01-001" }));
    // jedna z ôsmich snímok prázdna
    const a = feed(new Decider(), [...fr.filter((_, i) => i !== 3 && i !== 11), ...rep({ id: "OP01-001" }, 2)]);
    expect(a.length).toBe(1);
  });
  it("kým karta zostáva, druhýkrát sa nepridá", () => {
    expect(feed(new Decider(), rep({ id: "OP01-001" }, 200)).length).toBe(1);
  });
  it("výmena za inú kartu pridá obe", () => {
    const a = feed(new Decider(), [...rep({ id: "OP01-001" }, 12), ...rep({ id: "OP02-002" }, 15)]);
    expect(a.map((x) => x.id)).toEqual(["OP01-001", "OP02-002"]);
  });
  it("dve rovnaké karty za sebou s pauzou pridá obe", () => {
    const a = feed(new Decider(), [...rep({ id: "OP01-001" }, 12), ...rep({}, 15), ...rep({ id: "OP01-001" }, 12)]);
    expect(a.length).toBe(2);
  });
  it("rýchle vybratie a vrátenie tej istej karty ju nepridá dvakrát", () => {
    const a = feed(new Decider(), [...rep({ id: "OP01-001" }, 8), ...rep({}, 5), ...rep({ id: "OP01-001" }, 5)]);
    expect(a.length).toBe(1);
  });
  it("pomalý telefón (jedna snímka za 500 ms) kartu aj tak pridá", () => {
    const a = feed(new Decider(), rep({ id: "OP01-001" }, 8), 500);
    expect(a.length).toBe(1);
    expect(a[0].t).toBeLessThanOrEqual(1500);
  });
  it("veľmi pomalý telefón (900 ms) kartu aj tak pridá", () => {
    expect(feed(new Decider(), rep({ id: "OP01-001" }, 8), 900).length).toBe(1);
  });
  it("istá karta nie je označená na kontrolu, nízke skóre áno", () => {
    expect(feed(new Decider(), rep({ id: "OP01-001", s: 0.65, alt: [["OP02-002", 0.4]] }, 12))[0].unsure).toBe(false);
    expect(feed(new Decider(), rep({ id: "OP01-001", s: 0.48 }, 12))[0].unsure).toBe(true);
  });
  it("vráti ostatné verzie tej istej karty", () => {
    const d = new Decider();
    let r: any = null;
    for (let i = 0; i < 12 && !r; i++) r = d.frame(i * 140, hit("OP01-016_p1", 0.7, ["OP01-016_p2", 0.5], ["OP05-001", 0.45]));
    expect(r.sameCode).toEqual(["OP01-016_p2"]);
  });
});
