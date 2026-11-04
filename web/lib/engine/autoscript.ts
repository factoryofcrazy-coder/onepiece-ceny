// Prekladač textov kariet do DSL. Prekladá len kartu, ktorej CELÉMU textu rozumie; inak vráti null
// a karta ostane označená „efekt ešte nie je v hre“. Ručné skripty majú vždy prednosť.
import type { Ability, Cond, Filter, Keyword, Step, Until } from "./types";
import {
  activate, activeDon, addDon, bottom, bounce, choose, CH, costMod, counterBuff, deckToLife, discard, donMinus, draw, EV, giveDon, handGe, handLe, has, ifThen,
  ko, leaderPower, leaderTrait, leaderIs, lifeGe, lifeLe, donGe, donLe, myChar, myLC, oppChar, oppDiscard, playSelf, power, rest, restDon, restSelf, Script, search,
  selfKw, selfPower, statics, trashGe, trashSelf, trigger, triggerPlaySelf, don, anyChar, SELF, and, inTrash, lifeToHand, playFrom, powerAll, oppLC, leaderTraitIncl, multicolor, not, inHand, trashLife, oneOf, inLook,
} from "./dsl";

type Fx = Omit<Filter, "zone" | "side">;
const KW: Record<string, Keyword> = { Rush: "rush", "Double Attack": "doubleAttack", Banish: "banish", Blocker: "blocker" };
const num = (s: string) => parseInt(s.replace(/,/g, ""), 10);

// ---- kvalifikátory kariet: „with a cost of 4 or less“, „{Straw Hat Crew} type“, „[Nami]“…
function qualifiers(input: string): Fx | null {
  let s = ` ${input} `;
  const f: Fx = {};
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = s.match(re);
    if (m) {
      fn(m);
      s = s.replace(re, " ");
    }
  };
  take(/ with a (base )?cost of (\d+) or less /, (m) => (m[1] ? (f.baseCost = [0, num(m[2])]) : (f.cost = [0, num(m[2])])));
  take(/ with a (base )?cost of (\d+) or more /, (m) => (m[1] ? (f.baseCost = [num(m[2]), 99]) : (f.cost = [num(m[2]), 99])));
  take(/ with a (base )?cost of (\d+) /, (m) => (m[1] ? (f.baseCost = [num(m[2]), num(m[2])]) : (f.cost = [num(m[2]), num(m[2])])));
  take(/ with ([\d,]+) (base )?power or less /, (m) => (m[2] ? (f.basePower = [-99999, num(m[1])]) : (f.power = [-99999, num(m[1])])));
  take(/ with ([\d,]+) (base )?power or more /, (m) => (m[2] ? (f.basePower = [num(m[1]), 99999]) : (f.power = [num(m[1]), 99999])));
  take(/ with a \[Trigger\] /, () => (f.hasTrigger = true));
  take(/ other than \[([^\]]+)\] /, (m) => (f.notName = m[1]));
  take(/ other than this Character /, () => (f.notSelf = true));
  take(/ (?:\{([^}]+)\}|"([^"]+)"|\[([^\]]+)\]) or (?:\{([^}]+)\}|"([^"]+)"|\[([^\]]+)\]) type /, (m) => (f.trait = [m[1] ?? m[2] ?? m[3], m[4] ?? m[5] ?? m[6]]));
  take(/ \[([^\]]+)\] or \[([^\]]+)\] /, (m) => (f.name = [m[1], m[2]]));
  take(/ \{([^}]+)\} type /, (m) => (f.trait = m[1]));
  take(/ \[([^\]]+)\] type /, (m) => (f.trait = m[1]));
  take(/ "([^"]+)" type /, (m) => (f.trait = m[1]));
  take(/ type including "([^"]+)" /, (m) => (f.traitIncl = m[1]));
  take(/ (?:with )?\[(Blocker|Rush|Banish|Double Attack)\] /, (m) => (f.keyword = KW[m[1]]));
  take(/ \[([^\]]+)\] /, (m) => (f.name = m[1]));
  return s.trim() ? null : f;
}

