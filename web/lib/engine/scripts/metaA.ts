// Turnajové karty: EB01–EB04, OP01–OP08. Každý skript kopíruje text karty (komentár = originál v skratke).
import {
  activate, activateMain, activeDon, addDon, all, and, bottom, bounce, CH, choose, costMod, counter, counterBuff, custom, deckToLife, discard, don,
  donGe, donMinus, draw, drawDiscard, EV, giveDon, giveDonLeader, has, ifThen, inHand, inTrash, ko, koAll, later, leaderIs, leaderPower,
  leaderTrait, leaderTraitIncl, lifeGe, lifeLe, lifeToHand, main, myChar, myLC, noRefresh, not, oneOf, onEvent, onKO, onPlay, oppChar, oppLC,
  oppTurn, or, playFrom, playSelf, power, powerAll, rest, restDon, restSelf, reveal, Script, search, SELF, selfKw, selfPower, statics, trashLife,
  trashSelf, trigger, triggerPlaySelf, whenAttacking, yourTurn, cannotAttack, replaceKO, flag,
} from "../dsl";
import type { Cond, Step } from "../types";

const SH = "Straw Hat Crew";
const WB = "Whitebeard Pirates";
const AKP = "Animal Kingdom Pirates";
const BMP = "Big Mom Pirates";
const faceUp = (n = 1): Step => ({ op: "lifeFace", side: "me", up: true, n });
const faceDown = (n: number | "all" = 1): Step => ({ op: "lifeFace", side: "me", up: false, n });
const runMain: Step = { op: "runAbility", which: "main" };
const fewerChars: Cond = { c: "cmp", a: { n: "count", f: { zone: "characters" } }, op: "<", b: { n: "count", f: { side: "opp", zone: "characters" } } };
const oppHasPow = (min: number): Cond => has(oppChar({ power: [min, 99999] }));

