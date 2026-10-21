// Scenáre pre ťažké karty z turnajových deckov – overujú presné správanie podľa textu karty.
import { describe, expect, it } from "vitest";
import { buildDef, CardData } from "./cards";
import { applyAction, cardCount, counterOf, fieldOf, handCost, mainActions, newGame, power } from "./engine";
import META from "./meta-data.json";
import type { AnswerChoice, CardDef, GameState, P } from "./types";

const cards = (META as any).cards as Record<string, Omit<CardData, "code">>;
const DEFS: Record<string, CardDef> = Object.fromEntries(Object.entries(cards).map(([code, c]) => [code, buildDef({ code, ...c } as CardData)]));
const FILL = "OP12-002"; // vanilla Edward.Newgate 5/6000 (Whitebeard Pirates)

function game(l0: string, l1: string, extra0: string[] = [], extra1: string[] = []): GameState {
  const deck = (extra: string[]) => [...extra, ...Array(50 - extra.length).fill(FILL)];
  let s = newGame([{ name: "A", leader: l0, cards: deck(extra0) }, { name: "B", leader: l1, cards: deck(extra1) }], DEFS, 7, 0);
  s = applyAction(s, { type: "answer", p: 0, choice: { yes: false } });
  s = applyAction(s, { type: "answer", p: 1, choice: { yes: false } });
  return s;
}
const ans = (s: GameState, p: P, c: AnswerChoice) => applyAction(s, { type: "answer", p, choice: c });
/** dá kartu s kódom do ruky/na pole */
function put(s: GameState, p: P, code: string, where: "hand" | "field" | "trash" | "lifeTop" = "hand"): string {
  const x = s.players[p];
  const iid = Object.values(s.cards).find((c) => c.owner === p && c.code === code && (x.deck.includes(c.iid) || x.hand.includes(c.iid) || x.life.includes(c.iid)))!.iid;
  for (const z of ["deck", "hand", "life", "trash"] as const) x[z] = x[z].filter((i) => i !== iid);
  if (where === "hand") x.hand.push(iid);
  else if (where === "trash") x.trash.push(iid);
  else if (where === "lifeTop") x.life.unshift(iid);
  else {
    x.characters.push(iid);
    s.cards[iid].playedTurn = 0;
  }
  return iid;
}
function setMain(s: GameState, p: P, active: number) {
  s.active = p;
  s.turn = 5;
  s.turnCount = [3, 3];
  s.phase = "main";
  const x = s.players[p];
  x.donActive = active;
  x.donRested = 0;
  x.donDeck = x.donMax - active;
  for (const i of fieldOf(s, p)) s.cards[i].don = 0;
}