// ---- „up to 2 of your opponent's rested Characters with a cost of 4 or less“ → filter a počet
function targets(input: string): { f: Filter; max: number } | null {
  let s = input.trim();
  const m = s.match(/^up to (\d+) (?:of )?(.*)$/i);
  if (!m) return null;
  const max = num(m[1]);
  s = m[2];
  let make: (x: Fx) => Filter;
  let rested = false;
  const oppLc = s.match(/^your opponent's (?:(.*?) ?)Leader or Character cards?\b(.*)$/);
  if (oppLc) {
    const q = qualifiers(`${oppLc[1] ?? ""} ${oppLc[2]}`);
    return q ? { f: oppLC(q), max } : null;
  }
  const opp = s.match(/^your opponent's (rested )?(?:(.*?) ?)Characters?\b(.*)$/);
  const lc = s.match(/^your (?:(.*?) ?)Leader or Character cards?\b(.*)$/);
  const mine = s.match(/^your (rested )?(?:(.*?) ?)Characters?\b(.*)$/);
  const any = s.match(/^(rested )?(?:(.*?) ?)Characters?\b(.*)$/);
  let rest1 = "";
  if (opp) {
    make = oppChar;
    rested = !!opp[1];
    rest1 = `${opp[2] ?? ""} ${opp[3]}`;
  } else if (lc) {
    make = myLC;
    rest1 = `${lc[1] ?? ""} ${lc[2]}`;
  } else if (mine) {
    make = myChar;
    rested = !!mine[1];
    rest1 = `${mine[2] ?? ""} ${mine[3]}`;
  } else if (any) {
    make = anyChar;
    rested = !!any[1];
    rest1 = `${any[2] ?? ""} ${any[3]}`;
  } else {
    const named = s.match(/^your (.*?) cards?\b(.*)$/);
    if (!named) return null;
    make = myLC;
    rest1 = `${named[1]} ${named[2]}`;
  }
  const q = qualifiers(rest1);
  if (!q) return null;
  if (rested) q.rested = true;
  return { f: make(q), max };
}

const until = (s: string): Until | null => (s === "during this turn" ? "turn" : s === "during this battle" ? "battle" : null);
const signed = (s: string) => num(s.replace(/^[−–+-]/, "")) * (/^[−–-]/.test(s) ? -1 : 1);

/** Posledná veta, ktorej prekladač nerozumel (len na ladenie, tools a testy). */
export let lastFail = "";

// ---- jedna veta efektu
function action(input: string): Step[] | null {
  const t = input.trim().replace(/^([a-z])/, (c) => c.toUpperCase());
  const r = actionInner(t);
  if (r) return r;
  // „Trash 2 cards from the top of your deck and give up to 1…“
  const m = t.match(/^(.*?) and ((?:give|play|draw|trash|add|rest|KO|return|set)\b.*)$/);
  if (m) {
    const a = action(m[1]);
    const b = a && action(m[2]);
    if (a && b) return [...a, ...b];
  }
  lastFail = t;
  return null;
}

function actionInner(input: string): Step[] | null {
  const s = input.trim().replace(/\.$/, "");
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^Draw (\d+) cards?$/i))) return [draw(num(m[1]))];
  if ((m = s.match(/^Draw (\d+) cards? and trash (\d+) cards? from your hand$/i))) return [draw(num(m[1])), discard(num(m[2]))];
  if ((m = s.match(/^Trash (\d+) cards? from your hand$/i))) return [discard(num(m[1]))];
  if ((m = s.match(/^Your opponent trashes (\d+) cards? from their hand$/i))) return [oppDiscard(num(m[1]))];
  if ((m = s.match(/^KO (up to .*)$/i))) {
    const t = targets(m[1]);
    return t && t.f.side !== undefined ? ko(t.f, t.max) : null;
  }
  if ((m = s.match(/^Rest (up to .*)$/i))) {
    const t = targets(m[1]);
    return t && t.f.side === "opp" ? rest(t.f, t.max) : null;
  }
  if ((m = s.match(/^Return (up to .*) to the owner's hand$/i))) {
    const t = targets(m[1]);
    return t ? bounce(t.f, t.max) : null;
  }
  if ((m = s.match(/^Place (up to .*) at the bottom of the owner's deck$/i))) {
    const t = targets(m[1]);
    return t ? bottom(t.f, t.max) : null;
  }
  if ((m = s.match(/^Set (up to \d+ of your .*Characters?.*) as active$/i))) {
    const t = targets(m[1]);
    return t && !t.f.side ? activate(t.f, t.max) : null;
  }
  if ((m = s.match(/^Set up to (\d+) of your DON!! cards? as active$/i))) return [activeDon(num(m[1]))];
  if ((m = s.match(/^Add up to (\d+) DON!! cards? from your DON!! deck and rest (?:it|them)$/i))) return [addDon(num(m[1]), "rested")];
  if ((m = s.match(/^Add up to (\d+) DON!! cards? from your DON!! deck and set (?:it|them) as active$/i))) return [addDon(num(m[1]), "active")];
  if ((m = s.match(/^Add up to (\d+) cards? from the top of your deck to the top of your Life cards$/i))) return [deckToLife(num(m[1]))];
  if ((m = s.match(/^Give up to (\d+) rested DON!! cards? to your Leader or (\d+) of your Characters$/i))) return m[2] === "1" ? giveDon(num(m[1])) : null;
  // zdroj textov občas stratí mínus: „Give … your opponent's Characters 2000 power“ je vždy strata
  if ((m = s.match(/^Give (up to .*?) ([−–+-]?[\d,]+) power (during this (?:turn|battle))$/i))) {
    const t = targets(m[1]);
    const u = until(m[3]);
    if (!t || !u) return null;
    if (!/^[−–+-]/.test(m[2]) && t.f.side !== "opp") return null;
    return power(t.f, /^[−–+-]/.test(m[2]) ? signed(m[2]) : -num(m[2]), u, t.max);
  }
  if ((m = s.match(/^Give (up to .*?) ([−–+-]?\d+) cost (during this turn)$/i))) {
    const t = targets(m[1]);
    if (!t) return null;
    if (!/^[−–+-]/.test(m[2]) && t.f.side !== "opp") return null;
    return costMod(t.f, /^[−–+-]/.test(m[2]) ? signed(m[2]) : -num(m[2]), "turn", t.max);
  }
  if ((m = s.match(/^Trash (\d+) cards? from the top of your deck$/i))) return [{ op: "mill", n: num(m[1]) }];
  if ((m = s.match(/^Add up to (\d+) cards? from the top of your Life cards to your hand$/i))) return [lifeToHand("me", num(m[1]))];
  if ((m = s.match(/^Add up to (\d+) cards? from the top or bottom of your Life cards to your hand$/i))) return [lifeToHand("me", num(m[1]), "topOrBottom")];
  if ((m = s.match(/^(Up to .*?) gains? ([−–+-][\d,]+) power (during this (?:turn|battle))$/))) {
    const t = targets(m[1]);
    const u = until(m[3]);
    return t && u ? power(t.f, signed(m[2]), u, t.max) : null;
  }
  if ((m = s.match(/^Your Leader gains ([−–+-][\d,]+) power (during this (?:turn|battle))$/))) {
    const u = until(m[2]);
    return u ? leaderPower(signed(m[1]), u) : null;
  }
  if ((m = s.match(/^This Character gains ([−–+-][\d,]+) power (during this (?:turn|battle))$/))) {
    const u = until(m[2]);
    return u ? [selfPower(signed(m[1]), u)] : null;
  }
  if ((m = s.match(/^This Character gains \[(Rush|Double Attack|Banish|Blocker)\] during this turn$/))) return [selfKw(KW[m[1]])];
  if ((m = s.match(/^All of your (.*?)Characters? gains? ([−–+-][\d,]+) power (during this (?:turn|battle))$/))) {
    const q = qualifiers(m[1]);
    const u = until(m[3]);
    return q && u ? powerAll(myChar(q), signed(m[2]), u) : null;
  }
  if ((m = s.match(/^Play up to (\d+) (.*?)(Character|Stage)? ?cards? (.*?)?from your (hand|trash)( rested)?$/i))) {
    const q = qualifiers(`${m[2]} ${m[4] ?? ""}`);
    if (!q) return null;
    if (m[3]) q.type = m[3] as Fx["type"];
    return playFrom(m[5] as "hand" | "trash", q, num(m[1]), !!m[6]);
  }
  if ((m = s.match(/^Add up to (\d+) (.*?)(Character|Event|Stage)? ?cards? (.*?)?from your trash to your hand$/i))) {
    const q = qualifiers(`${m[2]} ${m[4] ?? ""}`);
    if (!q) return null;
    if (m[3]) q.type = m[3] as Fx["type"];
    const v = `tr${num(m[1])}`;
    return [choose(inTrash(q), num(m[1]), undefined, 0, v), { op: "move", v, to: "hand" }];
  }
  if (/^Add up to 1 card from the top of your Life cards to your hand$/i.test(s)) return [lifeToHand("me", 1)];
  if (/^Rest this (Character|Leader)$/i.test(s)) return [restSelf];
  if (/^Set this Character as active$/i.test(s)) return [{ op: "activate", v: "$self" }];
  if ((m = s.match(/^Your opponent returns (\d+) DON!! cards? from their field to their DON!! deck$/i))) return [{ op: "returnDon", n: num(m[1]), side: "opp" }];
  if ((m = s.match(/^Look at (\d+) cards? from the top of your deck and place them at the top or bottom of (?:the|your) deck in any order$/i))) return scry(num(m[1]));
  if (/^Activate this card's \[On Play\] effect$/i.test(s)) return [{ op: "runAbility", which: "onPlay" }];
  if (/^Activate this card's \[On KO\] effect$/i.test(s)) return [{ op: "runAbility", which: "onKO" }];
  if (/^Trash this Character$/i.test(s)) return [trashSelf];
  if (/^Play this card$/.test(s)) return [playSelf];
  if (/^Activate this card's \[Main\] effect$/.test(s)) return [{ op: "runAbility", which: "main" }];
  return null;
}

// ---- podmienka za „If …,“
function condition(s: string): Cond | null {
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^your Leader has the (?:\{([^}]+)\}|"([^"]+)"|\[([^\]]+)\]) type$/))) return leaderTrait(m[1] ?? m[2] ?? m[3]);
  if ((m = s.match(/^your Leader is \[([^\]]+)\]$/))) return leaderIs(m[1]);
  if ((m = s.match(/^your Leader's type includes (?:"([^"]+)"|\{([^}]+)\})$/))) return leaderTraitIncl(m[1] ?? m[2]);
  if ((m = s.match(/^your Leader has the (?:\{([^}]+)\}|"([^"]+)"|\[([^\]]+)\]) or (?:\{([^}]+)\}|"([^"]+)"|\[([^\]]+)\]) type$/))) return leaderTrait([m[1] ?? m[2] ?? m[3], m[4] ?? m[5] ?? m[6]]);
  if (s === "your Leader is multicolored") return multicolor;
  if ((m = s.match(/^you have (\d+) or more rested Characters?$/))) return has(myChar({ rested: true }), num(m[1]));
  if ((m = s.match(/^you have a (.*?) ?Character(.*)$/))) {
    const q = qualifiers(`${m[1]} ${m[2]}`);
    return q ? has(myChar(q)) : null;
  }
  if ((m = s.match(/^you have \[([^\]]+)\]$/))) return has(myChar({ name: m[1] }));
  if ((m = s.match(/^you don't have \[([^\]]+)\]$/))) return not(has(myChar({ name: m[1] })));
  if ((m = s.match(/^your opponent has (\d+) or more cards? in their hand$/))) return handGe(num(m[1]), "opp");
  if ((m = s.match(/^your opponent has (\d+) or more DON!! cards? on their field$/))) return donGe(num(m[1]), "opp");
  if ((m = s.match(/^your opponent has (\d+) or less DON!! cards? on their field$/))) return donLe(num(m[1]), "opp");
  if (s === "your opponent has more DON!! cards on their field than you")
    return { c: "cmp", a: { n: "donField", side: "opp" }, op: ">", b: { n: "donField", side: "me" } };
  if (s === "the number of DON!! cards on your field is equal to or less than the number on your opponent's field")
    return { c: "cmp", a: { n: "donField", side: "me" }, op: "<=", b: { n: "donField", side: "opp" } };
  if ((m = s.match(/^you have (\d+) or less Life cards?$/))) return lifeLe(num(m[1]));
  if ((m = s.match(/^you have (\d+) or more Life cards?$/))) return lifeGe(num(m[1]));
  if ((m = s.match(/^your opponent has (\d+) or less Life cards?$/))) return lifeLe(num(m[1]), "opp");
  if ((m = s.match(/^your opponent has (\d+) or more Life cards?$/))) return lifeGe(num(m[1]), "opp");
  if ((m = s.match(/^you have (\d+) or less cards? in your hand$/))) return handLe(num(m[1]));
  if ((m = s.match(/^you have (\d+) or more cards? in your hand$/))) return handGe(num(m[1]));
  if ((m = s.match(/^you have (\d+) or more cards? in your trash$/))) return trashGe(num(m[1]));
  if ((m = s.match(/^you have (\d+) or more DON!! cards? on your field$/))) return donGe(num(m[1]));
  if ((m = s.match(/^you have (\d+) or less DON!! cards? on your field$/))) return donLe(num(m[1]));
  if ((m = s.match(/^you have (\d+) or more (.*?) ?Characters?(.*)$/))) {
    const q = qualifiers(`${m[2]} ${m[3]}`);
    return q ? has(myChar(q), num(m[1])) : null;
  }
  return null;
}

// ---- cena pred dvojbodkou
function costOf(s: string): Step[] | null {
  const out: Step[] = [];
  for (const part of s.split(/ and /)) {
    const t = part.trim();
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^DON!! ?[−–-](\d+)$/))) out.push(donMinus(num(m[1])));
    else if ((m = t.match(/^trash (\d+) cards? from your hand$/i))) out.push(discard(num(m[1])));
    else if ((m = t.match(/^trash (\d+) (.*?) ?(Character|Event|Stage)? ?cards? from your hand$/i)) || (m = t.match(/^trash (\d+) (.*?) ?(Character|Event|Stage) from your hand$/i))) {
      const q = qualifiers(m[2]);
      if (!q) return null;
      if (m[3]) q.type = m[3] as Fx["type"];
      out.push(discard(num(m[1]), inHand(q)));
    } else if ((m = t.match(/^add (\d+) cards? from the top of your Life cards to your hand$/i))) out.push(lifeToHand("me", num(m[1])));
    else if ((m = t.match(/^add (\d+) cards? from the top or bottom of your Life cards to your hand$/i))) out.push(lifeToHand("me", num(m[1]), "topOrBottom"));
    else if ((m = t.match(/^trash (\d+) cards? from the top of your deck$/i))) out.push({ op: "mill", n: num(m[1]) });
    else if ((m = t.match(/^trash (\d+) cards? from the top of your Life cards$/i))) out.push(trashLife("me", num(m[1])));
    else if (/^return this Character to the owner's hand$/i.test(t)) out.push({ op: "move", v: "$self", to: "hand" });
    else if ((m = t.match(/^rest (\d+) of your DON!! cards?$/i))) out.push(restDon(num(m[1])));
    else if ((m = t.match(/^rest (\d+) of your DON!! cards? and this Character$/i))) out.push(restDon(num(m[1])), restSelf);
    else if (/^rest this (Character|Leader|Stage|card)$/i.test(t)) out.push(restSelf);
    else if (/^trash this (Character|Stage|card)$/i.test(t)) out.push(trashSelf);
    else return null;
  }
  return out;
}

const scry = (n: number): Step[] => {
  const v = "sc";
  return [{ op: "look", n }, choose(inLook(), n, "Ktoré karty dať POD balíček? (ostatné ostanú navrchu)", 0, v), { op: "move", v, to: "deckBottom" }, { op: "lookRest", to: "top" }];
};

const SEARCH =
  /^Look at (\d+) cards? from the top of your deck; reveal up to (\d+) (.*?)cards? (?:(.*?) )?and add (?:it|them) to your hand\. Then, place the rest at the (bottom|top) of your deck in any order\.?/;

function searchStep(s: string): { steps: Step[]; rest: string } | null {
  const m = s.match(SEARCH);
  if (!m) return null;
  let front = m[3].trim();
  const f0: Fx = {};
  const typed = front.match(/^(.*?)\s*\b(Character|Event|Stage)$/);
  if (typed) {
    front = typed[1];
    f0.type = typed[2] as Fx["type"];
  }
  const q = qualifiers(`${front} ${m[4] ?? ""}`);
  if (!q) return null;
  return { steps: search(num(m[1]), { ...f0, ...q }, num(m[2]), m[5] as "bottom" | "top"), rest: s.slice(m[0].length).trim() };
}

// ---- telo schopnosti = vety za sebou, môžu mať „If …,“
function body(input: string): Step[] | null {
  let s = input.trim();
  // „Choose one: • A • B“
  const pick = s.match(/^Choose one:\s*•\s*(.*)$/);
  if (pick) {
    const options = pick[1].split(/\s*•\s*/).map((text) => {
      const steps = body(text);
      return steps ? ([text.replace(/\.$/, ""), steps] as [string, Step[]]) : null;
    });
    if (options.some((o) => !o)) return null;
    return [oneOf(options as [string, Step[]][])];
  }
  const out: Step[] = [];
  while (s) {
    s = s.replace(/^Then, /, "").trim();
    const cond = s.match(/^If ([^,]+), (.*)$/);
    if (cond) {
      if (/you do\b|you did\b|instead|would/.test(cond[1])) return null;
      const c = condition(cond[1]);
      if (!c) {
        lastFail = `IF ${cond[1]}`;
        return null;
      }
      // podmienka platí len pre svoju vetu, inak by sme ticho zmenili význam
      const inner = cond[2];
      const sr = searchStep(inner);
      const [first, rest1] = sr ? [null, sr.rest] : splitSentence(inner);
      const steps = sr ? sr.steps : first != null ? action(first) : null;
      if (!steps) return null;
      // „Ak X, A. Potom B.“ – nie je isté, či podmienka platí aj pre B, takú kartu radšej neprekladáme
      if (/^Then,/.test(rest1)) return null;
      out.push(ifThen(c, steps));
      s = rest1;
      continue;
    }
    const sr = searchStep(s);
    if (sr) {
      out.push(...sr.steps);
      s = sr.rest;
      continue;
    }
    const [first, rest1] = splitSentence(s);
    const steps = action(first);
    if (!steps) return null;
    out.push(...steps);
    s = rest1;
  }
  return out.length ? out : null;
}

function splitSentence(s: string): [string, string] {
  const i = s.search(/\.(\s|$)/);
  if (i < 0) return [s, ""];
  return [s.slice(0, i), s.slice(i + 1).trim()];
}

const TIMING = /\[(On Play|When Attacking|Main|Counter|Activate: ?Main|On KO|End of Your Turn|Your Turn|Opponent's Turn|Trigger)\]/;

export function autoScript(text: string): Script | null {
  let t = (text || "")
    .replace(/NULL/g, " ")
    // „DON!! 1“ bez znamienka môže znamenať aj (1); istota je len pri vysvetlivke o vrátení
    .replace(/DON!! ?(\d+) ?\(You may return/g, "DON!! -$1 (You may return")
    .replace(/\([^)]*\)/g, " ")
    .replace(/This card has been officially errata'?d\.?/gi, " ")
    .replace(/K\.O\./g, "KO") // bodky v „K.O.“ by sa pomýlili s koncom vety
    .replace(/\s+/g, " ")
    .trim();
  t = t.replace(/^(\[(Blocker|Rush|Rush: Character|Banish|Double Attack)\]\s*)+/, "").trim();
  if (!t) return null;
  const abilities: Ability[] = [];
  while (t) {
    let cond: Cond | undefined;
    let m = t.match(/^\[DON!! x(\d+)\]\s*/);
    if (m) {
      cond = don(num(m[1]));
      t = t.slice(m[0].length);
    }
    // statické: „[DON!! x1] This Character gains +1000 power.“ / „[Your Turn] This Character gains +1000 power.“
    const stIf = t.match(/^If ([^,]+), this Character gains (?:([−–+-][\d,]+) power|\[(Rush|Double Attack|Banish|Blocker)\])\.?\s*/);
    if (stIf && !cond) {
      const c = condition(stIf[1]);
      if (!c) {
        lastFail = `IF ${stIf[1]}`;
        return null;
      }
      const mod = stIf[2] ? { stat: "power" as const, amount: signed(stIf[2]), f: SELF } : { stat: "kw" as const, kw: KW[stIf[3]], f: SELF };
      abilities.push(statics([mod], c));
      t = t.slice(stIf[0].length);
      continue;
    }
    m = t.match(/^(\[(?:Your Turn|Opponent's Turn)\] )?This Character gains (?:([−–+-][\d,]+) power|\[(Rush|Double Attack|Banish)\])\.?\s*/);
    if (m && (cond || m[1])) {
      const mod = m[2] ? { stat: "power" as const, amount: signed(m[2]), f: SELF } : { stat: "kw" as const, kw: KW[m[3]], f: SELF };
      const c = m[1] ? ({ c: "turn", who: /Your/.test(m[1]) ? "mine" : "opp" } as Cond) : undefined;
      abilities.push(statics([mod], cond && c ? and(cond, c) : (cond ?? c)));
      t = t.slice(m[0].length);
      continue;
    }
    const open = t.match(/^\[(On Play|When Attacking|Main|Counter|Activate: ?Main|On KO|End of Your Turn|Trigger)\]\s*/);
    if (!open) {
      lastFail = `START ${t.slice(0, 60)}`;
      return null;
    }
    t = t.slice(open[0].length);
    // „[On Play] / [When Attacking] …“: rovnaký efekt pre dve načasovania
    const also = t.match(/^\/\s*\[(On Play|When Attacking|Main|Counter|On KO)\]\s*/);
    if (also) t = t.slice(also[0].length);
    const once = /^\[Once Per Turn\]\s*/.exec(t);
    if (once) t = t.slice(once[0].length);
    // „Activate this card's [Main] effect“ nie je začiatok novej schopnosti
    const next = t.search(new RegExp(`(\\[DON!! x\\d+\\]|(?<!card's )${TIMING.source})`));
    let chunk = next < 0 ? t : t.slice(0, next);
    t = next < 0 ? "" : t.slice(next);
    chunk = chunk.trim();

    const o: Partial<Ability> = {};
    if (cond) o.cond = cond;
    if (once) o.once = true;
    const paid = chunk.match(/^(You may )?([^:.]+): (.*)$/);
    if (paid) {
      const c = costOf(paid[2]);
      if (!c) {
        lastFail = `COST ${paid[2]}`;
        return null;
      }
      o.cost = c;
      o.optional = true;
      chunk = paid[3];
    }
    const when = open[1].replace(/\s/g, "");
    if (when === "Trigger" && !o.cost && /^Play this card\.?$/.test(chunk)) {
      abilities.push(triggerPlaySelf());
      continue;
    }
    const steps = body(chunk);
    if (!steps) return null;
    const map: Record<string, Ability["when"]> = {
      OnPlay: "onPlay", WhenAttacking: "whenAttacking", Main: "main", Counter: "counter", "Activate:Main": "activateMain", OnKO: "onKO", EndofYourTurn: "endOfTurn", Trigger: "trigger",
    };
    abilities.push({ when: map[when], steps, ...o });
    if (also) abilities.push({ when: map[also[1].replace(/\s/g, "")], steps, ...o });
  }
  return abilities.length ? { abilities } : null;
}

void CH;
void EV;
void choose;
void counterBuff;
void trigger;
