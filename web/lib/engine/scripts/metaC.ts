// Turnajové karty: OP15–OP17.
import {
  activate, activateMain, activeDon, addDon, all, and, bottom, bounce, CH, choose, counter, counterBuff, custom, deckToLife, discard, don, donGe,
  donLe, donMinus, draw, drawDiscard, endOfTurn, EV, giveDon, has, ifThen, inHand, ko, leaderBattle, leaderIs, leaderPower, leaderTrait,
  leaderTraitIncl, lifeLe, lifeToHand, main, multicolor, myChar, myLC, noRefresh, not, oneOf, onEvent, onKO, onOppAttack, onPlay, oppChar, oppDiscard,
  oppLC, oppTurn, or, playFrom, playSelf, power, powerAll, replaceKO, replaceRemoveByOpp, rest, restAll, restDon, restSelf, reveal, Script, search,
  SELF, selfKw, selfPower, statics, thereIs, trashSelf, trigger, triggerPlaySelf, whenAttacking, yourTurn, cannotAttack, later, handLe, flag, negate,
} from "../dsl";
import type { Cond, Filter, Step } from "../types";

const SH = "Straw Hat Crew";
const EB = "East Blue";
const TBP = "Thriller Bark Pirates";
const BB = "Blackbeard Pirates";
const BMP = "Big Mom Pirates";
const AKP = "Animal Kingdom Pirates";
const ROCKS = "Rocks Pirates";
const faceUp = (n = 1): Step => ({ op: "lifeFace", side: "me", up: true, n });
const runOnKO: Step = { op: "runAbility", which: "onKO" };
const big: Cond = thereIs({ cost: [12, 99] }); // „If there is a Character with a cost of 12 or more“
const SELF_LEADER: Filter = { zone: "leader", self: true };
const enelCounter = counter(power(myLC({ name: "Enel" }), 2000, "battle"));
const toHandFromTrash = (f: Filter, label: string): Step[] => [choose(f, 1, label, 0, "h"), { op: "move", v: "h", to: "hand" }];
/** „Give up to 1 of your opponent's rested DON!! cards to 1 of your opponent's Characters“ (ako cena: povinne 1) */
const giveOppDonCost: Step[] = [
  { op: "choose", v: "od", f: oppChar(), min: 1, max: 1, label: "Ktorej súperovej postave dať súperov DON!! v rest" },
  { op: "giveDon", v: "od", n: 1, fromOpp: true },
];
const giveOppDon = (n: number, fromCostArea = false): Step[] => [
  choose(oppChar(), 1, `Súperovej postave daj ${n} jeho DON!!`, 0, "og"),
  { op: "giveDon", v: "og", n, ...(fromCostArea ? { oppCostArea: true } : { fromOpp: true }) },
];
const ifVar = (v: string, then: Step[]): Step => ifThen({ c: "cmp", a: { n: "varCount", v }, op: ">=", b: 1 }, then);
const scry2: Step[] = [
  { op: "look", n: 2 },
  choose({ zone: "look" }, 2, "Ktoré karty dať POD balíček? (ostatné ostanú navrchu)", 0, "sb"),
  { op: "move", v: "sb", to: "deckBottom" },
  { op: "lookRest", to: "top" },
];

