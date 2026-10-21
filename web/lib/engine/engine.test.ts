import { describe, expect, it } from "vitest";
import {
  applyAction, blockersFor, cardCount, cost, counterOptions, donOnField, fieldOf, IllegalAction, mainActions, newGame, power, viewFor,
} from "./engine";
import { DECK_ST01, DECK_ST26, DEFS } from "./fixtures";
import { nextRand } from "./rng";
import type { Action, AnswerChoice, GameState, P } from "./types";

// ------------------------------------------------------------------ pomocníci
const ans = (s: GameState, p: P, choice: AnswerChoice) => applyAction(s, { type: "answer", p, choice });

/** Nová hra po mulligane (bez výmeny ruky). p0 = ST-26 fialový, p1 = ST-01 červený. */
function start(seed = 42): GameState {
  let s = newGame([DECK_ST26, DECK_ST01], DEFS, seed, 0);
  s = ans(s, 0, { yes: false });
  s = ans(s, 1, { yes: false });
  return s;
}

/** Nájde inštanciu karty s daným kódom (kdekoľvek) a presunie ju do ruky hráča. */
function toHand(s: GameState, p: P, code: string): string {
  const x = s.players[p];
  const iid = Object.values(s.cards).find((c) => c.owner === p && c.code === code && (x.deck.includes(c.iid) || x.hand.includes(c.iid) || x.life.includes(c.iid)))!.iid;
  x.deck = x.deck.filter((i) => i !== iid);
  x.life = x.life.filter((i) => i !== iid);
  if (!x.hand.includes(iid)) x.hand.push(iid);
  return iid;
}

/** Pripraví stav: p je na ťahu v main fáze (ťah 3+), s daným počtom DON!!. */
function setTurn(s: GameState, p: P, turn: number, active: number, rested = 0) {
  s.active = p;
  s.turn = turn;
  s.phase = "main";
  const x = s.players[p];
  x.donDeck = 10 - active - rested;
  x.donActive = active;
  x.donRested = rested;
  for (const i of fieldOf(s, p)) s.cards[i].don = 0;
}

const play = (s: GameState, p: P, iid: string) => applyAction(s, { type: "play", p, iid });

// ------------------------------------------------------------------ pravidlá
describe("setup a ťahy", () => {
  it("rozdá 5 kariet, Life podľa leadera, prvý hráč neťahá a dostane 1 DON!!", () => {
    const s = start();
    expect(s.players[0].hand.length).toBe(5);
    expect(s.players[0].life.length).toBe(4); // OP09-061 má 4 Life
    expect(s.players[1].life.length).toBe(5); // ST01-001 má 5 Life
    expect(s.turn).toBe(1);
    expect(s.players[0].donActive).toBe(1);
    expect(s.players[0].deck.length).toBe(48 - 5 - 4);
  });

  it("druhý hráč v 1. ťahu ťahá a dostane 2 DON!!; v prvom ťahu sa neútočí", () => {
    let s = start();
    s = applyAction(s, { type: "endTurn", p: 0 });
    expect(s.active).toBe(1);
    expect(s.players[1].hand.length).toBe(6);
    expect(s.players[1].donActive).toBe(2);
    expect(() => applyAction(s, { type: "attack", p: 1, attacker: s.players[1].leader, target: s.players[0].leader })).toThrow(IllegalAction);
  });

  it("refresh vráti pripojené DON!! do cost area a všetko odrestuje", () => {
    let s = start();
    s = applyAction(s, { type: "attachDon", p: 0, target: s.players[0].leader });
    expect(s.cards[s.players[0].leader].don).toBe(1);
    s = applyAction(s, { type: "endTurn", p: 0 });
    s = applyAction(s, { type: "endTurn", p: 1 });
    expect(s.cards[s.players[0].leader].don).toBe(0);
    expect(s.players[0].donActive).toBe(1 + 2); // 1 vrátený + 2 nové
  });

  it("zahranie postavy zaplatí cost (DON!! do rest)", () => {
    let s = start();
    setTurn(s, 1, 3, 5);
    const zoro = toHand(s, 1, "ST01-013");
    s = play(s, 1, zoro);
    expect(s.players[1].characters).toContain(zoro);
    expect(s.players[1].donActive).toBe(2);
    expect(s.players[1].donRested).toBe(3);
  });
});

