// Herný engine One Piece TCG. Princípy: DESIGN.md
// Stav je čisté dáta; applyAction() vracia nový stav (vstupný stav sa nemení).
import { shuffle } from "./rng";
import {
  Ability, Action, AnswerChoice, CardDef, Cond, Filter, Frame, GameEvent, GameState, Inst, Keyword,
  Modifier, other, P, Pending, PlayerState, Step,
} from "./types";

const MAX_DON = 10;
const MAX_CHARS = 5;

// ------------------------------------------------------------------ setup
export type DeckInput = { name: string; leader: string; cards: string[] };

export function newGame(decks: [DeckInput, DeckInput], defs: Record<string, CardDef>, seed = Date.now() % 2147483647, first: P = 0): GameState {
  const s: GameState = {
    seed, turn: 0, active: first, first, phase: "setup",
    players: [null as any, null as any], cards: {}, defs, mods: [], stack: [], pending: [], prompt: null,
    battle: null, usedOnce: [], donReturnedThisTurn: [0, 0], log: [], winner: null, nextId: 1,
  };
  decks.forEach((d, i) => {
    const p = i as P;
    const mk = (code: string) => {
      const iid = `c${s.nextId++}`;
      s.cards[iid] = { iid, code, owner: p, rested: false, don: 0, playedTurn: 0 };
      return iid;
    };
    const leader = mk(d.leader);
    const [deck, seed2] = shuffle(d.cards.map(mk), s.seed);
    s.seed = seed2;
    s.players[p] = {
      name: d.name, leader, deck, hand: [], trash: [], life: [], characters: [], stage: null,
      donDeck: MAX_DON, donActive: 0, donRested: 0, mulliganDone: false,
    };
    s.players[p].hand = s.players[p].deck.splice(0, 5);
  });
  s.prompt = { kind: "mulligan", p: first };
  return s;
}

/** Hlboká kópia – engine nikdy nemení vstupný stav. */
const clone = (s: GameState): GameState => {
  // definície kariet sa nikdy nemenia → zdieľajú sa, kopíruje sa len meniaci sa stav
  const { defs, ...rest } = s;
  return { ...structuredClone(rest), defs } as GameState;
};

// ------------------------------------------------------------------ pomocné
export const def = (s: GameState, iid: string): CardDef => s.defs[s.cards[iid].code];
const pl = (s: GameState, p: P): PlayerState => s.players[p];
const ownerOf = (s: GameState, iid: string): P => s.cards[iid].owner;
const emit = (s: GameState, e: GameEvent) => {
  s.log.push(e);
  listen(s, e);
};
const info = (s: GameState, msg: string) => s.log.push({ t: "Info", msg });
export const fieldOf = (s: GameState, p: P): string[] => {
  const x = pl(s, p);
  return [x.leader, ...x.characters, ...(x.stage ? [x.stage] : [])];
};
export const donOnField = (s: GameState, p: P) => {
  const x = pl(s, p);
  return x.donActive + x.donRested + fieldOf(s, p).reduce((a, i) => a + s.cards[i].don, 0);
};
const onField = (s: GameState, iid: string) => fieldOf(s, ownerOf(s, iid)).includes(iid);

// ------------------------------------------------------------------ podmienky a prepočty
export function evalCond(s: GameState, c: Cond | undefined, source: string, controller: P): boolean {
  if (!c) return true;
  switch (c.c) {
    case "donAttached":
      return s.cards[source].don >= c.n && s.active === controller; // DON!! xN platí len v tvojom ťahu
    case "turn":
      return c.who === "mine" ? s.active === controller : s.active !== controller;
    case "donOnField":
      return donOnField(s, c.side === "opp" ? other(controller) : controller) >= c.n;
    case "leaderMulticolor":
      return def(s, pl(s, controller).leader).colors.length > 1;
    case "hasCharacter":
      return pl(s, controller).characters.some((i) => {
        const d = def(s, i);
        return (!c.names || c.names.includes(d.name)) && (!c.trait || d.traits.includes(c.trait)) && (!c.minBasePower || basePower(s, i) >= c.minBasePower);
      });
    case "lifeAtMost":
      return pl(s, c.side === "opp" ? other(controller) : controller).life.length <= c.n;
    case "and":
      return c.all.every((x) => evalCond(s, x, source, controller));
    case "not":
      return !evalCond(s, c.x, source, controller);
  }
}

/** Trvalé efekty (static) všetkých kariet na poli, ktoré práve platia – vyhodnotené teraz, nie zapamätané. */
function activeStatics(s: GameState) {
  const out: { src: string; p: P; m: NonNullable<Ability["mods"]>[number] }[] = [];
  for (const p of [0, 1] as P[])
    for (const src of fieldOf(s, p))
      for (const a of def(s, src).abilities)
        if (a.when === "static" && a.mods && evalCond(s, a.cond, src, p)) for (const m of a.mods) out.push({ src, p, m });
  return out;
}

