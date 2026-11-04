// Prekladač textov kariet: zhoda s ručnými skriptami a odmietanie toho, čomu nerozumie.
import { describe, expect, it } from "vitest";
import { autoScript } from "./autoscript";
import { SCRIPTS } from "./cards";
import META from "./meta-data.json";

const sortd = (x: any): any =>
  Array.isArray(x)
    ? x.map(sortd)
    : x && typeof x === "object"
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .filter((k) => k !== "label" && k !== "forPlay" && !(k === "atLeast" && x[k] === false) && x[k] !== undefined)
            .map((k) => [k, sortd(x[k])]),
        )
      : x;
const norm = (x: any) => JSON.stringify(sortd(x)).replace(/"v":"(?!\$)[^"]*"/g, '"v":"v"');

describe("prekladač textov kariet", () => {
  it("keď text preloží, zhoduje sa s ručným skriptom", () => {
    const cards = (META as any).cards as Record<string, { text?: string }>;
    let compared = 0;
    const diffs: string[] = [];
    for (const [code, script] of Object.entries(SCRIPTS)) {
      const auto = autoScript(cards[code]?.text ?? "");
      if (!auto) continue;
      compared++;
      if (norm(auto.abilities) !== norm((script as any).abilities)) diffs.push(code);
    }
    expect(compared).toBeGreaterThan(30);
    expect(diffs).toEqual([]);
  });

  it.each([
    ["kartu s neznámou vetou", "[On Play] Look at all of your Life cards and place them back in your Life area in any order."],
    ["druhú schopnosť, ktorej nerozumie", "[On Play] Draw 1 card. [Activate: Main] Do something unknown."],
    ["nejednoznačné Ak … Potom", "[On Play] If you have 2 or less Life cards, draw 1 card. Then, trash 1 card from your hand."],
    ["náhradný efekt", "[Once Per Turn] If this Character would be K.O.'d, you may trash 1 card from your hand instead."],
  ])("odmietne %s", (_n, text) => {
    expect(autoScript(text)).toBeNull();
  });

  it("preloží bežné efekty presne", () => {
    const a = autoScript("[DON!! x1] [When Attacking] [Once Per Turn] K.O. up to 1 of your opponent's rested Characters with a cost of 4 or less.")!.abilities[0];
    expect(a.when).toBe("whenAttacking");
    expect(a.once).toBe(true);
    expect(a.cond).toEqual({ c: "donAttached", n: 1 });
    expect((a.steps![0] as any).f).toEqual({ side: "opp", zone: "characters", cost: [0, 4], rested: true });
    const b = autoScript("[Counter] DON!! -1: Up to 1 of your Leader or Character cards gains +4000 power during this battle.")!.abilities[0];
    expect(b.optional).toBe(true);
    expect(b.cost).toEqual([{ op: "returnDon", n: 1, atLeast: false }]);
    expect((b.steps![1] as any).until).toBe("battle");
  });
});
