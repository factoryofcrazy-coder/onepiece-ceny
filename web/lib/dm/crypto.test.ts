import { describe, expect, it } from "vitest";
import { open, parseKeyRing, seal } from "./crypto";

const k1 = btoa(String.fromCharCode(...new Uint8Array(32).fill(1)));
const k2 = btoa(String.fromCharCode(...new Uint8Array(32).fill(2)));
const ring = parseKeyRing(`1:${k1}`);
const [C, S, M] = ["conv-1", "sender-1", "msg-1"];

describe("šifrovanie správ", () => {
  it("rozšifruje pôvodný text vrátane diakritiky a emoji", async () => {
    const text = "Koľko chceš za Luffyho? 🏴‍☠️";
    expect(await open(ring, C, S, M, await seal(ring, C, S, M, text))).toBe(text);
  });
  it("šifra neobsahuje text a rovnaký text dá zakaždým inú šifru", async () => {
    const a = await seal(ring, C, S, M, "tajomstvo");
    const b = await seal(ring, C, S, M, "tajomstvo");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
    expect(atob(a.ciphertext)).not.toContain("tajomstvo");
  });
  it.each([
    ["inej konverzácii", "conv-2", S, M],
    ["inému odosielateľovi", C, "sender-2", M],
    ["inému id správy", C, S, "msg-2"],
  ])("odmietne správu priradenú %s", async (_n, c, s, m) => {
    await expect(open(ring, c, s, m, await seal(ring, C, S, M, "x"))).rejects.toThrow();
  });
  it("odmietne pozmenenú šifru", async () => {
    const s = await seal(ring, C, S, M, "x");
    const bytes = Uint8Array.from(atob(s.ciphertext), (c) => c.charCodeAt(0));
    bytes[0] ^= 1;
    await expect(open(ring, C, S, M, { ...s, ciphertext: btoa(String.fromCharCode(...bytes)) })).rejects.toThrow();
  });
  it("po pridaní kľúča šifruje novým a staré správy stále otvorí", async () => {
    const old = await seal(ring, C, S, M, "stará");
    const next = parseKeyRing(`1:${k1},2:${k2}`);
    const fresh = await seal(next, C, S, M, "nová");
    expect(fresh.key_version).toBe(2);
    expect(await open(next, C, S, M, old)).toBe("stará");
    expect(await open(next, C, S, M, fresh)).toBe("nová");
    await expect(open(ring, C, S, M, fresh)).rejects.toThrow();
  });
  it.each(["", "abc", `1:${btoa("krátky")}`, `x:${k1}`, `0:${k1}`])("odmietne neplatné DM_KEYS %s", (raw) => {
    expect(() => parseKeyRing(raw)).toThrow();
  });
});
