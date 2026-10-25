// Herný engine One Piece TCG. Princípy: DESIGN.md
// Stav je čisté dáta; applyAction() vracia nový stav (vstupný stav sa nemení).
import { shuffle } from "./rng";
import { CUSTOM } from "./custom";
import {
  Ability, Action, AnswerChoice, CardDef, CardFlag, Cond, Filter, Frame, GameEvent, GameState, Inst, Keyword, Listen,
  Modifier, Num, other, P, Pending, PlayerFlag, PlayerState, Side, StaticMod, Step, Until, Zone,
} from "./types";

const MAX_DON = 10;
const MAX_CHARS = 5;

// ------------------------------------------------------------------ setup
export type DeckInput = { name: string; leader: string; cards: string[] };

export function newGame(decks: [DeckInput, DeckInput], defs: Record<string, CardDef>, seed = Date.now() % 2147483647, first: P = 0): GameState {
  const s: GameState = {
    seed, turn: 0, active: first, first, phase: "setup",
    players: [null as any, null as any], cards: {}, defs, mods: [], stack: [], pending: [], prompt: null,
    battle: null, usedOnce: [], donReturnedThisTurn: [0, 0], turnCount: [0, 0], look: null, delayed: [],
    log: [], winner: null, nextId: 1,
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
    const donMax = defs[d.leader]?.rules?.donDeck ?? MAX_DON;
    s.players[p] = {
      name: d.name, leader, deck, hand: [], trash: [], life: [], characters: [], stage: null,
      donDeck: donMax, donActive: 0, donRested: 0, donMax, mulliganDone: false, flags: [], extraTurn: false, handTrashedTurn: -1,
    };
    s.players[p].hand = s.players[p].deck.splice(0, 5);
  });
  s.prompt = { kind: "mulligan", p: first };
  return s;
}

/** Hlboká kópia – engine nikdy nemení vstupný stav. Definície kariet sa nemenia → zdieľajú sa. */
const clone = (s: GameState): GameState => {
  const { defs, ...rest } = s;
  return { ...structuredClone(rest), defs } as GameState;
};

// ------------------------------------------------------------------ pomocné
export const def = (s: GameState, iid: string): CardDef => s.defs[s.cards[iid].code];
export const pl = (s: GameState, p: P): PlayerState => s.players[p];
export const ownerOf = (s: GameState, iid: string): P => s.cards[iid].owner;
export const emit = (s: GameState, e: GameEvent) => {
  s.log.push(e);
  listen(s, e);
};
export const info = (s: GameState, msg: string) => s.log.push({ t: "Info", msg });
export const fieldOf = (s: GameState, p: P): string[] => {
  const x = pl(s, p);
  return [x.leader, ...x.characters, ...(x.stage ? [x.stage] : [])];
};
export const donOnField = (s: GameState, p: P) => {
  const x = pl(s, p);
  return x.donActive + x.donRested + fieldOf(s, p).reduce((a, i) => a + s.cards[i].don, 0);
};
export const onField = (s: GameState, iid: string) => fieldOf(s, ownerOf(s, iid)).includes(iid);
const sideP = (side: Side | undefined, p: P): P[] => (side === "opp" ? [other(p)] : side === "any" ? [p, other(p)] : [p]);
const nameOf = (s: GameState, iid: string) => def(s, iid).name;
const hasName = (d: CardDef, n: string) => d.name === n || d.names.includes(n);
const flagOn = (s: GameState, iid: string, flag: CardFlag) => s.mods.some((m) => m.target === iid && m.kind === "flag" && m.flag === flag);
export const playerFlag = (s: GameState, p: P, flag: PlayerFlag) => pl(s, p).flags.some((f) => f.flag === flag);

/** Schopnosti karty – negované karty nemajú žiadne. */
export function abilitiesOf(s: GameState, iid: string): Ability[] {
  if (flagOn(s, iid, "negated")) return [];
  return def(s, iid).abilities;
}

/** Kde je karta: hráč a zóna. */
export function zoneOf(s: GameState, iid: string): { p: P; zone: Zone } | null {
  const p = ownerOf(s, iid);
  const x = pl(s, p);
  if (x.leader === iid) return { p, zone: "leader" };
  if (x.characters.includes(iid)) return { p, zone: "characters" };
  if (x.stage === iid) return { p, zone: "stage" };
  if (x.hand.includes(iid)) return { p, zone: "hand" };
  if (x.trash.includes(iid)) return { p, zone: "trash" };
  if (x.life.includes(iid)) return { p, zone: "life" };
  if (x.deck.includes(iid)) return { p, zone: "deck" };
  if (s.look?.iids.includes(iid)) return { p, zone: "look" };
  return null;
}
/** Vyberie kartu z jej aktuálnej zóny (bez udalostí). */
function detach(s: GameState, iid: string) {
  const x = pl(s, ownerOf(s, iid));
  const c = s.cards[iid];
  if (x.characters.includes(iid) || x.stage === iid) leaveField(s, iid);
  x.hand = x.hand.filter((i) => i !== iid);
  x.trash = x.trash.filter((i) => i !== iid);
  if (x.life.includes(iid)) {
    x.life = x.life.filter((i) => i !== iid);
    emit(s, { t: "LifeRemoved", p: c.owner });
  }
  x.deck = x.deck.filter((i) => i !== iid);
  if (s.look) s.look.iids = s.look.iids.filter((i) => i !== iid);
  c.faceUp = false;
}

// ------------------------------------------------------------------ čísla, filtre, podmienky
export type Ctx = { src: string; p: P; vars: Record<string, string[]>; flags?: string[] };
const ctxOf = (f: Frame): Ctx => ({ src: f.source, p: f.controller, vars: f.vars, flags: f.flags });

export function evalNum(s: GameState, n: Num, c: Ctx): number {
  if (typeof n === "number") return n;
  const sp = (side?: Side) => (side === "opp" ? other(c.p) : c.p);
  switch (n.n) {
    case "donField":
      return n.side === "any" ? donOnField(s, 0) + donOnField(s, 1) : donOnField(s, sp(n.side));
    case "donActive":
      return pl(s, sp(n.side)).donActive;
    case "donGivenTotal":
      return fieldOf(s, sp(n.side)).reduce((a, i) => a + s.cards[i].don, 0);
    case "life":
      return pl(s, sp(n.side)).life.length;
    case "lifeBoth":
      return pl(s, 0).life.length + pl(s, 1).life.length;
    case "hand":
      return pl(s, sp(n.side)).hand.length;
    case "trash":
      return pl(s, sp(n.side)).trash.length;
    case "count":
      return candidates(s, n.f, c).length;
    case "varCount":
      return (c.vars[n.v] ?? []).length;
    case "varDon":
      return (c.vars[n.v] ?? []).reduce((a, i) => a + (s.cards[i]?.don ?? 0), 0);
    case "varPower": {
      const i = c.vars[n.v]?.[0];
      return i ? power(s, i) : 0;
    }
    case "varCost": {
      const i = c.vars[n.v]?.[0];
      return i ? (onField(s, i) ? cost(s, i) : def(s, i).cost) : 0;
    }
    case "mul":
      return evalNum(s, n.a, c) * n.k;
    case "div":
      return Math.floor(evalNum(s, n.a, c) / n.k);
    case "sub":
      return evalNum(s, n.a, c) - evalNum(s, n.b, c);
    case "add":
      return evalNum(s, n.a, c) + evalNum(s, n.b, c);
    case "restedCards": {
      const x = pl(s, c.p);
      return fieldOf(s, c.p).filter((i) => s.cards[i].rested).length + x.donRested;
    }
    case "distinctNames":
      return new Set(candidates(s, n.f, c).map((i) => nameOf(s, i))).size;
  }
}

function zoneList(s: GameState, z: Zone, p: P): string[] {
  const x = pl(s, p);
  switch (z) {
    case "characters":
      return [...x.characters];
    case "leader":
      return [x.leader];
    case "leaderOrCharacters":
      return [x.leader, ...x.characters];
    case "stage":
      return x.stage ? [x.stage] : [];
    case "field":
      return fieldOf(s, p);
    case "hand":
      return [...x.hand];
    case "trash":
      return [...x.trash];
    case "life":
      return [...x.life];
    case "deck":
      return [...x.deck];
    case "look":
      return s.look ? s.look.iids.filter((i) => ownerOf(s, i) === p) : [];
  }
}

const inRange = (v: number, r?: [number, number]) => !r || (v >= r[0] && v <= r[1]);
const asArr = <T,>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

