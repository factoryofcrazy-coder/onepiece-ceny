import { describe, expect, it } from "vitest";
import { variantGroup } from "./variants";

describe("variantGroup", () => {
  it("bez verzie, reprint a pre-errata sú základné", () => {
    expect(variantGroup(undefined)).toBe("base");
    expect(variantGroup("Reprint")).toBe("base");
    expect(variantGroup("Pre-Errata")).toBe("base");
    expect(variantGroup("Galdino · Reprint")).toBe("base");
  });
  it("manga má prednosť pred alt artom", () => {
    expect(variantGroup("Manga")).toBe("manga");
    expect(variantGroup("Alternate Art · Manga")).toBe("manga");
    expect(variantGroup("Parallel · Manga · Alternate Art")).toBe("manga");
  });
  it("alt art, parallel, SP a fóliové verzie", () => {
    for (const v of ["Alternate Art", "Parallel", "SP", "SPR", "Full Art", "Textured Foil", "Jolly Roger Foil", "Wanted Poster", "SP · Gold", "Super Alternate Art", "TR"]) expect(variantGroup(v)).toBe("alt");
  });
  it("promo, turnajové a eventové karty", () => {
    for (const v of ["Promo", "Tournament promo", "Turnajové promo", "Release Event", "Pre-Release", "Judge", "Event Pack Vol. 1", "CS 2024 Event Pack", "Winner Pack Vol. 7", "Store Championship Trophy Card"]) expect(variantGroup(v)).toBe("promo");
  });
});