export const META_A: Record<string, Script> = {
  // [Blocker] [On Play] Choose one: look at opponent's Life and reorder • turn all your Life face-down.
  "EB01-052": {
    kw: ["blocker"],
    abilities: [onPlay([oneOf([["Pozri súperove Life karty", [custom("lookOppLife")]], ["Otoč všetky svoje Life lícom dole", [faceDown("all")]]])])],
  },
  // [Main] K.O. up to 1 opp Character. Then trash your Life until 1. [Trigger] K.O. up to 1 with cost ≤ total Life.
  "EB01-059": {
    abilities: [main([...ko(oppChar()), { op: "trashLifeUntil", n: 1 }]), trigger(ko(oppChar({ costLeq: { n: "lifeBoth" } })))],
  },
  // [On Play] +1 DON!! active. [When Attacking] this base power = selected opp Character's power this turn.
  "EB01-061": {
    abilities: [
      onPlay([addDon(1)]),
      whenAttacking([choose(oppChar(), 1, "Ktorej súperovej postavy power skopírovať?", 0, "x"), { op: "basePower", v: "$self", value: "copy", copyOf: "x", until: "turn" }]),
    ],
  },
  "EB02-017": { abilities: [onPlay(search(5, { trait: SH, notName: "Nami" }))] },
  // [On Play] If no other [Buggy] Characters, Leader gains [Double Attack]. [Trigger] Rest opp Character cost ≤ 4.
  "EB02-018": {
    abilities: [
      onPlay([ifThen({ c: "none", f: myChar({ name: "Buggy", notSelf: true }) }, [{ op: "set", v: "L", from: "myLeader" }, { op: "kw", v: "L", kw: "doubleAttack", until: "turn" }])]),
      trigger(rest(oppChar({ cost: [0, 4] }))),
    ],
  },
  // [Main] SHC Character +6000; it won't become active next Refresh. [Trigger] Rest opp Character cost ≤ 4.
  "EB02-021": {
    abilities: [
      main([
        choose(myChar({ trait: SH }), 1, "+6000 power – svoja postava Straw Hat Crew", 0, "g"),
        { op: "power", v: "g", amount: 6000, until: "turn" },
        { op: "flag", v: "g", flag: "noRefresh", until: "permanent" },
      ]),
      trigger(rest(oppChar({ cost: [0, 4] }))),
    ],
  },
  // [Counter] This turn: if your Character would be K.O.'d in battle, you may trash 1 card from hand instead. [Trigger] Draw 1.
  "EB02-030": { abilities: [counter([custom("battleSaveThisTurn")]), trigger([draw(1)])] },
  "EB03-010": { kw: ["blocker"], abilities: [onPlay(search(5, { any: [{ type: CH, power: [-99999, 1000] }, { type: EV }] }))] },
  // [Blocker] [On Play] Give 1 rested DON!!. Then if trash ≥ 10, play {Thriller Bark Pirates} cost ≤ 2 from trash rested.
  "EB03-045": {
    kw: ["blocker"],
    abilities: [onPlay([...giveDon(1), ifThen({ c: "cmp", a: { n: "trash" }, op: ">=", b: 10 }, playFrom("trash", { trait: "Thriller Bark Pirates", cost: [0, 2] }, 1, true))])],
  },
  // [On Play] If you have a face-up Life card, K.O. opp Character cost ≤ 2. Then turn all your Life face-down.
  "EB03-051": { abilities: [onPlay([ifThen({ c: "faceUpLife" }, ko(oppChar({ cost: [0, 2] }))), faceDown("all")])] },
  // [Activate: Main] You may trash this: if Leader is [Shirahoshi], top deck → Life. Then {Neptunian} +1000.
  "EB03-052": {
    abilities: [activateMain([ifThen(leaderIs("Shirahoshi"), [deckToLife(1)]), ...powerAll(myChar({ trait: "Neptunian" }), 1000)], { optional: true, cost: [trashSelf] })],
  },
  // [On Play] Give 1 rested DON!! to Leader; then if opp ≥ 3 Life, opp top Life → hand. [On K.O.] You may turn 1 Life face-up: play Character ≤ 6000 power from hand.
  "EB03-053": {
    abilities: [
      onPlay([...giveDonLeader(1), ifThen(lifeGe(3, "opp"), [lifeToHand("opp")])]),
      onKO(playFrom("hand", { power: [-99999, 6000] }), { optional: true, cost: [faceUp(1)] }),
    ],
  },
  // [Rush] [Activate: Main] You may trash 1 card and this: top deck → Life. Then play [Trafalgar Law] cost ≤ 7 from hand.
  "EB03-062": {
    kw: ["rush"],
    abilities: [activateMain([deckToLife(1), ...playFrom("hand", { name: "Trafalgar Law", cost: [0, 7] })], { optional: true, cost: [discard(1), trashSelf] })],
  },
  "EB04-002": { abilities: [onPlay(search(4, { any: [{ trait: "Egghead" }, { trait: SH }], notName: "Jewelry Bonney" }))] },
  // [On Play] Leader +2000 until end of opponent's next End Phase. [Activate: Main][Once Per Turn] if opp has 8000+ power Character: [Rush: Character].
  "EB04-007": {
    abilities: [onPlay(leaderPower(2000, "oppNextEndPhase")), activateMain([ifThen(oppHasPow(8000), [selfKw("rushChar")])], { once: true })],
  },
  // [Rush: Character] [On Play] Draw 1 per {Neptunian} Character, then trash the same number.
  "EB04-011": {
    kw: ["rushChar"],
    abilities: [onPlay([draw({ n: "count", f: myChar({ trait: "Neptunian" }) }), discard({ n: "count", f: myChar({ trait: "Neptunian" }) })])],
  },
  // [Activate: Main] Set up to 1 DON!! active; then no DON!! active by Character effects this turn. [When Attacking] 3+ {Neptunian}: rest opp ≤ 8.
  "EB04-016": {
    abilities: [
      activateMain([activeDon(1), { op: "playerFlag", flag: "noActiveDonByCharEffect", until: "turn" }]),
      whenAttacking([ifThen(has(myChar({ trait: "Neptunian" }), 3), rest(oppChar({ cost: [0, 8] })))]),
    ],
  },
  "EB04-018": { abilities: [onPlay(ko(oppChar({ rested: true, power: [-99999, 8000] })), { optional: true, cost: [restSelf] })] },
  // Would be K.O.'d → may return 1 DON!! instead. [On Play] DON!! −2: if Leader {AKP}, gains Rush; then rest opp ≤ 7.
  "EB04-030": {
    abilities: [
      replaceKO(SELF, [donMinus(1)]),
      onPlay([ifThen(leaderTrait(AKP), [selfKw("rush")]), ...rest(oppChar({ cost: [0, 7] }))], { optional: true, cost: [donMinus(2)] }),
    ],
  },
  "EB04-031": {
    abilities: [
      replaceKO(SELF, [donMinus(1)]),
      activateMain([ifThen(and(leaderTrait(AKP), { c: "none", f: myChar({ name: "King", notSelf: true }) }), [addDon(1, "active"), addDon(1, "rested")])], { once: true }),
    ],
  },
  "EB04-032": {
    abilities: [
      onPlay([draw(2)], { optional: true, cost: [discard(1, inHand({ trait: AKP }))] }),
      activateMain([ifThen(leaderTrait(AKP), [addDon(1, "rested")])], { once: true, optional: true, cost: [restDon(2)] }),
    ],
  },
  // [Blocker] [On Play] If your DON!! ≤ opponent's: draw 1. Then +1 DON!! active.
  "EB04-038": {
    kw: ["blocker"],
    abilities: [onPlay([ifThen({ c: "cmp", a: { n: "donField" }, op: "<=", b: { n: "donField", side: "opp" } }, [draw(1)]), addDon(1)])],
  },
  "EB04-058": { kw: ["blocker"], abilities: [onPlay([ifThen(lifeLe(2), [deckToLife(1)])])] },
  // [Main] You may turn 1 Life face-up: if fewer Characters than opp, K.O. opp ≤ 6 and opp ≤ 5. [Trigger] Draw 2, trash 1.
  "EB04-059": {
    abilities: [
      main([ifThen(fewerChars, [...ko(oppChar({ cost: [0, 6] })), ...ko(oppChar({ cost: [0, 5] }))])], { optional: true, cost: [faceUp(1)] }),
      trigger(drawDiscard(2, 1)),
    ],
  },
  "OP01-016": { abilities: [onPlay(search(5, { trait: SH, type: CH, notName: "Nami" }))] },
  "OP01-027": { abilities: [main(power(oppChar(), -10000))] },
  "OP01-030": { abilities: [main(search(5, { trait: SH, type: CH })), trigger([runMain])] },
  // [Main] You may rest 2 of your Characters: Draw 2.
  "OP01-055": {
    abilities: [main([draw(2)], { optional: true, cost: [{ op: "choose", v: "r", f: myChar({ rested: false }), min: 2, max: 2, label: "Daj do rest 2 svoje postavy" }, { op: "rest", v: "r" }] })],
  },
  "OP01-057": { abilities: [counter([...counterBuff(2000), ...activate(myChar(), 1)]), trigger(ko(oppChar({ rested: true, cost: [0, 4] })))] },
  // [On Play] DON!! −6: If Leader {AKP}, K.O. all Characters other than this.
  "OP01-094": { abilities: [onPlay([ifThen(leaderTrait(AKP), koAll({ side: "any", zone: "characters", notSelf: true }))], { optional: true, cost: [donMinus(6)] })] },
  "OP02-021": {
    abilities: [main([ifThen(leaderTraitIncl(WB), ko(oppChar({ power: [-99999, 3000] })))]), trigger(power(oppLC(), -3000))],
  },
  "OP02-022": { abilities: [main(search(5, { type: CH, traitIncl: WB })), trigger([runMain])] },
  // [Your Turn] If ≤ 1 Life: your [Edward.Newgate] and Characters incl. "Whitebeard Pirates" +2000. [Trigger] Play this card.
  "OP02-024": {
    abilities: [
      statics([{ stat: "power", amount: 2000, f: myLC({ any: [{ name: "Edward.Newgate" }, { type: CH, traitIncl: WB }] }) }], and(yourTurn, lifeLe(1))),
      trigger([playSelf]),
    ],
  },
  // [On Play] Draw until you have 3 cards, then play blue {Impel Down} Character cost ≤ 6 from hand.
  "OP02-051": {
    abilities: [onPlay([draw({ n: "sub", a: 3, b: { n: "hand" } }), ...playFrom("hand", { color: "Blue", trait: "Impel Down", cost: [0, 6] })])],
  },
  "OP02-058": { abilities: [onPlay(search(5, { color: "Blue", trait: "Impel Down", notName: "Buggy" }))] },
  "OP02-068": { abilities: [counter(counterBuff(3000), { optional: true, cost: [discard(1)] }), trigger(bounce({ side: "any", zone: "characters", cost: [0, 2] }))] },
  "OP02-117": { abilities: [main(costMod(oppChar(), -5)), trigger(ko(oppChar({ cost: [0, 3] })))] },
  "OP03-003": { abilities: [onPlay(search(5, { traitIncl: WB, notName: "Izo" }))] },
  // Cannot be K.O.'d in battle by Slash. [On Play] search red Event.
  "OP03-008": {
    abilities: [statics([{ stat: "noBattleKO", attribute: "Slash", f: SELF }]), onPlay(search(5, { color: "Red", type: EV }))],
  },
  // [DON!! x2] [When Attacking] (1): Play Character cost ≤ 4 with [Trigger] from hand.
  "OP03-022": { abilities: [whenAttacking(playFrom("hand", { cost: [0, 4], hasTrigger: true }), { cond: don(2), optional: true, cost: [restDon(1)] })] },
  "OP03-026": { abilities: [onPlay([ifThen(leaderTrait("East Blue"), rest(oppChar()))]), triggerPlaySelf()] },
  "OP03-033": { abilities: [triggerPlaySelf(leaderTrait("East Blue"))] },
  "OP03-114": { abilities: [onPlay([ifThen(leaderTrait(BMP), [deckToLife(1)]), trashLife("opp", 1)])] },
  // [On Play] Up to 1 Character cost ≤ 8 to top or bottom of owner's Life face-up.
  "OP03-123": {
    abilities: [
      onPlay([
        choose({ side: "any", zone: "characters", cost: [0, 8], notSelf: false }, 1, "Postava do Life (lícom hore)", 0, "k"),
        ifThen({ c: "cmp", a: { n: "varCount", v: "k" }, op: ">=", b: 1 }, [
          oneOf([
            ["Navrch Life", [{ op: "move", v: "k", to: "lifeTop", faceUp: true }]],
            ["Naspodok Life", [{ op: "move", v: "k", to: "lifeBottom", faceUp: true }]],
          ]),
        ]),
      ]),
    ],
  },
  "OP04-016": { abilities: [counter(counterBuff(3000), { optional: true, cost: [discard(1)] }), trigger(power(oppLC(), -3000))] },
  "OP04-100": { abilities: [trigger(cannotAttack(oppLC(), "turn"))] },
  // [Counter] +4000. Then you may trash 1 card; if you do, set up to 3 DON!! active. [Trigger] Rest opp cost ≤ 3.
  "OP05-038": {
    abilities: [counter([...counterBuff(4000), { op: "may", cost: [discard(1)], steps: [activeDon(3)] }]), trigger(rest(oppLC({ cost: [0, 3] })))],
  },
  "OP05-057": {
    abilities: [main([...power(myLC(), 3000), ...bottom({ side: "any", zone: "characters", cost: [0, 2] })]), trigger(bounce({ side: "any", zone: "characters", cost: [0, 3] }))],
  },
  "OP05-067": { abilities: [whenAttacking([ifThen(lifeLe(3), [addDon(1)])])] },
  "OP05-073": { abilities: [onPlay([addDon(1, "rested")], { optional: true, cost: [discard(1)] }), trigger([playSelf], { optional: true, cost: [donMinus(1)] })] },
  "OP05-077": { abilities: [main(power(oppChar(), -5000), { optional: true, cost: [donMinus(1)] }), trigger([addDon(1)])] },
  // [Opponent's Turn][Once Per Turn] When your Life becomes 0: top deck → Life, then trash 1 from hand.
  "OP05-098": { abilities: [onEvent({ ev: "LifeZero", side: "me" }, [deckToLife(1), discard(1)], { cond: oppTurn, once: true })] },
  "OP05-114": {
    abilities: [
      counter([choose(myLC(), 1, "+2000 power počas súboja", 0, "b"), { op: "power", v: "b", amount: 2000, until: "battle" }, ifThen(lifeLe(2, "opp"), [{ op: "power", v: "b", amount: 2000, until: "battle" }])]),
      trigger(ko(oppChar({ costLeq: { n: "life", side: "opp" } }))),
    ],
  },
  "OP05-117": { abilities: [onPlay(search(5, { trait: "Sky Island" }))] },
  // [On Play] DON!! −10: your other Characters to bottom; extra turn. [Activate: Main][Once Per Turn] (1): +1 DON!! active.
  "OP05-119": {
    abilities: [
      onPlay([all(myChar({ notSelf: true }), "o"), { op: "move", v: "o", to: "deckBottom" }, { op: "extraTurn" }], { optional: true, cost: [donMinus(10)] }),
      activateMain([addDon(1)], { once: true, optional: true, cost: [restDon(1)] }),
    ],
  },
  "OP06-017": {
    abilities: [
      main(power(myLC(), 3000), { optional: true, cost: [lifeToHand("me", 1)] }),
      counter(power(myLC(), 3000), { optional: true, cost: [lifeToHand("me", 1)] }),
    ],
  },
  "OP06-018": {
    abilities: [main([...power(myLC(), 3000), ifThen(oppHasPow(7000), power(myLC(), 1000))]), trigger(ko(oppChar({ power: [-99999, 5000] })))],
  },
  // [On Play] You may trash 1 {Fish-Man} card or [The Ark Noah] from hand: K.O. opp rested Character.
  "OP06-033": {
    abilities: [onPlay(ko(oppChar({ rested: true })), { optional: true, cost: [discard(1, inHand({ any: [{ trait: "Fish-Man" }, { name: "The Ark Noah" }] }))] })],
  },
  "OP06-038": {
    abilities: [
      counter([
        choose(myLC(), 1, "+2000 power počas súboja", 0, "b"),
        { op: "power", v: "b", amount: 2000, until: "battle" },
        ifThen({ c: "cmp", a: { n: "restedCards" }, op: ">=", b: 8 }, [{ op: "power", v: "b", amount: 2000, until: "battle" }]),
      ]),
      trigger(ko(oppChar({ rested: true, cost: [0, 3] }))),
    ],
  },
  // [Blocker] [Activate: Main][Once Per Turn] You may trash 1 and place 1 Character cost ≤ 2 at bottom: +3000 this turn.
  "OP06-043": {
    kw: ["blocker"],
    abilities: [
      activateMain([selfPower(3000)], {
        once: true,
        optional: true,
        cost: [discard(1), { op: "choose", v: "b", f: { side: "any", zone: "characters", cost: [0, 2] }, min: 1, max: 1, label: "Postava cost ≤ 2 pod balíček" }, { op: "move", v: "b", to: "deckBottom" }],
      }),
    ],
  },
  "OP06-058": { abilities: [main(bottom({ side: "any", zone: "characters", cost: [0, 6] }, 2)), trigger(bottom({ side: "any", zone: "characters", cost: [0, 5] }))] },
  // [DON!! x2][Your Turn] +1000 per 5 cards in trash.
  "OP06-085": {
    abilities: [statics([{ stat: "power", amount: { n: "mul", a: { n: "div", a: { n: "trash" }, k: 5 }, k: 1000 }, f: SELF }], and(don(2), yourTurn))],
  },
  "OP06-104": { abilities: [onKO([ifThen(lifeLe(3, "opp"), [deckToLife(1)])]), triggerPlaySelf(lifeLe(3, "opp"))] },
  "OP06-115": {
    abilities: [counter(counterBuff(3000), { optional: true, cost: [discard(1)] }), trigger([ifThen(lifeLe(0), [deckToLife(1), discard(1)])])],
  },
  "OP06-118": {
    abilities: [
      whenAttacking([{ op: "activate", v: "$self" }], { once: true, optional: true, cost: [restDon(1)] }),
      activateMain([{ op: "activate", v: "$self" }], { once: true, optional: true, cost: [restDon(2)] }),
    ],
  },
  "OP07-022": { abilities: [onPlay(search(5, { color: "Green", trait: "Land of Wano", notName: "Otama" }))] },
  "OP07-056": {
    abilities: [
      counter(counterBuff(4000), { optional: true, cost: [{ op: "choose", v: "b", f: myChar({ cost: [2, 99] }), min: 1, max: 1, label: "Vráť svoju postavu (cost ≥ 2) do ruky" }, { op: "move", v: "b", to: "hand" }] }),
      trigger([draw(2), { op: "handToDeck", n: 2, where: "bottom" }]),
    ],
  },
  "OP07-057": {
    abilities: [
      main([choose(myLC({ trait: "The Seven Warlords of the Sea" }), 1, "+2000 a bez blockerov – svoja karta 7 Warlords", 0, "w"), { op: "power", v: "w", amount: 2000, until: "turn" }, { op: "flag", v: "w", flag: "noBlockerWhenAttacks", until: "turn" }]),
      trigger([draw(1)]),
    ],
  },
  // −3 cost in hand if your DON!! is at least 2 less than opponent's. [Blocker]
  "OP07-064": {
    kw: ["blocker"],
    abilities: [statics([{ stat: "handCost", amount: -3 }], { c: "cmp", a: { n: "donField" }, op: "<=", b: { n: "sub", a: { n: "donField", side: "opp" }, b: 2 } })],
  },
  "OP07-076": { abilities: [counter([...counterBuff(2000), ...rest(oppChar())], { optional: true, cost: [donMinus(1)] }), trigger([addDon(1)])] },
  "OP07-077": {
    abilities: [main([ifThen(or(leaderTrait(AKP), leaderTrait(BMP)), search(5, { any: [{ trait: AKP }, { trait: BMP }] }))]), trigger([runMain])],
  },
  "OP07-081": { abilities: [statics([{ stat: "cost", amount: -1, f: oppChar() }], and(don(1), yourTurn))] },
  "OP07-099": { abilities: [trigger(power(myLC({ trait: "Egghead" }), 2000, "myNextTurnEnd"))] },
  "OP08-036": { abilities: [main([all(oppChar({ rested: true, cost: [0, 7] }), "n"), { op: "flag", v: "n", flag: "noRefresh", until: "permanent" }]), trigger(rest(oppChar()))] },
  "OP08-040": {
    abilities: [onPlay([ifThen(leaderTraitIncl(WB), bounce(oppChar({ cost: [0, 4] })))], { optional: true, cost: [reveal(2, { traitIncl: WB })] })],
  },
  // [On Play] If Leader incl. WB and ≤ 2 Life: opp Characters cannot attack (until end of their next turn) unless they trash 2.
  "OP08-043": {
    abilities: [onPlay([ifThen(and(leaderTraitIncl(WB), lifeLe(2)), [all(oppChar(), "x"), { op: "flag", v: "x", flag: "attackTax2", until: "oppNextEndPhase" }])])],
  },
  "OP08-047": {
    abilities: [
      onPlay(bounce({ side: "any", zone: "characters", cost: [0, 6] }), {
        optional: true,
        cost: [{ op: "choose", v: "r", f: myChar({ notSelf: true }), min: 1, max: 1, label: "Vráť svoju inú postavu do ruky" }, { op: "move", v: "r", to: "hand" }],
      }),
    ],
  },
  "OP08-051": { abilities: [onPlay(power(myLC({ name: "Edward Weevil" }), 2000), { cond: yourTurn })] },
  // Leader: [When Attacking] You may turn 2 Life face-up: +1 DON!! rested.
  "OP08-058": { abilities: [whenAttacking([addDon(1, "rested")], { optional: true, cost: [faceUp(2)] })] },
  "OP08-062": {
    abilities: [
      activateMain([ifThen(leaderTrait(BMP), playFrom("hand", { name: "Charlotte Katakuri", cost: [3, 99], costLeq: { n: "donField", side: "opp" } }))], { optional: true, cost: [trashSelf] }),
    ],
  },
  // [Activate: Main][Once Per Turn] If no other [Black Maria]: +5 DON!! rested; at end of turn return DON!! down to opponent's count.
  "OP08-074": {
    abilities: [
      activateMain([ifThen({ c: "none", f: myChar({ name: "Black Maria", notSelf: true }) }, [addDon(5, "rested"), later({ op: "returnDonTo", target: { n: "donField", side: "opp" } })])], { once: true }),
    ],
  },
  "OP08-077": { abilities: [main([ifThen(or(leaderTrait(AKP), leaderTrait(BMP)), ko(oppChar({ cost: [0, 6] }), 2))], { optional: true, cost: [donMinus(2)] })] },
  // Leader: [DON!! x1][When Attacking] Play {Shandian Warrior} Character cost ≤ DON!! on field; if you do, top Life → hand.
  "OP08-098": {
    abilities: [
      whenAttacking(
        [
          choose({ zone: "hand", type: CH, trait: "Shandian Warrior", costLeq: { n: "donField" } }, 1, "Zahraj {Shandian Warrior} z ruky", 0, "k"),
          { op: "play", v: "k" },
          ifThen({ c: "cmp", a: { n: "varCount", v: "k" }, op: ">=", b: 1 }, [lifeToHand("me", 1)]),
        ],
        { cond: don(1) },
      ),
    ],
  },
  "OP08-099": { abilities: [] },
  "OP08-109": { abilities: [onPlay([ifThen(and(leaderTrait("Shandian Warrior"), has(myChar({ name: "Kalgara" }))), [deckToLife(1)])])] },
  "OP08-110": { abilities: [onPlay([...search(5, { name: "Upper Yard" }), ...playFrom("hand", { name: "Upper Yard", type: "Stage" })])] },
  "OP08-115": {
    abilities: [
      counter([ifThen(leaderTrait("Shandian Warrior"), counterBuff(3000)), ...playFrom("hand", { name: "Upper Yard", type: "Stage" })]),
      trigger(drawDiscard(2, 1)),
    ],
  },
};

void [donGe, not, noRefresh, flag, inTrash, giveDon];
