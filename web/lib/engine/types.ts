// Typy herného enginu – všetko je čisté dáta (serializovateľné do JSON).

export type P = 0 | 1;
export const other = (p: P): P => (p === 0 ? 1 : 0);

// ------------------------------------------------------------------ karty
export type CardType = "Leader" | "Character" | "Event" | "Stage";
export type Keyword = "rush" | "rushChar" | "blocker" | "doubleAttack" | "banish" | "unblockable";
/** trvanie dočasného efektu */
export type Until = "turn" | "battle" | "oppNextEndPhase" | "myNextTurnEnd" | "permanent";
/** strana vzhľadom na hráča, ktorému efekt patrí */
export type Side = "me" | "opp" | "any";

/** Číslo, ktoré sa vyhodnotí až v čase efektu. */
export type Num =
  | number
  | { n: "donField"; side?: Side }
  | { n: "donActive"; side?: Side }
  | { n: "donGivenTotal"; side?: Side } // súčet DON!! pripojených na kartách
  | { n: "life"; side?: Side }
  | { n: "lifeBoth" }
  | { n: "hand"; side?: Side }
  | { n: "trash"; side?: Side }
  | { n: "count"; f: Filter } // počet kariet podľa filtra
  | { n: "varCount"; v: string } // koľko kariet je v premennej
  | { n: "varDon"; v: string } // DON!! pripojené na prvej karte v premennej
  | { n: "varPower"; v: string } // power prvej karty v premennej
  | { n: "varCost"; v: string } // cost prvej karty v premennej
  | { n: "mul"; a: Num; k: number }
  | { n: "div"; a: Num; k: number } // celočíselne nadol
  | { n: "sub"; a: Num; b: Num }
  | { n: "add"; a: Num; b: Num }
  | { n: "restedCards" } // moje karty v rest (leader, postavy, stage, DON!!)
  | { n: "distinctNames"; f: Filter }; // počet rôznych mien medzi kartami podľa filtra

/** Podmienka – vyhodnocuje sa vždy v aktuálnom stave. */
export type Cond =
  | { c: "donAttached"; n: number } // [DON!! xN] na tejto karte (len vo vlastnom ťahu)
  | { c: "turn"; who: "mine" | "opp" }
  | { c: "cmp"; a: Num; op: ">=" | "<=" | "==" | ">" | "<"; b: Num }
  | { c: "leader"; f: Filter } // môj (alebo súperov, f.side) leader spĺňa filter
  | { c: "multicolor"; side?: Side }
  | { c: "exists"; f: Filter; min?: number } // aspoň min kariet (default 1)
  | { c: "none"; f: Filter } // žiadna karta
  | { c: "selfPlayedThisTurn" }
  | { c: "selfRested" }
  | { c: "secondTurnOrLater" }
  | { c: "faceUpLife"; side?: Side }
  | { c: "onlyChars"; f: Filter } // všetky moje postavy spĺňajú filter (a mám aspoň 0)
  | { c: "flag"; flag: string } // príznak v rámci (napr. „ak si to urobil“)
  | { c: "handTrashedThisTurn" }
  | { c: "attackerIs"; f: Filter } // v súboji: útočník spĺňa filter
  | { c: "targetIs"; f: Filter }
  | { c: "and"; all: Cond[] }
  | { c: "or"; any: Cond[] }
  | { c: "not"; x: Cond };

export type Zone = "characters" | "leader" | "leaderOrCharacters" | "stage" | "field" | "hand" | "trash" | "look" | "life" | "deck";

