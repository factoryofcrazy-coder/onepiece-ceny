import { describe, expect, it } from "vitest";
import { applyPromoImages, buildCardAlts, CmProduct, TcgProduct, variantLabel } from "./promo-images";

const card = (id: string, code: string, cmId?: number, v = "Pre-Release", img = "") => ({ id, code, v, set: cmId ? "CM-PROMO" : "OP01", img, cmId });
const prod = (group: string, number: string, name = "Karta") => ({ group, number, name, img: `https://x/${group}-${number}_200w.jpg` }) as TcgProduct;
const codes = Array.from({ length: 10 }, (_, i) => `OP01-${String(i + 1).padStart(3, "0")}`);

describe("applyPromoImages", () => {
  it("expanzia s rovnakými kartami dostane presný väčší obrázok", () => {
    const cards = codes.map((c, i) => card(`${c}_cm${i}`, c, i + 1));
    const cm: CmProduct[] = codes.map((_, i) => ({ idProduct: i + 1, idExpansion: 5 }));
    const r = applyPromoImages(cards, cm, codes.map((c) => prod("Set Pre-Release", c)));
    expect(r.exact).toBe(10);
    expect(cards[0].img).toBe("https://x/Set Pre-Release-OP01-001_in_400x400.jpg");
    expect((cards[0] as any).imgBase).toBeUndefined();
  });

  it("zmiešaná expanzia dostane základnú kartu s príznakom, nie cudziu verziu", () => {
    const base = card("OP01-001", "OP01-001", undefined, "", "base.jpg");
    const promo = card("OP01-001_cm1", "OP01-001", 1, "Promo");
    const r = applyPromoImages([base, promo], [{ idProduct: 1, idExpansion: 5 }], [prod("One Piece Promotion Cards", "OP01-001")]);
    expect(promo.img).toBe("base.jpg");
    expect((promo as any).imgBase).toBe(true);
    expect(r.approx).toBe(1);
    expect(r.exact).toBe(0);
  });

  it("dve verzie tej istej karty v expanzii sa nedajú rozlíšiť", () => {
    const cards = [...codes.map((c, i) => card(`${c}_cm${i}`, c, i + 1)), card("OP01-001_cm99", "OP01-001", 99)];
    const cm = [...codes.map((_, i) => ({ idProduct: i + 1, idExpansion: 5 })), { idProduct: 99, idExpansion: 5 }];
    applyPromoImages(cards, cm, codes.map((c) => prod("Set Pre-Release", c)));
    expect(cards[0].img).toBe("");
    expect(cards[1].img).not.toBe("");
  });

  it("nová karta bez obrázka sa doplní len pri jednoznačnej zhode", () => {
    const a = card("EB05-001", "EB05-001", undefined, "");
    const b = card("EB05-002", "EB05-002", undefined, "");
    const r = applyPromoImages([a, b], [], [prod("EB-05", "EB05-001"), prod("EB-05", "EB05-001", "Karta (Alternate Art)"), prod("EB-05", "EB05-002"), prod("EB-05", "EB05-002", "Iná karta")]);
    expect(a.img).toContain("_in_400x400");
    expect(b.img).toBe("");
    expect(r.filled).toBe(1);
  });

  it("číslo v zátvorke neznamená inú verziu", () => {
    const a = card("EB05-061", "EB05-061", undefined, "");
    applyPromoImages([a], [], [prod("EB-05", "EB05-061", "Nami (061)"), prod("EB-05", "EB05-061", "Nami (061) (Alternate Art)")]);
    expect(a.img).toContain("_in_400x400");
  });

  const tcgv = (number: string, name: string, usd: number) => ({ ...prod("EB-05", number, name), usd });
  const rare = (code: string, n: number, cm: number, id: number): any => ({ ...card(`${code}_cm${id}`, code, id, "Promo"), cm, cmLow: cm });
  // edícia musí mať aspoň 8 verzií, malé sa párujú príliš ľahko náhodou
  const makeFiller = () => Array.from({ length: 8 }, (_, i) => rare(`EB05-1${i}0`, 1, 10, 100 + i));
  const filler = makeFiller();
  // bežná edícia má oveľa viac kariet než vzácnych verzií
  const others = Array.from({ length: 40 }, (_, i) => tcgv(`EB05-2${String(i).padStart(2, "0")}`, "Bežná karta", 1));
  const fillerTcg = [...others, ...filler.flatMap((f: any) => [tcgv(f.code, "Karta", 2), tcgv(f.code, "Karta (Alternate Art)", 12)])];
  
  it("vzácne verzie sa spárujú podľa poradia a cien, chybný trend sa zahodí", () => {
    const base = { ...card("EB05-055", "EB05-055", undefined, "", "b.jpg"), set: "EB-05", setName: "Heroines" };
    const a = rare("EB05-055", 1, 16.48, 920071), b = rare("EB05-055", 2, 0.02, 920072), c = rare("EB05-055", 3, 1500, 920073);
    const r = applyPromoImages(
      [base, a, b, c, ...filler],
      [a, b, c, ...filler].map((x: any) => ({ idProduct: x.cmId!, idExpansion: 7 })),
      [...fillerTcg, tcgv("EB05-055", "Nami (055)", 4.63), tcgv("EB05-055", "Nami (055) (Super Rare Alternate Art)", 29.89), tcgv("EB05-055", "Nami (055) (Kentaro Yabuki)", 67.75), tcgv("EB05-055", "Nami (055) (Kentaro Yabuki) (Gold Stamped)", 1319)],
    );
    expect(r.paired).toBe(11);
    expect([a.v, b.v, c.v]).toEqual(["Alternate Art", "Kentaro Yabuki", "Kentaro Yabuki · Gold Stamped"]);
    expect(a.set).toBe("EB-05");
    expect(b.cm).toBeNull();
    expect(b.usd).toBe(67.75);
    expect(c.cm).toBe(1500);
  });

  it("nesedí počet alebo cena, verzia ostane ilustračná", () => {
    const base = { ...card("EB05-001", "EB05-001", undefined, "", "b.jpg"), set: "EB-05" };
    const a = rare("EB05-001", 1, 500, 1);
    const fresh = makeFiller(); // applyPromoImages mení riadky, predošlý test ich už spároval
    const r = applyPromoImages([base, a, ...fresh], [a, ...fresh].map((x: any) => ({ idProduct: x.cmId, idExpansion: 7 })), [...fillerTcg, tcgv("EB05-001", "Bonney", 13), tcgv("EB05-001", "Bonney (Alternate Art)", 41)]);
    expect(r.paired).toBe(8);
    expect(a.imgBase).toBe(true);
  });

  it("možné vzhľady len pre ilustračné karty, bez základnej verzie a duplicít", () => {
    const a: any = { ...card("OP01-016_cm1", "OP01-016", 1, "Promo", "b.jpg"), imgBase: true };
    const b: any = card("OP02-001", "OP02-001", undefined, "", "c.jpg");
    const alts = buildCardAlts([a, b], [
      prod("Romance Dawn", "OP01-016", "Nami"),
      prod("Romance Dawn", "OP01-016", "Nami (Parallel)"),
      prod("Romance Dawn", "OP01-016", "Nami (Parallel)"),
      prod("One Piece Promotion Cards", "OP01-016", "Nami (Judge)"),
      prod("Romance Dawn", "OP02-001", "Iná (Parallel)"),
    ]);
    expect(Object.keys(alts)).toEqual(["OP01-016"]);
    expect(alts["OP01-016"].map((x) => x.l)).toEqual(["Judge", "Parallel"]);
  });

  it("názov verzie", () => {
    expect(variantLabel("Nico Robin (016)")).toBe("");
    expect(variantLabel("Nico Robin (016) (SP)")).toBe("SP");
    expect(variantLabel("Baby 5 (Alternate Art)")).toBe("Alternate Art");
    expect(variantLabel("Zoro-Juurou (OP05-067)")).toBe("");
    expect(variantLabel("Chopper (EB01-006) (Manga)")).toBe("Manga");
  });
});
