// Typy herného enginu – všetko je čisté dáta (serializovateľné do JSON).

export type P = 0 | 1;
export const other = (p: P): P => (p === 0 ? 1 : 0);

// ------------------------------------------------------------------ karty
export type CardType = "Leader" | "Character" | "Event" | "Stage";
export type Keyword = "rush" | "blocker" | "doubleAttack" | "banish";
export type Until = "turn" | "battle" | "oppNextEndPhase";

/** Podmienka – vyhodnocuje sa vždy v aktuálnom stave. */
export type Cond =
  | { c: "donAttached"; n: number } // [DON!! xN] na tejto karte
  | { c: "turn"; who: "mine" | "opp" } // [Your Turn] / [Opponent's Turn]
  | { c: "donOnField"; n: number; side?: "me" | "opp" } // DON!! na poli ≥ n
  | { c: "leaderMulticolor" }
  | { c: "hasCharacter"; names?: string[]; trait?: string; minBasePower?: number }
  | { c: "lifeAtMost"; n: number; side?: "me" | "opp" }
  | { c: "and"; all: Cond[] }
  | { c: "not"; x: Cond };

/** Ktoré karty sa dajú vybrať. */
export type Filter = {
  side: "me" | "opp";
  zone: "characters" | "leaderOrCharacters" | "leader";
  maxCost?: number;
  maxPower?: number;
  trait?: string;
  keyword?: Keyword;
  rested?: boolean;
  notSelf?: boolean;
};

/** Kocky DSL. `var` = meno premennej s vybranými kartami (inštancie). */
export type Step =
  | { op: "choose"; var: string; filter: Filter; min: number; max: number; label: string }
  | { op: "draw"; n: number }
  | { op: "ko"; var: string }
  | { op: "rest"; var: string }
  | { op: "bounce"; var: string } // vráť do ruky majiteľa
  | { op: "power"; var: string | "self"; amount: number; until: Until }
  | { op: "setBasePower"; target: "myLeader"; value: number; until: Until; trait?: string }
  | { op: "addDon"; n: number; state: "active" | "rested" } // z DON!! balíčka na pole
  | { op: "giveDon"; n: number; label: string } // pripoj až n rest DON!! na môjho leadera/postavu
  | { op: "restOppDonOrChar"; maxCost: number } // ST26-002
  | { op: "noBlocker"; minPower?: number } // súper nemôže aktivovať [Blocker] (s power ≥ X) v tomto súboji
  | { op: "noBlockerThisTurn"; var: string } // Diable Jambe
  | { op: "bounceMine"; names: string[] } // vráť všetky moje postavy s týmito menami do ruky
  | { op: "playSelf" } // [Trigger] Play this card
  | { op: "runMain" } // [Trigger] Activate this card's [Main] effect
  | { op: "if"; cond: Cond; then: Step[]; else?: Step[] };

/** Cena schopnosti – platí sa pred efektom. */
export type Cost =
  | { op: "payDon"; n: number; atLeast?: boolean } // DON!! −n ; atLeast = "1 or more"
  | { op: "restSelf" };

export type Trigger =
  | "static"
  | "onPlay"
  | "whenAttacking"
  | "onKO"
  | "activateMain"
  | "main" // [Main] na evente
  | "counter" // [Counter] na evente
  | "trigger" // [Trigger] z Life
  | "onEvent"
  | "endOfTurn";

/** Trvalý efekt (static) – vyhodnocuje sa pri každom prepočte. */
export type StaticMod =
  | { stat: "power"; amount: number; target: "self" | "myCharacters" | "myLeader" }
  | { stat: "cost"; amount: number; target: "myCharacters" | "self" }
  | { stat: "keyword"; kw: Keyword; target: "self" };

export type Ability = {
  when: Trigger;
  cond?: Cond; // napr. [DON!! x1], [Your Turn]
  oncePerTurn?: boolean;
  optional?: boolean; // "You may" – hráč sa môže vzdať
  cost?: Cost[];
  steps?: Step[];
  mods?: StaticMod[]; // pre static
  listen?: { event: "DonReturned"; side: "me"; min: number }; // pre onEvent
  handCost?: { amount: number; cond: Cond }; // znížený cost v ruke (ST26-001)
};

export type CardDef = {
  code: string;
  name: string;
  type: CardType;
  colors: string[];
  cost: number;
  power: number;
  counter: number;
  life: number;
  traits: string[];
  keywords: Keyword[];
  abilities: Ability[];
  scripted: boolean; // false = efekt ešte nie je preložený do DSL (sprievodcovský režim)
  text: string;
};