const appliesTo = (s: GameState, target: "self" | "myCharacters" | "myLeader", src: string, p: P, iid: string) =>
  target === "self" ? iid === src : target === "myLeader" ? iid === pl(s, p).leader : pl(s, p).characters.includes(iid);

export function basePower(s: GameState, iid: string): number {
  const set = s.mods.filter((m) => m.target === iid && m.kind === "basePower");
  return set.length ? set[set.length - 1].amount : def(s, iid).power;
}

/** Aktuálna power = základ + DON!! (v ťahu majiteľa) + dočasné modifikátory + trvalé efekty. */
export function power(s: GameState, iid: string): number {
  const c = s.cards[iid];
  let v = basePower(s, iid);
  if (s.active === c.owner) v += c.don * 1000;
  for (const m of s.mods) if (m.target === iid && m.kind === "power") v += m.amount;
  for (const { src, p, m } of activeStatics(s)) if (m.stat === "power" && appliesTo(s, m.target, src, p, iid)) v += m.amount;
  return Math.max(0, v);
}

export function cost(s: GameState, iid: string): number {
  let v = def(s, iid).cost;
  for (const { src, p, m } of activeStatics(s))
    if (m.stat === "cost" && (m.target === "self" ? iid === src : pl(s, p).characters.includes(iid))) v += m.amount;
  return Math.max(0, v);
}

/** Cena zahrania z ruky (napr. ST26-001 −5, ak máš Sanjiho 7000+). */
export function handCost(s: GameState, iid: string): number {
  const d = def(s, iid);
  let v = d.cost;
  for (const a of d.abilities) if (a.handCost && evalCond(s, a.handCost.cond, iid, ownerOf(s, iid))) v += a.handCost.amount;
  return Math.max(0, v);
}

export function hasKw(s: GameState, iid: string, kw: Keyword): boolean {
  if (def(s, iid).keywords.includes(kw)) return true;
  for (const { src, m } of activeStatics(s)) if (m.stat === "keyword" && m.kw === kw && src === iid) return true;
  return false;
}

// ------------------------------------------------------------------ výber cieľov
export function candidates(s: GameState, f: Filter, source: string, controller: P): string[] {
  const side = f.side === "me" ? controller : other(controller);
  const x = pl(s, side);
  let list = f.zone === "characters" ? [...x.characters] : f.zone === "leader" ? [x.leader] : [x.leader, ...x.characters];
  return list.filter((i) => {
    const d = def(s, i);
    if (f.notSelf && i === source) return false;
    if (f.maxCost != null && (d.type !== "Character" || cost(s, i) > f.maxCost)) return false;
    if (f.maxPower != null && power(s, i) > f.maxPower) return false;
    if (f.trait && !d.traits.includes(f.trait)) return false;
    if (f.keyword && !hasKw(s, i, f.keyword)) return false;
    if (f.rested != null && s.cards[i].rested !== f.rested) return false;
    return true;
  });
}

// ------------------------------------------------------------------ reakcie (listeners)
function listen(s: GameState, e: GameEvent) {
  if (e.t !== "DonReturned") return;
  s.donReturnedThisTurn[e.p] += e.n;
  for (const p of [0, 1] as P[])
    for (const src of fieldOf(s, p))
      def(s, src).abilities.forEach((a, k) => {
        if (a.when !== "onEvent" || !a.listen) return;
        if (a.listen.event === "DonReturned" && a.listen.side === "me" && e.p === p && e.n >= a.listen.min) queue(s, src, p, k);
      });
}

/** Zaradí schopnosť do fronty (ak spĺňa podmienky a Once Per Turn ešte nebolo použité). */
function queue(s: GameState, src: string, p: P, k: number) {
  const a = def(s, src).abilities[k];
  if (!evalCond(s, a.cond, src, p)) return;
  const key = `${src}:${k}`;
  if (a.oncePerTurn && (s.usedOnce.includes(key) || s.pending.some((x) => x.source === src && x.ability === k))) return;
  s.pending.push({ source: src, controller: p, ability: k, label: `${def(s, src).name}: ${a.when}` });
}

function queueWhen(s: GameState, src: string, when: Ability["when"]) {
  const p = ownerOf(s, src);
  def(s, src).abilities.forEach((a, k) => a.when === when && queue(s, src, p, k));
}

/** Začne vykonávať schopnosť – rámec na zásobník (ceny sa riešia v run()). */
function startAbility(s: GameState, src: string, controller: P, k: number, kind: Frame["kind"] = "ability") {
  const a = def(s, src).abilities[k];
  if (a.oncePerTurn) s.usedOnce.push(`${src}:${k}`);
  s.stack.push({
    source: src, controller, steps: [...(a.steps ?? [])], pc: 0, vars: {}, label: `${def(s, src).name}`,
    costs: a.cost ?? [], ci: 0, optional: !!a.optional, asked: false, kind,
  });
}