/** Ktoré karty sa dajú vybrať. Rozsahy [min, max] sú vrátane. */
export type Filter = {
  side?: Side; // default "me"
  zone: Zone;
  type?: CardType | CardType[];
  name?: string | string[];
  notName?: string | string[];
  trait?: string | string[]; // presný typ (jeden z)
  traitIncl?: string; // „type including …“
  color?: string;
  cost?: [number, number]; // aktuálny cost (na poli), inak tlačený
  baseCost?: [number, number];
  power?: [number, number];
  basePower?: [number, number];
  costLeq?: Num; // cost ≤ dynamická hodnota
  costGeq?: Num;
  rested?: boolean;
  keyword?: Keyword;
  hasTrigger?: boolean;
  noCounter?: boolean;
  attribute?: string;
  notSelf?: boolean;
  self?: boolean;
  donGiven?: number; // aspoň toľko pripojených DON!!
  any?: Omit<Filter, "zone">[]; // alternatívy (OR) – ostatné polia platia navyše
  notIn?: string; // nie je v premennej
  printedPower?: [number, number]; // tlačená power (bez efektov)
};

/** Trvalý efekt (static) – vyhodnocuje sa pri každom prepočte. Cieľ = filter vzhľadom na majiteľa zdroja. */
export type StaticMod =
  | { stat: "power"; amount: Num; f: Filter }
  | { stat: "cost"; amount: Num; f: Filter }
  | { stat: "kw"; kw: Keyword; f: Filter }
  | { stat: "basePower"; value: number; f: Filter }
  | { stat: "handCost"; amount: Num } // cost tejto karty v ruke
  | { stat: "counter"; f: Filter; set?: number; add?: number } // counter kariet v ruke
  | { stat: "selfCounter"; add: number } // counter tejto karty v ruke
  | { stat: "cannotAttack"; f: Filter }
  | { stat: "attackOnly"; f: Filter } // súper môže útočiť len na tieto karty
  | { stat: "protect"; f: Filter } // nedá sa odstrániť efektom súpera
  | { stat: "noBattleKO"; attribute: string; f: Filter }; // nedá sa K.O. v súboji kartou s atribútom

export type Trigger =
  | "static"
  | "onPlay"
  | "whenAttacking"
  | "onOppAttack" // [On Your Opponent's Attack]
  | "onKO"
  | "activateMain"
  | "main" // [Main] na evente
  | "counter" // [Counter] na evente
  | "trigger" // [Trigger] z Life
  | "onEvent"
  | "endOfTurn" // [End of Your Turn]
  | "replace"; // „If … would be K.O.'d, you may … instead“

export type EvName =
  | "DonReturned"
  | "CharPlayed"
  | "EventActivated"
  | "KO"
  | "Damage" // hráč dostal zásah do Life
  | "LifeZero"
  | "LifeRemoved"
  | "BlockerActivated"
  | "HandTrashedByEffect"
  | "LeaderAttackedOrAttacks";

export type Listen = {
  ev: EvName;
  side?: Side; // čí je hráč/karta udalosti vzhľadom na majiteľa schopnosti
  f?: Filter; // filter na kartu udalosti (vyhodnotený pre jej majiteľa)
  min?: number;
};

export type Replace = { what: "ko" | "removeByOpp" | "remove"; f: Filter };

export type Ability = {
  when: Trigger;
  cond?: Cond;
  once?: boolean; // [Once Per Turn]
  onceKey?: string; // spoločné Once Per Turn pre viac schopností
  optional?: boolean; // „You may“ – hráč sa môže vzdať (pýtame sa pred cenou)
  cost?: Step[]; // platí sa pred efektom
  steps?: Step[];
  mods?: StaticMod[];
  listen?: Listen;
  replace?: Replace;
  label?: string;
};