export function matches(s: GameState, iid: string, f: Filter, c: Ctx): boolean {
  const d = def(s, iid);
  const inst = s.cards[iid];
  const field = onField(s, iid);
  if (f.self && iid !== c.src) return false;
  if (f.notSelf && iid === c.src) return false;
  if (f.type && !asArr(f.type).includes(d.type)) return false;
  if (f.name && !asArr(f.name).some((n) => hasName(d, n))) return false;
  if (f.notName && asArr(f.notName).some((n) => hasName(d, n))) return false;
  if (f.trait && !asArr(f.trait).some((t) => d.traits.includes(t))) return false;
  if (f.traitIncl && !d.traitText.toLowerCase().includes(f.traitIncl.toLowerCase())) return false;
  if (f.color && !d.colors.includes(f.color)) return false;
  if (f.attribute && !d.attribute.toLowerCase().includes(f.attribute.toLowerCase())) return false;
  const needCost = f.cost || f.costLeq != null || f.costGeq != null;
  const cv = needCost ? (field && d.type === "Character" ? cost(s, iid) : d.cost) : d.cost;
  if (f.cost && (d.type === "Leader" || !inRange(cv, f.cost))) return false;
  if (f.baseCost && (d.type === "Leader" || !inRange(d.cost, f.baseCost))) return false;
  if (f.costLeq != null && (d.type === "Leader" || cv > evalNum(s, f.costLeq, c))) return false;
  if (f.costGeq != null && (d.type === "Leader" || cv < evalNum(s, f.costGeq, c))) return false;
  if (f.power && (d.type === "Event" || d.type === "Stage" || !inRange(field ? power(s, iid) : d.power, f.power))) return false;
  if (f.basePower && (d.type === "Event" || d.type === "Stage" || !inRange(field ? basePower(s, iid) : d.power, f.basePower))) return false;
  if (f.rested != null && inst.rested !== f.rested) return false;
  if (f.keyword && !hasKw(s, iid, f.keyword)) return false;
  if (f.hasTrigger && !d.hasTrigger) return false;
  if (f.noCounter && d.counter > 0) return false;
  if (f.donGiven != null && inst.don < f.donGiven) return false;
  if (f.notIn && (c.vars[f.notIn] ?? []).includes(iid)) return false;
  if (f.printedPower && (d.type === "Event" || d.type === "Stage" || !inRange(d.power, f.printedPower))) return false;
  if (f.any && !f.any.some((g) => matches(s, iid, { ...g, zone: f.zone, side: f.side }, c))) return false;
  return true;
}

export function candidates(s: GameState, f: Filter, c: Ctx): string[] {
  const out: string[] = [];
  for (const p of sideP(f.side, c.p)) for (const i of zoneList(s, f.zone, p)) if (matches(s, i, f, c)) out.push(i);
  return out;
}

export function evalCond(s: GameState, k: Cond | undefined, c: Ctx): boolean {
  if (!k) return true;
  switch (k.c) {
    case "donAttached":
      return (s.cards[c.src]?.don ?? 0) >= k.n; // DON!! ostávajú pripojené aj počas súperovho ťahu
    case "turn":
      return k.who === "mine" ? s.active === c.p : s.active !== c.p;
    case "cmp": {
      const a = evalNum(s, k.a, c);
      const b = evalNum(s, k.b, c);
      return k.op === ">=" ? a >= b : k.op === "<=" ? a <= b : k.op === "==" ? a === b : k.op === ">" ? a > b : a < b;
    }
    case "leader": {
      const L = pl(s, k.f.side === "opp" ? other(c.p) : c.p).leader;
      return matches(s, L, { ...k.f, side: undefined }, c);
    }
    case "multicolor":
      return def(s, pl(s, k.side === "opp" ? other(c.p) : c.p).leader).colors.length > 1;
    case "exists":
      return candidates(s, k.f, c).length >= (k.min ?? 1);
    case "none":
      return candidates(s, k.f, c).length === 0;
    case "selfPlayedThisTurn":
      return s.cards[c.src].playedTurn === s.turn && onField(s, c.src);
    case "selfRested":
      return s.cards[c.src].rested;
    case "secondTurnOrLater":
      return s.turnCount[c.p] >= 2;
    case "faceUpLife":
      return pl(s, k.side === "opp" ? other(c.p) : c.p).life.some((i) => s.cards[i].faceUp);
    case "onlyChars":
      return pl(s, c.p).characters.every((i) => matches(s, i, k.f, c));
    case "flag":
      return !!c.flags?.includes(k.flag);
    case "handTrashedThisTurn":
      return pl(s, c.p).handTrashedTurn === s.turn;
    case "attackerIs":
      return !!s.battle && matches(s, s.battle.attacker, { ...k.f, side: "any" }, c);
    case "targetIs":
      return !!s.battle && matches(s, s.battle.target, { ...k.f, side: "any" }, c);
    case "and":
      return k.all.every((x) => evalCond(s, x, c));
    case "or":
      return k.any.some((x) => evalCond(s, x, c));
    case "not":
      return !evalCond(s, k.x, c);
  }
}

// ------------------------------------------------------------------ trvalé efekty a prepočty
let depth = 0; // poistka proti rekurzii (podmienka statiky sa pýta na power, ktorá počíta statiky…)

type ActiveStatic = { src: string; p: P; m: StaticMod };
/** Odtlačok stavu, od ktorého závisia trvalé efekty – na cache výpočtu (inak by sa podmienky vnárali exponenciálne). */
function fingerprint(s: GameState): string {
  let h = `${s.turn}|${s.active}|${s.battle?.attacker ?? ""}`;
  for (const p of [0, 1] as P[]) {
    const x = s.players[p];
    h += `|${x.leader},${x.characters.join(",")},${x.stage ?? ""},${x.life.length},${x.hand.join(",")},${x.trash.length},${x.donActive},${x.donRested},${x.donDeck},${x.handTrashedTurn}`;
    for (const i of fieldOf(s, p)) h += `;${s.cards[i].don}${s.cards[i].rested ? "r" : ""}`;
    for (const i of x.life) if (s.cards[i]?.faceUp) h += "u";
  }
  for (const m of s.mods) h += `/${m.target}${m.kind[0]}${m.amount}${m.flag ?? m.kw ?? ""}`;
  return h;
}
const staticCache = new WeakMap<GameState, Map<string, ActiveStatic[]>>();

function activeStatics(s: GameState): ActiveStatic[] {
  if (depth > 2) return [];
  const key = `${depth}#${fingerprint(s)}`;
  let m = staticCache.get(s);
  const hit = m?.get(key);
  if (hit) return hit;
  const res = computeStatics(s);
  if (!m) staticCache.set(s, (m = new Map()));
  if (m.size > 64) m.clear();
  m.set(key, res);
  return res;
}
function computeStatics(s: GameState): ActiveStatic[] {
  depth++;
  try {
    const out: ActiveStatic[] = [];
    for (const p of [0, 1] as P[])
      for (const src of fieldOf(s, p))
        for (const a of abilitiesOf(s, src))
          if (a.when === "static" && a.mods && evalCond(s, a.cond, { src, p, vars: {} })) for (const m of a.mods) out.push({ src, p, m });
    return out;
  } finally {
    depth--;
  }
}
function staticTargets(s: GameState, st: ActiveStatic, iid: string, m: { f: Filter }): boolean {
  depth++;
  try {
    return sideP(m.f.side, st.p).includes(ownerOf(s, iid)) && matches(s, iid, m.f, { src: st.src, p: st.p, vars: {} });
  } finally {
    depth--;
  }
}

export function basePower(s: GameState, iid: string): number {
  const set = s.mods.filter((m) => m.target === iid && m.kind === "basePower");
  if (set.length) return set[set.length - 1].amount;
  let v = def(s, iid).power;
  if (onField(s, iid)) for (const st of activeStatics(s)) if (st.m.stat === "basePower" && staticTargets(s, st, iid, st.m)) v = st.m.value;
  return v;
}

export function power(s: GameState, iid: string): number {
  const c = s.cards[iid];
  let v = basePower(s, iid);
  if (s.active === c.owner) v += c.don * 1000;
  for (const m of s.mods) if (m.target === iid && m.kind === "power") v += m.amount;
  for (const st of activeStatics(s))
    if (st.m.stat === "power" && staticTargets(s, st, iid, st.m)) v += evalNum(s, st.m.amount, { src: st.src, p: st.p, vars: {} });
  return Math.max(0, v);
}

export function cost(s: GameState, iid: string): number {
  let v = def(s, iid).cost;
  for (const m of s.mods) if (m.target === iid && m.kind === "cost") v += m.amount;
  for (const st of activeStatics(s))
    if (st.m.stat === "cost" && staticTargets(s, st, iid, st.m)) v += evalNum(s, st.m.amount, { src: st.src, p: st.p, vars: {} });
  return Math.max(0, v);
}

export function handCost(s: GameState, iid: string): number {
  const d = def(s, iid);
  const p = ownerOf(s, iid);
  let v = d.cost;
  for (const a of d.abilities)
    if (a.when === "static" && a.mods && evalCond(s, a.cond, { src: iid, p, vars: {} }))
      for (const m of a.mods) if (m.stat === "handCost") v += evalNum(s, m.amount, { src: iid, p, vars: {} });
  if (playerFlag(s, p, "lawDiscount2") && hasName(d, "Trafalgar Law") && d.type === "Character" && d.cost >= 4) v -= 2;
  return Math.max(0, v);
}

/** Counter karty v ruke (s trvalými efektmi). */
export function counterOf(s: GameState, iid: string): number {
  const d = def(s, iid);
  const p = ownerOf(s, iid);
  let v = d.counter;
  for (const a of d.abilities)
    if (a.when === "static" && a.mods && evalCond(s, a.cond, { src: iid, p, vars: {} }))
      for (const m of a.mods) if (m.stat === "selfCounter") v += m.add;
  for (const st of activeStatics(s))
    if (st.m.stat === "counter" && st.p === p && matches(s, iid, st.m.f, { src: st.src, p: st.p, vars: {} })) {
      if (st.m.set != null) v = st.m.set;
      if (st.m.add != null) v += st.m.add;
    }
  return v;
}

export function hasKw(s: GameState, iid: string, kw: Keyword): boolean {
  if (!flagOn(s, iid, "negated") && def(s, iid).keywords.includes(kw)) return true;
  if (s.mods.some((m) => m.target === iid && m.kind === "kw" && m.kw === kw)) return true;
  for (const st of activeStatics(s)) if (st.m.stat === "kw" && st.m.kw === kw && staticTargets(s, st, iid, st.m)) return true;
  return false;
}