// ------------------------------------------------------------------ primitívy (menia stav + udalosti)
function draw(s: GameState, p: P, n: number) {
  for (let i = 0; i < n; i++) {
    const x = pl(s, p);
    if (!x.deck.length) return lose(s, p, "nemá kartu na ťahanie");
    x.hand.push(x.deck.shift()!);
  }
  emit(s, { t: "CardDrawn", p, n });
}

function addDon(s: GameState, p: P, n: number, state: "active" | "rested") {
  const x = pl(s, p);
  const k = Math.min(n, x.donDeck);
  if (!k) return;
  x.donDeck -= k;
  if (state === "active") x.donActive += k;
  else x.donRested += k;
  emit(s, { t: "DonAdded", p, n: k, state });
}

/** Postava/stage z poľa preč: pripojené DON!! sa vrátia do cost area ako rest. */
function leaveField(s: GameState, iid: string) {
  const c = s.cards[iid];
  const x = pl(s, c.owner);
  x.donRested += c.don;
  c.don = 0;
  c.rested = false;
  x.characters = x.characters.filter((i) => i !== iid);
  if (x.stage === iid) x.stage = null;
  s.mods = s.mods.filter((m) => m.target !== iid);
}

function ko(s: GameState, iid: string) {
  if (!onField(s, iid) || def(s, iid).type === "Leader") return;
  leaveField(s, iid);
  pl(s, ownerOf(s, iid)).trash.push(iid);
  emit(s, { t: "KO", iid });
  queueWhen(s, iid, "onKO");
}

function bounce(s: GameState, iid: string) {
  if (!onField(s, iid) || def(s, iid).type === "Leader") return;
  leaveField(s, iid);
  pl(s, ownerOf(s, iid)).hand.push(iid);
}

function addMod(s: GameState, m: Omit<Modifier, "setOnTurn">) {
  s.mods.push({ ...m, setOnTurn: s.turn });
}

function lose(s: GameState, p: P, why: string) {
  if (s.winner != null) return;
  s.winner = other(p);
  s.phase = "over";
  s.prompt = null;
  info(s, `${pl(s, p).name} prehral – ${why}.`);
}

/** Zahrá postavu na pole (z ruky alebo cez [Trigger]); pri 6. postave treba jednu odhodiť. */
function putCharacter(s: GameState, iid: string) {
  const c = s.cards[iid];
  const x = pl(s, c.owner);
  x.hand = x.hand.filter((i) => i !== iid);
  x.life = x.life.filter((i) => i !== iid);
  c.rested = false;
  c.don = 0;
  c.playedTurn = s.turn;
  x.characters.push(iid);
  emit(s, { t: "CardPlayed", p: c.owner, iid });
  queueWhen(s, iid, "onPlay");
  if (x.characters.length > MAX_CHARS) s.prompt = { kind: "trashCharacter", p: c.owner, options: x.characters.filter((i) => i !== iid) };
}