// ------------------------------------------------------------------ stav
export type Inst = {
  iid: string; // inštancia v hre
  code: string;
  owner: P;
  rested: boolean;
  don: number; // pripojené DON!!
  playedTurn: number; // ťah, v ktorom bola zahraná (Rush / summoning sickness)
};

export type PlayerState = {
  name: string;
  leader: string;
  deck: string[]; // vrch = index 0
  hand: string[];
  trash: string[];
  life: string[]; // vrch = index 0
  characters: string[];
  stage: string | null;
  donDeck: number;
  donActive: number;
  donRested: number;
  mulliganDone: boolean;
};

export type Modifier = {
  target: string; // iid
  kind: "power" | "basePower" | "noBlocker" | "noBlockerMinPower";
  amount: number;
  until: Until;
  setOnTurn: number;
  owner: P; // kto modifikátor vytvoril (pre oppNextEndPhase)
};

export type GameEvent =
  | { t: "DonReturned"; p: P; n: number }
  | { t: "DonAdded"; p: P; n: number; state: "active" | "rested" }
  | { t: "CardDrawn"; p: P; n: number }
  | { t: "CardPlayed"; p: P; iid: string }
  | { t: "KO"; iid: string }
  | { t: "LifeDamage"; p: P; n: number }
  | { t: "Attack"; attacker: string; target: string }
  | { t: "Info"; msg: string };

export type Frame = {
  source: string; // iid karty, ktorej efekt beží
  controller: P;
  steps: Step[];
  pc: number;
  vars: Record<string, string[]>;
  label: string;
  costs: Cost[]; // najprv sa zaplatia všetky ceny, až potom kroky
  ci: number;
  optional: boolean; // „You may“ – spýtať sa, či zaplatiť / použiť
  asked: boolean;
  kind: "ability" | "counterEvent" | "triggerEvent" | "mainEvent";
};

/** Reakcia čakajúca vo fronte. */
export type Pending = { source: string; controller: P; ability: number; label: string };

export type Prompt =
  | { kind: "mulligan"; p: P }
  | { kind: "choose"; p: P; label: string; options: string[]; min: number; max: number }
  | { kind: "payCost"; p: P; label: string } // zaplatiť cenu „You may“? áno/nie
  | { kind: "donSource"; p: P; n: number; atLeast: boolean; label: string } // ktoré DON!! vrátiť
  | { kind: "orderTriggers"; p: P; options: number[] } // indexy v pending
  | { kind: "blocker"; p: P; options: string[] }
  | { kind: "counter"; p: P }
  | { kind: "trigger"; p: P; iid: string } // aktivovať [Trigger] z Life?
  | { kind: "trashCharacter"; p: P; options: string[] }; // 6. postava

export type Battle = {
  attacker: string;
  target: string;
  step: "whenAttacking" | "block" | "counter" | "damage" | "done";
  counterPower: number;
  hitsLeft?: number; // zostávajúce zásahy do Life (Double Attack + Trigger medzi nimi)
};

export type GameState = {
  seed: number;
  turn: number; // 1, 2, …
  active: P;
  first: P;
  phase: "setup" | "main" | "battle" | "end" | "over";
  players: [PlayerState, PlayerState];
  cards: Record<string, Inst>;
  defs: Record<string, CardDef>;
  mods: Modifier[];
  stack: Frame[];
  pending: Pending[];
  prompt: Prompt | null;
  battle: Battle | null;
  usedOnce: string[]; // `${iid}:${ability}` použité tento ťah
  donReturnedThisTurn: [number, number];
  log: GameEvent[];
  winner: P | null;
  nextId: number;
};

// ------------------------------------------------------------------ akcie hráča
export type Action =
  | { type: "mulligan"; p: P; redraw: boolean }
  | { type: "play"; p: P; iid: string }
  | { type: "attachDon"; p: P; target: string }
  | { type: "activate"; p: P; iid: string; ability: number }
  | { type: "attack"; p: P; attacker: string; target: string }
  | { type: "endTurn"; p: P }
  | { type: "answer"; p: P; choice: AnswerChoice };

export type AnswerChoice =
  | { pick: string[] } // choose / blocker / trashCharacter (prázdne = nič)
  | { yes: boolean } // payCost / trigger
  | { don: { active: number; rested: number; attached: Record<string, number> } } // donSource
  | { order: number } // orderTriggers – ktorá reakcia ide prvá
  | { counter: string[] }; // karty z ruky použité ako counter (postavy) alebo [Counter] eventy
