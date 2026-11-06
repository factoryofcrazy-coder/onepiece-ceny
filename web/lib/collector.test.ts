import { describe, expect, it } from "vitest";
import type { Card } from "./data";
import { collectionChange, collectionCsv, topMoves } from "./collector";
import { certUrl, Copy, copyLabel, copyValue, gradedCounts, parseCert, parseMoney, portfolio, soldSearchUrl } from "./copies";

const card = (id: string, cm?: number, cm7?: number, cm30?: number) => ({ id, code: id, name: id, v: "", set: "OP-01", cm, cm7, cm30, usd: null }) as unknown as Card;
const copy = (o: Partial<Copy>): Copy => ({ id: "x", card_id: "A", paid: null, own_value: null, bought_on: null, cond: "NM", grader: null, grade: null, cert: null, note: null, ...o });

describe("pohyby cien", () => {
  const cards = [card("HORE", 10, 15, 10), card("VIAC", 10, 20, 10), card("DOLE", 10, 5, 10), card("LACNA", 0.5, 2, 0.5), card("BEZ", 10), card("ROVNO", 10, 10, 10)];
  it("zoradí podľa smeru a vyradí lacné, bez priemerov aj bez zmeny", () => {
    expect(topMoves(cards, 1.1, "up", 1).map((m) => [m.card.id, m.pct])).toEqual([["VIAC", 100], ["HORE", 50]]);
    expect(topMoves(cards, 1.1, "down", 1).map((m) => [m.card.id, m.pct])).toEqual([["DOLE", -50]]);
  });
  it("nižšia hranica lacnú kartu pustí", () => expect(topMoves(cards, 1.1, "up", 0)[0].card.id).toBe("LACNA"));
  it("zbierka sa počíta s kusmi a bez kariet bez priemerov", () => {
    expect(collectionChange([{ card: card("A", 1, 20, 10), n: 2 }, { card: card("B", 1, 10, 10), n: 1 }, { card: card("C", 1), n: 50 }])).toEqual({ week: 50, month: 30, counted: 2, pct: 67 });
    expect(collectionChange([{ card: card("C", 1), n: 1 }])).toBeNull();
  });
});

describe("hodnota kusu a zisk", () => {
  it("gradovaná karta nepreberá trhovú cenu negradovanej", () => {
    expect(copyValue(copy({ grader: "PSA", grade: 10 }), 50)).toBeNull();
    expect(copyValue(copy({ grader: "PSA", grade: 10, own_value: 300 }), 50)).toBe(300);
    expect(copyValue(copy({}), 50)).toBe(50);
    expect(copyValue(copy({ own_value: 70 }), 50)).toBe(70);
  });
  it("zisk ráta len kusy s nákupom aj hodnotou", () => {
    const p = portfolio(
      [copy({ paid: 10 }), copy({ paid: 100, card_id: "B", grader: "PSA", grade: 9, cond: null }), copy({}), copy({ paid: 20, card_id: "BEZ" })],
      (id) => (id === "A" ? 15 : id === "B" ? 500 : null),
    );
    expect(p).toEqual({ paid: 10, value: 15, diff: 5, pct: 50, counted: 1, noPaid: 1, noValue: 2 });
  });
  it("nič nezapísané", () => expect(portfolio([], () => 1)).toMatchObject({ pct: null, counted: 0 }));
  it("kúpená zadarmo nedelí nulou", () => expect(portfolio([copy({ paid: 0 })], () => 5)).toMatchObject({ diff: 5, pct: null }));
  it("popis stavu", () => {
    expect(copyLabel(copy({ grader: "CGC", grade: 9.5, cond: null }))).toBe("CGC 9.5");
    expect(copyLabel(copy({ cond: "LP" }))).toBe("LP");
    expect(copyLabel(copy({ cond: null }))).toBe("Bez stavu");
  });
});

describe("predaje na eBay", () => {
  it("hľadá kód, firmu a známku medzi predanými", () => {
    expect(soldSearchUrl("OP01-120", "PSA", 10)).toBe("https://www.ebay.com/sch/i.html?_nkw=OP01-120+PSA+10&LH_Sold=1&LH_Complete=1");
    expect(soldSearchUrl("OP01-120", "CGC", 9.5)).toContain("_nkw=OP01-120+CGC+9.5&");
  });
  it("cudzie znaky neporušia adresu", () => expect(soldSearchUrl("A&B", "PSA", 10)).toContain("A%26B+PSA+10"));
});

describe("certifikát", () => {
  it("odkaz na overenie len tam, kde adresu poznáme", () => {
    expect(certUrl({ grader: "PSA", cert: "123" })).toBe("https://www.psacard.com/cert/123");
    expect(certUrl({ grader: "CGC", cert: "6101899117" })).toBe("https://www.cgccards.com/certlookup/6101899117/");
    expect(certUrl({ grader: "BGS", cert: "123" })).toBeNull();
    expect(certUrl({ grader: "PSA", cert: null })).toBeNull();
  });
  it("číslo z formulára", () => {
    expect(parseCert(" 123 456 ")).toBe("123456");
    expect(parseCert("")).toBeNull();
    expect(parseCert("../../x")).toBeUndefined();
    expect(parseCert("a".repeat(31))).toBeUndefined();
  });
  it("počty podľa firmy", () => expect(gradedCounts([{ grader: "CGC" }, { grader: "PSA" }, { grader: "PSA" }, { grader: null }])).toEqual([["PSA", 2], ["CGC", 1]]));
});

describe("suma z formulára", () => {
  it("čiarka, medzery a mena", () => {
    expect(parseMoney("12,5")).toBe(12.5);
    expect(parseMoney(" 1 200,50 € ")).toBe(1200.5);
    expect(parseMoney("3.456")).toBe(3.46);
  });
  it("prázdne je nezadané, nezmysel je chyba", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("abc")).toBeUndefined();
    expect(parseMoney("-5")).toBeUndefined();
    expect(parseMoney("9999999")).toBeUndefined();
  });
});

describe("export", () => {
  const lines = (s: string) => s.replace("﻿", "").split("\r\n");
  it("karta bez zapísaných kusov má jeden riadok, viac kusov po riadku a súčet len raz", () => {
    const l = lines(collectionCsv(
      [{ card: card("A", 2), n: 3, unit: 2.5 }, { card: card("B", 1), n: 1, unit: null }],
      [copy({ paid: 1.5, bought_on: "2026-01-02" }), copy({ grader: "PSA", grade: 10, cond: null, own_value: 90, cert: "123" })],
    ));
    expect(l).toHaveLength(4);
    expect(l[1]).toBe("A;A;;OP-01;3;2,5;7,5;NM;;1,5;2026-01-02;2,5;");
    expect(l[2]).toBe("A;A;;OP-01;;2,5;;PSA 10;123;;;90;");
    expect(l[3]).toBe("B;B;;OP-01;1;;;;;;;;");
  });
  it("začína BOM kvôli diakritike v Exceli", () => expect(collectionCsv([], []).charCodeAt(0)).toBe(0xfeff));
  it("zneškodní vzorce a ohraničí oddeľovače", () => {
    const l = lines(collectionCsv([{ card: { ...card("A"), name: '=HYPERLINK("x")' }, n: 1, unit: null }], [copy({ note: "a;b" })]));
    expect(l[1]).toContain(`"'=HYPERLINK(""x"")"`);
    expect(l[1].endsWith('"a;b"')).toBe(true);
  });
});