// ------------------------------------------------------------------ interpret DSL
/** Vykoná krok vrchného rámca. Vráti false, ak engine čaká na odpoveď hráča. */
function execStep(s: GameState, f: Frame, st: Step): boolean {
  const p = f.controller;
  const vars = (v: string) => (v === "self" ? [f.source] : f.vars[v] ?? []);
  switch (st.op) {
    case "choose": {
      const opts = candidates(s, st.filter, f.source, p);
      if (!opts.length || st.max === 0) {
        f.vars[st.var] = [];
        return true;
      }
      s.prompt = { kind: "choose", p, label: st.label, options: opts, min: Math.min(st.min, opts.length), max: Math.min(st.max, opts.length) };
      return false;
    }
    case "draw":
      draw(s, p, st.n);
      return true;
    case "ko":
      vars(st.var).forEach((i) => ko(s, i));
      return true;
    case "rest":
      vars(st.var).forEach((i) => (s.cards[i].rested = true));
      return true;
    case "bounce":
      vars(st.var).forEach((i) => bounce(s, i));
      return true;
    case "bounceMine":
      pl(s, p).characters.filter((i) => st.names.includes(def(s, i).name)).forEach((i) => bounce(s, i));
      return true;
    case "power":
      vars(st.var).forEach((i) => addMod(s, { target: i, kind: "power", amount: st.amount, until: st.until, owner: p }));
      return true;
    case "setBasePower": {
      const L = pl(s, p).leader;
      if (!st.trait || def(s, L).traits.includes(st.trait)) addMod(s, { target: L, kind: "basePower", amount: st.value, until: st.until, owner: p });
      return true;
    }
    case "addDon":
      addDon(s, p, st.n, st.state);
      return true;
    case "giveDon": {
      if (!pl(s, p).donRested) return true;
      s.prompt = { kind: "choose", p, label: st.label, options: [pl(s, p).leader, ...pl(s, p).characters], min: 0, max: 1 };
      return false;
    }
    case "restOppDonOrChar": {
      const o = other(p);
      const opts = [...(pl(s, o).donActive ? ["don"] : []), ...pl(s, o).characters.filter((i) => !s.cards[i].rested && cost(s, i) <= st.maxCost)];
      if (!opts.length) return true;
      s.prompt = { kind: "choose", p, label: `Daj do rest súperov DON!! alebo postavu s cost ≤ ${st.maxCost}`, options: opts, min: 0, max: 1 };
      return false;
    }
    case "noBlocker":
      if (s.battle) addMod(s, { target: s.battle.attacker, kind: st.minPower ? "noBlockerMinPower" : "noBlocker", amount: st.minPower ?? 0, until: "battle", owner: p });
      return true;
    case "noBlockerThisTurn":
      vars(st.var).forEach((i) => addMod(s, { target: i, kind: "noBlocker", amount: 0, until: "turn", owner: p }));
      return true;
    case "playSelf":
      if (def(s, f.source).type === "Character") putCharacter(s, f.source);
      f.kind = "ability"; // karta už nejde do trashu
      return true;
    case "runMain": {
      const k = def(s, f.source).abilities.findIndex((a) => a.when === "main");
      if (k >= 0) {
        const a = def(s, f.source).abilities[k];
        // [Trigger] Activate this card's [Main] effect – bez ceny za zahranie, ale s cenou efektu (napr. DON!! −2)
        s.stack.push({ ...f, steps: a.steps ?? [], pc: 0, vars: {}, costs: a.cost ?? [], ci: 0, optional: !!a.optional, asked: false, kind: "ability" });
      }
      return true;
    }
    case "if": {
      // vetvu vložíme hneď ZA podmienku (rámec má vlastnú kópiu krokov, definícia karty sa nemení)
      const branch = evalCond(s, st.cond, f.source, p) ? st.then : st.else ?? [];
      f.steps = [...f.steps.slice(0, f.pc + 1), ...branch, ...f.steps.slice(f.pc + 1)];
      return true;
    }
  }
}

const canPayDon = (s: GameState, p: P, n: number) => donOnField(s, p) >= n;

/** Hlavná slučka: vykonáva efekty, reakcie, súboj a kontroly, kým netreba odpoveď hráča. */
function run(s: GameState) {
  for (let guard = 0; guard < 10000; guard++) {
    if (s.winner != null || s.prompt) return;
    const f = s.stack[s.stack.length - 1];
    if (f) {
      // 1) ceny
      if (f.ci < f.costs.length) {
        const c = f.costs[f.ci];
        const payable = c.op === "payDon" ? canPayDon(s, f.controller, c.n) : !s.cards[f.source].rested;
        if (!payable) {
          info(s, `${f.label}: cenu nie je možné zaplatiť.`);
          finishFrame(s, f, false);
          continue;
        }
        if (f.optional && !f.asked) {
          s.prompt = { kind: "payCost", p: f.controller, label: `${f.label}: ${c.op === "payDon" ? `DON!! −${c.n}${c.atLeast ? " alebo viac" : ""}` : "dať do rest"} – použiť efekt?` };
          return;
        }
        if (c.op === "payDon") {
          s.prompt = { kind: "donSource", p: f.controller, n: c.n, atLeast: !!c.atLeast, label: `${f.label}: vyber DON!! na vrátenie` };
          return;
        }
        s.cards[f.source].rested = true;
        f.ci++;
        continue;
      }
      if (f.optional && !f.asked && !f.costs.length) {
        f.asked = true; // „You may“ bez ceny – zjednodušene áno
      }
      // 2) kroky
      if (f.pc < f.steps.length) {
        const st = f.steps[f.pc];
        if (execStep(s, f, st)) f.pc++;
        continue;
      }
      finishFrame(s, f, true);
      continue;
    }
    // 3) fronta reakcií – hráč na ťahu prvý, pri viacerých si vyberie poradie
    if (s.pending.length) {
      const mine = s.pending.filter((x) => x.controller === s.active);
      const group = mine.length ? mine : s.pending;
      if (group.length > 1) {
        s.prompt = { kind: "orderTriggers", p: group[0].controller, options: group.map((g) => s.pending.indexOf(g)) };
        return;
      }
      const next = group[0];
      s.pending.splice(s.pending.indexOf(next), 1);
      startPending(s, next);
      continue;
    }
    // 4) súboj
    if (s.battle) {
      if (battleStep(s)) continue;
      return;
    }
    return; // čaká sa na akciu hráča
  }
  throw new Error("Engine: nekonečná slučka");
}

