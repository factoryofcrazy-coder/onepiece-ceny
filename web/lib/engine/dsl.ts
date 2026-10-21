// Stavebnica skriptov kariet – krátke pomocníky nad DSL krokmi, aby skript kopíroval text karty.
import type { Ability, Cond, Filter, Keyword, Num, StaticMod, Step, Until } from "./types";

export type Script = { kw?: Keyword[]; abilities: Ability[]; names?: string[]; rules?: { donDeck?: number; leaderCannotAttack?: boolean } };

// ------------------------------------------------------------------ filtre
type FX = Omit<Filter, "zone" | "side">;
export const oppChar = (x: FX = {}): Filter => ({ side: "opp", zone: "characters", ...x });
export const oppLC = (x: FX = {}): Filter => ({ side: "opp", zone: "leaderOrCharacters", ...x });
export const myChar = (x: FX = {}): Filter => ({ zone: "characters", ...x });
export const myLC = (x: FX = {}): Filter => ({ zone: "leaderOrCharacters", ...x });
export const anyChar = (x: FX = {}): Filter => ({ side: "any", zone: "characters", ...x });
export const inHand = (x: FX = {}): Filter => ({ zone: "hand", ...x });
export const inTrash = (x: FX = {}): Filter => ({ zone: "trash", ...x });
export const inLook = (x: FX = {}): Filter => ({ zone: "look", ...x });
export const costMax = (n: number): FX => ({ cost: [0, n] });
export const powMax = (n: number): FX => ({ power: [-99999, n] });
export const CH = "Character" as const;
export const EV = "Event" as const;

// ------------------------------------------------------------------ popisy pre výzvy (slovensky)
export function fdesc(f: Filter): string {
  const who = f.side === "opp" ? "súperovu " : f.side === "any" ? "" : "svoju ";
  const what =
    f.zone === "characters" ? "postavu" : f.zone === "leaderOrCharacters" ? "kartu (leader/postava)" : f.zone === "leader" ? "leadera"
    : f.zone === "hand" ? "kartu z ruky" : f.zone === "trash" ? "kartu z trashu" : f.zone === "look" ? "kartu" : f.zone === "stage" ? "stage" : "kartu";
  const parts: string[] = [];
  if (f.name) parts.push(`[${[f.name].flat().join("]/[")}]`);
  if (f.trait) parts.push(`{${[f.trait].flat().join("}/{")}}`);
  if (f.traitIncl) parts.push(`typ „${f.traitIncl}“`);
  if (f.color) parts.push(f.color);
  if (f.type) parts.push([f.type].flat().join("/"));
  if (f.cost) parts.push(f.cost[0] > 0 ? `cost ${f.cost[0]}–${f.cost[1]}` : `cost ≤ ${f.cost[1]}`);
  if (f.baseCost) parts.push(`base cost ≤ ${f.baseCost[1]}`);
  if (f.power) parts.push(f.power[0] > -99999 ? `power ≥ ${f.power[0]}` : `power ≤ ${f.power[1]}`);
  if (f.basePower) parts.push(f.basePower[0] > -99999 ? `base power ≥ ${f.basePower[0]}` : `base power ≤ ${f.basePower[1]}`);
  if (f.rested) parts.push("v rest");
  if (f.hasTrigger) parts.push("s [Trigger]");
  if (f.keyword) parts.push(`[${f.keyword}]`);
  return `${who}${what}${parts.length ? " – " + parts.join(", ") : ""}`;
}

// ------------------------------------------------------------------ kroky
let vn = 0;
const nv = () => `v${++vn}`;

export const choose = (f: Filter, max: Num, label?: string, min: Num = 0, v = "t"): Step => ({ op: "choose", v, f, max, min, label: label ?? `Vyber ${fdesc(f)}` });
export const all = (f: Filter, v = "t"): Step => ({ op: "all", v, f });