describe("prepočty – hodnoty sa nepamätajú", () => {
  it("[DON!! x1] Zoro ST01-013: +1000 len kým má DON!! a len v mojom ťahu", () => {
    let s = start();
    setTurn(s, 1, 3, 5);
    const zoro = toHand(s, 1, "ST01-013");
    s = play(s, 1, zoro);
    expect(power(s, zoro)).toBe(5000);
    s = applyAction(s, { type: "attachDon", p: 1, target: zoro });
    expect(power(s, zoro)).toBe(5000 + 1000 + 1000); // DON + static
    s = applyAction(s, { type: "endTurn", p: 1 }); // súperov ťah – DON!! odišli pri refresh? nie, refresh je až v mojom ťahu
    expect(s.cards[zoro].don).toBe(1);
    expect(power(s, zoro)).toBe(5000); // v súperovom ťahu DON!! ani [DON!! x1] neplatí
  });

  it("leader OP09-061 [DON!! x1]: všetky moje postavy +1 cost", () => {
    let s = start();
    setTurn(s, 0, 3, 8);
    const usopp = toHand(s, 0, "OP09-063");
    s = play(s, 0, usopp);
    expect(cost(s, usopp)).toBe(4);
    s = applyAction(s, { type: "attachDon", p: 0, target: s.players[0].leader });
    expect(cost(s, usopp)).toBe(5);
  });
});