function startPending(s: GameState, x: Pending) {
  if (!onField(s, x.source) && def(s, x.source).abilities[x.ability].when !== "onKO") return; // karta medzitým odišla
  startAbility(s, x.source, x.controller, x.ability);
}

function finishFrame(s: GameState, f: Frame, done: boolean) {
  s.stack.pop();
  // event karta po vykonaní ide do trashu
  if ((f.kind === "mainEvent" || f.kind === "counterEvent" || f.kind === "triggerEvent") && def(s, f.source).type === "Event") {
    const x = pl(s, ownerOf(s, f.source));
    if (!x.trash.includes(f.source)) x.trash.push(f.source);
  }
  void done;
}

// ------------------------------------------------------------------ súboj
function battleStep(s: GameState): boolean {
  const b = s.battle!;
  const def_ = other(s.active);
  if (b.step === "whenAttacking") {
    b.step = "block";
    const blockers = blockersFor(s);
    if (blockers.length) {
      s.prompt = { kind: "blocker", p: def_, options: blockers };
      return false;
    }
    b.step = "counter";
    return true;
  }
  if (b.step === "block") {
    b.step = "counter";
    return true;
  }
  if (b.step === "counter") {
    if (counterOptions(s, def_).length) {
      s.prompt = { kind: "counter", p: def_ };
      return false;
    }
    b.step = "damage";
    return true;
  }
  if (b.step === "damage") {
    b.step = "done";
    resolveDamage(s);
    return true;
  }
  // koniec súboja
  s.mods = s.mods.filter((m) => m.until !== "battle");
  s.battle = null;
  s.phase = s.winner != null ? "over" : "main";
  return true;
}

export function blockersFor(s: GameState): string[] {
  const b = s.battle!;
  const d = other(s.active);
  if (s.mods.some((m) => m.target === b.attacker && m.kind === "noBlocker")) return [];
  const minP = s.mods.filter((m) => m.target === b.attacker && m.kind === "noBlockerMinPower").map((m) => m.amount);
  return pl(s, d).characters.filter(
    (i) => i !== b.target && !s.cards[i].rested && hasKw(s, i, "blocker") && !minP.some((mp) => power(s, i) >= mp),
  );
}

/** Karty v ruke, ktoré sa dajú použiť ako counter (postavy s counter hodnotou, [Counter] eventy, ktoré viem zaplatiť). */
export function counterOptions(s: GameState, p: P): string[] {
  const x = pl(s, p);
  return x.hand.filter((i) => {
    const d = def(s, i);
    if (d.type === "Character") return d.counter > 0;
    if (d.type === "Event") return d.abilities.some((a) => a.when === "counter") && x.donActive >= d.cost;
    return false;
  });
}

function resolveDamage(s: GameState) {
  const b = s.battle!;
  const tp = ownerOf(s, b.target);
  if (b.hitsLeft == null) {
    const atk = power(s, b.attacker);
    const tgt = power(s, b.target);
    if (atk < tgt) return info(s, `Útok ${atk} < ${tgt} – bez účinku.`);
    if (def(s, b.target).type !== "Leader") return ko(s, b.target);
    b.hitsLeft = hasKw(s, b.attacker, "doubleAttack") ? 2 : 1;
  }
  while (b.hitsLeft! > 0) {
    b.hitsLeft!--;
    const x = pl(s, tp);
    if (!x.life.length) return lose(s, tp, "dostal zásah s 0 Life");
    const card = x.life.shift()!;
    emit(s, { t: "LifeDamage", p: tp, n: 1 });
    if (hasKw(s, b.attacker, "banish")) {
      x.trash.push(card);
      continue;
    }
    x.hand.push(card); // Life karta ide do ruky; ak má [Trigger], hráč sa môže rozhodnúť ju aktivovať
    if (def(s, card).abilities.some((a) => a.when === "trigger")) {
      s.prompt = { kind: "trigger", p: tp, iid: card };
      if (b.hitsLeft! > 0) b.step = "damage"; // ďalší zásah po vyriešení triggeru
      return;
    }
  }
}

// ------------------------------------------------------------------ ťahy a fázy
function startTurn(s: GameState) {
  s.turn++;
  const p = s.active;
  const x = pl(s, p);
  // Refresh: DON!! z kariet späť do cost area, všetko aktívne
  for (const i of fieldOf(s, p)) {
    x.donActive += s.cards[i].don;
    s.cards[i].don = 0;
    s.cards[i].rested = false;
  }
  x.donActive += x.donRested;
  x.donRested = 0;
  // Draw (prvý hráč v 1. ťahu neťahá)
  if (s.turn > 1) draw(s, p, 1);
  if (s.winner != null) return;
  // DON!! fáza: +2, prvý ťah hry +1
  addDon(s, p, s.turn === 1 ? 1 : 2, "active");
  s.phase = "main";
  run(s);
}