function cannotAttack(s: GameState, iid: string): boolean {
  if (flagOn(s, iid, "cannotAttack")) return true;
  const d = def(s, iid);
  if (d.type === "Leader" && d.rules?.leaderCannotAttack && !flagOn(s, iid, "negated")) return true;
  for (const st of activeStatics(s)) if (st.m.stat === "cannotAttack" && staticTargets(s, st, iid, st.m)) return true;
  return false;
}
function protectedFromOpp(s: GameState, iid: string): boolean {
  for (const st of activeStatics(s)) if (st.m.stat === "protect" && staticTargets(s, st, iid, st.m)) return true;
  return false;
}

/** Súperove ciele útoku (Captain John obmedzí ciele). */
export function attackTargets(s: GameState, p: P): string[] {
  const o = pl(s, other(p));
  const all = [o.leader, ...o.characters.filter((i) => s.cards[i].rested)];
  const only: string[] = [];
  for (const st of activeStatics(s))
    if (st.m.stat === "attackOnly" && st.p === other(p)) for (const i of o.characters) if (staticTargets(s, st, i, st.m)) only.push(i);
  return only.length ? all.filter((i) => only.includes(i)) : all;
}

// ------------------------------------------------------------------ udalosti a fronta reakcií
function listenMatch(s: GameState, l: Listen, src: string, p: P, evP: P | null, card: string | null, n = 1): boolean {
  if (l.side === "me" && evP !== p) return false;
  if (l.side === "opp" && evP !== other(p)) return false;
  if (l.min != null && n < l.min) return false;
  if (l.f && (!card || !matches(s, card, { ...l.f, zone: l.f.zone }, { src, p, vars: {} }) || !sideP(l.f.side, p).includes(ownerOf(s, card)))) return false;
  return true;
}

function fire(s: GameState, ev: Listen["ev"], evP: P | null, card: string | null, n = 1) {
  for (const p of [0, 1] as P[])
    for (const src of fieldOf(s, p))
      abilitiesOf(s, src).forEach((a, k) => {
        if (a.when !== "onEvent" || !a.listen || a.listen.ev !== ev) return;
        if (listenMatch(s, a.listen, src, p, evP, card, n)) queue(s, src, p, k, card ?? undefined);
      });
}

function listen(s: GameState, e: GameEvent) {
  switch (e.t) {
    case "DonReturned":
      s.donReturnedThisTurn[e.p] += e.n;
      return fire(s, "DonReturned", e.p, null, e.n);
    case "CardPlayed":
      if (def(s, e.iid).type === "Character") fire(s, "CharPlayed", e.p, e.iid);
      return;
    case "EventActivated":
      return fire(s, "EventActivated", e.p, e.iid);
    case "KO":
      return fire(s, "KO", ownerOf(s, e.iid), e.iid);
    case "LifeDamage":
      return fire(s, "Damage", e.p, null);
    case "LifeRemoved":
      fire(s, "LifeRemoved", e.p, null);
      if (pl(s, e.p).life.length === 0) fire(s, "LifeZero", e.p, null);
      return;
  }
}

export const onceKeyOf = (src: string, a: Ability, k: number) => `${src}:${a.onceKey ?? k}`;
export function queue(s: GameState, src: string, p: P, k: number, eventCard?: string) {
  const a = def(s, src).abilities[k];
  if (!evalCond(s, a.cond, { src, p, vars: {} })) return;
  const key = onceKeyOf(src, a, k);
  if (a.once && (s.usedOnce.includes(key) || s.pending.some((x) => x.source === src && onceKeyOf(src, def(s, src).abilities[x.ability], x.ability) === key))) return;
  s.pending.push({ source: src, controller: p, ability: k, label: `${def(s, src).name}: ${a.label ?? WHEN_SK[a.when] ?? a.when}`, eventCard });
}
const WHEN_SK: Record<string, string> = {
  onPlay: "[On Play]", whenAttacking: "[When Attacking]", onOppAttack: "[On Your Opponent's Attack]", onKO: "[On K.O.]",
  endOfTurn: "[End of Your Turn]", onEvent: "reakcia", trigger: "[Trigger]", main: "[Main]", counter: "[Counter]", activateMain: "[Activate: Main]",
};
export function queueWhen(s: GameState, src: string, when: Ability["when"]) {
  const p = ownerOf(s, src);
  abilitiesOf(s, src).forEach((a, k) => a.when === when && queue(s, src, p, k));
}

export function startAbility(s: GameState, src: string, controller: P, k: number, kind: Frame["kind"] = "ability", eventCard?: string) {
  const a = def(s, src).abilities[k];
  if (a.once) s.usedOnce.push(onceKeyOf(src, a, k));
  s.stack.push({
    source: src, controller, steps: [...(a.steps ?? [])], pc: 0,
    vars: { $self: [src], ...(eventCard ? { $event: [eventCard] } : {}) }, flags: [],
    label: def(s, src).name, costs: a.cost ?? [], ci: 0, optional: !!a.optional, asked: false, kind, ability: k, eventCard,
  });
}
function pushSub(s: GameState, parent: Frame, steps: any[], extra: Partial<Frame> = {}) {
  s.stack.push({
    source: parent.source, controller: parent.controller, steps, pc: 0, vars: parent.vars, flags: parent.flags,
    label: parent.label, costs: [], ci: 0, optional: false, asked: true, kind: "sub", ...extra,
  });
}

// ------------------------------------------------------------------ primitívy
export function draw(s: GameState, p: P, n: number) {
  for (let i = 0; i < n; i++) {
    const x = pl(s, p);
    if (!x.deck.length) return lose(s, p, "nemá kartu na ťahanie");
    x.hand.push(x.deck.shift()!);
  }
  if (n > 0) emit(s, { t: "CardDrawn", p, n });
}
export function addDon(s: GameState, p: P, n: number, state: "active" | "rested") {
  const x = pl(s, p);
  const k = Math.max(0, Math.min(n, x.donDeck));
  if (!k) return;
  x.donDeck -= k;
  if (state === "active") x.donActive += k;
  else x.donRested += k;
  emit(s, { t: "DonAdded", p, n: k, state });
}
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
function koNow(s: GameState, iid: string, battle = false) {
  if (!onField(s, iid) || def(s, iid).type === "Leader") return;
  leaveField(s, iid);
  pl(s, ownerOf(s, iid)).trash.push(iid);
  emit(s, { t: "KO", iid, battle });
  queueWhen(s, iid, "onKO");
}
export function addMod(s: GameState, m: Omit<Modifier, "setOnTurn">) {
  s.mods.push({ ...m, setOnTurn: s.turn });
}
export function lose(s: GameState, p: P, why: string) {
  if (s.winner != null) return;
  s.winner = other(p);
  s.phase = "over";
  s.prompt = null;
  info(s, `${pl(s, p).name} prehral – ${why}.`);
}
function putOnField(s: GameState, iid: string, rested = false) {
  const c = s.cards[iid];
  const x = pl(s, c.owner);
  const d = def(s, iid);
  detach(s, iid);
  c.rested = rested;
  c.don = 0;
  c.playedTurn = s.turn;
  if (d.type === "Stage") {
    if (x.stage) {
      const old = x.stage;
      leaveField(s, old);
      x.trash.push(old);
    }
    x.stage = iid;
  } else x.characters.push(iid);
  emit(s, { t: "CardPlayed", p: c.owner, iid });
  queueWhen(s, iid, "onPlay");
  if (x.characters.length > MAX_CHARS) s.prompt = { kind: "trashCharacter", p: c.owner, options: x.characters.filter((i) => i !== iid) };
}
function moveTo(s: GameState, iid: string, to: string, faceUp = false) {
  const c = s.cards[iid];
  const x = pl(s, c.owner);
  detach(s, iid);
  if (to === "hand") x.hand.push(iid);
  else if (to === "trash") x.trash.push(iid);
  else if (to === "deckBottom") x.deck.push(iid);
  else if (to === "deckTop") x.deck.unshift(iid);
  else if (to === "lifeTop") (x.life.unshift(iid), (c.faceUp = faceUp));
  else if (to === "lifeBottom") (x.life.push(iid), (c.faceUp = faceUp));
}
function trashFromHand(s: GameState, p: P, iids: string[], byEffect: boolean) {
  for (const i of iids) moveTo(s, i, "trash");
  if (byEffect && iids.length) {
    pl(s, p).handTrashedTurn = s.turn;
    fire(s, "HandTrashedByEffect", p, null);
  }
}