describe("turnajové karty – scenáre", () => {
  it("OP13-001 Luffy: pri súperovom útoku dá do rest 2 DON!! → leader +4000 počas súboja", () => {
    let s = game("OP13-001", "OP17-039");
    setMain(s, 1, 0);
    s.players[0].donActive = 3;
    s.players[0].donDeck = 7;
    s.cards[s.players[0].leader].don = 1; // [DON!! x1]
    s.players[0].donDeck--;
    s = applyAction(s, { type: "attack", p: 1, attacker: s.players[1].leader, target: s.players[0].leader });
    expect(s.prompt).toMatchObject({ kind: "payCost", p: 1 }); // najprv [When Attacking] útočníka (Xebec) – hráč na ťahu má prednosť
    s = ans(s, 1, { yes: false });
    expect(s.prompt).toMatchObject({ kind: "oneOf", p: 0 });
    s = ans(s, 0, { option: 2 });
    expect(s.prompt).toMatchObject({ kind: "choose", p: 0 });
    s = ans(s, 0, { pick: [s.players[0].leader] });
    expect(power(s, s.players[0].leader)).toBe(5000 + 4000);
    expect(s.players[0].donRested).toBe(2);
  });

  it("OP17-023 Nami: postavu Straw Hat Crew namiesto K.O. zachráni tým, že sa Nami dá do rest", () => {
    let s = game("OP15-001", "OP17-039", ["OP17-023", "EB02-017"], ["OP17-016"]);
    const nami = put(s, 0, "OP17-023", "field");
    const nami2 = put(s, 0, "EB02-017", "field"); // Nami 2000 power, SHC
    setMain(s, 1, 3);
    const rakuyo = put(s, 1, "OP17-016"); // [On Play] K.O. až 2 postavy s base power ≤ 2000
    s = applyAction(s, { type: "play", p: 1, iid: rakuyo });
    expect(s.prompt).toMatchObject({ kind: "choose", p: 1 });
    s = ans(s, 1, { pick: [nami2] });
    expect(s.prompt).toMatchObject({ kind: "payCost", p: 0 }); // zachrániť?
    s = ans(s, 0, { yes: true });
    expect(s.players[0].characters).toContain(nami2);
    expect(s.cards[nami].rested).toBe(true);
  });

  it("EB02-017 Nami: pozrie 5, vezme Straw Hat Crew, zvyšok pod balíček – počet kariet sedí", () => {
    let s = game("OP15-001", "OP17-039", ["EB02-017", "OP17-082"]);
    setMain(s, 0, 5);
    const before = cardCount(s, 0);
    const nami = put(s, 0, "EB02-017");
    const target = put(s, 0, "OP17-082", "hand");
    s.players[0].hand = s.players[0].hand.filter((i) => i !== target);
    s.players[0].deck.unshift(target);
    s = applyAction(s, { type: "play", p: 0, iid: nami });
    expect(s.prompt).toMatchObject({ kind: "choose", zone: "look" });
    expect((s.prompt as any).options).toEqual([target]);
    s = ans(s, 0, { pick: [target] });
    expect(s.players[0].hand).toContain(target);
    expect(s.look).toBeNull();
    expect(cardCount(s, 0)).toBe(before);
  });

  it("OP15-058 Enel: DON!! balíček má 6 kariet", () => {
    const s = game("OP15-058", "OP17-039");
    expect(s.players[0].donMax).toBe(6);
    expect(s.players[0].donDeck + s.players[0].donActive).toBe(6);
  });

  it("OP17-044 Captain John v rest: súper môže útočiť len naňho", () => {
    let s = game("OP17-039", "OP15-001", ["OP17-044"]);
    const john = put(s, 0, "OP17-044", "field");
    s.cards[john].rested = true;
    setMain(s, 1, 2);
    const targets = mainActions(s).filter((a) => a.type === "attack").map((a: any) => a.target);
    expect(new Set(targets)).toEqual(new Set([john]));
  });

  it("OP09-118 Roger: keď súper použije [Blocker] a niekto má 0 Life, vyhrá", () => {
    let s = game("OP15-001", "OP17-039", ["OP09-118"], ["OP17-041"]);
    const roger = put(s, 0, "OP09-118", "field");
    const wang = put(s, 1, "OP17-041", "field"); // [Blocker]
    s.players[1].life = [];
    setMain(s, 0, 0);
    s = applyAction(s, { type: "attack", p: 0, attacker: roger, target: s.players[1].leader });
    expect(s.prompt).toMatchObject({ kind: "blocker", p: 1 });
    s = ans(s, 1, { pick: [wang] });
    expect(s.winner).toBe(0);
  });

  it("OP17-107 Daifuku: [Trigger] Play this card – z Life rovno na pole", () => {
    let s = game("OP15-001", "OP17-099", [], ["OP17-107"]);
    put(s, 1, "OP17-107", "lifeTop");
    setMain(s, 0, 0);
    s = applyAction(s, { type: "attack", p: 0, attacker: s.players[0].leader, target: s.players[1].leader });
    while (s.prompt && s.prompt.kind !== "trigger") s = ans(s, s.prompt.p, s.prompt.kind === "counter" ? { counter: [] } : { pick: [] });
    expect(s.prompt).toMatchObject({ kind: "trigger", p: 1 });
    s = ans(s, 1, { yes: true });
    expect(s.players[1].characters.map((i) => s.cards[i].code)).toContain("OP17-107");
    expect(cardCount(s, 1)).toBe(51);
  });

  it("OP17-062 Kaido: keď sa v mojom ťahu vráti DON!!, pridá 1 aktívny a 1 nastaví aktívny", () => {
    let s = game("OP17-058", "OP15-001", ["OP17-062", "OP15-061"]);
    put(s, 0, "OP17-062", "field");
    setMain(s, 0, 4);
    s.players[0].donRested = 2;
    s.players[0].donDeck = 4;
    const ohm = put(s, 0, "OP15-061"); // [On Play] DON!! −1: Draw 1
    s = applyAction(s, { type: "play", p: 0, iid: ohm });
    expect(s.prompt).toMatchObject({ kind: "payCost" });
    s = ans(s, 0, { yes: true });
    expect(s.prompt).toMatchObject({ kind: "donSource", n: 1 });
    s = ans(s, 0, { don: { active: 0, rested: 1, attached: {} } });
    expect(s.prompt).toBeNull();
    expect(s.players[0].donActive).toBe(5);
    expect(s.players[0].donRested).toBe(1);
    expect(s.players[0].donDeck).toBe(4);
  });

  it("OP17-063 Kaido: postavy bez counteru v ruke majú +1000 counter", () => {
    const s = game("OP17-058", "OP15-001", ["OP17-063", "OP17-062"]);
    put(s, 0, "OP17-063", "field");
    const k2 = put(s, 0, "OP17-062"); // Kaido 10 bez counteru
    expect(counterOf(s, k2)).toBe(1000);
  });

  it("OP07-064 Sanji: v ruke −3 cost, keď mám aspoň o 2 DON!! menej", () => {
    const s = game("OP17-058", "OP15-001", ["OP07-064"]);
    const sanji = put(s, 0, "OP07-064");
    setMain(s, 0, 2);
    s.players[1].donActive = 5;
    s.players[1].donDeck = 5;
    expect(handCost(s, sanji)).toBe(3);
  });
});