/** Kocky DSL. var = meno premennej so zoznamom kariet. "$self" = zdrojová karta. */
export type Step =
  | { op: "choose"; v: string; f: Filter; min?: Num; max: Num; label: string; distinctNames?: boolean; maxTotalCost?: number; chooser?: "opp" }
  | { op: "all"; v: string; f: Filter }
  | { op: "set"; v: string; from: "self" | "myLeader" | "oppLeader" | "battleAttacker" | "battleTarget" | "eventCard" }
  | { op: "look"; n: Num; side?: Side }
  | { op: "lookRest"; to: "bottom" | "trash" | "top" }
  | { op: "move"; v: string; to: "hand" | "trash" | "deckBottom" | "deckTop" | "lifeTop" | "lifeBottom"; faceUp?: boolean }
  | { op: "ko"; v: string }
  | { op: "play"; v: string; rested?: boolean; free?: boolean }
  | { op: "rest"; v: string }
  | { op: "activate"; v: string } // nastav ako aktívne
  | { op: "draw"; n: Num }
  | { op: "discard"; n: Num; side?: Side; f?: Filter; upTo?: boolean } // vyhoď z ruky (vyberá majiteľ ruky)
  | { op: "handToDeck"; n: Num; where: "bottom" | "top" | "topOrBottom" }
  | { op: "deckToLife"; n: Num; faceUp?: boolean }
  | { op: "lifeToHand"; side: Side; n: Num; from?: "top" | "topOrBottom" }
  | { op: "trashLife"; side: Side; n: Num }
  | { op: "lifeFace"; side: Side; up: boolean; n: number | "all" }
  | { op: "trashLifeUntil"; n: number }
  | { op: "mill"; n: Num }
  | { op: "addDon"; n: Num; state: "active" | "rested"; side?: Side }
  | { op: "returnDon"; n: Num; atLeast?: boolean; side?: Side } // DON!! −n
  | { op: "restDon"; n: Num; side?: Side } // (n) – daj do rest n aktívnych DON!!
  | { op: "activeDon"; n: Num } // nastav až n DON!! ako aktívne
  | { op: "returnDonTo"; target: Num } // vráť DON!!, kým nemáš toľko na poli
  | { op: "giveDon"; v: string; n: Num; each?: boolean; active?: boolean; fromOpp?: boolean; oppCostArea?: boolean }
  | { op: "power"; v: string; amount: Num; until: Until }
  | { op: "basePower"; v: string; value: Num | "copy"; copyOf?: string; until: Until }
  | { op: "costMod"; v: string; amount: Num; until: Until }
  | { op: "kw"; v: string; kw: Keyword; until: Until }
  | { op: "flag"; v: string; flag: CardFlag; until: Until }
  | { op: "playerFlag"; flag: PlayerFlag; side?: Side; until: Until }
  | { op: "if"; cond: Cond; then: Step[]; else?: Step[] }
  | { op: "oneOf"; chooser?: "me" | "opp"; options: { label: string; steps: Step[] }[] }
  | { op: "custom"; fn: string; arg?: any }
  | { op: "setFlag"; flag: string } // príznak rámca (pre „If you do“)
  | { op: "later"; when: "endOfTurn"; steps: Step[] }
  | { op: "extraTurn" }
  | { op: "win" }
  | { op: "runAbility"; which: Trigger } // „Activate this card's [Main]/[On Play]/[On K.O.] effect“
  | { op: "reveal"; v?: string; n: number; f: Filter } // odhaľ n kariet z ruky (cena)
  | { op: "may"; label?: string; cost: Step[]; steps: Step[] } // „You may X. If you do, Y.“
  | { op: "info"; msg: string };

export type CardFlag =
  | "cannotAttack"
  | "noRefresh" // nebude aktívna v najbližšej Refresh fáze
  | "cannotBeRested"
  | "negated"
  | "noBlockerWhenAttacks" // keď útočí, súper nemôže použiť [Blocker]
  | "noBlockerMinPower5000"
  | "activateAtEndOfTurn"
  | "attackTax2" // môže útočiť, len ak súper vyhodí 2 karty z ruky
  | "battleSaveDiscard" // ak by bola K.O. v súboji, môžeš namiesto toho vyhodiť 1 kartu z ruky
  | "marked"; // pomocná značka pre efekty (napr. Krieg)

export type PlayerFlag = "noPlayChars" | "noPlayChars5" | "noDrawByEffect" | "noActiveDonByCharEffect" | "lawDiscount2" | "restDonAtMainStart";

export type CardDef = {
  code: string;
  name: string;
  names: string[]; // aj alternatívne mená („also treat this card's name as …“)
  type: CardType;
  colors: string[];
  cost: number;
  power: number;
  counter: number;
  life: number;
  traits: string[];
  traitText: string;
  attribute: string;
  hasTrigger: boolean;
  keywords: Keyword[];
  abilities: Ability[];
  scripted: boolean; // false = efekt ešte nie je preložený do DSL
  text: string;
  rules?: { donDeck?: number; leaderCannotAttack?: boolean };
};