function endTurn(s: GameState) {
  const p = s.active;
  s.phase = "end";
  fieldOf(s, p).forEach((i) => queueWhen(s, i, "endOfTurn"));
  run(s);
  if (s.prompt) return; // efekty na konci ťahu čakajú na voľbu
  // modifikátory: „do konca ťahu“ končia; „do konca súperovej ďalšej End fázy“ končia v End fáze súpera
  s.mods = s.mods.filter((m) => m.until !== "turn" && !(m.until === "oppNextEndPhase" && m.owner !== p));
  s.usedOnce = [];
  s.donReturnedThisTurn = [0, 0];
  s.active = other(p);
  startTurn(s);
}

function setupLife(s: GameState) {
  for (const p of [0, 1] as P[]) {
    const x = pl(s, p);
    const n = def(s, x.leader).life || 5;
    x.life = x.deck.splice(0, n).reverse(); // vrch balíčka ide na spodok Life
  }
  s.active = s.first;
  startTurn(s);
}

// ------------------------------------------------------------------ akcie hráča
export class IllegalAction extends Error {}
const fail = (msg: string): never => {
  throw new IllegalAction(msg);
};

export function applyAction(state: GameState, a: Action): GameState {
  if (state.winner != null) fail("Hra skončila.");
  const s = clone(state);
  if (s.prompt) {
    if (a.type !== "answer") fail("Engine čaká na odpoveď.");
    if (s.prompt.p !== a.p) fail("Na rade je druhý hráč.");
    answer(s, (a as any).choice as AnswerChoice);
    if (!s.prompt) run(s);
    return s;
  }
  if (a.type === "answer") fail("Nie je na čo odpovedať.");
  if (a.type === "mulligan") fail("Mulligan nie je teraz možný.");
  if (a.p !== s.active) fail("Nie si na ťahu.");
  if (s.phase !== "main" || s.stack.length || s.pending.length || s.battle) fail("Teraz sa to nedá.");
  const x = pl(s, a.p);
  switch (a.type) {
    case "play": {
      if (!x.hand.includes(a.iid)) fail("Karta nie je v ruke.");
      const d = def(s, a.iid);
      if (d.type === "Event" && !d.abilities.some((ab) => ab.when === "main") && d.scripted) fail("Tento event sa nedá zahrať v Main fáze.");
      const c = handCost(s, a.iid);
      if (x.donActive < c) fail(`Potrebuješ ${c} aktívnych DON!!.`);
      x.donActive -= c;
      x.donRested += c;
      if (d.type === "Character") putCharacter(s, a.iid);
      else if (d.type === "Stage") {
        x.hand = x.hand.filter((i) => i !== a.iid);
        if (x.stage) (leaveField(s, x.stage), x.trash.push(x.stage));
        x.stage = a.iid;
        s.cards[a.iid].playedTurn = s.turn;
        emit(s, { t: "CardPlayed", p: a.p, iid: a.iid });
        queueWhen(s, a.iid, "onPlay");
      } else {
        x.hand = x.hand.filter((i) => i !== a.iid);
        emit(s, { t: "CardPlayed", p: a.p, iid: a.iid });
        const k = d.abilities.findIndex((ab) => ab.when === "main");
        if (k >= 0) startAbility(s, a.iid, a.p, k, "mainEvent");
        else x.trash.push(a.iid);
      }
      break;
    }
    case "attachDon": {
      if (!x.donActive) fail("Nemáš aktívny DON!!.");
      if (!fieldOf(s, a.p).includes(a.target) || a.target === x.stage) fail("DON!! sa dá dať len na leadera alebo postavu.");
      x.donActive--;
      s.cards[a.target].don++;
      break;
    }
    case "activate": {
      if (!fieldOf(s, a.p).includes(a.iid)) fail("Karta nie je na tvojom poli.");
      const ab = def(s, a.iid).abilities[a.ability];
      if (!ab || ab.when !== "activateMain") fail("Táto schopnosť sa nedá aktivovať.");
      if (ab.oncePerTurn && s.usedOnce.includes(`${a.iid}:${a.ability}`)) fail("Už použité tento ťah.");
      if (!evalCond(s, ab.cond, a.iid, a.p)) fail("Podmienka nie je splnená.");
      startAbility(s, a.iid, a.p, a.ability);
      break;
    }
    case "attack": {
      if (s.turn <= 2) fail("V prvom ťahu každého hráča sa neútočí.");
      if (!fieldOf(s, a.p).includes(a.attacker) || a.attacker === x.stage) fail("Útočiť môže leader alebo postava.");
      const at = s.cards[a.attacker];
      if (at.rested) fail("Útočník je v rest.");
      if (def(s, a.attacker).type === "Character" && at.playedTurn === s.turn && !hasKw(s, a.attacker, "rush")) fail("Postava zahraná tento ťah nemôže útočiť (bez [Rush]).");
      const o = other(a.p);
      const tg = a.target;
      const okTarget = tg === pl(s, o).leader || (pl(s, o).characters.includes(tg) && s.cards[tg].rested);
      if (!okTarget) fail("Cieľ musí byť súperov leader alebo postava v rest.");
      at.rested = true;
      s.phase = "battle";
      s.battle = { attacker: a.attacker, target: tg, step: "whenAttacking", counterPower: 0 };
      emit(s, { t: "Attack", attacker: a.attacker, target: tg });
      queueWhen(s, a.attacker, "whenAttacking");
      break;
    }
    case "endTurn":
      endTurn(s);
      return s;
  }
  run(s);
  return s;
}

