// Turnajové decky: každý deck odohrá hry proti iným (bot aj náhodné legálne ťahy) a kontrolujú sa invarianty pravidiel.
import { describe, expect, it } from "vitest";
import { botAction } from "./bot";
import { buildDef, CardData } from "./cards";
import { applyAction, cardCount, donOnField, IllegalAction, mainActions, newGame, viewFor } from "./engine";
import META from "./meta-data.json";
import { nextRand } from "./rng";
import type { Action, AnswerChoice, CardDef, GameState, P } from "./types";

type MetaDeck = { leader: string; leaderName: string; player: string; cards: Record<string, number> };
const cards = (META as any).cards as Record<string, Omit<CardData, "code">>;
const DEFS: Record<string, CardDef> = Object.fromEntries(Object.entries(cards).map(([code, c]) => [code, buildDef({ code, ...c } as CardData)]));
const decks = ((META as any).decks as MetaDeck[])
  .map((d) => ({ name: `${d.leaderName} (${d.player})`, leader: d.leader, cards: Object.entries(d.cards).flatMap(([c, n]) => Array(n).fill(c)) as string[] }))
  .filter((d) => DEFS[d.leader] && d.cards.every((c) => DEFS[c]));

function randomAnswer(s: GameState, r: () => number): AnswerChoice {
  const pr = s.prompt!;
  switch (pr.kind) {
    case "mulligan":
    case "payCost":
    case "trigger":
      return { yes: r() < 0.6 };
    case "oneOf":
      return { option: Math.floor(r() * pr.options.length) };
    case "choose":
    case "blocker":
    case "trashCharacter": {
      const opts = [...pr.options];
      const min = pr.kind === "choose" ? pr.min : pr.kind === "trashCharacter" ? 1 : 0;
      const max = pr.kind === "choose" ? pr.max : 1;
      const n = min + Math.floor(r() * (max - min + 1));
      const pick: string[] = [];
      while (pick.length < n && opts.length) pick.push(opts.splice(Math.floor(r() * opts.length), 1)[0]);
      return { pick };
    }
    case "orderTriggers":
      return { order: pr.options[Math.floor(r() * pr.options.length)] };
    case "counter":
      return { counter: [] };
    case "donSource":
      return botAnswerDon(s);
  }
}
function botAnswerDon(s: GameState): AnswerChoice {
  const pr = s.prompt as Extract<GameState["prompt"], { kind: "donSource" }>;
  const x = s.players[pr.p];
  let n = pr.n;
  const r = Math.min(n, x.donRested);
  n -= r;
  const a = Math.min(n, x.donActive);
  n -= a;
  const attached: Record<string, number> = {};
  for (const i of [x.leader, ...x.characters]) {
    if (!n) break;
    const k = Math.min(n, s.cards[i].don);
    if (k) (attached[i] = k), (n -= k);
  }
  return { don: { active: a, rested: r, attached } };
}

function check(s: GameState, counts: number[]) {
  for (const p of [0, 1] as P[]) {
    const x = s.players[p];
    expect(donOnField(s, p) + x.donDeck).toBe(x.donMax);
    expect(x.donActive).toBeGreaterThanOrEqual(0);
    expect(x.donRested).toBeGreaterThanOrEqual(0);
    if (!s.stack.length) expect(cardCount(s, p)).toBe(counts[p]);
    expect(x.characters.length).toBeLessThanOrEqual(s.prompt?.kind === "trashCharacter" ? 6 : 5);
  }
}

function play(seedIn: number, a: number, b: number, mode: "bot" | "random", steps = 2500) {
  let seed = seedIn;
  const r = () => {
    const [v, ns] = nextRand(seed);
    seed = ns;
    return v;
  };
  let s = newGame([decks[a], decks[b]], DEFS, seedIn, (seedIn % 2) as P);
  const counts = [cardCount(s, 0), cardCount(s, 1)];
  for (let i = 0; i < steps && s.winner == null; i++) {
    let act: Action | null;
    if (mode === "bot") {
      const who: P = s.prompt ? s.prompt.p : s.active;
      act = botAction(s, who);
      if (!act) act = { type: "endTurn", p: s.active };
    } else if (s.prompt) act = { type: "answer", p: s.prompt.p, choice: randomAnswer(s, r) };
    else {
      const acts = mainActions(s).filter((x) => x.type !== "endTurn");
      act = acts.length && r() < 0.8 ? acts[Math.floor(r() * acts.length)] : { type: "endTurn", p: s.active };
    }
    try {
      s = applyAction(s, act);
    } catch (e) {
      if (!(e instanceof IllegalAction)) throw new Error(`${decks[a].name} vs ${decks[b].name}, krok ${i}: ${(e as Error).stack}`);
      // nelegálna voľba (napr. náhodný výber) – skús ukončiť ťah / odpovedať inak
      s = recover(s);
    }
    check(s, counts);
    if (i % 25 === 0) {
      for (const p of [0, 1] as P[]) viewFor(s, p);
    }
  }
  return s;
}
/** po nelegálnej voľbe skús postupne bezpečné odpovede */
function recover(s: GameState): GameState {
  if (!s.prompt) return applyAction(s, { type: "endTurn", p: s.active });
  const pr = s.prompt;
  const tries: AnswerChoice[] = [(botAction(s, pr.p) as any).choice, { pick: [] }, { yes: false }, { option: 0 }, { counter: [] }];
  if (pr.kind === "choose") tries.push({ pick: pr.options.slice(0, pr.min) });
  for (const c of tries) {
    try {
      return applyAction(s, { type: "answer", p: pr.p, choice: c });
    } catch {
      /* ďalší pokus */
    }
  }
  throw new Error(`Uviaznutý prompt: ${JSON.stringify(pr)}`);
}

describe("turnajové decky", () => {
  it("všetky karty z turnajových deckov majú skript", () => {
    const missing = Object.values(DEFS).filter((d) => !d.scripted).map((d) => `${d.code} ${d.name}`);
    expect(missing).toEqual([]);
  });

  it(`každý deck odohrá hry bot vs bot a náhodné legálne hry bez chyby (${decks.length} deckov)`, () => {
    let games = 0;
    let finished = 0;
    for (let a = 0; a < decks.length; a++) {
      for (const mode of ["bot", "random"] as const) {
        const b = (a * 7 + (mode === "bot" ? 3 : 11)) % decks.length;
        const s = play(1000 + a * 13 + (mode === "bot" ? 1 : 2), a, b, mode);
        games++;
        if (s.winner != null) finished++;
      }
    }
    expect(games).toBe(decks.length * 2);
    expect(finished).toBeGreaterThan(games * 0.5);
  }, 600000);
});
