// Definície kariet pre engine: skripty efektov (DSL) + „vanilla“ karty z databázy kariet.
import type { Ability, CardDef, Keyword } from "./types";

/** Minimálne údaje o karte z /api/cards. */
export type CardData = {
  code: string;
  name: string;
  type: string;
  colors: string[];
  cost: number | null;
  power: number | null;
  counter: number | null;
  life: number | null;
  traits: string;
  text: string;
};

const SH = "Straw Hat Crew";
const myOne = (label: string, trait?: string) =>
  ({ op: "choose", var: "t", filter: { side: "me", zone: "leaderOrCharacters", trait }, min: 0, max: 1, label }) as const;

/** Skripty efektov podľa herného kódu. Každý zodpovedá oficiálnemu textu karty. */
export const SCRIPTS: Record<string, { keywords?: Keyword[]; abilities: Ability[] }> = {
  // ---------------------------------------------------------------- ST-01 Straw Hat Crew
  // [Activate: Main] [Once Per Turn] Give this Leader or 1 of your Characters up to 1 rested DON!! card.
  "ST01-001": { abilities: [{ when: "activateMain", oncePerTurn: true, steps: [{ op: "giveDon", n: 1, label: "Komu dať 1 DON!!" }] }] },
  // [DON!! x2] [When Attacking] Opponent cannot activate a [Blocker] with 5000+ power. [Trigger] Play this card.
  "ST01-002": {
    abilities: [
      { when: "whenAttacking", cond: { c: "donAttached", n: 2 }, steps: [{ op: "noBlocker", minPower: 5000 }] },
      { when: "trigger", steps: [{ op: "playSelf" }] },
    ],
  },
  "ST01-003": { abilities: [] },
  // [DON!! x2] This Character gains [Rush].
  "ST01-004": { abilities: [{ when: "static", cond: { c: "donAttached", n: 2 }, mods: [{ stat: "keyword", kw: "rush", target: "self" }] }] },
  // [DON!! x1] [When Attacking] Up to 1 of your Leader or Character cards other than this card gains +1000 power during this turn.
  "ST01-005": {
    abilities: [
      {
        when: "whenAttacking",
        cond: { c: "donAttached", n: 1 },
        steps: [
          { op: "choose", var: "t", filter: { side: "me", zone: "leaderOrCharacters", notSelf: true }, min: 0, max: 1, label: "+1000 power do konca ťahu" },
          { op: "power", var: "t", amount: 1000, until: "turn" },
        ],
      },
    ],
  },
  "ST01-006": { keywords: ["blocker"], abilities: [] },
  // [Activate: Main] [Once Per Turn] Give up to 1 rested DON!! card to your Leader or 1 of your Characters.
  "ST01-007": { abilities: [{ when: "activateMain", oncePerTurn: true, steps: [{ op: "giveDon", n: 1, label: "Komu dať 1 DON!!" }] }] },
  "ST01-008": { abilities: [] },
  "ST01-009": { abilities: [] },
  "ST01-010": { abilities: [] },
  // [On Play] Give up to 2 rested DON!! cards to your Leader or 1 of your Characters.
  "ST01-011": { abilities: [{ when: "onPlay", steps: [{ op: "giveDon", n: 2, label: "Komu dať 2 DON!!" }] }] },
  // [Rush] [DON!! x2] [When Attacking] Your opponent cannot activate [Blocker] during this battle.
  "ST01-012": { keywords: ["rush"], abilities: [{ when: "whenAttacking", cond: { c: "donAttached", n: 2 }, steps: [{ op: "noBlocker" }] }] },
  // [DON!! x1] This Character gains +1000 power.
  "ST01-013": { abilities: [{ when: "static", cond: { c: "donAttached", n: 1 }, mods: [{ stat: "power", amount: 1000, target: "self" }] }] },
  // [Counter] +3000 during this battle. [Trigger] +1000 during this turn.
  "ST01-014": {
    abilities: [
      { when: "counter", steps: [myOne("+3000 power počas súboja"), { op: "power", var: "t", amount: 3000, until: "battle" }] },
      { when: "trigger", steps: [myOne("+1000 power do konca ťahu"), { op: "power", var: "t", amount: 1000, until: "turn" }] },
    ],
  },
  // [Main] K.O. up to 1 of your opponent's Characters with 6000 power or less. [Trigger] Activate this card's [Main] effect.
  "ST01-015": {
    abilities: [
      {
        when: "main",
        steps: [
          { op: "choose", var: "t", filter: { side: "opp", zone: "characters", maxPower: 6000 }, min: 0, max: 1, label: "K.O. postavu s power ≤ 6000" },
          { op: "ko", var: "t" },
        ],
      },
      { when: "trigger", steps: [{ op: "runMain" }] },
    ],
  },
  // [Main] Straw Hat Crew Leader/Character – opponent cannot activate [Blocker] when it attacks this turn.
  // [Trigger] K.O. up to 1 of your opponent's [Blocker] Characters with a cost of 3 or less.
  "ST01-016": {
    abilities: [
      { when: "main", steps: [myOne("Kto nemôže byť zablokovaný", SH), { op: "noBlockerThisTurn", var: "t" }] },
      {
        when: "trigger",
        steps: [
          { op: "choose", var: "t", filter: { side: "opp", zone: "characters", keyword: "blocker", maxCost: 3 }, min: 0, max: 1, label: "K.O. [Blocker] s cost ≤ 3" },
          { op: "ko", var: "t" },
        ],
      },
    ],
  },
  // [Activate: Main] You may rest this Stage: Up to 1 Straw Hat Crew Leader or Character gains +1000 power during this turn.
  "ST01-017": {
    abilities: [
      { when: "activateMain", cost: [{ op: "restSelf" }], steps: [myOne("+1000 power do konca ťahu", SH), { op: "power", var: "t", amount: 1000, until: "turn" }] },
    ],
  },

  // ---------------------------------------------------------------- ST-26 Purple/Black Luffy
  // [DON!! x1] All of your Characters gain +1 cost.
  // [Your Turn] [Once Per Turn] When 2 or more DON!! cards on your field are returned to your DON!! deck,
  // add up to 1 DON!! card from your DON!! deck and set it as active, and add up to 1 additional DON!! card and rest it.
  "OP09-061": {
    abilities: [
      { when: "static", cond: { c: "donAttached", n: 1 }, mods: [{ stat: "cost", amount: 1, target: "myCharacters" }] },
      {
        when: "onEvent",
        listen: { event: "DonReturned", side: "me", min: 2 },
        cond: { c: "turn", who: "mine" },
        oncePerTurn: true,
        steps: [
          { op: "addDon", n: 1, state: "active" },
          { op: "addDon", n: 1, state: "rested" },
        ],
      },
    ],
  },
  // Hand: -5 cost with a [San-Gorou]/[Sanji] Character with 7000+ base power. [On Play] Return all of your [San-Gorou] and [Sanji] Characters to hand.
  "ST26-001": {
    abilities: [
      { when: "static", handCost: { amount: -5, cond: { c: "hasCharacter", names: ["San-Gorou", "Sanji"], minBasePower: 7000 } } },
      { when: "onPlay", steps: [{ op: "bounceMine", names: ["San-Gorou", "Sanji"] }] },
    ],
  },
  // [Blocker] [On Play] DON!! -2: Rest up to 1 of your opponent's DON!! cards or Characters with a cost of 1 or less.
  "ST26-002": {
    keywords: ["blocker"],
    abilities: [{ when: "onPlay", optional: true, cost: [{ op: "payDon", n: 2 }], steps: [{ op: "restOppDonOrChar", maxCost: 1 }] }],
  },
  // [On Play] DON!! -2: Add up to 1 DON!! card from your DON!! deck and set it as active.
  "ST26-003": { abilities: [{ when: "onPlay", optional: true, cost: [{ op: "payDon", n: 2 }], steps: [{ op: "addDon", n: 1, state: "active" }] }] },
  // [On Play] DON!! -2: Give up to 2 of your opponent's Characters -2000 power during this turn.
  "ST26-004": {
    abilities: [
      {
        when: "onPlay",
        optional: true,
        cost: [{ op: "payDon", n: 2 }],
        steps: [
          { op: "choose", var: "t", filter: { side: "opp", zone: "characters" }, min: 0, max: 2, label: "−2000 power do konca ťahu" },
          { op: "power", var: "t", amount: -2000, until: "turn" },
        ],
      },
    ],
  },
  // [On Play] / [When Attacking] DON!! -2: If your Leader is multicolored and your opponent has 5+ DON!! on their field,
  // your Straw Hat Crew Leader's base power becomes 7000 until the end of your opponent's next End Phase.
  "ST26-005": {
    abilities: (["onPlay", "whenAttacking"] as const).map((when) => ({
      when,
      optional: true,
      cost: [{ op: "payDon" as const, n: 2 }],
      steps: [
        {
          op: "if" as const,
          cond: { c: "and" as const, all: [{ c: "leaderMulticolor" as const }, { c: "donOnField" as const, n: 5, side: "opp" as const }] },
          then: [{ op: "setBasePower" as const, target: "myLeader" as const, value: 7000, until: "oppNextEndPhase" as const, trait: SH }],
        },
      ],
    })),
  },
  "OP05-065": { abilities: [] },
  // [Blocker] [Opponent's Turn] If you have 10 DON!! cards on your field, this Character gains +1000 power.
  "OP05-066": {
    keywords: ["blocker"],
    abilities: [
      { when: "static", cond: { c: "and", all: [{ c: "turn", who: "opp" }, { c: "donOnField", n: 10 }] }, mods: [{ stat: "power", amount: 1000, target: "self" }] },
    ],
  },
  // [DON!! x1] If you have 8 or more DON!! cards on your field, this Character gains [Rush].
  "OP05-070": {
    abilities: [
      { when: "static", cond: { c: "and", all: [{ c: "donAttached", n: 1 }, { c: "donOnField", n: 8 }] }, mods: [{ stat: "keyword", kw: "rush", target: "self" }] },
    ],
  },
  "OP09-063": { abilities: [] },
  // [On Play] You may return 1 or more DON!! cards: Give up to 2 rested DON!! cards to your Leader or 1 of your Characters.
  "OP09-070": {
    abilities: [{ when: "onPlay", optional: true, cost: [{ op: "payDon", n: 1, atLeast: true }], steps: [{ op: "giveDon", n: 2, label: "Komu dať 2 DON!!" }] }],
  },
  // [On Play] You may return 1 or more DON!! cards: Add up to 1 DON!! card from your DON!! deck and set it as active.
  "OP09-076": { abilities: [{ when: "onPlay", optional: true, cost: [{ op: "payDon", n: 1, atLeast: true }], steps: [{ op: "addDon", n: 1, state: "active" }] }] },
  // [Main] DON!! −2: K.O. up to 1 of your opponent's Characters with 6000 power or less. [Trigger] Add up to 1 DON!! and set it as active.
  "OP09-077": {
    abilities: [
      {
        when: "main",
        optional: true,
        cost: [{ op: "payDon", n: 2 }],
        steps: [
          { op: "choose", var: "t", filter: { side: "opp", zone: "characters", maxPower: 6000 }, min: 0, max: 1, label: "K.O. postavu s power ≤ 6000" },
          { op: "ko", var: "t" },
        ],
      },
      { when: "trigger", steps: [{ op: "addDon", n: 1, state: "active" }] },
    ],
  },
};