// ------------------------------------------------------------------ odpovede na prompty
function answer(s: GameState, ch: AnswerChoice) {
  const pr = s.prompt!;
  const f = s.stack[s.stack.length - 1];
  s.prompt = null;
  switch (pr.kind) {
    case "mulligan": {
      const x = pl(s, pr.p);
      if ((ch as any).yes === true) {
        // vráť ruku, zamiešaj, potiahni 5
        x.deck.push(...x.hand);
        x.hand = [];
        const [d, seed] = shuffle(x.deck, s.seed);
        s.seed = seed;
        x.deck = d;
        x.hand = x.deck.splice(0, 5);
      }
      x.mulliganDone = true;
      const o = other(pr.p);
      if (!pl(s, o).mulliganDone) s.prompt = { kind: "mulligan", p: o };
      else setupLife(s);
      return;
    }
    case "payCost": {
      f.asked = true;
      if (!(ch as any).yes) finishFrame(s, f, false);
      return;
    }
    case "donSource": {
      const d = (ch as any).don as { active: number; rested: number; attached: Record<string, number> };
      if (!d) return fail("Chýba výber DON!!.");
      const x = pl(s, pr.p);
      const total = d.active + d.rested + Object.values(d.attached).reduce((a, b) => a + b, 0);
      if (pr.atLeast ? total < pr.n : total !== pr.n) return fail(`Vráť ${pr.atLeast ? "aspoň " : ""}${pr.n} DON!!.`);
      if (d.active > x.donActive || d.rested > x.donRested) return fail("Toľko DON!! nemáš.");
      for (const [iid, n] of Object.entries(d.attached))
        if (!fieldOf(s, pr.p).includes(iid) || s.cards[iid].don < n) return fail("Na karte nie je toľko DON!!.");
      x.donActive -= d.active;
      x.donRested -= d.rested;
      for (const [iid, n] of Object.entries(d.attached)) s.cards[iid].don -= n;
      x.donDeck += total;
      f.ci++;
      emit(s, { t: "DonReturned", p: pr.p, n: total }); // ← tu môžu zareagovať iné karty (napr. leader OP09-061)
      return;
    }
    case "choose": {
      const pick = ((ch as any).pick ?? []) as string[];
      if (pick.some((i) => !pr.options.includes(i)) || pick.length < pr.min || pick.length > pr.max) return fail("Neplatný výber.");
      const st = f.steps[f.pc];
      if (st.op === "giveDon") {
        const x = pl(s, pr.p);
        if (pick[0]) {
          const n = Math.min(st.n, x.donRested);
          x.donRested -= n;
          s.cards[pick[0]].don += n;
        }
      } else if (st.op === "restOppDonOrChar") {
        const o = pl(s, other(pr.p));
        if (pick[0] === "don") (o.donActive--, o.donRested++);
        else if (pick[0]) s.cards[pick[0]].rested = true;
      } else if (st.op === "choose") f.vars[st.var] = pick;
      f.pc++;
      return;
    }
    case "orderTriggers": {
      const k = (ch as any).order as number;
      if (!pr.options.includes(k)) return fail("Neplatné poradie.");
      const [x] = s.pending.splice(k, 1);
      startPending(s, x);
      return;
    }
    case "blocker": {
      const pick = ((ch as any).pick ?? []) as string[];
      if (pick[0]) {
        if (!pr.options.includes(pick[0])) return fail("Tento blocker sa nedá použiť.");
        s.cards[pick[0]].rested = true;
        s.battle!.target = pick[0];
        info(s, `${def(s, pick[0]).name} blokuje.`);
      }
      return;
    }
    case "counter": {
      const used = ((ch as any).counter ?? []) as string[];
      const x = pl(s, pr.p);
      const b = s.battle!;
      if (!used.length) {
        b.step = "damage";
        return;
      }
      for (const iid of used) {
        if (!counterOptions(s, pr.p).includes(iid)) return fail("Túto kartu nemôžeš použiť ako counter.");
        const d = def(s, iid);
        x.hand = x.hand.filter((i) => i !== iid);
        if (d.type === "Character") {
          x.trash.push(iid);
          addMod(s, { target: b.target, kind: "power", amount: d.counter, until: "battle", owner: pr.p });
        } else {
          x.donActive -= d.cost;
          x.donRested += d.cost;
          const k = d.abilities.findIndex((a) => a.when === "counter");
          startAbility(s, iid, pr.p, k, "counterEvent");
        }
      }
      // po vyriešení counterov sa engine znovu opýta (ďalší counter alebo nič)
      return;
    }
    case "trigger": {
      const x = pl(s, pr.p);
      if ((ch as any).yes) {
        const k = def(s, pr.iid).abilities.findIndex((a) => a.when === "trigger");
        x.hand = x.hand.filter((i) => i !== pr.iid);
        startAbility(s, pr.iid, pr.p, k, def(s, pr.iid).type === "Event" ? "triggerEvent" : "ability");
        // Trigger postavy, ktorá sa nezahrá, ide do trashu
        if (def(s, pr.iid).type !== "Event" && !def(s, pr.iid).abilities[k].steps?.some((st) => st.op === "playSelf")) x.trash.push(pr.iid);
      }
      return;
    }
    case "trashCharacter": {
      const pick = ((ch as any).pick ?? []) as string[];
      if (!pick[0] || !pr.options.includes(pick[0])) return fail("Vyber postavu na odhodenie.");
      leaveField(s, pick[0]);
      pl(s, pr.p).trash.push(pick[0]);
      return;
    }
  }
}

