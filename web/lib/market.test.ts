import { describe, expect, it } from "vitest";
import { lastSpyDay, spyAligned } from "./market";

const spy = [
  { day: "2026-11-05", close: 733 },
  { day: "2026-11-06", close: 735.29 },
  { day: "2026-11-09", close: 742 },
];

describe("lastSpyDay", () => {
  it("cez víkend vráti piatkový kurz", () => {
    expect(lastSpyDay(spy, "2026-11-07")).toBe("2026-11-06");
    expect(lastSpyDay(spy, "2026-11-08")).toBe("2026-11-06");
  });
  it("v obchodný deň vráti ten istý deň", () => {
    expect(lastSpyDay(spy, "2026-11-09")).toBe("2026-11-09");
  });
  it("pred prvým kurzom nič", () => {
    expect(lastSpyDay(spy, "2026-11-01")).toBeNull();
  });
});

describe("spyAligned", () => {
  it("víkend drží piatkový kurz, takže zmena je 0", () => {
    expect(spyAligned(["2026-11-06", "2026-11-07"], spy)).toEqual([1000, 1000]);
  });
});