export const META_C: Record<string, Script> = {
  // Leader: [DON!! x1][Opponent's Turn] If your only Characters are {East Blue}: opp Characters −2000. [Activate: Main][Once Per Turn] Rest opp Character with 2+ DON!! given.
  "OP15-001": {
    abilities: [
      statics([{ stat: "power", amount: -2000, f: oppChar() }], and(don(1), oppTurn, { c: "onlyChars", f: { zone: "characters", trait: EB } })),
      activateMain(rest(oppChar({ donGiven: 2 })), { once: true }),
    ],
  },
  // Would be K.O.'d → may trash Character ≤ 6000 power from hand instead. [Activate: Main][Once Per Turn] give opp rested DON!! to opp Character: give 1 rested DON!! to its owner's Leader/Character.
  "OP15-003": {
    abilities: [
      replaceKO(SELF, [discard(1, inHand({ type: CH, power: [-99999, 6000] }))]),
      activateMain([choose(oppLC(), 1, "Súperov leader/postava dostane ďalší jeho DON!!", 0, "o2"), { op: "giveDon", v: "o2", n: 1, fromOpp: true }], {
        once: true,
        optional: true,
        cost: giveOppDonCost,
      }),
    ],
  },
  "OP15-007": { abilities: [onPlay([ifThen(leaderTrait(EB), playFrom("hand", { cost: [0, 5] }))])] },
  // [On Play] Give up to 3 opp rested DON!! to 1 opp Character; this gains [Rush]. [Activate: Main][Once Per Turn] If played this turn: opp Characters −1000 per DON!! given to that Character.
  "OP15-008": {
    abilities: [
      onPlay([
        choose(oppChar(), 1, "Súperovej postave daj až 3 jeho DON!! v rest", 0, "k"),
        { op: "giveDon", v: "k", n: 3, fromOpp: true },
        { op: "flag", v: "k", flag: "marked", until: "turn" },
        selfKw("rush"),
      ]),
      activateMain([custom("kriegPower")], { once: true, cond: { c: "selfPlayedThisTurn" } }),
    ],
  },
  // If your Character ≤ 7000 base power would be removed by opp effect: may give your Leader −2000 this turn instead.
  "OP15-009": { abilities: [replaceRemoveByOpp(myChar({ basePower: [-99999, 7000] }), leaderPower(-2000))] },
  "OP15-011": {
    abilities: [
      statics([{ stat: "kw", kw: "blocker", f: SELF }, { stat: "power", amount: 2000, f: SELF }], and(oppTurn, leaderTrait(EB))),
      onKO([ifThen(leaderTrait(EB), ko(oppChar({ basePower: [-99999, 6000] })))]),
    ],
  },
  "OP15-017": {
    abilities: [
      activateMain([choose(oppLC(), 1, "Súperov leader/postava dostane ďalší jeho DON!!", 0, "o2"), { op: "giveDon", v: "o2", n: 1, fromOpp: true }], {
        once: true,
        optional: true,
        cost: giveOppDonCost,
      }),
    ],
  },
  "OP15-023": {
    abilities: [
      onKO(noRefresh(oppLC({ rested: true }), 2)),
      activateMain([choose(oppLC(), 1, "Súperov leader/postava dostane DON!! z jeho cost area", 0, "o2"), { op: "giveDon", v: "o2", n: 1, oppCostArea: true }], {
        once: true,
        optional: true,
        cost: giveOppDonCost,
      }),
    ],
  },
  "OP15-025": {
    kw: ["blocker"],
    abilities: [onPlay([...giveOppDon(2, true), later(...noRefresh(oppChar({ rested: true, donGiven: 3 })))])],
  },
  "OP15-026": { abilities: [onPlay(search(3, { trait: EB })), activateMain(giveOppDon(1), { optional: true, cost: [trashSelf] })] },
  "OP15-028": { abilities: [onPlay([ifThen(leaderTrait(EB), giveOppDon(1, true))])] },
  "OP15-032": {
    abilities: [
      onPlay([custom("restOppCardsOrDon", { max: 1 })]),
      activateMain([ifThen(leaderTrait(SH), activate(myChar({ baseCost: [0, 8] })))], { optional: true, cost: [trashSelf] }),
    ],
  },
  "OP15-035": { abilities: [replaceRemoveByOpp(myChar({ basePower: [-99999, 7000] }), [custom("restCards", 2)])] },
  "OP15-037": { abilities: [main(search(5, { trait: EB, notName: "The Outcome Will Tell Us Who's Strong and Who's Weak" })), trigger([draw(1)])] },
  "OP15-038": {
    abilities: [main(noRefresh(oppChar({ rested: true, cost: [0, 8], donGiven: 2 }))), counter(power(myLC({ name: "Krieg" }), 4000, "battle"))],
  },
  // Leader: DON!! deck = 6. [Activate: Main][Once Per Turn] From your second turn: +1 active, +4 rested; give up to 4 rested DON!! to 1 Character.
  "OP15-058": {
    rules: { donDeck: 6 },
    abilities: [activateMain([addDon(1, "active"), addDon(4, "rested"), ...giveDon(4, myChar())], { once: true, cond: { c: "secondTurnOrLater" } })],
  },
  "OP15-061": {
    abilities: [onPlay([draw(1)], { optional: true, cost: [donMinus(1)] }), whenAttacking([ifThen(donLe(6), power(oppChar(), -1000))])],
  },
  "OP15-066": { abilities: [onPlay([draw(1)], { optional: true, cost: [donMinus(1)] }), whenAttacking([ifThen(donLe(6), scry2)])] },
  "OP15-067": { abilities: [statics([{ stat: "kw", kw: "rush", f: SELF }], donLe(6)), onPlay([draw(1)], { optional: true, cost: [donMinus(1)] })] },
  // All your [Ohm] and this gain [Double Attack]. [Opponent's Turn] their base power becomes 6000.
  "OP15-071": {
    abilities: [
      statics([{ stat: "kw", kw: "doubleAttack", f: myChar({ any: [{ name: "Ohm" }, { self: true }] }) }]),
      statics([{ stat: "basePower", value: 6000, f: myChar({ any: [{ name: "Ohm" }, { self: true }] }) }], oppTurn),
    ],
  },
  "OP15-074": {
    abilities: [
      main([ifThen(leaderIs("Enel"), [draw(1)]), choose(myChar(), 1, "+2 cost do konca súperovej End fázy", 0, "c"), { op: "costMod", v: "c", amount: 2, until: "oppNextEndPhase" }], {
        optional: true,
        cost: [donMinus(1)],
      }),
      enelCounter,
    ],
  },
  "OP15-075": {
    abilities: [main([ifThen(leaderIs("Enel"), power(myLC(), 1000)), ...ko(oppChar({ power: [-99999, 3000] }))], { optional: true, cost: [donMinus(1)] }), enelCounter],
  },
  "OP15-076": {
    abilities: [main([ifThen(leaderIs("Enel"), [draw(1)]), ...power(oppChar(), -1000)], { optional: true, cost: [donMinus(1)] }), enelCounter],
  },
  "OP15-077": { abilities: [main([draw(1), ...noRefresh(oppChar({ rested: true, power: [-99999, 6000] }))], { optional: true, cost: [donMinus(1)] })] },
  "OP15-078": {
    abilities: [
      main([draw(1), ...rest(oppChar({ power: [-99999, 5000] }))], { optional: true, cost: [donMinus(2)] }),
      counter([...counterBuff(1000), ifThen(donLe(6), [draw(1)])]),
    ],
  },
  "OP15-084": { abilities: [onPlay([ifThen(leaderTrait(TBP), [{ op: "mill", n: 5 }])]), onKO([ifThen(handLe(6), [draw(1)])])] },
  "OP15-086": {
    abilities: [
      onPlay([ifThen(leaderTrait(SH), [choose({ zone: "trash", type: CH, trait: SH, cost: [0, 7] }, 1, "Zahraj {Straw Hat Crew} z trashu (získa [Rush])", 0, "n"), { op: "play", v: "n" }, { op: "kw", v: "n", kw: "rush", until: "turn" }])]),
    ],
  },
  "OP15-088": {
    abilities: [statics([{ stat: "cost", amount: 6, f: SELF }]), onPlay(playFrom("trash", { trait: SH, cost: [0, 2] }), { optional: true, cost: [{ op: "mill", n: 3 }] })],
  },
  "OP15-090": { abilities: [replaceRemoveByOpp(myChar({ basePower: [-99999, 7000] }), [discard(1)])] },
  // Trash ≥ 10: base 9000 and +10 cost. ≥ 20: on opponent's turn your Leader's base power 7000. ≥ 30: +1000.
  "OP15-092": {
    abilities: [
      statics([{ stat: "basePower", value: 9000, f: SELF }, { stat: "cost", amount: 10, f: SELF }], { c: "cmp", a: { n: "trash" }, op: ">=", b: 10 }),
      statics([{ stat: "basePower", value: 7000, f: { zone: "leader" } }], and(oppTurn, { c: "cmp", a: { n: "trash" }, op: ">=", b: 20 })),
      statics([{ stat: "power", amount: 1000, f: SELF }], { c: "cmp", a: { n: "trash" }, op: ">=", b: 30 }),
    ],
  },
  "OP15-101": {
    abilities: [onPlay(search(5, { any: [{ name: "Mont Blanc Noland" }, { trait: "Shandian Warrior" }] }, 2), { optional: true, cost: [discard(1)] })],
  },
  "OP15-108": { abilities: [onPlay(search(3, { trait: "Sky Island" }))] },
  "OP15-112": { kw: ["blocker"], abilities: [onPlay(playFrom("hand", { trait: "Shandian Warrior", cost: [0, 3] }))] },
  "OP15-113": { abilities: [onPlay([deckToLife(1)], { optional: true, cost: [discard(1)] })] },
  "OP15-114": {
    abilities: [
      onPlay([...powerAll(oppChar(), -2000), all(oppChar({ power: [-99999, 0] }), "z"), { op: "ko", v: "z" }], { optional: true, cost: [faceUp(1)] }),
      activateMain(giveDon(1, myLC({ trait: "Sky Island" })), { once: true }),
    ],
  },
  // If ≤ 6 DON!!: cannot be removed by opp effects and +2000. [On Play] DON!! −1: look at 5, 1 to hand, rest bottom, then trash 1.
  "OP15-118": {
    abilities: [
      statics([{ stat: "protect", f: SELF }, { stat: "power", amount: 2000, f: SELF }], donLe(6)),
      onPlay([...search(5, {}), discard(1)], { optional: true, cost: [donMinus(1)] }),
    ],
  },
  // If ≥ 6 DON!!: [Rush]. When opponent activates an Event or [Blocker]: reveal top Life, +1000 per its cost this turn.
  "OP15-119": {
    abilities: [
      statics([{ stat: "kw", kw: "rush", f: SELF }], donGe(6)),
      onEvent({ ev: "EventActivated", side: "opp" }, [custom("revealLifeTopPower")]),
      onEvent({ ev: "BlockerActivated", side: "opp" }, [custom("revealLifeTopPower")]),
    ],
  },
  "OP16-002": { abilities: [onPlay([draw(1)], { optional: true, cost: [reveal(1, { type: CH, power: [8000, 8000] })] })] },
  "OP16-004": { abilities: [] },
  "OP16-017": {
    kw: ["blocker"],
    abilities: [statics([{ stat: "power", amount: -4000, f: SELF }], { c: "none", f: myChar({ traitIncl: "Whitebeard Pirates", cost: [8, 99] }) })],
  },
  "OP16-021": {
    abilities: [onPlay([ifThen(leaderTrait("Whitebeard Pirates"), search(3, {}))]), activateMain(giveDon(1), { optional: true, cost: [trashSelf] })],
  },
  // Leader: [Activate: Main][Once Per Turn] If only {Impel Down} Characters: set 2 DON!! active.
  "OP16-022": { abilities: [activateMain([ifThen({ c: "onlyChars", f: { zone: "characters", trait: "Impel Down" } }, [activeDon(2)])], { once: true })] },
  "OP16-026": { abilities: [onPlay([...search(3, { trait: "Impel Down" }), ...playFrom("hand", { cost: [0, 2] })])] },
  "OP16-032": { kw: ["unblockable"], abilities: [onPlay(flagOpp({ notName: "Monkey.D.Luffy" }, "cannotBeRested"))] },
  // [DON!! x1][Your Turn] +1000 per your Characters with different names. [On Play] search {Impel Down}.
  "OP16-034": {
    abilities: [
      statics([{ stat: "power", amount: { n: "mul", a: { n: "distinctNames", f: { zone: "characters" } }, k: 1000 }, f: SELF }], and(don(1), yourTurn)),
      onPlay(search(3, { trait: "Impel Down" })),
    ],
  },
  "OP16-038": {
    abilities: [
      main([ifThen({ c: "cmp", a: { n: "distinctNames", f: { zone: "characters", trait: "Impel Down" } }, op: ">=", b: 5 }, [all(myLC(), "a"), { op: "activate", v: "a" }])], {
        optional: true,
        cost: [restDon(6)],
      }),
      counter(leaderBattle(3000)),
    ],
  },
  "OP16-042": { abilities: [] },
  "OP16-045": {
    kw: ["blocker"],
    abilities: [
      onPlay(playFrom("hand", { trait: "Impel Down", cost: [0, 2] }), {
        optional: true,
        cost: [{ op: "choose", v: "r", f: myChar({ cost: [2, 99] }), min: 1, max: 1, label: "Vráť svoju postavu (cost ≥ 2) do ruky" }, { op: "move", v: "r", to: "hand" }],
      }),
    ],
  },
  "OP16-048": {
    abilities: [
      onPlay([ifThen(leaderTrait("Impel Down"), [draw(1), ...playFrom("hand", { name: "Prisoner of Impel Down" })])]),
      onOppAttack([choose(myChar({ name: "Prisoner of Impel Down" }), 1, "Ktorý [Prisoner of Impel Down] získa [Blocker]", 0, "pr"), { op: "kw", v: "pr", kw: "blocker", until: "turn" }], {
        once: true,
      }),
    ],
  },
  "OP16-051": { abilities: [onPlay([ifThen(handLe(5), [draw(2)])])] },
  "OP16-054": {
    abilities: [statics([{ stat: "power", amount: 3000, f: SELF }], and(don(1), yourTurn, { c: "cmp", a: { n: "hand" }, op: ">=", b: 5 })), onPlay([draw(1)])],
  },
  "OP16-055": {
    abilities: [onPlay([draw(1)]), whenAttacking([{ op: "set", v: "oL", from: "oppLeader" }, { op: "basePower", v: "$self", value: "copy", copyOf: "oL", until: "turn" }], { cond: don(1) })],
  },
  "OP16-056": { abilities: [activateMain([draw(2), ...cannotAttack(oppChar({ cost: [0, 9] }))], { optional: true, cost: [trashSelf] })] },
  "OP16-064": { abilities: [onPlay(search(5, { trait: "Navy", notName: "Koby" }))] },
  "OP16-065": {
    abilities: [
      onPlay(power(oppChar(), -6000, "oppNextEndPhase"), { optional: true, cost: [donMinus(1)] }),
      activateMain([ifThen(leaderTrait("Navy"), [addDon(2)])], { once: true, optional: true, cost: [restDon(1)] }),
    ],
  },
  "OP16-067": { abilities: [onPlay([...search(5, { trait: "Navy" }), discard(1)])] },
  "OP16-068": { abilities: [onPlay([addDon(1)]), whenAttacking([ifThen(leaderTrait("Donquixote Pirates"), [selfPower(3000)])])] },
  "OP16-077": { abilities: [main([...search(5, { trait: "Navy" }, 2), discard(1)])] },
  "OP16-078": { abilities: [onPlay(search(5, { trait: "Navy" })), activateMain(drawDiscard(1, 1), { optional: true, cost: [donMinus(1), restSelf] })] },
  // Leader: [Opponent's Turn] your Characters +1 cost. [On your Opponent's Attack][Once Per Turn] trash 1 [Trigger] card: change target to this Leader or {BB} Character.
  "OP16-080": {
    abilities: [
      statics([{ stat: "cost", amount: 1, f: myChar() }], oppTurn),
      onOppAttack([custom("changeTarget")], { once: true, optional: true, cost: [discard(1, inHand({ hasTrigger: true }))] }),
    ],
  },
  "OP16-103": { abilities: [onKO([ifThen(and(oppTurn, leaderTrait(BB)), [draw(1), ...power(oppLC(), -3000)])]), trigger([runOnKO])] },
  "OP16-104": {
    abilities: [
      whenAttacking([choose(oppChar(), 1, "Ktorej súperovej postavy power skopírovať?", 0, "x"), { op: "basePower", v: "$self", value: "copy", copyOf: "x", until: "turn" }]),
      trigger([draw(1), ...playFrom("trash", { trait: BB, cost: [1, 1] })]),
    ],
  },
  "OP16-106": {
    abilities: [
      onKO([ifThen(leaderTrait(BB), [draw(1), choose(myLC(), 1, "Base power sa stane 7000", 0, "w"), { op: "basePower", v: "w", value: 7000, until: "turn" }])]),
      trigger([runOnKO]),
    ],
  },
  "OP16-108": {
    abilities: [
      onPlay([choose({ zone: "trash", trait: BB, cost: [0, 6] }, 1, "{Blackbeard Pirates} z trashu navrch Life (lícom hore)", 0, "l"), { op: "move", v: "l", to: "lifeTop", faceUp: true }], {
        optional: true,
        cost: [discard(1)],
      }),
      trigger([draw(2)]),
    ],
  },
  "OP16-110": { abilities: [onKO([draw(1), ...rest(oppChar({ cost: [0, 6] }))]), trigger([runOnKO])] },
  "OP16-113": { abilities: [statics([{ stat: "kw", kw: "blocker", f: SELF }], lifeLe(2)), triggerPlaySelf(leaderTrait("Kuja Pirates"))] },
  "OP16-115": {
    abilities: [
      main([ifThen(leaderTrait(BB), toHandFromTrash({ zone: "trash", hasTrigger: true, notName: "Black Vortex" }, "Karta s [Trigger] z trashu do ruky"))]),
      trigger(negate(oppLC())),
    ],
  },
  "OP16-116": {
    abilities: [main([ifThen(donGe(10), playFrom("hand", { name: "Marshall.D.Teach" })), lifeToHand("opp", 1)]), trigger(drawDiscard(2, 1))],
  },
  "OP16-118": {
    abilities: [
      statics([{ stat: "counter", f: { zone: "hand", type: CH, power: [8000, 8000] }, set: 2000 }]),
      onPlay(search(5, { any: [{ name: "Monkey.D.Luffy" }, { traitIncl: "Whitebeard Pirates" }] })),
      onKO(search(5, { any: [{ name: "Monkey.D.Luffy" }, { traitIncl: "Whitebeard Pirates" }] })),
    ],
  },
  "OP16-119": {
    abilities: [
      onPlay([{ op: "look", n: 3 }, choose({ zone: "look" }, 1, "Kartu navrch Life", 0, "l"), { op: "move", v: "l", to: "lifeTop" }, { op: "lookRest", to: "bottom" }]),
      trigger([...negate(oppChar()), ...ko(oppChar({ cost: [0, 5] }))]),
    ],
  },
  // Leader: [On Your Opponent's Attack][Once Per Turn] trash 1: Leader or Character +4000 this battle.
  "OP17-001": { abilities: [onOppAttack(power(myLC(), 4000, "battle"), { once: true, optional: true, cost: [discard(1)] })] },
  "OP17-002": { abilities: [statics([{ stat: "power", amount: 3000, f: SELF }], oppTurn)] },
  "OP17-003": {
    kw: ["rushChar"],
    abilities: [onPlay([ifThen(or(leaderIs("Edward.Newgate"), leaderTrait("Land of Wano")), power(oppChar({ rested: true }), -6000))])],
  },
  "OP17-004": {
    abilities: [onPlay([choose(myChar({ any: [{ trait: "Land of Wano" }, { traitIncl: "Whitebeard Pirates" }] }), 1, "Kto získa [Rush]", 0, "r"), { op: "kw", v: "r", kw: "rush", until: "turn" }])],
  },
  "OP17-005": {
    abilities: [
      statics([{ stat: "handCost", amount: -4 }], has(oppChar({ power: [10000, 99999] }))),
      onPlay([ifThen(not(multicolor), [{ op: "set", v: "L", from: "myLeader" }, { op: "basePower", v: "L", value: 8000, until: "oppNextEndPhase" }])]),
    ],
  },
  "OP17-008": {
    abilities: [onPlay([ifThen(leaderIs("Edward.Newgate"), [{ op: "set", v: "L", from: "myLeader" }, { op: "basePower", v: "L", value: 8000, until: "oppNextEndPhase" }])])],
  },
  "OP17-016": { abilities: [onPlay(ko(oppChar({ basePower: [-99999, 2000] }), 2))] },
  "OP17-017": { abilities: [counter([...power(myLC({ traitIncl: "Whitebeard Pirates" }), 2000, "battle"), ...power(oppLC(), -2000)])] },
  "OP17-019": { abilities: [main(search(5, { traitIncl: "Whitebeard Pirates" })), trigger(leaderPower(1000))] },
  "OP17-022": { kw: ["rush"], abilities: [onPlay([activeDon(2), ...restAll(oppChar())])] },
  // If your {East Blue}/{SHC} Character would be K.O.'d, you may rest this Character instead.
  "OP17-023": { abilities: [replaceKO(myChar({ any: [{ trait: EB }, { trait: SH }] }), [restSelf])] },
  "OP17-031": { abilities: [onPlay([draw(1), ...rest(oppChar({ cost: [0, 8] }))]), endOfTurn(activate(myChar({ traitIncl: "Red-Haired Pirates" })))] },
  // Leader: [When Attacking] You may trash 1: reveal top card; if type incl. "Rocks Pirates", draw 2.
  "OP17-039": { abilities: [whenAttacking([custom("xebecReveal")], { optional: true, cost: [discard(1)] })] },
  "OP17-040": {
    abilities: [
      onPlay([draw(1)]),
      onEvent({ ev: "LeaderAttackedOrAttacks", side: "me" }, leaderBattle(3000), { once: true, optional: true, cond: leaderTraitIncl(ROCKS), cost: [discard(1)] }),
    ],
  },
  "OP17-041": {
    kw: ["blocker"],
    abilities: [onPlay([all(oppChar({ baseCost: [1, 1] }), "b1"), { op: "move", v: "b1", to: "deckBottom" }], { optional: true, cost: [discard(1)] })],
  },
  "OP17-042": { kw: ["blocker"], abilities: [onPlay(power(oppChar(), -3000), { optional: true, cost: [reveal(3, { traitIncl: ROCKS })] })] },
  // If this would be removed from the field, you may trash 2 cards instead. [On Play] Leader base power 6000.
  "OP17-043": {
    abilities: [
      { when: "replace", replace: { what: "remove", f: SELF }, cost: [discard(2)], steps: [], optional: true },
      onPlay([{ op: "set", v: "L", from: "myLeader" }, { op: "basePower", v: "L", value: 6000, until: "oppNextEndPhase" }]),
    ],
  },
  "OP17-044": {
    abilities: [
      statics([{ stat: "attackOnly", f: SELF }], and(leaderTraitIncl(ROCKS), { c: "selfRested" })),
      activateMain(drawDiscard(1, 1), { optional: true, cost: [restSelf] }),
    ],
  },
  "OP17-045": { abilities: [replaceRemoveByOpp(myChar(), [discard(2)]), onPlay([draw(1)])] },
  "OP17-046": { kw: ["blocker"], abilities: [onPlay(bottom({ side: "any", zone: "characters", cost: [0, 5] }))] },
  "OP17-048": {
    kw: ["rushChar"],
    abilities: [
      whenAttacking(power(oppChar(), -3000), { once: true, onceKey: "s", optional: true, cost: [discard(1, inHand({ traitIncl: ROCKS }))] }),
      onOppAttack(power(oppChar(), -3000), { once: true, onceKey: "s", optional: true, cost: [discard(1, inHand({ traitIncl: ROCKS }))] }),
    ],
  },
  "OP17-049": {
    abilities: [
      onPlay([oneOf([["Súper potiahne 2 karty", [draw(2)]], ["Vyhodíš 2 karty z ruky", [oppDiscard(2)]]], "opp")]),
      onOppAttack(power(myLC(), 1000, "battle"), { once: true, optional: true, cost: [discard(1)] }),
    ],
  },
  "OP17-050": { abilities: [onPlay([...scry2, draw(1)])] },
  "OP17-052": { abilities: [onPlay(toHandFromTrash({ zone: "trash", color: "Blue", type: EV, cost: [0, 0] }, "Modrý event (cost 0) z trashu do ruky"))] },
  "OP17-054": {
    abilities: [onPlay(cannotAttack(oppChar({ baseCost: [0, 6] }))), activateMain(cannotAttack(oppChar()), { optional: true, cost: [restDon(3), restSelf] })],
  },
  "OP17-055": {
    abilities: [
      main([choose(myLC({ name: "Rocks.D.Xebec" }), 1, "Kto získa [Unblockable]", 0, "u"), { op: "kw", v: "u", kw: "unblockable", until: "turn" }], { optional: true, cost: [restDon(1)] }),
      counter(power(myLC({ traitIncl: ROCKS }), 2000, "battle")),
    ],
  },
  "OP17-056": {
    abilities: [main(bounce({ side: "any", zone: "characters", cost: [0, 6] }), { optional: true, cost: [restDon(5)] }), counter(power(myLC({ traitIncl: ROCKS }), 2000, "battle"))],
  },
  // Leader: [When Attacking]/[On Your Opponent's Attack][Once Per Turn] DON!! −1: opp Character −2000.
  "OP17-058": {
    abilities: [
      whenAttacking(power(oppChar(), -2000), { once: true, onceKey: "k", optional: true, cost: [donMinus(1)] }),
      onOppAttack(power(oppChar(), -2000), { once: true, onceKey: "k", optional: true, cost: [donMinus(1)] }),
    ],
  },
  "OP17-059": { kw: ["blocker"], abilities: [onPlay([draw(1), ...ko(oppChar({ cost: [0, 2] }), 2)], { optional: true, cost: [donMinus(1)] })] },
  "OP17-061": {
    abilities: [
      onPlay([ifThen(leaderTrait(AKP), [deckToLife(1)])], { optional: true, cost: [donMinus(1)] }),
      activateMain(playFrom("hand", { name: ["King", "Queen", "Jack"] }), { optional: true, cost: [trashSelf] }),
    ],
  },
  "OP17-062": { kw: ["blocker"], abilities: [onEvent({ ev: "DonReturned", side: "me" }, [addDon(1), activeDon(1)], { cond: yourTurn, once: true })] },
  "OP17-063": {
    abilities: [
      statics([{ stat: "counter", f: { zone: "hand", type: CH, noCounter: true }, add: 1000 }]),
      activateMain([choose(oppChar({ cost: [0, 6] }), 1, "Negovať a K.O. – súperova postava cost ≤ 6", 0, "n"), { op: "flag", v: "n", flag: "negated", until: "turn" }, { op: "ko", v: "n" }], {
        once: true,
        optional: true,
        cond: { c: "selfPlayedThisTurn" },
        cost: [donMinus(1)],
      }),
    ],
  },
  "OP17-065": { kw: ["banish"], abilities: [onPlay([draw(1), ...cannotAttack(oppChar({ cost: [0, 5] }), "oppNextEndPhase", 2)], { optional: true, cost: [donMinus(1)] })] },
  "OP17-073": { abilities: [onPlay([ifThen(leaderTrait(AKP), [addDon(1)])], { optional: true, cost: [discard(1)] })] },
  "OP17-074": { kw: ["blocker"], abilities: [onPlay([addDon(1, "rested")])] },
  "OP17-077": {
    abilities: [
      main([ifThen(leaderTrait(AKP), [addDon(3, "rested")])], { optional: true, cost: [restDon(3), discard(2)] }),
      counter(leaderBattle(4000), { optional: true, cost: [donMinus(1)] }),
    ],
  },
  // Leader: All your Characters with cost ≥ 12 gain [Blocker].
  "OP17-079": { abilities: [statics([{ stat: "kw", kw: "blocker", f: myChar({ cost: [12, 99] }) }])] },
  "OP17-080": { abilities: [statics([{ stat: "power", amount: 3000, f: SELF }], big), onPlay(search(3, { trait: "Elbaph" }, 1, "trash"))] },
  "OP17-081": {
    abilities: [
      statics([{ stat: "cost", amount: 12, f: SELF }], leaderTrait("Elbaph")),
      onPlay(toHandFromTrash({ zone: "trash", type: CH, cost: [0, 8], notName: "Gerd" }, "Postava (cost ≤ 8) z trashu do ruky"), { optional: true, cost: [discard(1)] }),
    ],
  },
  "OP17-082": { abilities: [statics([{ stat: "power", amount: 3000, f: SELF }], big), onPlay(drawDiscard(2, 2))] },
  "OP17-083": { abilities: [statics([{ stat: "kw", kw: "blocker", f: SELF }, { stat: "power", amount: 3000, f: SELF }], big)] },
  "OP17-084": {
    abilities: [onPlay([ifThen(big, [choose(myChar(), 1, "Kto získa [Unblockable]", 0, "u"), { op: "kw", v: "u", kw: "unblockable", until: "turn" }])])],
  },
  "OP17-086": { abilities: [onPlay([draw(2)], { optional: true, cost: [discard(1, inHand({ trait: "Elbaph" }))] })] },
  "OP17-087": { abilities: [statics([{ stat: "power", amount: 3000, f: SELF }], big), onPlay([ifThen(big, power(oppChar(), -3000))])] },
  "OP17-089": { abilities: [statics([{ stat: "cost", amount: 12, f: SELF }]), onPlay(search(3, { trait: "Elbaph" }, 1, "trash"))] },
  "OP17-090": { abilities: [statics([{ stat: "power", amount: 3000, f: SELF }], big), onPlay([ifThen(big, ko(oppChar({ cost: [0, 2] })))])] },
  "OP17-091": { abilities: [statics([{ stat: "power", amount: 3000, f: SELF }], big), onPlay([ifThen(big, [oppDiscard(1)])])] },
  "OP17-093": { abilities: [statics([{ stat: "kw", kw: "rush", f: SELF }], big), onPlay([draw(1), ...playFrom("trash", { cost: [0, 2] })])] },
  "OP17-094": { abilities: [statics([{ stat: "cost", amount: 12, f: SELF }], leaderTrait("Elbaph"))] },
  "OP17-095": {
    abilities: [statics([{ stat: "power", amount: 3000, f: SELF }], big), replaceRemoveByOpp(myChar(), [custom("trashToDeckBottom", 3)])],
  },
  "OP17-096": {
    abilities: [counter([ifThen(big, counterBuff(4000))]), trigger(toHandFromTrash({ zone: "trash", trait: "Elbaph" }, "Karta {Elbaph} z trashu do ruky"))],
  },
  "OP17-097": { abilities: [main([all(oppChar(), "c"), { op: "costMod", v: "c", amount: -1, until: "turn" }]), counter(leaderBattle(3000))] },
  "OP17-098": { abilities: [main([ifThen(big, ko(oppChar({ cost: [0, 6] }), 2))], { optional: true, cost: [restDon(6)] }), counter(leaderBattle(3000))] },
  // Leader: [When Attacking] You may trash 1: opponent chooses: you trash 1 and add top deck to Life • opponent trashes 1 from hand.
  "OP17-099": {
    abilities: [
      whenAttacking(
        [oneOf([["Súper vyhodí 1 kartu a pridá 1 kartu do Life", [discard(1), deckToLife(1)]], ["Vyhodíš 1 kartu z ruky", [oppDiscard(1)]]], "opp")],
        { optional: true, cost: [discard(1)] },
      ),
    ],
  },
  "OP17-102": { abilities: [onKO(playFrom("trash", { power: [-99999, 4000], notName: "Charlotte Oven" })), triggerPlaySelf()] },
  "OP17-103": { abilities: [onPlay([ifThen(leaderTrait(BMP), [deckToLife(1)]), ...power(oppChar(), -3000)], { cond: yourTurn }), triggerPlaySelf()] },
  "OP17-104": { abilities: [onPlay([ifThen(leaderTrait(BMP), [deckToLife(1)])], { cond: yourTurn, optional: true, cost: [restDon(2)] }), triggerPlaySelf()] },
  "OP17-106": { abilities: [onPlay([deckToLife(1), oppDiscard(1)], { cond: yourTurn, optional: true, cost: [restDon(2)] }), triggerPlaySelf()] },
  "OP17-107": { abilities: [triggerPlaySelf()] },
  "OP17-108": { kw: ["blocker"], abilities: [trigger(rest(oppChar({ cost: [0, 6] })))] },
  "OP17-109": { abilities: [onPlay([draw(3)], { optional: true, cost: [discard(1, inHand({ hasTrigger: true }))] }), trigger(search(5, { trait: BMP }))] },
  "OP17-110": { abilities: [onPlay([...playFrom("hand", { trait: BMP, cost: [0, 6] }), selfKw("rush")], { cond: yourTurn }), triggerPlaySelf()] },
  "OP17-111": { abilities: [onPlay(ko(oppChar({ cost: [0, 1] }), 2), { optional: true, cost: [reveal(2, { hasTrigger: true })] }), triggerPlaySelf()] },
  // [Your Turn] Base power of your [Trigger] Characters with 4000 base power becomes 8000. [On Play] Draw 1, then choose: top deck → Life • opp top Life → hand.
  "OP17-112": {
    abilities: [
      statics([{ stat: "basePower", value: 8000, f: myChar({ hasTrigger: true, printedPower: [4000, 4000] }) }], yourTurn),
      onPlay([draw(1), oneOf([["Pridaj 1 kartu z balíčka do Life", [deckToLife(1)]], ["Súperova vrchná Life karta do jeho ruky", [lifeToHand("opp", 1)]]])]),
    ],
  },
  "OP17-113": { abilities: [onPlay(search(3, { trait: BMP }))] },
  "OP17-114": {
    abilities: [onPlay([draw(1), deckToLife(1), ...power(oppChar(), -3000, "turn", 2)], { cond: yourTurn, optional: true, cost: [restDon(2)] }), triggerPlaySelf()],
  },
  // If you only have Characters without a Counter: +2000 Counter in hand. [On Play] Draw 1, play up to 2 {Rocks Pirates} with different names, total cost ≤ 9.
  "OP17-118": {
    abilities: [
      statics([{ stat: "selfCounter", add: 2000 }], and(has(myChar()), { c: "onlyChars", f: { zone: "characters", noCounter: true } })),
      onPlay([
        draw(1),
        { op: "choose", v: "rp", f: { zone: "hand", type: [CH, "Stage"], traitIncl: ROCKS }, min: 0, max: 2, label: "Zahraj až 2 {Rocks Pirates} (rôzne mená, spolu cost ≤ 9)", distinctNames: true, maxTotalCost: 9 },
        { op: "play", v: "rp" },
      ]),
    ],
  },
  "OP17-119": {
    abilities: [
      statics([{ stat: "cost", amount: 12, f: SELF }]),
      statics([{ stat: "power", amount: 3000, f: SELF }], oppTurn),
      onPlay([{ op: "choose", v: "lk", f: oppChar(), min: 0, max: 5, label: "K.O. súperove postavy so súčtom cost ≤ 4", maxTotalCost: 4 }, { op: "ko", v: "lk" }]),
    ],
  },
};

function flagOpp(x: Omit<Filter, "zone" | "side">, fl: "cannotBeRested"): Step[] {
  return [choose(oppChar(x), 1, "Nedá sa dať do rest – súperova postava", 0, "fo"), { op: "flag", v: "fo", flag: fl, until: "oppNextEndPhase" }];
}

void [bounce, ifVar, playSelf, replaceKO, SELF_LEADER, EV, flag, negate, has, lifeToHand, multicolor, giveDon, donGe, leaderPower];
