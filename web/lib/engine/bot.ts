// Boti na tréning, tri úrovne. Všetci hrajú len legálne akcie cez engine.
// Ťažký bot je férový: skúša vlastné ťahy na kópii hry, ale hodnotí len to, čo by videl človek
// (stôl, počty kariet, Life), nikdy obsah súperovej ruky ani poradie balíčkov. Overuje to bot.test.ts.
import { applyAction, blockersFor, cost, counterOf, counterOptions, def, donOnField, fieldOf, handCost, hasKw, mainActions, power } from "./engine";
import { Action, AnswerChoice, GameState, other, P } from "./types";

export type BotLevel = "easy" | "medium" | "hard";
export const BOT_LEVELS: { id: BotLevel; label: string; hint: string; en: string; hintEn: string }[] = [
  { id: "easy", label: "Ľahký", hint: "Na zoznámenie s hrou, často urobí chybu.", en: "Easy", hintEn: "To get to know the game, often makes mistakes." },
  { id: "medium", label: "Stredný", hint: "Hrá rozumne a útočí, ale ďaleko nerozmýšľa.", en: "Medium", hintEn: "Plays sensibly and attacks, but doesn't think far ahead." },
  { id: "hard", label: "Ťažký", hint: "Porovnáva ťahy, šetrí obranu a hľadá výhru. Tvoje karty nevidí.", en: "Hard", hintEn: "Compares moves, saves defense and looks for the win. It can't see your cards." },
];

