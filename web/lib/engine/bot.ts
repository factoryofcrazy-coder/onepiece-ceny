// Jednoduchý bot na tréning: hrá agresívne, ale podľa pravidiel (len legálne akcie cez engine).
import { blockersFor, cost, counterOf, counterOptions, def, donOnField, fieldOf, handCost, mainActions, power } from "./engine";
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
    .filter((a) => s.cards[a.iid] && def(s, a.iid).type !== "Leader")
    .filter((a) => def(s, a.iid).type !== "Event" || o.characters.length > 0 || def(s, a.iid).abilities.every((ab) => ab.when !== "main"))
    .sort((a, b) => handCost(s, b.iid) - handCost(s, a.iid));
  if (plays.length && (x.characters.length < 5 || def(s, plays[0].iid).type !== "Character")) return plays[0];

  // 2) aktivuj efekty (Once Per Turn) – len raz za ťah na kartu, aby sa bot nezacyklil
  const act = acts.find((a) => a.type === "activate" && !s.usedOnce.includes(`bot:${a.iid}:${a.ability}`));
  if (act && s.turn % 2 === 0) return act;

  // 3) zvyšné DON!! na leadera
  if (x.donActive > 0 && s.turnCount[me] > 1 && acts.some((a) => a.type === "attachDon")) return { type: "attachDon", p: me, target: x.leader };

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

export function botAnswer(s: GameState, me: P): AnswerChoice {
  const pr = s.prompt!;
  switch (pr.kind) {
    case "mulligan":
      return { yes: false };
    case "choose": {
      // cieľ súpera: najsilnejší; vlastná karta: leader / prvá
      const known = (i: string) => !!s.cards[i];
      const opts = [...pr.options].filter(known).sort((a, b) => {
        const ma = s.cards[a].owner === me ? 1 : 0;
        const mb = s.cards[b].owner === me ? 1 : 0;
        if (ma !== mb) return ma - mb;
        return power(s, b) - power(s, a) || cost(s, b) - cost(s, a);
      });
      const n = Math.max(pr.min, Math.min(pr.max, opts.length));
      if (pr.maxTotalCost != null || pr.distinctNames) {
        const pick: string[] = [];
        let total = 0;
        for (const i of opts) {
          if (pick.length >= n) break;
          const c = cost(s, i);
          if (pr.maxTotalCost != null && total + c > pr.maxTotalCost) continue;
          if (pr.distinctNames && pick.some((j) => def(s, j).name === def(s, i).name)) continue;
          pick.push(i);
          total += c;
        }
        return { pick: pick.length >= pr.min ? pick : opts.slice(0, pr.min) };
      }
      return { pick: opts.slice(0, n) };
    }
    case "payCost":
      return { yes: true };
    case "oneOf":
      return { option: 0 };
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
      const opts = counterOptions(s, me).filter((i) => def(s, i).type === "Character").sort((a, c) => counterOf(s, c) - counterOf(s, a));
      const lifeLow = s.players[me].life.length <= 2;
      if (!lifeLow && b.target === s.players[me].leader) return { counter: [] };
      let sum = 0;
      const use: string[] = [];
      for (const i of opts) {
        if (sum >= need) break;
        sum += counterOf(s, i);
        use.push(i);
      }
      return { counter: sum >= need ? use : [] };
    }
    case "trigger":
      return { yes: true };
    case "trashCharacter":
      return { pick: [[...pr.options].sort((a, b) => power(s, a) - power(s, b))[0]] };
  }
}

void donOnField;
