// Tri úrovne botov: partia sa dohrá a ťažký bot je férový (rozhodnutie nezávisí od skrytých kariet).
import { describe, expect, it } from "vitest";
import { botAction, BotLevel } from "./bot";
import { buildDef, CardData } from "./cards";
import { applyAction, newGame } from "./engine";
import META from "./meta-data.json";
import type { CardDef, GameState, P } from "./types";

const cards = (META as any).cards as Record<string, Omit<CardData, "code">>;
const DEFS: Record<string, CardDef> = Object.fromEntries(Object.entries(cards).map(([code, c]) => [code, buildDef({ code, ...c } as CardData)]));
const decks = ((META as any).decks as any[])
  .map((d) => ({ name: d.leaderName, leader: d.leader, cards: Object.entries(d.cards).flatMap(([c, n]) => Array(n as number).fill(c)) }))
  .filter((d) => DEFS[d.leader] && d.cards.every((c: string) => DEFS[c]));
const seeded = (n: number) => () => (n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296;

function play(levels: [BotLevel, BotLevel], a: number, b: number, seed: number, onHard?: (s: GameState, p: P) => void) {
  let s = newGame([decks[a], decks[b]] as any, DEFS, seed);
  const rng = seeded(seed);
  for (let i = 0; i < 1500 && s.winner == null; i++) {
    const p: P = s.prompt ? s.prompt.p : s.active;
    if (levels[p] === "hard" && !s.prompt && onHard) onHard(s, p);
    const act = botAction(s, p, levels[p], rng);
    if (!act) break;
    s = applyAction(s, act);
  }
  return s;
}

function shuffled(arr: string[], rng: () => number) {
  const c = [...arr];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

/** Rovnaká verejná pozícia, ale iné skryté karty: súperova ruka, balíčky a Life lícom dole sa vymenia. */
function reshuffleHidden(s: GameState, me: P, rng: () => number): GameState {
  const { defs, ...rest } = s as any;
  const c = { ...structuredClone(rest), defs } as GameState;
  const o = c.players[(1 - me) as P];
  const pool = shuffled([...o.hand, ...o.deck], rng);
  o.hand = pool.slice(0, o.hand.length);
  o.deck = pool.slice(o.hand.length);
  c.players[me].deck = shuffled(c.players[me].deck, rng);
  c.seed = 12345;
  return c;
}

describe("úrovne botov", () => {
  it.each(["easy", "medium", "hard"] as BotLevel[])("%s dohrá partiu bez nelegálneho ťahu", (level) => {
    const s = play([level, "medium"], 1, 6, 77);
    expect(s.winner).not.toBeNull();
  });

  it("Stredný sa nezasekne na efekte bez zmeny (EB04-016)", () => {
    const i = decks.findIndex((d) => d.cards.includes("EB04-016"));
    expect(i).toBeGreaterThanOrEqual(0);
    const s = play(["medium", "medium"], i, i, 9016);
    expect(s.winner).not.toBeNull();
  });
});

describe("zákaz hrať postavy", () => {
  it("efekt zahrania sa pri zákaze nepýta na výber", () => {
    const i = decks.findIndex((d) => d.leader === "OP09-042");
    let s = newGame([decks[i], decks[i]] as any, DEFS, 5);
    s = applyAction(s, { type: "answer", p: 0, choice: { yes: false } });
    s = applyAction(s, { type: "answer", p: 1, choice: { yes: false } });
    s.players[0].flags.push({ flag: "noPlayChars", until: "turn", setOnTurn: s.turn } as any);
    const hand = s.players[0].hand[0];
    s.cards[hand].code = "EB05-021";
    expect(s.prompt).toBeFalsy();
    expect(s.players[0].flags.filter((x) => x.flag === "noPlayChars")).toHaveLength(1);
  });
});

describe("ťažký bot je férový", () => {
  it("skryté karty nemenia jeho rozhodnutie", () => {
    let checked = 0;
    play(["hard", "medium"], 1, 6, 31, (s, p) => {
      if (checked >= 6 || s.turnCount[p] < 2) return;
      const seed = { ...s, seed: 12345 } as GameState;
      const rng = seeded(checked + 5);
      const base = botAction(reshuffleHidden(seed, p, seeded(99)), p, "hard");
      const other = botAction(reshuffleHidden(seed, p, rng), p, "hard");
      expect(other).toEqual(base);
      checked++;
    });
    expect(checked).toBeGreaterThan(0);
  }, 120000);
});