// ------------------------------------------------------------------ ceny
/** Dá sa cena zaplatiť? (pred otázkou „použiť efekt?“) */
function canPay(s: GameState, st: Step, c: Ctx): boolean {
  switch (st.op) {
    case "returnDon":
      return donOnField(s, c.p) >= evalNum(s, st.n, c);
    case "restDon":
      return pl(s, c.p).donActive >= evalNum(s, st.n, c);
    case "rest":
      return (c.vars[st.v] ?? (st.v === "$self" ? [c.src] : [])).every((i) => !s.cards[i].rested && onField(s, i));
    case "move":
      if (st.v === "$self") return onField(s, c.src) || zoneOf(s, c.src)?.zone === "hand";
      return true;
    case "discard":
      return candidates(s, { ...(st.f ?? { zone: "hand" }), zone: "hand", side: "me" }, c).length >= evalNum(s, st.n, c);
    case "reveal":
      return candidates(s, { ...st.f, zone: "hand", side: "me" }, c).length >= st.n;
    case "choose":
      return candidates(s, st.f, c).length >= evalNum(s, st.min ?? 0, c);
    case "lifeToHand":
      return pl(s, c.p).life.length >= evalNum(s, st.n, c);
    case "lifeFace":
      return pl(s, c.p).life.filter((i) => !!s.cards[i].faceUp !== st.up).length >= (st.n === "all" ? 1 : st.n);
    case "mill":
      return pl(s, c.p).deck.length >= evalNum(s, st.n, c);
    case "giveDon":
      if (st.fromOpp) return pl(s, other(c.p)).donRested >= 1;
      if (st.oppCostArea) return pl(s, other(c.p)).donActive + pl(s, other(c.p)).donRested >= 1;
      return st.active ? pl(s, c.p).donActive >= evalNum(s, st.n, c) : true;
    case "custom":
      return CUSTOM[st.fn]?.canPay ? CUSTOM[st.fn].canPay!(s, c, st.arg) : true;
    default:
      return true;
  }
}
function costText(st: Step): string {
  switch (st.op) {
    case "returnDon":
      return `DON!! −${typeof st.n === "number" ? st.n : "X"}${st.atLeast ? " alebo viac" : ""}`;
    case "restDon":
      return `daj do rest ${typeof st.n === "number" ? st.n : "X"} DON!!`;
    case "rest":
      return st.v === "$self" ? "daj túto kartu do rest" : "daj do rest";
    case "move":
      return st.v === "$self" ? "vyhoď túto kartu" : "presuň kartu";
    case "discard":
      return `vyhoď ${typeof st.n === "number" ? st.n : "X"} kartu z ruky`;
    case "reveal":
      return `ukáž ${st.n} karty z ruky`;
    case "lifeToHand":
      return "vezmi Life kartu do ruky";
    case "lifeFace":
      return `otoč ${st.n === "all" ? "všetky" : st.n} Life ${st.up ? "lícom hore" : "lícom dole"}`;
    case "giveDon":
      return "pripoj aktívne DON!!";
    default:
      return "zaplať cenu";
  }
}

// ------------------------------------------------------------------ odstraňovanie (K.O., do ruky, pod balíček) s náhradnými efektmi
type Removal = "ko" | "bounce" | "deckBottom" | "deckTop" | "trash" | "life";

/** Náhradné efekty, ktoré môžu zachrániť kartu. */
function replacementsFor(s: GameState, iid: string, kind: Removal, byOpp: boolean, battle: boolean): { src: string; k: number }[] {
  const owner = ownerOf(s, iid);
  const out: { src: string; k: number }[] = [];
  for (const src of fieldOf(s, owner))
    abilitiesOf(s, src).forEach((a, k) => {
      if (a.when !== "replace" || !a.replace) return;
      const r = a.replace;
      if (r.what === "ko" && kind !== "ko") return;
      if (r.what === "remove" && false) return;
      if (r.what === "removeByOpp" && !byOpp) return;
      if (a.once && s.usedOnce.includes(onceKeyOf(src, a, k))) return;
      if (r.what === "removeByOpp" && kind === "ko" && battle) return;
      const c: Ctx = { src, p: owner, vars: { $self: [src], $saved: [iid] } };
      if (!matches(s, iid, r.f, c) || !sideP(r.f.side, owner).includes(owner)) return;
      if (!evalCond(s, a.cond, c)) return;
      if (!(a.cost ?? []).every((st) => canPay(s, st, c))) return;
      void battle;
      out.push({ src, k });
    });
  return out;
}

/** Spracuje odstránenie kariet v premennej – po jednej, s možnosťou náhradného efektu. Vracia true, keď je hotovo. */
function removeStep(s: GameState, f: Frame, iids: string[], kind: Removal, battle = false): boolean {
  if (f.sub?.i == null) f.sub = { ...(f.sub ?? {}), i: 0, saved: [] as string[], asked: [] as string[] };
  const byOpp = !battle;
  while (f.sub.i < iids.length) {
    const iid = iids[f.sub.i];
    const zone = zoneOf(s, iid);
    const isField = zone && (zone.zone === "characters" || zone.zone === "stage");
    if (!isField || f.sub.saved.includes(iid)) {
      f.sub.i++;
      continue;
    }
    const opp = byOpp && ownerOf(s, iid) !== f.controller;
    if (opp && protectedFromOpp(s, iid)) {
      info(s, `${nameOf(s, iid)} sa nedá odstrániť efektom súpera.`);
      f.sub.i++;
      continue;
    }
    if (battle && kind === "ko" && flagOn(s, iid, "battleSaveDiscard") && pl(s, ownerOf(s, iid)).hand.length && !f.sub.asked.includes(`${iid}:battleSave`)) {
      f.sub.asked.push(`${iid}:battleSave`);
      s.stack.push({
        source: iid, controller: ownerOf(s, iid), steps: [], pc: 0, vars: { $self: [iid], $saved: [iid] }, flags: [],
        label: `Zachrániť ${nameOf(s, iid)}`, costs: [{ op: "discard", n: 1 }], ci: 0, optional: true, asked: false, kind: "replace", parentSave: iid,
      });
      return false;
    }
    const reps = replacementsFor(s, iid, kind, opp, battle).filter((r) => !f.sub.asked.includes(`${iid}:${r.src}:${r.k}`));
    if (reps.length) {
      const r = reps[0];
      f.sub.asked.push(`${iid}:${r.src}:${r.k}`);
      const a = def(s, r.src).abilities[r.k];
      s.stack.push({
        source: r.src, controller: ownerOf(s, iid), steps: [...(a.steps ?? [])], pc: 0, vars: { $self: [r.src], $saved: [iid] }, flags: [],
        label: `${def(s, r.src).name}: zachrániť ${nameOf(s, iid)}`, costs: a.cost ?? [], ci: 0, optional: true, asked: false,
        kind: "replace", ability: r.k, parentSave: iid,
      });
      return false;
    }
    f.sub.i++;
    if (kind === "ko") koNow(s, iid, battle);
    else {
      const to = kind === "bounce" ? "hand" : kind === "life" ? (f.sub.lifeTo ?? "lifeTop") : kind;
      moveTo(s, iid, to, !!f.sub.lifeFaceUp);
    }
  }
  f.sub = undefined;
  return true;
}

// ------------------------------------------------------------------ interpret DSL
const vget = (f: Frame, v: string): string[] => f.vars[v] ?? (v === "$self" ? [f.source] : []);

function promptChoose(s: GameState, f: Frame, p: P, label: string, options: string[], min: number, max: number, zone?: Zone) {
  s.prompt = { kind: "choose", p, label, options, min: Math.min(min, options.length), max: Math.min(max, options.length), zone };
  f.sub = { ...(f.sub ?? {}), awaiting: true };
}