// ------------------------------------------------------------------ DON!! −2 a reakcia leadera
describe("DON!! −X combo s leaderom OP09-061", () => {
  it("Nico Robin ST26-003 DON!! −2 → leader zareaguje (+1 aktívny, +1 rest), Robin pridá +1 aktívny", () => {
    let s = start();
    setTurn(s, 0, 3, 5);
    const robin = toHand(s, 0, "ST26-003");
    s = play(s, 0, robin); // cost 3 → active 2, rested 3
    expect(s.prompt?.kind).toBe("payCost");
    s = ans(s, 0, { yes: true });
    expect(s.prompt?.kind).toBe("donSource");
    s = ans(s, 0, { don: { active: 0, rested: 2, attached: {} } });
    // DonReturned(2) → leader vo fronte, Robin efekt beží ďalej, potom leader
    expect(s.prompt).toBeNull();
    const x = s.players[0];
    expect(x.donActive).toBe(2 + 1 + 1); // pôvodné 2 + Robin 1 + leader 1
    expect(x.donRested).toBe(3 - 2 + 1); // 3 − vrátené 2 + leader 1
    expect(x.donDeck).toBe(4);
    expect(donOnField(s, 0) + x.donDeck).toBe(10);
    expect(s.donReturnedThisTurn[0]).toBe(2);
    expect(s.usedOnce).toContain(`${x.leader}:1`);
    // poradie udalostí: vrátenie → Robin +1 → leader +1 +1
    const evs = s.log.filter((e) => e.t === "DonReturned" || e.t === "DonAdded").map((e) => e.t + ("state" in e ? `:${e.state}` : `:${e.n}`));
    expect(evs.slice(-4)).toEqual(["DonReturned:2", "DonAdded:active", "DonAdded:active", "DonAdded:rested"]);
  });

  it("Once Per Turn: druhé vrátenie 2+ DON!! v tom istom ťahu leader neaktivuje", () => {
    let s = start();
    setTurn(s, 0, 3, 8);
    const robin = toHand(s, 0, "ST26-003");
    const zoro = toHand(s, 0, "OP09-076");
    s = play(s, 0, robin);
    s = ans(s, 0, { yes: true });
    s = ans(s, 0, { don: { active: 0, rested: 2, attached: {} } });
    const before = s.players[0].donDeck;
    s = play(s, 0, zoro); // „1 or more“
    s = ans(s, 0, { yes: true });
    s = ans(s, 0, { don: { active: 0, rested: 3, attached: {} } }); // vráti 3
    expect(s.players[0].donDeck).toBe(before + 3 - 1); // len Zoro +1, leader už nie
  });

  it("vrátenie len 1 DON!! leadera nespustí (treba 2 alebo viac)", () => {
    let s = start();
    setTurn(s, 0, 3, 5);
    const zoro = toHand(s, 0, "OP09-076");
    s = play(s, 0, zoro);
    s = ans(s, 0, { yes: true });
    s = ans(s, 0, { don: { active: 0, rested: 1, attached: {} } });
    expect(s.usedOnce.length).toBe(0);
    expect(s.players[0].donDeck).toBe(5 + 1 - 1);
  });

  it("DON!! −2 sa dá zaplatiť aj DON!! pripojenými na kartách", () => {
    let s = start();
    setTurn(s, 0, 3, 4);
    const L = s.players[0].leader;
    s = applyAction(s, { type: "attachDon", p: 0, target: L });
    s = applyAction(s, { type: "attachDon", p: 0, target: L });
    const robin = toHand(s, 0, "ST26-003"); // zostal 1 aktívny → nemá na cost 3
    expect(() => play(s, 0, robin)).toThrow(IllegalAction);
    setTurn(s, 0, 3, 3, 4);
    s.cards[L].don = 0;
    s.players[0].donDeck = 3;
    s.cards[L].don = 2;
    s.players[0].donRested = 2;
    s = play(s, 0, robin); // active 3 → 0, rested 5
    s = ans(s, 0, { yes: true });
    s = ans(s, 0, { don: { active: 0, rested: 0, attached: { [L]: 2 } } });
    expect(s.cards[L].don).toBe(0);
    expect(s.players[0].donDeck).toBe(3 + 2 - 1 - 2);
  });

  it("ak sa hráč rozhodne cenu nezaplatiť, efekt ani reakcia sa nestanú", () => {
    let s = start();
    setTurn(s, 0, 3, 5);
    const robin = toHand(s, 0, "ST26-003");
    s = play(s, 0, robin);
    s = ans(s, 0, { yes: false });
    expect(s.players[0].donDeck).toBe(5);
    expect(s.usedOnce.length).toBe(0);
  });

  it("nesprávny počet DON!! na vrátenie je odmietnutý", () => {
    let s = start();
    setTurn(s, 0, 3, 5);
    const robin = toHand(s, 0, "ST26-003");
    s = play(s, 0, robin);
    s = ans(s, 0, { yes: true });
    expect(() => ans(s, 0, { don: { active: 1, rested: 0, attached: {} } })).toThrow(IllegalAction);
  });
});

