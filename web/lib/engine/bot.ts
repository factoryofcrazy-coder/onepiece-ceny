// Jednoduchý bot na tréning: hrá agresívne, ale podľa pravidiel (len legálne akcie cez engine).
import { blockersFor, cost, counterOptions, def, donOnField, fieldOf, handCost, mainActions, power } from "./engine";
import { Action, AnswerChoice, GameState, other, P } from "./types";

export function botAction(s: GameState, me: P): Action | null {
  if (s.winner != null) return null;
  if (s.prompt) return s.prompt.p === me ? { type: "answer", p: me, choice: botAnswer(s, me) } : null;
  if (s.active !== me) return null;
  const acts = mainActions(s);
  if (!acts.length) return null;
  const x = s.players[me];
  const o = s.players[other(me)];

  // 1) zahraj najdrahšiu postavu/event, ktorú si môžeš dovoliť
  const plays = acts
    .filter((a): a is Extract<Action, { type: "play" }> => a.type === "play")
    .filter((a) => def(s, a.iid).type !== "Event" || o.characters.length > 0 || def(s, a.iid).abilities.every((ab) => ab.when !== "main"))
    .sort((a, b) => handCost(s, b.iid) - handCost(s, a.iid));
  if (plays.length && (x.characters.length < 5 || def(s, plays[0].iid).type !== "Character")) return plays[0];

  // 2) aktivuj efekty (Once Per Turn)
  const act = acts.find((a) => a.type === "activate");
  if (act) return act;

  // 3) zvyšné DON!! na leadera
  if (x.donActive > 0 && s.turn > 2) return { type: "attachDon", p: me, target: x.leader };

  // 4) útok: najprv na leadera, ak má útočník dosť power
  const attacks = acts.filter((a): a is Extract<Action, { type: "attack" }> => a.type === "attack");
  const target = o.leader;
  const good = attacks
    .filter((a) => a.target === target && power(s, a.attacker) >= power(s, target))
    .sort((a, b) => power(s, b.attacker) - power(s, a.attacker));
  if (good.length) return good[0];
  const koRested = attacks.find((a) => a.target !== target && power(s, a.attacker) >= power(s, a.target));
  if (koRested) return koRested;
  return { type: "endTurn", p: me };
}

function botAnswer(s: GameState, me: P): AnswerChoice {
  const pr = s.prompt!;
  switch (pr.kind) {
    case "mulligan":
      return { yes: false };
    case "choose": {
      // cieľ súpera: najsilnejší; vlastný cieľ: leader
      const opts = [...pr.options].sort((a, b) =>
        a === "don" ? 1 : b === "don" ? -1 : s.cards[a].owner === me ? -1 : power(s, b) - power(s, a) || cost(s, b) - cost(s, a),
      );
      return { pick: opts.slice(0, Math.max(pr.min, pr.max)) };
    }
    case "payCost":
      return { yes: donOnField(s, me) >= 4 };
    case "donSource": {
      const x = s.players[me];
      let n = pr.n;
      const d = { active: 0, rested: 0, attached: {} as Record<string, number> };
      const r = Math.min(n, x.donRested);
      d.rested = r;
      n -= r;
      const a = Math.min(n, x.donActive);
      d.active = a;
      n -= a;
      for (const i of fieldOf(s, me)) {
        if (!n) break;
        const k = Math.min(n, s.cards[i].don);
        if (k) (d.attached[i] = k), (n -= k);
      }
      return { don: d };
    }
    case "orderTriggers":
      return { order: pr.options[0] };
    case "blocker": {
      const b = s.battle!;
      const tgtIsLeader = b.target === s.players[me].leader;
      const bl = blockersFor(s).sort((a, c) => power(s, a) - power(s, c));
      return { pick: tgtIsLeader && s.players[me].life.length <= 3 && bl.length ? [bl[0]] : [] };
    }
    case "counter": {
      const b = s.battle!;
      const need = power(s, b.attacker) - power(s, b.target) + 1;
      if (need <= 0) return { counter: [] };
      const opts = counterOptions(s, me).filter((i) => def(s, i).type === "Character").sort((a, c) => def(s, c).counter - def(s, a).counter);
      const lifeLow = s.players[me].life.length <= 2;
      if (!lifeLow && b.target === s.players[me].leader) return { counter: [] }; // šetrí karty, kým má Life
      let sum = 0;
      const use: string[] = [];
      for (const i of opts) {
        if (sum >= need) break;
        sum += def(s, i).counter;
        use.push(i);
      }
      return { counter: sum >= need ? use.slice(0, 1) : [] };
    }
    case "trigger":
      return { yes: true };
    case "trashCharacter":
      return { pick: [[...pr.options].sort((a, b) => power(s, a) - power(s, b))[0]] };
  }
}