/** Vykoná krok. true = hotovo (pc++), false = čaká na prompt alebo podrámec. */
function execStep(s: GameState, f: Frame, st: Step): boolean {
  const p = f.controller;
  const c = ctxOf(f);
  const N = (n: Num) => evalNum(s, n, c);
  const sp = (side?: Side) => (side === "opp" ? other(p) : p);
  switch (st.op) {
    case "choose": {
      if (f.sub?.done) {
        f.vars[st.v] = f.sub.pick;
        f.sub = undefined;
        return true;
      }
      let opts = candidates(s, st.f, c);
      const max = N(st.max);
      if (!opts.length || max <= 0) {
        f.vars[st.v] = [];
        return true;
      }
      const min = N(st.min ?? 0);
      promptChoose(s, f, st.chooser === "opp" ? other(p) : p, st.label, opts, min, max, st.f.zone);
      if (st.maxTotalCost != null || st.distinctNames) Object.assign(s.prompt!, { maxTotalCost: st.maxTotalCost, distinctNames: st.distinctNames });
      f.sub.chooseStep = true;
      return false;
    }
    case "all":
      f.vars[st.v] = candidates(s, st.f, c);
      return true;
    case "set": {
      const b = s.battle;
      const m: Record<string, string | undefined> = {
        self: f.source, myLeader: pl(s, p).leader, oppLeader: pl(s, other(p)).leader,
        battleAttacker: b?.attacker, battleTarget: b?.target, eventCard: f.eventCard,
      };
      const v = m[st.from];
      f.vars[st.v] = v ? [v] : [];
      return true;
    }
    case "look": {
      const side = sp(st.side);
      const x = pl(s, side);
      const n = Math.min(N(st.n), x.deck.length);
      const iids = x.deck.splice(0, n);
      s.look = { p, iids: [...(s.look && s.look.p === p ? s.look.iids : []), ...iids] };
      if (side !== p) info(s, `${pl(s, p).name} sa pozerá na vrch súperovho balíčka.`);
      return true;
    }
    case "lookRest": {
      if (!s.look) return true;
      const rest = s.look.iids;
      const x = pl(s, p);
      s.look = null;
      for (const i of rest) {
        const o = pl(s, ownerOf(s, i));
        if (st.to === "trash") o.trash.push(i);
        else if (st.to === "top") o.deck.unshift(i);
        else o.deck.push(i);
      }
      void x;
      return true;
    }
    case "move": {
      const iids = vget(f, st.v);
      const isF = (i: string) => {
        const z = zoneOf(s, i)?.zone;
        return z === "characters" || z === "stage";
      };
      if (!f.sub?.moveInit) {
        for (const i of iids) {
          if (isF(i)) continue;
          if (st.to === "trash" && zoneOf(s, i)?.zone === "hand") trashFromHand(s, ownerOf(s, i), [i], true);
          else moveTo(s, i, st.to, st.faceUp);
        }
        const fieldOnes = iids.filter(isF);
        if (!fieldOnes.length) return true;
        f.sub = { moveInit: true, fieldOnes, lifeTo: st.to, lifeFaceUp: st.faceUp };
      }
      const kind: Removal = st.to === "hand" ? "bounce" : st.to === "lifeTop" || st.to === "lifeBottom" ? "life" : (st.to as Removal);
      return removeStep(s, f, f.sub.fieldOnes, kind);
    }
    case "ko":
      return removeStep(s, f, vget(f, st.v), "ko", f.kind === "sub" && f.sub?.battle);
    case "play": {
      const iids = vget(f, st.v);
      f.sub ??= { i: 0 };
      if (playerFlag(s, p, "noPlayChars")) return (f.sub = undefined), true;
      while (f.sub.i < iids.length) {
        const i = iids[f.sub.i++];
        const t = def(s, i).type;
        if (t !== "Character" && t !== "Stage") continue;
        if (onField(s, i)) continue;
        putOnField(s, i, !!st.rested);
        if (s.prompt) return false; // 6. postava
      }
      f.sub = undefined;
      return true;
    }
    case "rest":
      for (const i of vget(f, st.v)) if (!flagOn(s, i, "cannotBeRested") || ownerOf(s, i) === p) s.cards[i].rested = true;
      return true;
    case "activate":
      for (const i of vget(f, st.v)) s.cards[i].rested = false;
      return true;
    case "draw":
      if (playerFlag(s, p, "noDrawByEffect")) return true;
      draw(s, p, N(st.n));
      return true;
    case "discard": {
      const who = sp(st.side);
      if (f.sub?.done) {
        trashFromHand(s, who, f.sub.pick, true);
        f.sub = undefined;
        return true;
      }
      const opts = candidates(s, { ...(st.f ?? { zone: "hand" }), zone: "hand", side: st.side === "opp" ? "opp" : "me" }, c);
      const n = Math.min(N(st.n), opts.length);
      if (!n) return true;
      if (!st.upTo && opts.length <= n) {
        trashFromHand(s, who, opts, true);
        return true;
      }
      promptChoose(s, f, who, `Vyhoď ${n} ${n === 1 ? "kartu" : "karty"} z ruky`, opts, st.upTo ? 0 : n, n, "hand");
      return false;
    }
    case "handToDeck": {
      if (f.sub?.done && st.where === "topOrBottom" && f.sub.option == null) {
        s.prompt = { kind: "oneOf", p, label: "Kam dať vybrané karty?", options: ["Navrch balíčka", "Pod balíček"] };
        f.sub = { awaiting: true, pick: f.sub.pick };
        return false;
      }
      if (f.sub?.done) {
        const top = st.where === "top" || (st.where === "topOrBottom" && f.sub.option === 0);
        for (const i of f.sub.pick) moveTo(s, i, top ? "deckTop" : "deckBottom");
        f.sub = undefined;
        return true;
      }
      const opts = [...pl(s, p).hand];
      const n = Math.min(N(st.n), opts.length);
      if (!n) return true;
      promptChoose(s, f, p, `Vyber ${n} ${n === 1 ? "kartu" : "karty"} z ruky – pôjdu ${st.where === "top" ? "na vrch" : "pod"} balíček`, opts, n, n, "hand");
      return false;
    }
    case "deckToLife": {
      const x = pl(s, p);
      for (let k = 0; k < N(st.n) && x.deck.length; k++) {
        const i = x.deck.shift()!;
        x.life.unshift(i);
        s.cards[i].faceUp = !!st.faceUp;
      }
      return true;
    }
    case "lifeToHand": {
      const who = sp(st.side);
      const x = pl(s, who);
      if (st.from === "topOrBottom" && x.life.length > 1 && !f.sub?.done) {
        s.prompt = { kind: "oneOf", p, label: "Ktorú Life kartu?", options: ["Z vrchu", "Zo spodu"] };
        f.sub = { awaiting: true, oneOfLife: true };
        return false;
      }
      const bottom = f.sub?.option === 1;
      f.sub = undefined;
      for (let k = 0; k < N(st.n) && x.life.length; k++) {
        const i = bottom ? x.life[x.life.length - 1] : x.life[0];
        moveTo(s, i, "hand");
      }
      return true;
    }
    case "trashLife": {
      const x = pl(s, sp(st.side));
      for (let k = 0; k < N(st.n) && x.life.length; k++) moveTo(s, x.life[0], "trash");
      return true;
    }
    case "lifeFace": {
      const x = pl(s, sp(st.side));
      let n = st.n === "all" ? x.life.length : st.n;
      let flipped = 0;
      for (const i of x.life) {
        if (n <= 0) break;
        if (!!s.cards[i].faceUp !== st.up) {
          s.cards[i].faceUp = st.up;
          n--;
          flipped++;
        }
      }
      if (flipped) s.log.push({ t: "LifeFlipped", p: x === s.players[0] ? 0 : 1, n: flipped, up: st.up });
      return true;
    }
    case "trashLifeUntil": {
      const x = pl(s, p);
      while (x.life.length > st.n) moveTo(s, x.life[0], "trash");
      return true;
    }
    case "mill": {
      const x = pl(s, p);
      for (let k = 0; k < N(st.n) && x.deck.length; k++) x.trash.push(x.deck.shift()!);
      return true;
    }
    case "addDon":
      addDon(s, sp(st.side), N(st.n), st.state);
      return true;
    case "returnDon": {
      const who = sp(st.side);
      const n = N(st.n);
      if (!n) return true;
      if (donOnField(s, who) < n) {
        f.sub = { failed: true };
        return true;
      }
      s.prompt = { kind: "donSource", p: who, n, atLeast: !!st.atLeast, label: `${f.label}: vyber DON!! na vrátenie` };
      f.sub = { awaiting: true };
      return false;
    }
    case "restDon": {
      const who = sp(st.side);
      const x = pl(s, who);
      const k = Math.min(N(st.n), x.donActive);
      x.donActive -= k;
      x.donRested += k;
      return true;
    }
    case "activeDon": {
      const x = pl(s, p);
      if (playerFlag(s, p, "noActiveDonByCharEffect") && def(s, f.source).type === "Character") return true;
      const k = Math.min(N(st.n), x.donRested);
      x.donRested -= k;
      x.donActive += k;
      return true;
    }
    case "returnDonTo": {
      const x = pl(s, p);
      let extra = donOnField(s, p) - N(st.target);
      while (extra > 0) {
        if (x.donRested) x.donRested--;
        else if (x.donActive) x.donActive--;
        else {
          const withDon = fieldOf(s, p).find((i) => s.cards[i].don > 0);
          if (!withDon) break;
          s.cards[withDon].don--;
        }
        x.donDeck++;
        extra--;
        s.donReturnedThisTurn[p]++;
      }
      return true;
    }
    case "giveDon": {
      const targets = vget(f, st.v);
      const donOwner = st.fromOpp || st.oppCostArea ? other(p) : p;
      const x = pl(s, donOwner);
      let total = N(st.n);
      for (const t of targets) {
        if (!onField(s, t)) continue;
        let n = st.each ? N(st.n) : total;
        if (st.oppCostArea) {
          const a = Math.min(n, x.donActive);
          const r = Math.min(n - a, x.donRested);
          x.donActive -= a;
          x.donRested -= r;
          n = a + r;
        } else if (st.active) {
          const k = Math.min(n, x.donActive);
          x.donActive -= k;
          n = k;
        } else {
          const k = Math.min(n, x.donRested);
          x.donRested -= k;
          n = k;
        }
        s.cards[t].don += n;
        if (!st.each) total -= n;
      }
      return true;
    }
    case "power":
      for (const i of vget(f, st.v)) addMod(s, { target: i, kind: "power", amount: N(st.amount), until: st.until, owner: p });
      return true;
    case "basePower": {
      const val = st.value === "copy" ? (vget(f, st.copyOf!)[0] ? power(s, vget(f, st.copyOf!)[0]) : null) : N(st.value);
      if (val == null) return true;
      for (const i of vget(f, st.v)) addMod(s, { target: i, kind: "basePower", amount: val, until: st.until, owner: p });
      return true;
    }
    case "costMod":
      for (const i of vget(f, st.v)) addMod(s, { target: i, kind: "cost", amount: N(st.amount), until: st.until, owner: p });
      return true;
    case "kw":
      for (const i of vget(f, st.v)) addMod(s, { target: i, kind: "kw", amount: 0, kw: st.kw, until: st.until, owner: p });
      return true;
    case "flag":
      for (const i of vget(f, st.v))
        addMod(s, { target: i, kind: "flag", amount: 0, flag: st.flag, until: st.flag === "noRefresh" ? "permanent" : st.until, owner: p });
      return true;
    case "playerFlag":
      pl(s, sp(st.side)).flags.push({ flag: st.flag, until: st.until, setOnTurn: s.turn });
      return true;
    case "if": {
      const branch = evalCond(s, st.cond, c) ? st.then : (st.else ?? []);
      f.steps = [...f.steps.slice(0, f.pc + 1), ...branch, ...f.steps.slice(f.pc + 1)];
      return true;
    }
    case "oneOf": {
      if (f.sub?.done) {
        const o = st.options[f.sub.option];
        f.sub = undefined;
        if (o) f.steps = [...f.steps.slice(0, f.pc + 1), ...o.steps, ...f.steps.slice(f.pc + 1)];
        return true;
      }
      s.prompt = { kind: "oneOf", p: st.chooser === "opp" ? other(p) : p, label: `${f.label}: vyber jednu možnosť`, options: st.options.map((o) => o.label) };
      f.sub = { awaiting: true };
      return false;
    }
    case "custom": {
      const h = CUSTOM[st.fn];
      if (!h) {
        info(s, `Chýba efekt ${st.fn}.`);
        return true;
      }
      return h.run(s, f, st.arg);
    }
    case "setFlag":
      f.flags.push(st.flag);
      return true;
    case "later":
      s.delayed.push({ p, source: f.source, steps: st.steps, turn: s.turn, label: f.label });
      return true;
    case "extraTurn":
      pl(s, p).extraTurn = true;
      info(s, `${pl(s, p).name} bude mať extra ťah.`);
      return true;
    case "win":
      if (s.winner == null) {
        s.winner = p;
        s.phase = "over";
        s.prompt = null;
        info(s, `${pl(s, p).name} vyhral efektom karty ${f.label}.`);
      }
      return true;
    case "runAbility": {
      const k = def(s, f.source).abilities.findIndex((a) => a.when === st.which);
      if (k >= 0) {
        const a = def(s, f.source).abilities[k];
        s.stack.push({
          source: f.source, controller: p, steps: [...(a.steps ?? [])], pc: 0, vars: { $self: [f.source] }, flags: [],
          label: f.label, costs: a.cost ?? [], ci: 0, optional: !!a.optional, asked: false, kind: "ability", ability: k,
        });
      }
      f.pc++;
      return false;
    }
    case "reveal": {
      if (f.sub?.done) {
        if (st.v) f.vars[st.v] = f.sub.pick;
        info(s, `${pl(s, p).name} ukázal: ${f.sub.pick.map((i: string) => nameOf(s, i)).join(", ")}`);
        f.sub = undefined;
        return true;
      }
      const opts = candidates(s, { ...st.f, zone: "hand", side: "me" }, c);
      if (opts.length <= st.n) {
        if (st.v) f.vars[st.v] = opts;
        info(s, `${pl(s, p).name} ukázal: ${opts.map((i) => nameOf(s, i)).join(", ")}`);
        return true;
      }
      promptChoose(s, f, p, `Ukáž ${st.n} karty z ruky`, opts, st.n, st.n, "hand");
      return false;
    }
    case "may":
      s.stack.push({
        source: f.source, controller: p, steps: st.steps, pc: 0, vars: f.vars, flags: f.flags, label: st.label ?? f.label,
        costs: st.cost, ci: 0, optional: true, asked: false, kind: "sub",
      });
      f.pc++;
      return false;
    case "info":
      info(s, st.msg);
      return true;
  }
}