export function botAction(s: GameState, me: P, level: BotLevel = "medium", rng: () => number = Math.random): Action | null {
  if (s.winner != null) return null;
  if (s.prompt) {
    if (s.prompt.p !== me) return null;
    const choice = level === "hard" ? hardAnswer(s, me, rng) : level === "easy" ? easyAnswer(s, me, rng) : botAnswer(s, me);
    return { type: "answer", p: me, choice };
  }
  if (s.active !== me) return null;
  if (level === "hard") return hardMain(s, me);
  if (level === "easy") return easyMain(s, me, rng);
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
  // efekt bez viditeľnej zmeny by sa dal aktivovať donekonečna (napr. EB04-016), preto ho treba vyskúšať
  const act = acts.find((a) => a.type === "activate" && !s.usedOnce.includes(`bot:${a.iid}:${a.ability}`) && changesGame(s, me, a));
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

const LOSE_CARD = /vyho[ďd]|vyhodi|trash|zahoď|vráť|vrati|pod balíček|odstráň|obetuj/i;

export function botAnswer(s: GameState, me: P, rng: () => number = Math.random, level: BotLevel = "medium"): AnswerChoice {
  const pr = s.prompt!;
  switch (pr.kind) {
    case "rps":
      // bot hrá v prehliadači a súperovu voľbu nepoužije – čistá náhoda
      return { rps: (["rock", "paper", "scissors"] as const)[Math.floor(rng() * 3)] };
    case "firstChoice":
      return { first: true };
    case "mulligan":
      return { yes: false };
    case "choose": {
      // cieľ súpera: najsilnejší; vlastná karta: leader / prvá
      const known = (i: string) => !!s.cards[i];
      const opts = [...pr.options].filter(known).sort((a, b) => {
        const ma = s.cards[a].owner === me ? 1 : 0;
        const mb = s.cards[b].owner === me ? 1 : 0;
        if (ma !== mb) return ma - mb;
        // vlastné karty, o ktoré prichádzam (vyhodiť, vrátiť…): najslabšie; ostatné výbery: najsilnejšie
        if (level !== "medium" && ma === 1 && LOSE_CARD.test(pr.label ?? "")) return power(s, a) - power(s, b) || cost(s, a) - cost(s, b);
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
      const lifeLow = s.players[me].life.length <= 1; // Stredný sa bráni až pri poslednom Life
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

// ---------- Ľahký: často zahrá najlacnejšie, chybuje a skoro sa nebráni ----------
const EASY_MISTAKE = 0.3;

function easyMain(s: GameState, me: P, rng: () => number): Action | null {
  const acts = mainActions(s);
  if (!acts.length) return null;
  const x = s.players[me];
  const useful = acts.filter((a) => a.type === "attack" || a.type === "play");
  if (useful.length && rng() < EASY_MISTAKE) return useful[Math.floor(rng() * useful.length)];
  const plays = acts
    .filter((a): a is Extract<Action, { type: "play" }> => a.type === "play")
    .filter((a) => def(s, a.iid).type === "Character")
    .sort((a, b) => handCost(s, a.iid) - handCost(s, b.iid));
  if (plays.length && x.characters.length < 4 && rng() < 0.7) return plays[0];
  const attacks = acts.filter((a): a is Extract<Action, { type: "attack" }> => a.type === "attack");
  const hit = attacks.find((a) => power(s, a.attacker) >= power(s, a.target));
  if (hit && rng() < 0.8) return hit;
  return { type: "endTurn", p: me };
}

function easyAnswer(s: GameState, me: P, rng: () => number): AnswerChoice {
  const pr = s.prompt!;
  if (pr.kind === "counter") return { counter: [] };
  if (pr.kind === "blocker" && rng() < 0.7) return { pick: [] };
  return botAnswer(s, me, rng);
}

// ---------- Ťažký ----------
// Raz za ťah vyskúša niekoľko plánov. Každý si zahrá do konca svojho ťahu a cez odpoveď súpera na kópii,
// kde sú skryté karty náhodne premiešané medzi tým, čo by nevidel ani človek. Vyberie plán s najlepším výsledkom.
function cardValue(s: GameState, i: string) {
  const blocker = hasKw(s, i, "blocker") ? 1000 : 0;
  return 600 + power(s, i) * 0.6 + cost(s, i) * 350 + blocker;
}

/** Hodnotenie pozície: len verejné informácie (stôl, počty kariet, Life). */
export function evaluate(s: GameState, me: P) {
  if (s.winner != null) return s.winner === me ? 1e7 : -1e7;
  const x = s.players[me];
  const o = s.players[other(me)];
  // posledné Life sú najcennejšie, za stratu prvých človek ešte dostane kartu do ruky
  const lifeWorth = (n: number) => [0, 6000, 10500, 14000, 16000, 17500, 18500][Math.min(n, 6)];
  let score = lifeWorth(x.life.length) - lifeWorth(o.life.length) + (x.hand.length - o.hand.length) * 900;
  const worth = (i: string) => cardValue(s, i) * (s.cards[i].rested ? 0.8 : 1);
  for (const i of x.characters) score += worth(i);
  for (const i of o.characters) score -= worth(i);
  if (x.stage) score += 1500;
  if (o.stage) score -= 1500;
  return score;
}

type Plan = { target: "leader" | "ko"; cheap: boolean; donFirst: boolean; holdChars: boolean; reserve: number; noActivate?: boolean };
const PLANS: Plan[] = [
  { target: "leader", cheap: false, donFirst: false, holdChars: false, reserve: 0 },
  { target: "ko", cheap: false, donFirst: false, holdChars: false, reserve: 0 },
  { target: "leader", cheap: true, donFirst: false, holdChars: false, reserve: 0 },
  { target: "leader", cheap: false, donFirst: true, holdChars: false, reserve: 0 },
  { target: "ko", cheap: false, donFirst: false, holdChars: true, reserve: 0 },
  { target: "leader", cheap: false, donFirst: false, holdChars: false, reserve: 2 },
  { target: "leader", cheap: false, donFirst: false, holdChars: false, reserve: 0, noActivate: true },
  { target: "ko", cheap: false, donFirst: false, holdChars: false, reserve: 0, noActivate: true },
];
export const HARD_ROLLOUTS = { n: 3, turns: 2 };

const fingerprint = (s: GameState) => JSON.stringify([s.players, s.cards, s.usedOnce, s.prompt, s.stack.length, s.pending.length]);
function changesGame(s: GameState, me: P, a: Action) {
  try {
    return fingerprint(applyAction(s, a)) !== fingerprint(s);
  } catch {
    return false;
  }
}

function planStep(s: GameState, me: P, plan: Plan, done: Set<string>): Action {
  const acts = mainActions(s);
  const x = s.players[me];
  const o = s.players[other(me)];
  const attacks = acts.filter((a): a is Extract<Action, { type: "attack" }> => a.type === "attack");
  const leaderPower = power(s, o.leader);
  const attackers = [...new Set(attacks.filter((a) => a.target === o.leader).map((a) => a.attacker))].filter((a) => !plan.holdChars || a === x.leader);

  const donStep = (): Action | null => {
    if (!x.donActive || !attackers.length || s.turnCount[me] <= 1 || !acts.some((a) => a.type === "attachDon")) return null;
    const short = attackers
      .map((a) => ({ a, need: Math.ceil((leaderPower - power(s, a)) / 1000) }))
      .filter((z) => z.need > 0 && z.need <= x.donActive)
      .sort((p, q) => p.need - q.need)[0];
    if (short) return { type: "attachDon", p: me, target: short.a };
    if (plan.reserve && x.donActive <= plan.reserve) return null;
    const top = [...attackers].sort((p, q) => power(s, q) - power(s, p))[0];
    return power(s, top) >= leaderPower ? { type: "attachDon", p: me, target: top } : null;
  };

  if (plan.donFirst) {
    const d = donStep();
    if (d) return d;
  }
  const plays = acts
    .filter((a): a is Extract<Action, { type: "play" }> => a.type === "play")
    .filter((a) => {
      const d = def(s, a.iid);
      if (handCost(s, a.iid) > x.donActive - plan.reserve) return false;
      if (d.type === "Character") return x.characters.length < 5;
      if (d.type === "Stage") return !x.stage;
      return o.characters.length > 0 || d.abilities.every((ab) => ab.when !== "main");
    })
    .sort((a, b) => (plan.cheap ? handCost(s, a.iid) - handCost(s, b.iid) : handCost(s, b.iid) - handCost(s, a.iid)));
  if (plays.length) return plays[0];

  const act = plan.noActivate ? undefined : acts.find((a) => a.type === "activate" && !done.has(`${a.iid}:${a.ability}`) && changesGame(s, me, a));
  if (act && act.type === "activate") {
    done.add(`${act.iid}:${act.ability}`);
    return act;
  }
  const d = donStep();
  if (d) return d;

  let pick: Extract<Action, { type: "attack" }> | null = null;
  let best = 0;
  for (const a of attacks) {
    if (power(s, a.attacker) < power(s, a.target)) continue;
    if (plan.holdChars && a.attacker !== x.leader) continue;
    const onLeader = a.target === o.leader;
    const base = onLeader ? (plan.target === "leader" || o.life.length <= 2 ? 7000 : 2500) : cardValue(s, a.target) + (plan.target === "ko" ? 4000 : 0);
    const score = base - (power(s, a.attacker) - power(s, a.target)) * 0.2;
    if (score > best) (best = score), (pick = a);
  }
  return pick ?? { type: "endTurn", p: me };
}

// verejné čísla → rovnaká pozícia dá rovnaké premiešanie, nezávisle od skrytých kariet
function publicSeed(s: GameState, me: P) {
  let h = 2166136261;
  const text = `${s.turn}|${me}|${s.players[0].life.length}|${s.players[1].life.length}|${s.players[0].hand.length}|${s.players[1].hand.length}|${s.players[0].characters.join()}|${s.players[1].characters.join()}|${s.players[me].hand.join()}`;
  for (let k = 0; k < text.length; k++) h = Math.imul(h ^ text.charCodeAt(k), 16777619);
  return h >>> 0;
}
const miniRng = (seed: number) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

/** Kópia hry, v ktorej sú skryté karty premiešané: súperova ruka, balíčky, Life lícom dole. */
function determinize(s: GameState, me: P, rng: () => number): GameState {
  const { defs, ...rest } = s as any;
  const c = { ...structuredClone(rest), defs } as GameState;
  c.seed = Math.floor(rng() * 2147483646) + 1;
  const mix = (arr: string[]) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  for (const p of [0, 1] as P[]) {
    const x = c.players[p];
    const hiddenLife = x.life.filter((i) => !c.cards[i].faceUp);
    const pool = [...x.deck, ...hiddenLife, ...(p === me ? [] : x.hand)].sort();
    mix(pool);
    let k = 0;
    x.deck = x.deck.map(() => pool[k++]);
    x.life = x.life.map((i) => (c.cards[i].faceUp ? i : pool[k++]));
    if (p !== me) x.hand = x.hand.map(() => pool[k++]);
  }
  return c;
}

function rollout(s: GameState, me: P, plan: Plan, rng: () => number) {
  let cur = determinize(s, me, rng);
  const stop = s.turn + HARD_ROLLOUTS.turns;
  const done = new Set<string>();
  for (let i = 0; i < 90 && cur.winner == null && cur.turn < stop; i++) {
    const p: P = cur.prompt ? cur.prompt.p : cur.active;
    let a: Action | null;
    if (p !== me) a = botAction(cur, p, "medium", rng);
    else if (cur.prompt) a = { type: "answer", p: me, choice: hardAnswer(cur, me, rng, false) };
    else a = planStep(cur, me, plan, done);
    if (!a) break;
    try {
      cur = applyAction(cur, a);
    } catch {
      break;
    }
  }
  return evaluate(cur, me);
}

const chosen = new Map<P, { key: string; plan: Plan; done: Set<string> }>();

function hardMain(s: GameState, me: P): Action | null {
  if (!mainActions(s).length) return null;
  const key = `${s.turn}:${s.players[me].leader}`;
  let c = chosen.get(me);
  if (!c || c.key !== key) {
    const rng = miniRng(publicSeed(s, me));
    let plan = PLANS[0];
    let best = -Infinity;
    for (const candidate of PLANS) {
      let sum = 0;
      for (let r = 0; r < HARD_ROLLOUTS.n; r++) sum += rollout(s, me, candidate, rng);
      if (sum > best) (best = sum), (plan = candidate);
    }
    c = { key, plan, done: new Set() };
    chosen.set(me, c);
  }
  return planStep(s, me, c.plan, c.done);
}

/** Zahrá odpoveď na kópii. Končí, keď by sa rozhodoval súper alebo sa pozeráme do balíčka. */
function simulate(s: GameState, me: P, a: Action): GameState | null {
  try {
    let cur = applyAction(s, a);
    for (let i = 0; i < 12; i++) {
      if (cur.winner != null || !cur.prompt || cur.prompt.p !== me || cur.look) break;
      cur = applyAction(cur, { type: "answer", p: me, choice: botAnswer(cur, me, () => 0, "hard") });
    }
    return cur;
  } catch {
    return null;
  }
}

function hardAnswer(s: GameState, me: P, rng: () => number, search = true): AnswerChoice {
  const pr = s.prompt!;
  const x = s.players[me];
  const tryChoices = (list: AnswerChoice[]) => {
    if (!search || s.look) return null; // v balíčku sa rozhoduje podľa pravidla, nie pokusom
    let best: AnswerChoice | null = null;
    let bestScore = -Infinity;
    for (const choice of list) {
      const after = simulate(s, me, { type: "answer", p: me, choice });
      if (!after) continue;
      const score = evaluate(after, me);
      if (score > bestScore) (bestScore = score), (best = choice);
    }
    return best;
  };
  // obrana sa dá vyskúšať aj vo vnútri plánov: počíta len Life, stôl a počty kariet
  const tryAll = (list: AnswerChoice[]) => {
    let best: AnswerChoice | null = null;
    let bestScore = -Infinity;
    for (const choice of list) {
      const after = simulate(s, me, { type: "answer", p: me, choice });
      if (!after) continue;
      const score = evaluate(after, me);
      if (score > bestScore) (bestScore = score), (best = choice);
    }
    return best;
  };
  switch (pr.kind) {
    case "mulligan": {
      const cheap = x.hand.filter((i) => def(s, i).type === "Character" && def(s, i).cost <= 3).length;
      return { yes: cheap < 2 };
    }
    case "counter": {
      // skúsi obranu bez karty, každú jednu kartu a dve najsilnejšie (aj eventy) a vyberie najlepšiu pozíciu
      const b = s.battle!;
      if (power(s, b.attacker) - power(s, b.target) + 1 <= 0) return { counter: [] };
      const opts = counterOptions(s, me);
      if (!opts.length) return { counter: [] };
      const strong = opts.filter((i) => def(s, i).type === "Character").sort((a, c) => counterOf(s, c) - counterOf(s, a));
      if (!search) {
        // vo vnútri plánov rýchle pravidlo: posledné dve Life bráň, ak na to stačia dve karty
        const need = power(s, b.attacker) - power(s, b.target) + 1;
        if (b.target !== x.leader || x.life.length > 2) return { counter: [] };
        const use = strong.slice(0, 2);
        return { counter: use.reduce((n, i) => n + counterOf(s, i), 0) >= need ? use : [] };
      }
      const list: AnswerChoice[] = [{ counter: [] }, ...opts.map((i) => ({ counter: [i] }))];
      if (strong.length >= 2) list.push({ counter: strong.slice(0, 2) });
      return tryAll(list) ?? { counter: [] };
    }
    case "blocker": {
      const options = blockersFor(s);
      if (!options.length) return { pick: [] };
      if (!search) {
        const cheapest = [...options].sort((a, c) => cardValue(s, a) - cardValue(s, c))[0];
        return { pick: s.battle!.target === x.leader && x.life.length <= 2 ? [cheapest] : [] };
      }
      return tryAll([{ pick: [] }, ...options.map((i) => ({ pick: [i] }))]) ?? { pick: [] };
    }
    case "choose": {
      if (pr.max === 1) {
        const list: AnswerChoice[] = pr.options.filter((i) => !!s.cards[i]).slice(0, 14).map((i) => ({ pick: [i] }));
        if (pr.min === 0) list.push({ pick: [] });
        const best = tryChoices(list);
        if (best) return best;
      }
      return botAnswer(s, me, rng, "hard");
    }
    case "payCost":
    case "trigger": {
      return tryChoices([{ yes: true }, { yes: false }]) ?? { yes: true };
    }
    case "oneOf": {
      return tryChoices(pr.options.map((_, option) => ({ option }))) ?? { option: 0 };
    }
    case "trashCharacter":
      return { pick: [[...pr.options].sort((a, b) => cardValue(s, a) - cardValue(s, b))[0]] };
    default:
      return botAnswer(s, me, rng);
  }
}

void donOnField;