/** K.O. až max súperových postáv */
export const ko = (f: Filter, max = 1, label?: string): Step[] => {
  const v = nv();
  return [choose(f, max, label ?? `K.O. – ${fdesc(f)}`, 0, v), { op: "ko", v }];
};
export const koAll = (f: Filter): Step[] => {
  const v = nv();
  return [all(f, v), { op: "ko", v }];
};
export const rest = (f: Filter, max = 1, label?: string): Step[] => {
  const v = nv();
  return [choose(f, max, label ?? `Daj do rest – ${fdesc(f)}`, 0, v), { op: "rest", v }];
};
export const restAll = (f: Filter): Step[] => {
  const v = nv();
  return [all(f, v), { op: "rest", v }];
};
export const activate = (f: Filter, max = 1, label?: string): Step[] => {
  const v = nv();
  return [choose(f, max, label ?? `Nastav ako aktívnu – ${fdesc(f)}`, 0, v), { op: "activate", v }];
};
export const bounce = (f: Filter, max = 1, label?: string): Step[] => {
  const v = nv();
  return [choose(f, max, label ?? `Vráť do ruky – ${fdesc(f)}`, 0, v), { op: "move", v, to: "hand" }];
};
export const bottom = (f: Filter, max = 1, label?: string): Step[] => {
  const v = nv();
  return [choose(f, max, label ?? `Pod balíček – ${fdesc(f)}`, 0, v), { op: "move", v, to: "deckBottom" }];
};
export const power = (f: Filter, amount: Num, until: Until = "turn", max = 1, label?: string): Step[] => {
  const v = nv();
  const sign = typeof amount === "number" ? (amount > 0 ? `+${amount}` : `${amount}`) : "±";
  return [choose(f, max, label ?? `${sign} power – ${fdesc(f)}`, 0, v), { op: "power", v, amount, until }];
};
export const powerAll = (f: Filter, amount: Num, until: Until = "turn"): Step[] => {
  const v = nv();
  return [all(f, v), { op: "power", v, amount, until }];
};
export const selfPower = (amount: Num, until: Until = "turn"): Step => ({ op: "power", v: "$self", amount, until });
export const leaderPower = (amount: Num, until: Until = "turn"): Step[] => {
  const v = nv();
  return [{ op: "set", v, from: "myLeader" }, { op: "power", v, amount, until }];
};
export const costMod = (f: Filter, amount: Num, until: Until = "turn", max = 1): Step[] => {
  const v = nv();
  return [choose(f, max, `${typeof amount === "number" && amount > 0 ? "+" : ""}${amount} cost – ${fdesc(f)}`, 0, v), { op: "costMod", v, amount, until }];
};
export const gainKw = (f: Filter, kw: Keyword, until: Until = "turn", max = 1): Step[] => {
  const v = nv();
  return [choose(f, max, `Získa [${kw}] – ${fdesc(f)}`, 0, v), { op: "kw", v, kw, until }];
};
export const selfKw = (kw: Keyword, until: Until = "turn"): Step => ({ op: "kw", v: "$self", kw, until });
export const flag = (f: Filter, fl: import("./types").CardFlag, until: Until, max = 1, label?: string): Step[] => {
  const v = nv();
  return [choose(f, max, label ?? `${FLAG_SK[fl] ?? fl} – ${fdesc(f)}`, 0, v), { op: "flag", v, flag: fl, until }];
};
const FLAG_SK: Record<string, string> = {
  cannotAttack: "Nemôže útočiť", noRefresh: "Nebude aktívna v Refresh fáze", cannotBeRested: "Nedá sa dať do rest", negated: "Negovať efekt",
};
export const cannotAttack = (f: Filter, until: Until = "oppNextEndPhase", max = 1) => flag(f, "cannotAttack", until, max);
export const noRefresh = (f: Filter, max = 1) => flag(f, "noRefresh", "permanent", max);
export const negate = (f: Filter, max = 1, until: Until = "turn") => flag(f, "negated", until, max);