// ------------------------------------------------------------------ súboj
describe("súboj", () => {
  function battleSetup() {
    const s = start();
    setTurn(s, 0, 3, 6);
    return s;
  }

  it("útok na leadera: rovnaká power = zásah, Life karta ide do ruky", () => {
    let s = battleSetup();
    const hand = s.players[1].hand.length;
    // bez blockerov a counterov v ruke súpera
    s.players[1].hand = s.players[1].hand.filter((i) => !counterOptions(s, 1).includes(i));
    const h0 = s.players[1].hand.length;
    s = applyAction(s, { type: "attack", p: 0, attacker: s.players[0].leader, target: s.players[1].leader });
    if (s.prompt?.kind === "trigger") s = ans(s, 1, { yes: false });
    expect(s.players[1].life.length).toBe(4);
    expect(s.players[1].hand.length).toBe(h0 + 1);
    expect(s.battle).toBeNull();
    void hand;
  });

  it("blocker presmeruje útok a postava je K.O.", () => {
    let s = battleSetup();
    s.players[1].hand = [];
    const chop = toHand(s, 1, "ST01-006");
    s.players[1].hand = s.players[1].hand.filter((i) => i !== chop);
    s.players[1].characters.push(chop);
    s = applyAction(s, { type: "attack", p: 0, attacker: s.players[0].leader, target: s.players[1].leader });
    expect(s.prompt).toMatchObject({ kind: "blocker", p: 1 });
    s = ans(s, 1, { pick: [chop] });
    expect(s.players[1].trash).toContain(chop);
    expect(s.players[1].life.length).toBe(5);
  });

  it("counter z ruky (+1000) zastaví útok", () => {
    let s = battleSetup();
    s.players[1].hand = [];
    const nami = toHand(s, 1, "ST01-007"); // counter 1000
    s = applyAction(s, { type: "attack", p: 0, attacker: s.players[0].leader, target: s.players[1].leader });
    expect(s.prompt).toMatchObject({ kind: "counter", p: 1 });
    s = ans(s, 1, { counter: [nami] });
    expect(s.prompt).toBeNull(); // už nemá ďalší counter
    expect(s.players[1].life.length).toBe(5);
    expect(s.players[1].trash).toContain(nami);
    // counter platil len počas súboja
    expect(power(s, s.players[1].leader)).toBe(5000);
  });

  it("[Counter] event Guard Point: zaplatí cost a dá +3000 počas súboja", () => {
    let s = battleSetup();
    s.players[1].hand = [];
    s.players[1].donActive = 2;
    s.players[1].donDeck = 8;
    const gp = toHand(s, 1, "ST01-014");
    s.cards[s.players[0].leader].don = 0;
    s = applyAction(s, { type: "attachDon", p: 0, target: s.players[0].leader }); // 6000
    s = applyAction(s, { type: "attack", p: 0, attacker: s.players[0].leader, target: s.players[1].leader });
    s = ans(s, 1, { counter: [gp] });
    expect(s.prompt).toMatchObject({ kind: "choose", p: 1 });
    s = ans(s, 1, { pick: [s.players[1].leader] });
    expect(s.players[1].life.length).toBe(5);
    expect(s.players[1].donActive).toBe(1);
    expect(s.players[1].trash).toContain(gp);
  });

  it("[Trigger] Gum-Gum Jet Pistol z Life: aktivuje [Main] a K.O. útočiacu postavu", () => {
    let s = battleSetup();
    s.players[1].hand = [];
    const jet = toHand(s, 1, "ST01-015");
    s.players[1].hand = [];
    s.players[1].life.unshift(jet);
    const usopp = toHand(s, 0, "OP09-063");
    s.players[0].hand = s.players[0].hand.filter((i) => i !== usopp);
    s.players[0].characters.push(usopp);
    s.cards[usopp].playedTurn = 1;
    s = applyAction(s, { type: "attack", p: 0, attacker: usopp, target: s.players[1].leader });
    expect(s.prompt).toMatchObject({ kind: "trigger", p: 1, iid: jet });
    s = ans(s, 1, { yes: true });
    expect(s.prompt).toMatchObject({ kind: "choose", p: 1 });
    s = ans(s, 1, { pick: [usopp] });
    expect(s.players[0].trash).toContain(usopp);
    expect(s.players[1].trash).toContain(jet);
    expect(s.players[1].hand).not.toContain(jet);
  });

  it("postava zahraná tento ťah bez [Rush] nemôže útočiť; ST01-012 Luffy s [Rush] môže", () => {
    let s = start();
    s.players[1].hand = [];
    setTurn(s, 0, 3, 10);
    const usopp = toHand(s, 0, "OP09-063");
    s = play(s, 0, usopp);
    expect(() => applyAction(s, { type: "attack", p: 0, attacker: usopp, target: s.players[1].leader })).toThrow(IllegalAction);
    let t = start();
    setTurn(t, 1, 3, 10);
    t.players[0].hand = [];
    const luffy = toHand(t, 1, "ST01-012");
    t = play(t, 1, luffy);
    t = applyAction(t, { type: "attack", p: 1, attacker: luffy, target: t.players[0].leader });
    expect(t.log.some((e) => e.t === "Attack")).toBe(true);
  });

  it("ST26-005 nastaví base power leadera na 7000 až do konca súperovej ďalšej End fázy", () => {
    let s = start();
    setTurn(s, 0, 5, 10);
    s.players[1].donActive = 5;
    s.players[1].donDeck = 5;
    const luffy = toHand(s, 0, "ST26-005");
    s = play(s, 0, luffy); // cost 6 → 4 aktívne
    s = ans(s, 0, { yes: true });
    s = ans(s, 0, { don: { active: 2, rested: 0, attached: {} } });
    const L = s.players[0].leader;
    expect(power(s, L)).toBe(7000);
    s = applyAction(s, { type: "endTurn", p: 0 });
    expect(power(s, L)).toBe(7000); // stále platí v súperovom ťahu
    s = applyAction(s, { type: "endTurn", p: 1 });
    expect(power(s, L)).toBe(5000); // skončilo v súperovej End fáze
  });
});

