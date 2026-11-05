import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyReaction, EMOTES, groupReactions, isEmote } from "./reactions";

describe("groupReactions", () => {
  it("zoskupí, označí moje a drží stále poradie", () => {
    const g = groupReactions([{ emote: "rip", user_id: "a" }, { emote: "kek", user_id: "b" }, { emote: "kek", user_id: "a" }], "a");
    expect(g.map((x) => [x.emote, x.count, x.mine])).toEqual([["kek", 2, true], ["rip", 1, true]]);
    expect(groupReactions([{ emote: "kek", user_id: "b" }], "a")[0].mine).toBe(false);
  });
  it("prázdne a neznáme", () => {
    expect(groupReactions(undefined, "a")).toEqual([]);
    expect(groupReactions([{ emote: "zzz", user_id: "b" }], "a")).toEqual([]);
  });
});

describe("applyReaction", () => {
  it("pridá raz a zruší", () => {
    const a = applyReaction(undefined, "kek", "u", true);
    expect(applyReaction(a, "kek", "u", true)).toEqual(a);
    expect(applyReaction(a, "kek", "u", false)).toEqual([]);
    expect(applyReaction([...a, { emote: "kek", user_id: "v" }], "kek", "u", false)).toEqual([{ emote: "kek", user_id: "v" }]);
  });
});

it("zoznam emotov sedí s kontrolou v databáze", () => {
  const sql = readFileSync("supabase/migrations/20261115_reactions.sql", "utf8");
  const list = EMOTES.map((e) => `'${e.id}'`).join(", ");
  expect(sql.split(`in (${list})`).length - 1).toBe(2);
  expect(isEmote("kek")).toBe(true);
  expect(isEmote("x")).toBe(false);
});
