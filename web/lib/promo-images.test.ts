import { describe, expect, it } from "vitest";
import { applyPromoImages, CmProduct, TcgProduct } from "./promo-images";

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
});