// ------------------------------------------------------------------ hlavná slučka
function run(s: GameState) {
  for (let guard = 0; guard < 20000; guard++) {
    if (s.winner != null || s.prompt) return;
    const f = s.stack[s.stack.length - 1];
    if (f) {
      // ceny: najprv sa spýtaj (You may), potom zaplať všetky
      if (f.ci < f.costs.length || (f.optional && !f.asked)) {
        const c = ctxOf(f);
        if (!f.asked && f.ci === 0) {
          const ok = f.costs.every((st) => canPay(s, st, c));
          if (!ok) {
            if (f.costs.length) info(s, `${f.label}: efekt sa nedá použiť – cenu nie je možné zaplatiť (${f.costs.map(costText).join(", ")}).`);
            finishFrame(s, f, false);
            continue;
          }
          if (f.optional) {
            const what = f.costs.length ? f.costs.map(costText).join(", ") : "použiť efekt";
            s.prompt = { kind: "payCost", p: f.controller, label: `${f.label}: ${what}?` };
            return;
          }
          f.asked = true;
        }
        if (f.ci < f.costs.length) {
          const st = f.costs[f.ci];
          const done = execStep(s, f, st);
          if (f.sub?.failed) {
            f.sub = undefined;
            finishFrame(s, f, false);
            continue;
          }
          if (done) f.ci++;
          continue;
        }
      }
      if (f.pc < f.steps.length) {
        const st = f.steps[f.pc];
        if (execStep(s, f, st)) f.pc++;
        continue;
      }
      finishFrame(s, f, true);
      continue;
    }
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
    if (s.battle) {
      if (battleStep(s)) continue;
      return;
    }
    if (s.phase === "end") {
      finishEndPhase(s);
      continue;
    }
    return;
  }
  throw new Error("Engine: nekonečná slučka");
}

function startPending(s: GameState, x: Pending) {
  const a = def(s, x.source).abilities[x.ability];
  const z = zoneOf(s, x.source)?.zone;
  if (a.when === "onKO") {
    if (z !== "trash") return;
  } else if (a.when !== "trigger" && z !== "characters" && z !== "leader" && z !== "stage") return;
  if (!evalCond(s, a.cond, { src: x.source, p: x.controller, vars: {} }) && a.when !== "onKO") return;
  startAbility(s, x.source, x.controller, x.ability, "ability", x.eventCard);
}

function finishFrame(s: GameState, f: Frame, done: boolean) {
  const idx = s.stack.lastIndexOf(f);
  if (idx >= 0) s.stack.splice(idx, 1);
  if (f.kind === "replace" && done && f.parentSave) {
    const parent = s.stack[s.stack.length - 1];
    if (parent?.sub) parent.sub.saved.push(f.parentSave);
    const ab = f.ability != null ? def(s, f.source).abilities[f.ability] : null;
    if (ab?.once) s.usedOnce.push(onceKeyOf(f.source, ab, f.ability!));
    info(s, `${nameOf(s, f.parentSave)} zachránená (${def(s, f.source).name}).`);
  }
  if (f.kind === "mainEvent" || f.kind === "counterEvent" || f.kind === "triggerEvent") {
    const z = zoneOf(s, f.source);
    if (!z && !s.stack.some((x) => x.source === f.source)) pl(s, ownerOf(s, f.source)).trash.push(f.source);
  }
  if (f.kind === "attackTax" && !done && s.battle) s.battle.step = "done";
  if (s.look && !s.stack.some((x) => x.controller === s.look!.p)) {
    // nezabudni vrátiť pozreté karty (keby skript zabudol lookRest)
    for (const i of s.look.iids) pl(s, ownerOf(s, i)).deck.push(i);
    s.look = null;
  }
}