export const draw = (n: Num): Step => ({ op: "draw", n });
export const discard = (n: Num, f?: Filter): Step => ({ op: "discard", n, f });
export const drawDiscard = (d: number, t: number): Step[] => [draw(d), discard(t)];
export const oppDiscard = (n: Num): Step => ({ op: "discard", n, side: "opp" });
export const addDon = (n: Num, state: "active" | "rested" = "active"): Step => ({ op: "addDon", n, state });
export const donMinus = (n: Num, atLeast = false): Step => ({ op: "returnDon", n, atLeast });
export const restDon = (n: Num): Step => ({ op: "restDon", n });
export const activeDon = (n: Num): Step => ({ op: "activeDon", n });
export const deckToLife = (n: Num = 1, faceUp = false): Step => ({ op: "deckToLife", n, faceUp });
export const lifeToHand = (side: "me" | "opp" = "me", n: Num = 1, from: "top" | "topOrBottom" = "top"): Step => ({ op: "lifeToHand", side, n, from });
export const trashLife = (side: "me" | "opp", n: Num = 1): Step => ({ op: "trashLife", side, n });
export const restSelf: Step = { op: "rest", v: "$self" };
export const trashSelf: Step = { op: "move", v: "$self", to: "trash" };
export const reveal = (n: number, f: FX = {}): Step => ({ op: "reveal", n, f: { zone: "hand", ...f } });

/** Pripoj až n DON!! v rest na leadera alebo 1 postavu */
export const giveDon = (n: Num, f: Filter = myLC(), max = 1, each = false, label?: string): Step[] => {
  const v = nv();
  return [choose(f, max, label ?? `Komu dať ${typeof n === "number" ? n : ""} DON!!`, 0, v), { op: "giveDon", v, n, each }];
};
export const giveDonLeader = (n: Num): Step[] => {
  const v = nv();
  return [{ op: "set", v, from: "myLeader" }, { op: "giveDon", v, n }];
};

/** „Look at N cards from the top of your deck; reveal up to K … and add to hand. Then place the rest at the bottom.“ */
export const search = (n: number, f: FX = {}, max = 1, rest: "bottom" | "trash" | "top" = "bottom", label?: string): Step[] => {
  const v = nv();
  return [
    { op: "look", n },
    choose(inLook(f), max, label ?? `Vezmi do ruky – ${fdesc(inLook(f))}`, 0, v),
    { op: "move", v, to: "hand" },
    { op: "lookRest", to: rest },
  ];
};

export const playFrom = (zone: "hand" | "trash", f: FX = {}, max = 1, rested = false, label?: string): Step[] => {
  const v = nv();
  const flt: Filter = { zone, type: f.type ?? CH, ...f };
  return [choose(flt, max, label ?? `Zahraj ${fdesc(flt)}${rested ? " (v rest)" : ""}`, 0, v), { op: "play", v, rested }];
};

export const ifThen = (cond: Cond, then: Step[], els?: Step[]): Step => ({ op: "if", cond, then, else: els });
export const oneOf = (options: [string, Step[]][], chooser: "me" | "opp" = "me"): Step => ({ op: "oneOf", chooser, options: options.map(([label, steps]) => ({ label, steps })) });
export const custom = (fn: string, arg?: any): Step => ({ op: "custom", fn, arg });
export const later = (...steps: Step[]): Step => ({ op: "later", when: "endOfTurn", steps });
export const playSelf: Step = { op: "play", v: "$self" };