const KW: [RegExp, Keyword][] = [
  [/\[Blocker\]/i, "blocker"],
  [/\[Rush\]/i, "rush"],
  [/\[Double Attack\]/i, "doubleAttack"],
  [/\[Banish\]/i, "banish"],
];

/** Text karty bez vysvetliviek v zátvorkách a bez samotných kľúčových slov – ak ostane niečo, karta má efekt. */
function hasEffectText(text: string) {
  const t = (text || "")
    .replace(/NULL/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\[(Blocker|Rush|Double Attack|Banish)\]/gi, "")
    .trim();
  return t.length > 0;
}

export function buildDef(c: CardData): CardDef {
  const s = SCRIPTS[c.code];
  const text = c.text && c.text !== "NULL" ? c.text : "";
  // kľúčové slová len ak sú „samostatne“ (nie [DON!! x2] … gains [Rush])
  const plainKw = KW.filter(([re]) => re.test(text.split(/\[DON!!|\[Opponent's Turn\]|\[Your Turn\]|If /)[0])).map(([, k]) => k);
  return {
    code: c.code,
    name: c.name,
    type: (["Leader", "Character", "Event", "Stage"].includes(c.type) ? c.type : "Character") as CardDef["type"],
    colors: c.colors,
    cost: c.cost ?? 0,
    power: c.power ?? 0,
    counter: c.counter ?? 0,
    life: c.life ?? 0,
    traits: c.traits ? splitTraits(c.traits) : [],
    keywords: s?.keywords ?? plainKw,
    abilities: s?.abilities ?? [],
    scripted: !!s || !hasEffectText(text),
    text,
  };
}

/** OPTCG API dáva traity ako jeden reťazec („Straw Hat Crew Supernovas“) → rozpoznáme známe viacslovné traity. */
const KNOWN_TRAITS = [
  "Straw Hat Crew", "The Four Emperors", "Fish-Man", "Supernovas", "Animal", "Alabasta", "Navy", "Land of Wano",
  "Whitebeard Pirates", "Red-Haired Pirates", "Big Mom Pirates", "Animal Kingdom Pirates", "The Seven Warlords of the Sea",
  "Donquixote Pirates", "Revolutionary Army", "Heart Pirates", "Kid Pirates", "Egghead", "World Government", "CP9",
];
export function splitTraits(s: string): string[] {
  const out: string[] = [];
  let rest = ` ${s} `;
  for (const t of KNOWN_TRAITS) if (rest.includes(` ${t} `)) (out.push(t), (rest = rest.replace(` ${t} `, " ")));
  rest.trim().split(/\s{2,}|\s*\/\s*/).filter(Boolean).forEach((x) => x.trim() && out.push(x.trim()));
  return out;
}