// ------------------------------------------------------------------ pomoc pre UI a testy
/** Pohľad hráča: súperova ruka, balíčky a Life sú skryté. */
export function viewFor(s: GameState, p: P) {
  const o = other(p);
  const v = clone(s);
  v.players[o].hand = v.players[o].hand.map(() => "hidden");
  v.players[o].deck = v.players[o].deck.map(() => "hidden");
  v.players[p].deck = v.players[p].deck.map(() => "hidden");
  v.players[0].life = v.players[0].life.map(() => "hidden");
  v.players[1].life = v.players[1].life.map(() => "hidden");
  return v;
}

/** Legálne akcie v Main fáze (pre UI a simulácie). */
export function mainActions(s: GameState): Action[] {
  if (s.prompt || s.winner != null || s.phase !== "main" || s.stack.length || s.pending.length) return [];
  const p = s.active;
  const x = pl(s, p);
  const out: Action[] = [];
  for (const i of x.hand) {
    const d = def(s, i);
    if (handCost(s, i) > x.donActive) continue;
    if (d.type === "Event" && !d.abilities.some((a) => a.when === "main")) continue;
    out.push({ type: "play", p, iid: i });
  }
  if (x.donActive) for (const t of [x.leader, ...x.characters]) out.push({ type: "attachDon", p, target: t });
  for (const i of fieldOf(s, p))
    def(s, i).abilities.forEach((a, k) => {
      if (a.when === "activateMain" && !(a.oncePerTurn && s.usedOnce.includes(`${i}:${k}`)) && evalCond(s, a.cond, i, p)) out.push({ type: "activate", p, iid: i, ability: k });
    });
  if (s.turn > 2) {
    const o = pl(s, other(p));
    const targets = [o.leader, ...o.characters.filter((i) => s.cards[i].rested)];
    for (const at of [x.leader, ...x.characters]) {
      const c = s.cards[at];
      if (c.rested) continue;
      if (def(s, at).type === "Character" && c.playedTurn === s.turn && !hasKw(s, at, "rush")) continue;
      for (const t of targets) out.push({ type: "attack", p, attacker: at, target: t });
    }
  }
  out.push({ type: "endTurn", p });
  return out;
}

/** Event, ktorý sa práve vykonáva (už nie je v ruke, do trashu ide po dokončení). */
export function resolving(s: GameState, p: P): string[] {
  const x = pl(s, p);
  const zones = new Set([...x.hand, ...x.trash, ...x.characters, ...x.life, ...x.deck]);
  return [...new Set(s.stack.filter((f) => f.kind !== "ability" && ownerOf(s, f.source) === p && !zones.has(f.source)).map((f) => f.source))];
}

/** Celkový počet kariet hráča (invariant pre testy) – vrátane eventu vo vykonávaní. */
export function cardCount(s: GameState, p: P) {
  const x = pl(s, p);
  return 1 + x.deck.length + x.hand.length + x.trash.length + x.life.length + x.characters.length + (x.stage ? 1 : 0) + resolving(s, p).length;
}