// ------------------------------------------------------------------ súboj
function battleStep(s: GameState): boolean {
  const b = s.battle!;
  const d = other(s.active);
  if (!onField(s, b.attacker) || !onField(s, b.target)) {
    // útočník alebo cieľ odišiel z poľa → súboj končí
    endBattle(s);
    return true;
  }
  if (b.step === "whenAttacking") {
    b.step = "block";
    const blockers = blockersFor(s);
    if (blockers.length) {
      s.prompt = { kind: "blocker", p: d, options: blockers };
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
    if (counterOptions(s, d).length) {
      s.prompt = { kind: "counter", p: d };
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
  endBattle(s);
  return true;
}
function endBattle(s: GameState) {
  s.mods = s.mods.filter((m) => m.until !== "battle");
  s.battle = null;
  s.phase = s.winner != null ? "over" : "main";
}

export function blockersFor(s: GameState): string[] {
  const b = s.battle!;
  const d = other(s.active);
  if (hasKw(s, b.attacker, "unblockable")) return [];
  if (s.mods.some((m) => m.target === b.attacker && m.kind === "flag" && m.flag === "noBlockerWhenAttacks")) return [];
  const min5 = s.mods.some((m) => m.target === b.attacker && m.kind === "flag" && m.flag === "noBlockerMinPower5000");
  return pl(s, d).characters.filter((i) => i !== b.target && !s.cards[i].rested && hasKw(s, i, "blocker") && !(min5 && power(s, i) >= 5000));
}

export function counterOptions(s: GameState, p: P): string[] {
  const x = pl(s, p);
  return x.hand.filter((i) => {
    const d = def(s, i);
    if (d.type === "Character") return counterOf(s, i) > 0;
    if (d.type === "Event") return d.abilities.some((a) => a.when === "counter") && x.donActive >= handCost(s, i);
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
    if (def(s, b.target).type !== "Leader") {
      const attr = def(s, b.attacker).attribute;
      for (const st of activeStatics(s))
        if (st.m.stat === "noBattleKO" && attr.toLowerCase().includes(st.m.attribute.toLowerCase()) && staticTargets(s, st, b.target, st.m)) {
          info(s, `${nameOf(s, b.target)} sa nedá K.O. v súboji touto kartou.`);
          return;
        }
      // K.O. v súboji – cez rámec, aby fungovali náhradné efekty
      s.stack.push({
        source: b.attacker, controller: s.active, steps: [{ op: "ko", v: "t" }], pc: 0, vars: { t: [b.target] }, flags: [],
        label: "Súboj", costs: [], ci: 0, optional: false, asked: true, kind: "sub", sub: { battle: true },
      });
      return;
    }
    b.hitsLeft = hasKw(s, b.attacker, "doubleAttack") ? 2 : 1;
  }
  while (b.hitsLeft! > 0) {
    b.hitsLeft!--;
    const x = pl(s, tp);
    if (!x.life.length) return lose(s, tp, "dostal zásah s 0 Life");
    const card = x.life.shift()!;
    s.cards[card].faceUp = false;
    emit(s, { t: "LifeDamage", p: tp, n: 1 });
    emit(s, { t: "LifeRemoved", p: tp });
    if (hasKw(s, b.attacker, "banish")) {
      x.trash.push(card);
      continue;
    }
    x.hand.push(card);
    if (def(s, card).abilities.some((a) => a.when === "trigger")) {
      s.prompt = { kind: "trigger", p: tp, iid: card };
      if (b.hitsLeft! > 0) b.step = "damage";
      return;
    }
  }
}

// ------------------------------------------------------------------ ťahy
function expire(s: GameState, ending: P) {
  s.mods = s.mods.filter((m) => {
    if (m.until === "turn") return false;
    if (m.until === "oppNextEndPhase" && m.owner !== ending && s.turn > m.setOnTurn) return false;
    if (m.until === "oppNextEndPhase" && m.owner !== ending && s.turn === m.setOnTurn) return true;
    if (m.until === "oppNextEndPhase" && m.owner === ending && s.turn > m.setOnTurn) return true;
    if (m.until === "myNextTurnEnd" && m.owner === ending && s.turn > m.setOnTurn) return false;
    return true;
  });
  for (const p of [0, 1] as P[])
    pl(s, p).flags = pl(s, p).flags.filter((x) => !(x.until === "turn" || (x.until === "oppNextEndPhase" && p !== ending && s.turn > x.setOnTurn)));
}

function startTurn(s: GameState) {
  s.turn++;
  const p = s.active;
  s.turnCount[p]++;
  const x = pl(s, p);
  emit(s, { t: "Turn", p, turn: s.turn });
  // Refresh: pripojené DON!! späť, všetko aktívne (okrem kariet, ktoré sa nemajú aktivovať)
  for (const i of fieldOf(s, p)) {
    x.donActive += s.cards[i].don;
    s.cards[i].don = 0;
    if (flagOn(s, i, "noRefresh")) continue;
    s.cards[i].rested = false;
  }
  s.mods = s.mods.filter((m) => !(m.kind === "flag" && m.flag === "noRefresh" && ownerOf(s, m.target) === p));
  x.donActive += x.donRested;
  x.donRested = 0;
  if (s.turn > 1) draw(s, p, 1);
  if (s.winner != null) return;
  addDon(s, p, s.turn === 1 ? 1 : 2, "active");
  if (playerFlag(s, p, "restDonAtMainStart")) {
    if (x.donActive) (x.donActive--, x.donRested++);
    x.flags = x.flags.filter((f) => f.flag !== "restDonAtMainStart");
  }
  s.phase = "main";
  run(s);
}

function endTurn(s: GameState) {
  const p = s.active;
  s.phase = "end";
  fieldOf(s, p).forEach((i) => queueWhen(s, i, "endOfTurn"));
  for (const d of s.delayed.filter((d) => d.p === p && d.turn === s.turn))
    s.stack.unshift({
      source: d.source, controller: p, steps: d.steps, pc: 0, vars: { $self: [d.source] }, flags: [], label: d.label,
      costs: [], ci: 0, optional: false, asked: true, kind: "ability",
    });
  s.delayed = s.delayed.filter((d) => !(d.p === p && d.turn === s.turn));
  run(s);
}
function finishEndPhase(s: GameState) {
  const p = s.active;
  // „set this Character as active at the end of this turn“
  for (const m of s.mods.filter((m) => m.kind === "flag" && m.flag === "activateAtEndOfTurn" && ownerOf(s, m.target) === p)) s.cards[m.target].rested = false;
  expire(s, p);
  s.usedOnce = [];
  s.donReturnedThisTurn = [0, 0];
  const x = pl(s, p);
  if (x.extraTurn) x.extraTurn = false;
  else s.active = other(p);
  startTurn(s);
}

function setupLife(s: GameState) {
  for (const p of [0, 1] as P[]) {
    const x = pl(s, p);
    const n = def(s, x.leader).life || 5;
    x.life = x.deck.splice(0, n).reverse();
  }
  s.active = s.first;
  startTurn(s);
}

// ------------------------------------------------------------------ akcie hráča
export class IllegalAction extends Error {}
const fail = (msg: string): never => {
  throw new IllegalAction(msg);
};

function canActivate(s: GameState, iid: string, k: number, p: P): boolean {
  const a = abilitiesOf(s, iid)[k];
  if (!a || a.when !== "activateMain") return false;
  if (a.once && s.usedOnce.includes(onceKeyOf(iid, a, k))) return false;
  const c: Ctx = { src: iid, p, vars: { $self: [iid] } };
  if (!evalCond(s, a.cond, c) && !a.optional) {
    // podmienka „If …“ sa vyhodnocuje až v efekte; ak je to podmienka aktivácie (cond), musí platiť
    return false;
  }
  return (a.cost ?? []).every((st) => canPay(s, st, c));
}

function canAttackWith(s: GameState, iid: string, p: P): boolean {
  if (!fieldOf(s, p).includes(iid) || iid === pl(s, p).stage) return false;
  const c = s.cards[iid];
  if (c.rested) return false;
  if (cannotAttack(s, iid)) return false;
  if (def(s, iid).type === "Character" && c.playedTurn === s.turn && !hasKw(s, iid, "rush") && !hasKw(s, iid, "rushChar")) return false;
  if (flagOn(s, iid, "attackTax2") && pl(s, p).hand.length < 2) return false;
  return true;
}

export function applyAction(state: GameState, a: Action): GameState {
  if (state.winner != null) fail("Hra skončila.");
  const s = clone(state);
  if (s.prompt) {
    if (a.type !== "answer") fail("Engine čaká na odpoveď.");
    if (s.prompt.p !== a.p) fail("Na rade je druhý hráč.");
    answer(s, (a as Extract<Action, { type: "answer" }>).choice);
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
      if (d.type === "Leader") fail("Leadera nemožno zahrať.");
      if (d.type === "Event" && !d.abilities.some((ab) => ab.when === "main") && d.scripted) fail("Tento event sa nedá zahrať v Main fáze.");
      if (d.type === "Character" && playerFlag(s, a.p, "noPlayChars")) fail("Tento ťah už nemôžeš hrať postavy.");
      if (d.type === "Character" && playerFlag(s, a.p, "noPlayChars5") && d.cost >= 5) fail("Tento ťah nemôžeš hrať postavy s base cost 5+.");
      const c = handCost(s, a.iid);
      if (x.donActive < c) fail(`Potrebuješ ${c} aktívnych DON!!.`);
      x.donActive -= c;
      x.donRested += c;
      if (d.type === "Character" && hasName(d, "Trafalgar Law") && d.cost >= 4) x.flags = x.flags.filter((f) => f.flag !== "lawDiscount2");
      if (d.type === "Character" || d.type === "Stage") putOnField(s, a.iid);
      else {
        x.hand = x.hand.filter((i) => i !== a.iid);
        emit(s, { t: "CardPlayed", p: a.p, iid: a.iid });
        const k = d.abilities.findIndex((ab) => ab.when === "main");
        if (k >= 0) {
          emit(s, { t: "EventActivated", p: a.p, iid: a.iid });
          startAbility(s, a.iid, a.p, k, "mainEvent");
        } else x.trash.push(a.iid);
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
      if (!canActivate(s, a.iid, a.ability, a.p)) fail("Tento efekt sa teraz nedá aktivovať.");
      startAbility(s, a.iid, a.p, a.ability);
      break;
    }
    case "attack": {
      if (s.turnCount[a.p] <= 1) fail("V prvom ťahu každého hráča sa neútočí.");
      if (!canAttackWith(s, a.attacker, a.p)) fail("Táto karta teraz nemôže útočiť.");
      const isLeaderTarget = a.target === pl(s, other(a.p)).leader;
      if (!attackTargets(s, a.p).includes(a.target)) fail("Cieľ musí byť súperov leader alebo postava v rest.");
      if (!isLeaderTarget && def(s, a.attacker).type === "Character" && s.cards[a.attacker].playedTurn === s.turn && !hasKw(s, a.attacker, "rush") && !hasKw(s, a.attacker, "rushChar"))
        fail("Bez [Rush] nemôže útočiť.");
      if (isLeaderTarget && def(s, a.attacker).type === "Character" && s.cards[a.attacker].playedTurn === s.turn && !hasKw(s, a.attacker, "rush"))
        fail("[Rush: Character] môže útočiť len na postavy.");
      s.cards[a.attacker].rested = true;
      s.phase = "battle";
      s.battle = { attacker: a.attacker, target: a.target, step: "whenAttacking", counterPower: 0 };
      emit(s, { t: "Attack", attacker: a.attacker, target: a.target });
      queueWhen(s, a.attacker, "whenAttacking");
      for (const i of fieldOf(s, other(a.p))) queueWhen(s, i, "onOppAttack");
      if (def(s, a.attacker).type === "Leader") fire(s, "LeaderAttackedOrAttacks", a.p, null);
      if (isLeaderTarget) fire(s, "LeaderAttackedOrAttacks", other(a.p), null);
      if (flagOn(s, a.attacker, "attackTax2")) {
        s.stack.push({
          source: a.attacker, controller: a.p, steps: [], pc: 0, vars: {}, flags: [], label: "Útok (vyhoď 2 karty)",
          costs: [{ op: "discard", n: 2 }], ci: 0, optional: false, asked: true, kind: "attackTax",
        });
      }
      break;
    }
    case "endTurn":
      endTurn(s);
      return s;
  }
  run(s);
  return s;
}

function answer(s: GameState, ch: AnswerChoice) {
  const pr = s.prompt!;
  const f = s.stack[s.stack.length - 1];
  s.prompt = null;
  const restore = () => (s.prompt = pr);
  switch (pr.kind) {
    case "mulligan": {
      const x = pl(s, pr.p);
      if ((ch as any).yes === true) {
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
      const yes = (ch as any).yes;
      if (typeof yes !== "boolean") return (restore(), fail("Odpovedz áno/nie."));
      f.asked = true;
      if (!yes) finishFrame(s, f, false);
      return;
    }
    case "donSource": {
      const d = (ch as any).don;
      if (!d) return (restore(), fail("Chýba výber DON!!."));
      const x = pl(s, pr.p);
      const total = d.active + d.rested + Object.values(d.attached as Record<string, number>).reduce((a: number, b: number) => a + b, 0);
      if (pr.atLeast ? total < pr.n : total !== pr.n) return (restore(), fail(`Vráť ${pr.atLeast ? "aspoň " : ""}${pr.n} DON!!.`));
      if (d.active < 0 || d.rested < 0 || d.active > x.donActive || d.rested > x.donRested) return (restore(), fail("Toľko DON!! nemáš."));
      for (const [iid, n] of Object.entries(d.attached as Record<string, number>))
        if (n < 0 || !fieldOf(s, pr.p).includes(iid) || s.cards[iid].don < n) return (restore(), fail("Na karte nie je toľko DON!!."));
      x.donActive -= d.active;
      x.donRested -= d.rested;
      for (const [iid, n] of Object.entries(d.attached as Record<string, number>)) s.cards[iid].don -= n;
      x.donDeck += total;
      f.sub = undefined;
      if (f.ci < f.costs.length && f.costs[f.ci].op === "returnDon") f.ci++;
      else f.pc++;
      emit(s, { t: "DonReturned", p: pr.p, n: total });
      return;
    }
    case "choose": {
      const pick = (ch as any).pick ?? [];
      if (!Array.isArray(pick) || new Set(pick).size !== pick.length || pick.some((i: string) => !pr.options.includes(i)) || pick.length < pr.min || pick.length > pr.max)
        return (restore(), fail("Neplatný výber."));
      const st = (f.ci < f.costs.length ? f.costs[f.ci] : f.steps[f.pc]) as Step;
      if (st.op === "choose" && (st.distinctNames || st.maxTotalCost != null)) {
        const names = pick.map((i: string) => nameOf(s, i));
        if (st.distinctNames && new Set(names).size !== names.length) return (restore(), fail("Karty musia mať rôzne mená."));
        if (st.maxTotalCost != null && pick.reduce((a: number, i: string) => a + (onField(s, i) ? cost(s, i) : def(s, i).cost), 0) > st.maxTotalCost)
          return (restore(), fail(`Spolu najviac cost ${st.maxTotalCost}.`));
      }
      f.sub = { ...(f.sub ?? {}), done: true, pick };
      return;
    }
    case "oneOf": {
      const o = (ch as any).option;
      if (typeof o !== "number" || o < 0 || o >= pr.options.length) return (restore(), fail("Vyber možnosť."));
      f.sub = { ...(f.sub ?? {}), done: true, option: o };
      return;
    }
    case "orderTriggers": {
      const k = (ch as any).order;
      if (!pr.options.includes(k)) return (restore(), fail("Neplatné poradie."));
      const [x] = s.pending.splice(k, 1);
      startPending(s, x);
      return;
    }
    case "blocker": {
      const pick = (ch as any).pick ?? [];
      if (pick[0]) {
        if (!pr.options.includes(pick[0])) return (restore(), fail("Tento blocker sa nedá použiť."));
        s.cards[pick[0]].rested = true;
        s.battle!.target = pick[0];
        info(s, `${nameOf(s, pick[0])} blokuje.`);
        fire(s, "BlockerActivated", pr.p, pick[0]);
      }
      return;
    }
    case "counter": {
      const used: string[] = (ch as any).counter ?? [];
      const x = pl(s, pr.p);
      const b = s.battle!;
      if (!used.length) {
        b.step = "damage";
        return;
      }
      const opts = counterOptions(s, pr.p);
      let don = x.donActive;
      for (const iid of used) {
        if (!opts.includes(iid)) return (restore(), fail("Túto kartu nemôžeš použiť ako counter."));
        if (def(s, iid).type === "Event") don -= handCost(s, iid);
      }
      if (don < 0) return (restore(), fail("Nemáš dosť DON!! na eventy."));
      for (const iid of used) {
        const d = def(s, iid);
        if (d.type === "Character") {
          const v = counterOf(s, iid);
          moveTo(s, iid, "trash");
          addMod(s, { target: b.target, kind: "power", amount: v, until: "battle", owner: pr.p });
          info(s, `Counter ${nameOf(s, iid)} +${v}`);
        } else {
          const c = handCost(s, iid);
          x.donActive -= c;
          x.donRested += c;
          x.hand = x.hand.filter((i) => i !== iid);
          emit(s, { t: "EventActivated", p: pr.p, iid });
          const k = d.abilities.findIndex((a) => a.when === "counter");
          startAbility(s, iid, pr.p, k, "counterEvent");
        }
      }
      b.countered = true;
      return; // b.step ostáva „counter“ → hráč môže pridať ďalší counter
    }
    case "trigger": {
      const x = pl(s, pr.p);
      if ((ch as any).yes) {
        // karta je počas efektu „v rozlete“; ak ju efekt nezahrá, skončí v trashi (finishFrame)
        const k = def(s, pr.iid).abilities.findIndex((a) => a.when === "trigger");
        x.hand = x.hand.filter((i) => i !== pr.iid);
        startAbility(s, pr.iid, pr.p, k, "triggerEvent");
      }
      return;
    }
    case "trashCharacter": {
      const pick = (ch as any).pick ?? [];
      if (!pick[0] || !pr.options.includes(pick[0])) return (restore(), fail("Vyber postavu na odhodenie."));
      leaveField(s, pick[0]);
      pl(s, pr.p).trash.push(pick[0]);
      return;
    }
  }
}

// ------------------------------------------------------------------ pohľad hráča a pomocné pre UI/testy
export function viewFor(s: GameState, p: P) {
  const o = other(p);
  const v = clone(s);
  const visibleLife = (x: PlayerState) => x.life.filter((i) => s.cards[i].faceUp);
  const hidden = new Set([...s.players[o].hand, ...s.players[o].deck, ...s.players[p].deck, ...s.players[0].life, ...s.players[1].life]);
  for (const i of [...visibleLife(s.players[0]), ...visibleLife(s.players[1])]) hidden.delete(i);
  if (s.prompt?.kind === "trigger") hidden.delete(s.prompt.iid);
  if (s.look) for (const i of s.look.iids) (s.look.p === p ? hidden.delete(i) : hidden.add(i));
  const mask = (arr: string[]) => arr.map((i) => (hidden.has(i) ? "hidden" : i));
  v.players[o].hand = mask(v.players[o].hand);
  v.players[o].deck = v.players[o].deck.map(() => "hidden");
  v.players[p].deck = v.players[p].deck.map(() => "hidden");
  v.players[0].life = mask(v.players[0].life);
  v.players[1].life = mask(v.players[1].life);
  if (v.look) v.look.iids = mask(v.look.iids);
  const cards: GameState["cards"] = {};
  for (const [iid, c] of Object.entries(v.cards)) if (!hidden.has(iid)) cards[iid] = c;
  v.cards = cards;
  const codes = new Set(Object.values(cards).map((c) => c.code));
  v.defs = Object.fromEntries(Object.entries(s.defs).filter(([k]) => codes.has(k)));
  v.seed = 0;
  // rámce môžu odkazovať na skryté karty (premenné) – klient ich nepotrebuje
  v.stack = v.stack.map((f) => ({ ...f, vars: Object.fromEntries(Object.entries(f.vars).map(([k, l]) => [k, l.filter((i) => !hidden.has(i))])) }));
  return v;
}

/** Legálne akcie v Main fáze (pre UI a simulácie). */
export function mainActions(s: GameState): Action[] {
  if (s.prompt || s.winner != null || s.phase !== "main" || s.stack.length || s.pending.length || s.battle) return [];
  const p = s.active;
  const x = pl(s, p);
  const out: Action[] = [];
  for (const i of x.hand) {
    if (!s.cards[i]) continue;
    const d = def(s, i);
    if (d.type === "Leader") continue;
    if (handCost(s, i) > x.donActive) continue;
    if (d.type === "Event" && !d.abilities.some((a) => a.when === "main") && d.scripted) continue;
    if (d.type === "Character" && (playerFlag(s, p, "noPlayChars") || (playerFlag(s, p, "noPlayChars5") && d.cost >= 5))) continue;
    out.push({ type: "play", p, iid: i });
  }
  if (x.donActive) for (const t of [x.leader, ...x.characters]) out.push({ type: "attachDon", p, target: t });
  for (const i of fieldOf(s, p)) abilitiesOf(s, i).forEach((_, k) => canActivate(s, i, k, p) && out.push({ type: "activate", p, iid: i, ability: k }));
  if (s.turnCount[p] > 1) {
    const targets = attackTargets(s, p);
    const oL = pl(s, other(p)).leader;
    for (const a of [x.leader, ...x.characters])
      if (canAttackWith(s, a, p))
        for (const t of targets) {
          const fresh = def(s, a).type === "Character" && s.cards[a].playedTurn === s.turn;
          if (fresh && t === oL && !hasKw(s, a, "rush")) continue;
          out.push({ type: "attack", p, attacker: a, target: t });
        }
  }
  out.push({ type: "endTurn", p });
  return out;
}

/** Karty v rozlete (event počas vykonávania). */
export function resolving(s: GameState, p: P): string[] {
  const x = pl(s, p);
  const zones = new Set([...x.hand, ...x.trash, ...x.characters, ...x.life, ...x.deck, ...(x.stage ? [x.stage] : []), ...(s.look?.iids ?? [])]);
  return [...new Set(s.stack.filter((f) => ownerOf(s, f.source) === p && !zones.has(f.source) && f.source !== x.leader).map((f) => f.source))];
}

/** Celkový počet kariet hráča (invariant pre testy). */
export function cardCount(s: GameState, p: P) {
  const x = pl(s, p);
  const look = (s.look?.iids ?? []).filter((i) => ownerOf(s, i) === p).length;
  return 1 + x.deck.length + x.hand.length + x.trash.length + x.life.length + x.characters.length + (x.stage ? 1 : 0) + look + resolving(s, p).length;
}

export { other };
export type { Ctx as EffectCtx, Frame, Removal, Until };