// ------------------------------------------------------------------ stav
export type Inst = {
  iid: string;
  code: string;
  owner: P;
  rested: boolean;
  don: number; // pripojené DON!!
  playedTurn: number;
  faceUp?: boolean; // Life karta lícom hore
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
  donMax: number; // 10, pri niektorých leaderoch 6
  mulliganDone: boolean;
  flags: { flag: PlayerFlag; until: Until; setOnTurn: number }[];
  extraTurn: boolean;
  handTrashedTurn: number; // ťah, v ktorom bola naposledy karta z ruky vyhodená efektom
};

export type Modifier = {
  target: string;
  kind: "power" | "basePower" | "cost" | "kw" | "flag";
  amount: number;
  kw?: Keyword;
  flag?: CardFlag;
  until: Until;
  setOnTurn: number;
  owner: P; // kto modifikátor vytvoril
};

export type GameEvent =
  | { t: "DonReturned"; p: P; n: number }
  | { t: "DonAdded"; p: P; n: number; state: "active" | "rested" }
  | { t: "CardDrawn"; p: P; n: number }
  | { t: "CardPlayed"; p: P; iid: string }
  | { t: "EventActivated"; p: P; iid: string }
  | { t: "KO"; iid: string; battle?: boolean }
  | { t: "LifeDamage"; p: P; n: number }
  | { t: "LifeRemoved"; p: P }
  | { t: "Attack"; attacker: string; target: string }
  | { t: "Turn"; p: P; turn: number }
  | { t: "Info"; msg: string };

export type Frame = {
  source: string;
  controller: P;
  steps: Step[];
  pc: number;
  vars: Record<string, string[]>;
  flags: string[];
  label: string;
  costs: Step[];
  ci: number;
  optional: boolean;
  asked: boolean;
  kind: "ability" | "counterEvent" | "triggerEvent" | "mainEvent" | "replace" | "sub" | "attackTax";
  cursor?: number; // postup v krokoch nad viacerými kartami
  sub?: any; // pracovné dáta kroku
  ability?: number;
  eventCard?: string;
  parentSave?: string; // replace: ktorú kartu tento rámec chráni
  removalKind?: "ko" | "bounce" | "deckBottom" | "deckTop" | "trash" | "life";
};

/** Reakcia čakajúca vo fronte. */
export type Pending = { source: string; controller: P; ability: number; label: string; eventCard?: string };

export type Prompt =
  | { kind: "mulligan"; p: P }
  | { kind: "choose"; p: P; label: string; options: string[]; min: number; max: number; zone?: Zone; maxTotalCost?: number; distinctNames?: boolean }
  | { kind: "payCost"; p: P; label: string }
  | { kind: "donSource"; p: P; n: number; atLeast: boolean; label: string }
  | { kind: "orderTriggers"; p: P; options: number[] }
  | { kind: "blocker"; p: P; options: string[] }
  | { kind: "counter"; p: P }
  | { kind: "trigger"; p: P; iid: string }
  | { kind: "trashCharacter"; p: P; options: string[] }
  | { kind: "oneOf"; p: P; label: string; options: string[] };

export type Battle = {
  attacker: string;
  target: string;
  step: "whenAttacking" | "block" | "counter" | "damage" | "done";
  counterPower: number;
  hitsLeft?: number;
  countered?: boolean;
};

export type Delayed = { p: P; source: string; steps: Step[]; turn: number; label: string };

export type GameState = {
  seed: number;
  turn: number;
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
  usedOnce: string[];
  donReturnedThisTurn: [number, number];
  turnCount: [number, number]; // koľký ťah daného hráča
  look: { p: P; iids: string[] } | null;
  delayed: Delayed[];
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
  | { pick: string[] }
  | { yes: boolean }
  | { don: { active: number; rested: number; attached: Record<string, number> } }
  | { order: number }
  | { option: number }
  | { counter: string[] };