// ------------------------------------------------------------------ náhodné hry
function randomAnswer(s: GameState, r: () => number): Action {
  const pr = s.prompt!;
  const p = pr.p;
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  switch (pr.kind) {
    case "mulligan":
      return { type: "answer", p, choice: { yes: r() < 0.3 } };
    case "choose": {
      const n = pr.min + Math.floor(r() * (pr.max - pr.min + 1));
      const opts = [...pr.options].sort(() => r() - 0.5);
      return { type: "answer", p, choice: { pick: opts.slice(0, n) } };
    }
    case "payCost":
    case "trigger":
      return { type: "answer", p, choice: { yes: r() < 0.7 } };
    case "donSource": {
      const x = s.players[p];
      let need = pr.atLeast ? pr.n + Math.floor(r() * 2) : pr.n;
      need = Math.min(need, donOnField(s, p));
      const d = { active: 0, rested: 0, attached: {} as Record<string, number> };
      let a = x.donActive, rr = x.donRested;
      const att: Record<string, number> = {};
      for (const i of fieldOf(s, p)) att[i] = s.cards[i].don;
      while (need > 0) {
        const src = pick(["a", "r", "t"]);
        if (src === "a" && a) (a--, d.active++, need--);
        else if (src === "r" && rr) (rr--, d.rested++, need--);
        else if (src === "t") {
          const k = Object.keys(att).find((i) => att[i] > 0);
          if (k) (att[k]--, (d.attached[k] = (d.attached[k] ?? 0) + 1), need--);
        }
      }
      return { type: "answer", p, choice: { don: d } };
    }
    case "orderTriggers":
      return { type: "answer", p, choice: { order: pick(pr.options) } };
    case "blocker":
      return { type: "answer", p, choice: { pick: r() < 0.5 ? [pick(pr.options)] : [] } };
    case "counter": {
      const opts = counterOptions(s, p);
      return { type: "answer", p, choice: { counter: r() < 0.4 && opts.length ? [pick(opts)] : [] } };
    }
    case "trashCharacter":
      return { type: "answer", p, choice: { pick: [pick(pr.options)] } };
  }
}

