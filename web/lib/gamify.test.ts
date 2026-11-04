import { describe, expect, it } from "vitest";
import { DON_SKINS, isUnlocked, ruleText, emptyStats } from "./donSkins";
import { levelOf, levelProgress, rankOf, RANKS, xpForLevel } from "./gamify";

describe("levely a ranky", () => {
  it("levely", () => {
    expect(levelOf(0)).toBe(1);
    expect(levelOf(49)).toBe(1);
    expect(levelOf(50)).toBe(2);
    expect(levelOf(500)).toBe(5);
    expect(xpForLevel(10)).toBe(2250);
    expect(levelProgress(100)).toMatchObject({ level: 2, have: 50, need: 100, toNext: 50, pct: 50 });
  });
  it("ranky", () => {
    expect(rankOf(999).id).toBe("sailor");
    expect(rankOf(1000).id).toBe("pirate");
    expect(rankOf(1600).id).toBe("king");
    expect(RANKS.map((r) => r.min)).toEqual([...RANKS.map((r) => r.min)].sort((a, b) => a - b));
    expect(new Set(RANKS.map((r) => r.id)).size).toBe(7);
  });
  it("skiny za level a rank", () => {
    const byId = (id: string) => DON_SKINS.find((k) => k.id === id)!;
    const st = { ...emptyStats(), level: 5, rankIndex: 2 }; // Kapitán
    expect(isUnlocked(byId("level_05"), st)).toBe(true);
    expect(isUnlocked(byId("level_10"), st)).toBe(false);
    expect(isUnlocked(byId("rank_captain"), st)).toBe(true);
    expect(isUnlocked(byId("rank_supernova"), st)).toBe(false);
    expect(isUnlocked(byId("rank_captain"), emptyStats())).toBe(false);
    expect(ruleText(byId("rank_king").rule)).toBe("Rank Kráľ pirátov");
    expect(ruleText(byId("level_20").rule)).toBe("Level 20");
  });
});
