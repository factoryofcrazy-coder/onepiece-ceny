import { describe, expect, it } from "vitest";
import { fmtDmDay, hasLink, previewOf, splitLinks } from "./text";

describe("text správ", () => {
  it("nájde webové odkazy a nechá zvyšok ako text", () => {
    expect(splitLinks("pozri https://x.sk/a?b=1, dobre?")).toEqual([
      { t: "text", v: "pozri " },
      { t: "link", v: "https://x.sk/a?b=1" },
      { t: "text", v: ", dobre?" },
    ]);
  });
  it.each(["javascript:alert(1)", "data:text/html,<b>x</b>", "ftp://x.sk", "<a href=x>y</a>"])("z %s nespraví odkaz", (t) => {
    expect(hasLink(t)).toBe(false);
  });
  it("preview ukáže kartu, keď správa nemá text", () => {
    expect(previewOf({ text: "", card: { id: "OP01-003_p1" } })).toBe("Karta OP01-003");
    expect(previewOf(null)).toBe("Správu sa nepodarilo načítať");
  });
  it("označí dnešok a včerajšok", () => {
    const now = new Date("2026-11-05T12:00:00");
    expect(fmtDmDay("2026-11-05T08:00:00", now)).toBe("Dnes");
    expect(fmtDmDay("2026-11-04T08:00:00", now)).toBe("Včera");
  });
});