describe("náhodné hry – invarianty", () => {
  it("300 hier s náhodnými legálnymi ťahmi: žiadna chyba, DON!! a karty sedia", () => {
    let finished = 0;
    for (let g = 0; g < 300; g++) {
      let seed = 1000 + g;
      const r = () => {
        const [v, ns] = nextRand(seed);
        seed = ns;
        return v;
      };
      let s = newGame(g % 2 ? [DECK_ST26, DECK_ST01] : [DECK_ST01, DECK_ST26], DEFS, seed, (g % 2) as P);
      const counts = [cardCount(s, 0), cardCount(s, 1)];
      for (let step = 0; step < 3000 && s.winner == null; step++) {
        let a: Action;
        if (s.prompt) a = randomAnswer(s, r);
        else {
          const acts = mainActions(s);
          // preferuj útoky a zahrania, nech hra postupuje
          const attacks = acts.filter((x) => x.type === "attack");
          const plays = acts.filter((x) => x.type === "play" || x.type === "attachDon" || x.type === "activate");
          a = attacks.length && r() < 0.6 ? attacks[Math.floor(r() * attacks.length)] : plays.length && r() < 0.7 ? plays[Math.floor(r() * plays.length)] : { type: "endTurn", p: s.active };
        }
        s = applyAction(s, a);
        for (const p of [0, 1] as P[]) {
          const x = s.players[p];
          expect(donOnField(s, p) + x.donDeck).toBe(10);
          expect(x.donActive).toBeGreaterThanOrEqual(0);
          expect(x.donRested).toBeGreaterThanOrEqual(0);
          expect(x.characters.length).toBeLessThanOrEqual(s.prompt?.kind === "trashCharacter" ? 6 : 5);
          expect(cardCount(s, p)).toBe(counts[p]);
        }
      }
      if (s.winner != null) finished++;
    }
    expect(finished).toBeGreaterThan(250);
  }, 120_000);
});

// ------------------------------------------------------------------ bot
describe("online pohľad (viewFor)", () => {
  it("neprezradí skryté karty a klient z neho vypočíta rovnaké legálne akcie ako server", () => {
    for (let g = 0; g < 40; g++) {
      let seed = 5000 + g;
      const r = () => {
        const [v, ns] = nextRand(seed);
        seed = ns;
        return v;
      };
      let s = newGame([DECK_ST26, DECK_ST01], DEFS, seed, (g % 2) as P);
      for (let step = 0; step < 1500 && s.winner == null; step++) {
        for (const p of [0, 1] as P[]) {
          const v = viewFor(s, p);
          const o = (1 - p) as P;
          expect(v.seed).toBe(0);
          for (const iid of [...s.players[o].hand, ...s.players[p].deck, ...s.players[o].deck, ...s.players[0].life, ...s.players[1].life])
            if (!(s.prompt?.kind === "trigger" && s.prompt.iid === iid)) expect(v.cards[iid]).toBeUndefined();
          expect(v.players[o].hand.length).toBe(s.players[o].hand.length);
          const actor = s.prompt ? s.prompt.p : s.active;
          if (p === actor) {
            expect(JSON.stringify(mainActions(v))).toBe(JSON.stringify(mainActions(s)));
            if (s.prompt?.kind === "counter") expect(counterOptions(v, p)).toEqual(counterOptions(s, p));
            if (s.prompt?.kind === "blocker") expect(blockersFor(v)).toEqual(blockersFor(s));
            for (const i of fieldOf(s, p)) expect(power(v, i)).toBe(power(s, i));
          }
        }
        let a: Action;
        if (s.prompt) a = randomAnswer(s, r);
        else {
          const acts = mainActions(s);
          const pick = acts.filter((x) => x.type !== "endTurn");
          a = pick.length && r() < 0.75 ? pick[Math.floor(r() * pick.length)] : { type: "endTurn", p: s.active };
        }
        s = applyAction(s, a);
      }
    }
  }, 120000);
});

import { botAction } from "./bot";
describe("bot", () => {
  it("bot proti botovi dohrá 50 hier len legálnymi ťahmi", () => {
    let done = 0;
    for (let g = 0; g < 50; g++) {
      let s = newGame([DECK_ST26, DECK_ST01], DEFS, 500 + g, (g % 2) as P);
      for (let k = 0; k < 4000 && s.winner == null; k++) {
        const who: P = s.prompt ? s.prompt.p : s.active;
        const a = botAction(s, who);
        if (!a) throw new Error("bot nevie čo robiť");
        s = applyAction(s, a);
      }
      if (s.winner != null) done++;
    }
    expect(done).toBe(50);
  }, 120_000);
});