// ------------------------------------------------------------------ podmienky
export const leaderIs = (name: string | string[]): Cond => ({ c: "leader", f: { zone: "leader", name } });
export const leaderTrait = (trait: string | string[]): Cond => ({ c: "leader", f: { zone: "leader", trait } });
export const leaderTraitIncl = (t: string): Cond => ({ c: "leader", f: { zone: "leader", traitIncl: t } });
export const lifeLe = (n: number, side: "me" | "opp" = "me"): Cond => ({ c: "cmp", a: { n: "life", side }, op: "<=", b: n });
export const lifeGe = (n: number, side: "me" | "opp" = "me"): Cond => ({ c: "cmp", a: { n: "life", side }, op: ">=", b: n });
export const donGe = (n: number, side: "me" | "opp" = "me"): Cond => ({ c: "cmp", a: { n: "donField", side }, op: ">=", b: n });
export const donLe = (n: number, side: "me" | "opp" = "me"): Cond => ({ c: "cmp", a: { n: "donField", side }, op: "<=", b: n });
export const handLe = (n: number): Cond => ({ c: "cmp", a: { n: "hand" }, op: "<=", b: n });
export const handGe = (n: number, side: "me" | "opp" = "me"): Cond => ({ c: "cmp", a: { n: "hand", side }, op: ">=", b: n });
export const trashGe = (n: number): Cond => ({ c: "cmp", a: { n: "trash" }, op: ">=", b: n });
export const has = (f: Filter, min = 1): Cond => ({ c: "exists", f, min });
export const yourTurn: Cond = { c: "turn", who: "mine" };
export const oppTurn: Cond = { c: "turn", who: "opp" };
export const don = (n: number): Cond => ({ c: "donAttached", n });
export const and = (...all: Cond[]): Cond => ({ c: "and", all });
export const or = (...any: Cond[]): Cond => ({ c: "or", any });
export const not = (x: Cond): Cond => ({ c: "not", x });
export const multicolor: Cond = { c: "multicolor" };
/** „If there is a Character with a cost of 12 or more“ (na ktorejkoľvek strane) */
export const thereIs = (x: FX): Cond => has({ side: "any", zone: "characters", ...x });

// ------------------------------------------------------------------ schopnosti
type AO = Partial<Omit<Ability, "when" | "steps">>;
export const onPlay = (steps: Step[], o: AO = {}): Ability => ({ when: "onPlay", steps, ...o });
export const whenAttacking = (steps: Step[], o: AO = {}): Ability => ({ when: "whenAttacking", steps, ...o });
export const onOppAttack = (steps: Step[], o: AO = {}): Ability => ({ when: "onOppAttack", steps, ...o });
export const onKO = (steps: Step[], o: AO = {}): Ability => ({ when: "onKO", steps, ...o });
export const activateMain = (steps: Step[], o: AO = {}): Ability => ({ when: "activateMain", steps, ...o });
export const main = (steps: Step[], o: AO = {}): Ability => ({ when: "main", steps, ...o });
export const counter = (steps: Step[], o: AO = {}): Ability => ({ when: "counter", steps, ...o });
export const trigger = (steps: Step[], o: AO = {}): Ability => ({ when: "trigger", steps, ...o });
export const endOfTurn = (steps: Step[], o: AO = {}): Ability => ({ when: "endOfTurn", steps, ...o });
export const onEvent = (listen: Ability["listen"], steps: Step[], o: AO = {}): Ability => ({ when: "onEvent", listen, steps, ...o });
export const statics = (mods: StaticMod[], cond?: Cond): Ability => ({ when: "static", mods, cond });
export const replaceKO = (f: Filter, cost: Step[], o: AO = {}): Ability => ({ when: "replace", replace: { what: "ko", f }, cost, steps: [], optional: true, ...o });
export const replaceRemoveByOpp = (f: Filter, cost: Step[], o: AO = {}): Ability => ({ when: "replace", replace: { what: "removeByOpp", f }, cost, steps: [], optional: true, ...o });
export const triggerPlaySelf = (cond?: Cond): Ability => trigger(cond ? [ifThen(cond, [playSelf])] : [playSelf]);
export const SELF: Filter = { zone: "characters", self: true };

/** Counter event: +N power počas súboja na leadera/postavu */
export const counterBuff = (n: number, f: Filter = myLC()): Step[] => power(f, n, "battle", 1, `+${n} power počas súboja`);
export const leaderBattle = (n: number): Step[] => leaderPower(n, "battle");
