// Turnajové karty: OP09–OP14.
import {
  activate, activateMain, activeDon, addDon, all, and, bottom, bounce, CH, choose, costMod, counter, counterBuff, custom, deckToLife, discard, don,
  donGe, donMinus, draw, drawDiscard, endOfTurn, EV, flag, giveDon, giveDonLeader, has, ifThen, inHand, ko, later, leaderBattle, leaderIs, leaderPower,
  leaderTrait, leaderTraitIncl, lifeGe, lifeLe, lifeToHand, main, multicolor, myChar, myLC, negate, noRefresh, not, oneOf, onEvent, onKO, onOppAttack, onPlay,
  oppChar, oppDiscard, oppLC, oppTurn, or, playFrom, playSelf, power, powerAll, replaceKO, replaceRemoveByOpp, rest, restDon, restSelf, reveal,
  Script, search, SELF, selfKw, selfPower, statics, thereIs, trashSelf, trigger, triggerPlaySelf, whenAttacking, yourTurn, cannotAttack,
} from "../dsl";
import type { Cond, Step } from "../types";

const SH = "Straw Hat Crew";
const DP = "Donquixote Pirates";
const BB = "Blackbeard Pirates";
const TBP = "Thriller Bark Pirates";
const FILM_SH: Cond = or(leaderTrait("FILM"), leaderTrait(SH));
const faceUp = (n = 1): Step => ({ op: "lifeFace", side: "me", up: true, n });
const faceDown = (n = 1): Step => ({ op: "lifeFace", side: "me", up: false, n });
const runMain: Step = { op: "runAbility", which: "main" };
const runOnPlay: Step = { op: "runAbility", which: "onPlay" };
const runOnKO: Step = { op: "runAbility", which: "onKO" };
const giveActiveDonTo = (name: string, n: number): Step[] => [
  { op: "choose", v: "r", f: myLC({ name }), min: 1, max: 1, label: `Komu dať ${n} aktívne DON!!` },
  { op: "giveDon", v: "r", n, active: true },
];
const ifVar = (v: string, then: Step[]): Step => ifThen({ c: "cmp", a: { n: "varCount", v }, op: ">=", b: 1 }, then);

export const META_B: Record<string, Script> = {
  // [Rush]. Give all of your opponent's Characters −1000 power.
  "OP09-004": { kw: ["rush"], abilities: [statics([{ stat: "power", amount: -1000, f: oppChar() }])] },
  // Leader: [Activate: Main] You may rest 5 DON!! and trash 1: play {Cross Guild} Character from hand.
  "OP09-042": { abilities: [activateMain(playFrom("hand", { trait: "Cross Guild" }), { optional: true, cost: [restDon(5), discard(1)] })] },
  "OP09-048": { kw: ["blocker"], abilities: [onPlay(drawDiscard(2, 1))] },
  // [On Play] Place opp Character at bottom. Then if you don't have 5 Characters cost ≥ 5, place this at bottom.
  "OP09-051": {
    abilities: [onPlay([...bottom(oppChar()), ifThen(not(has(myChar({ cost: [5, 99] }), 5)), [{ op: "move", v: "$self", to: "deckBottom" }])])],
  },
  "OP09-056": { abilities: [onPlay(search(4, { any: [{ trait: "Cross Guild" }, { traitIncl: "Baroque Works" }], notName: "Mr.3" }))] },
  "OP09-057": { abilities: [main(search(4, { trait: "Cross Guild" })), trigger([runMain])] },
  // Leader: [Banish] [When Attacking] You may trash 1 card with [Trigger]: +1 DON!! rested.
  "OP09-062": { kw: ["banish"], abilities: [whenAttacking([addDon(1, "rested")], { optional: true, cost: [discard(1, inHand({ hasTrigger: true }))] })] },
  "OP09-072": { kw: ["blocker"], abilities: [onPlay([draw(2)], { optional: true, cost: [donMinus(2), discard(1)] })] },
  "OP09-078": {
    abilities: [counter([ifThen(leaderTrait(SH), counterBuff(4000)), draw(2)], { optional: true, cost: [donMinus(2), discard(1)] })],
  },
  // [Blocker] [Activate: Main][Once Per Turn] If Leader {BB} and played this turn: negate opp Leader; negate opp Character, it cannot attack.
  "OP09-093": {
    kw: ["blocker"],
    abilities: [
      activateMain(
        [
          { op: "set", v: "L", from: "oppLeader" },
          { op: "flag", v: "L", flag: "negated", until: "turn" },
          choose(oppChar(), 1, "Negovať efekt a zakázať útok – súperova postava", 0, "c"),
          { op: "flag", v: "c", flag: "negated", until: "turn" },
          { op: "flag", v: "c", flag: "cannotAttack", until: "oppNextEndPhase" },
        ],
        { once: true, cond: and(leaderTrait(BB), { c: "selfPlayedThisTurn" }) },
      ),
    ],
  },
  "OP09-095": { abilities: [activateMain(search(5, { trait: BB }), { optional: true, cost: [restDon(1), restSelf] })] },
  "OP09-097": {
    abilities: [
      counter([choose(oppLC(), 1, "Negovať efekt a −4000 power", 0, "n"), { op: "flag", v: "n", flag: "negated", until: "turn" }, { op: "power", v: "n", amount: -4000, until: "turn" }]),
      trigger(negate(oppLC())),
    ],
  },
  // [Rush] When your opponent activates [Blocker], if either player has 0 Life, you win.
  "OP09-118": {
    kw: ["rush"],
    abilities: [onEvent({ ev: "BlockerActivated", side: "opp" }, [ifThen(or(lifeLe(0), lifeLe(0, "opp")), [{ op: "win" }])])],
  },
  // Leader: [End of Your Turn] If {DP} Character with 6000+ power: set 1 DON!! active. [Opponent's Turn][Once Per Turn] When you activate an Event: +1 DON!! active.
  "OP10-003": {
    abilities: [
      endOfTurn([ifThen(has(myChar({ trait: DP, power: [6000, 99999] })), [activeDon(1)])]),
      onEvent({ ev: "EventActivated", side: "me" }, [addDon(1)], { cond: oppTurn, once: true }),
    ],
  },
  "OP10-005": { abilities: [statics([{ stat: "power", amount: 3000, f: SELF }], yourTurn), onKO([draw(1)])] },
  "OP10-016": { abilities: [activateMain([...giveDon(2), ...power(oppChar(), -1000)], { optional: true, cost: [restSelf] })] },
  "OP10-020": {
    abilities: [main([...power(oppChar(), -4000), ifThen(lifeLe(2), power(myLC(), 1000))]), trigger(ko(oppChar({ power: [-99999, 3000] })))],
  },
  // [Blocker] [On K.O.] DON!! −1: If Leader {DP}, add purple Event from trash to hand.
  "OP10-062": {
    kw: ["blocker"],
    abilities: [
      onKO([ifThen(leaderTrait(DP), [choose({ zone: "trash", color: "Purple", type: EV }, 1, "Fialový event z trashu do ruky", 0, "e"), { op: "move", v: "e", to: "hand" }])], {
        optional: true,
        cost: [donMinus(1)],
      }),
    ],
  },
  "OP10-065": { abilities: [activateMain(search(5, { trait: DP }), { optional: true, cost: [restDon(1), restSelf] })] },
  "OP10-067": {
    abilities: [
      onPlay([choose({ zone: "trash", color: "Purple", type: EV, cost: [0, 5] }, 1, "Fialový event (cost ≤ 5) z trashu do ruky", 0, "e"), { op: "move", v: "e", to: "hand" }, activeDon(1)], {
        optional: true,
        cost: [donMinus(1)],
      }),
    ],
  },
  "OP10-071": {
    abilities: [
      onPlay(playFrom("hand", { trait: DP, cost: [0, 5] }), { optional: true, cost: [donMinus(1)] }),
      onOppAttack([addDon(1)], { once: true, optional: true, cost: [restDon(1)] }),
    ],
  },
  "OP10-072": {
    abilities: [onPlay([draw(2)], { optional: true, cost: [discard(1, inHand({ type: EV }))] }), endOfTurn([ifThen(donGe(7), [activeDon(2)])])],
  },
  "OP10-078": {
    abilities: [
      main(search(3, { trait: DP, notName: "I Do Not Forgive Those Who Laugh at My Family!!!" })),
      counter(search(3, { trait: DP, notName: "I Do Not Forgive Those Who Laugh at My Family!!!" })),
    ],
  },
  "OP10-098": {
    abilities: [
      main([
        ifThen({ c: "cmp", a: { n: "count", f: myChar() }, op: "<=", b: { n: "sub", a: { n: "count", f: oppChar() }, b: 2 } }, [
          ...ko(oppChar({ baseCost: [0, 6] })),
          ...ko(oppChar({ baseCost: [0, 4] })),
        ]),
      ]),
      trigger([{ op: "set", v: "L", from: "oppLeader" }, { op: "flag", v: "L", flag: "negated", until: "turn" }, ...negate(oppChar())]),
    ],
  },
  "OP10-114": {
    abilities: [
      activateMain([ifThen({ c: "cmp", a: { n: "life" }, op: "<=", b: { n: "life", side: "opp" } }, rest(oppChar({ cost: [0, 4] })))], { optional: true, cost: [restSelf] }),
    ],
  },
  "OP11-003": { abilities: [] },
  "OP11-018": { abilities: [main([...power(oppChar(), -4000), ...ko(oppChar({ power: [-99999, 6000] }))]), trigger(ko(oppChar({ power: [-99999, 6000] })))] },
  // Leader: cannot attack. [Activate: Main][Once Per Turn] You may rest 1 DON!! and turn 1 Life face-up: play {Neptunian} or [Megalo] cost ≤ DON!! on field.
  "OP11-022": {
    rules: { leaderCannotAttack: true },
    abilities: [
      activateMain(playFrom("hand", { any: [{ trait: "Neptunian" }, { name: "Megalo" }], costLeq: { n: "donField" } }), {
        once: true,
        optional: true,
        cost: [restDon(1), faceUp(1)],
      }),
    ],
  },
  "OP11-028": { abilities: [onPlay(noRefresh(oppChar({ rested: true }))), trigger(ko(oppChar({ rested: true, cost: [0, 3] })))] },
  "OP11-033": { abilities: [] },
  "OP11-036": { abilities: [onPlay([ifThen(leaderIs("Shirahoshi"), search(5, { any: [{ trait: "Neptunian" }, { name: "Shirahoshi" }] }))])] },
  "OP11-054": {
    kw: ["blocker"],
    abilities: [onPlay([ifThen(multicolor, [draw(3), { op: "handToDeck", n: 2, where: "topOrBottom" }])])],
  },
  "OP11-067": {
    kw: ["blocker"],
    abilities: [endOfTurn([...activate(myChar({ trait: "Big Mom Pirates", cost: [3, 99] }), 2), addDon(1, "rested")])],
  },
  // [On Play] search {BMP} cost ≥ 2. [Activate: Main] DON!! −1, rest this: look at top of opponent's deck.
  "OP11-070": {
    abilities: [
      onPlay(search(5, { trait: "Big Mom Pirates", cost: [2, 99] })),
      activateMain(
        [{ op: "look", n: 1, side: "opp" }, choose({ side: "opp", zone: "look" }, 1, "Vrch súperovho balíčka (len pozri, potom Potvrdiť)", 0, "x"), { op: "lookRest", to: "top" }],
        { optional: true, cost: [donMinus(1), restSelf] },
      ),
    ],
  },
  "OP11-106": { abilities: [onPlay(ko(oppChar({ cost: [0, 5] })), { optional: true, cost: [lifeToHand("me", 1, "topOrBottom")] })] },
  // [Blocker] [Activate: Main][Once Per Turn] If Leader [Shirahoshi], you may turn 1 Life face-down: set this active at end of turn.
  "OP11-107": {
    kw: ["blocker"],
    abilities: [activateMain([{ op: "flag", v: "$self", flag: "activateAtEndOfTurn", until: "turn" }], { once: true, optional: true, cond: leaderIs("Shirahoshi"), cost: [faceDown(1)] })],
  },
  "OP11-115": { abilities: [counter([ifThen(leaderIs("Shirahoshi"), counterBuff(4000))]), trigger(ko(oppChar({ cost: [0, 2] })))] },
  // Leader: [Activate: Main][Once Per Turn] You may reveal 2 Events: Character with ≤ 4000 base power +2000.
  "OP12-001": { abilities: [activateMain(power(myChar({ basePower: [-99999, 4000] }), 2000), { once: true, optional: true, cost: [reveal(2, { type: EV })] })] },
  "OP12-002": { abilities: [] },
  "OP12-006": { abilities: [onPlay(search(5, { any: [{ name: "Monkey.D.Luffy" }, { color: "Red", type: EV }] }))] },
  "OP12-009": {
    abilities: [onPlay([selfKw("rush"), selfPower(1000, "oppNextEndPhase")], { optional: true, cost: [reveal(2, { type: EV })] })],
  },
  "OP12-014": {
    abilities: [onPlay(search(5, { any: [{ name: "Monkey.D.Luffy" }, { color: "Red", type: EV }] })), activateMain(giveDon(2), { optional: true, cost: [trashSelf] })],
  },
  "OP12-015": {
    abilities: [
      statics([{ stat: "power", amount: 2000, f: SELF }], { c: "cmp", a: { n: "donGivenTotal" }, op: ">=", b: 2 }),
      onPlay([...playFrom("hand", { color: "Red", power: [-99999, 3000] }), ...giveDon(1)], { optional: true, cost: [reveal(2, { type: EV })] }),
    ],
  },
  // [Main] You may give 2 active DON!! to [Silvers Rayleigh]: no [Blocker] when it attacks. [Counter] Characters or [Silvers Rayleigh] +2000.
  "OP12-016": {
    abilities: [
      main([{ op: "flag", v: "r", flag: "noBlockerWhenAttacks", until: "turn" }], { optional: true, cost: giveActiveDonTo("Silvers Rayleigh", 2) }),
      counter(power(myLC({ any: [{ type: CH }, { name: "Silvers Rayleigh" }] }), 2000, "battle")),
    ],
  },
  "OP12-017": {
    abilities: [main(search(4, { any: [{ color: "Red", type: EV }, { type: CH, cost: [3, 99] }] }), { optional: true, cost: giveActiveDonTo("Silvers Rayleigh", 1) })],
  },
  "OP12-018": {
    abilities: [
      counter([
        ...power(myLC({ any: [{ type: CH }, { name: "Silvers Rayleigh" }] }), 2000, "battle"),
        { op: "may", cost: [restDon(1)], steps: powerAll(oppLC(), -1000) },
      ]),
    ],
  },
  "OP12-023": { abilities: [] },
  "OP12-034": {
    abilities: [onPlay([ifThen({ c: "leader", f: { zone: "leader", attribute: "Slash" } }, search(5, { any: [{ attribute: "Slash" }, { color: "Green", type: EV }] }))])],
  },
  "OP12-037": {
    abilities: [main([custom("restOppCardsOrDon", { max: 2, chars: true })], { optional: true, cost: [restDon(3)] }), counter(leaderBattle(3000))],
  },
  "OP12-038": {
    abilities: [main(ko(oppChar({ rested: true, baseCost: [0, 4] }), 2), { optional: true, cost: [restDon(2)] }), counter(leaderBattle(3000))],
  },
  // Leader: [Once Per Turn] If your [Trafalgar Law] would be K.O.'d, may add top Life to hand instead. [Activate: Main][Once Per Turn] DON!! −1: next Law cost ≥ 4 −2.
  "OP12-061": {
    abilities: [
      replaceKO(myChar({ name: "Trafalgar Law" }), [lifeToHand("me", 1)], { once: true }),
      activateMain([{ op: "playerFlag", flag: "lawDiscount2", until: "turn" }], { once: true, optional: true, cost: [donMinus(1)] }),
    ],
  },
  "OP12-063": {
    kw: ["blocker"],
    abilities: [
      statics(
        [
          { stat: "power", amount: 2000, f: SELF },
          { stat: "cost", amount: 5, f: SELF },
        ],
        has({ zone: "trash", type: EV }, 4),
      ),
    ],
  },
  "OP12-071": { abilities: [onPlay(search(4, { any: [{ name: "Sanji" }, { type: EV }] }))] },
  // [Your Turn] When a card is removed from either player's Life: draw 1; then no more drawing by your effects this turn.
  "OP12-099": {
    abilities: [onEvent({ ev: "LifeRemoved", side: "any" }, [draw(1), { op: "playerFlag", flag: "noDrawByEffect", until: "turn" }], { cond: yourTurn })],
  },
  // If your Character base cost ≤ 6 would be removed by opponent's effect: may turn 1 Life face-up instead. [Opponent's Turn] {Neptunian} +2000 if no other 2-cost [Shirahoshi].
  "OP12-102": {
    abilities: [
      replaceRemoveByOpp(myChar({ baseCost: [0, 6] }), [faceUp(1)]),
      statics([{ stat: "power", amount: 2000, f: myChar({ trait: "Neptunian" }) }], and(oppTurn, { c: "none", f: myChar({ name: "Shirahoshi", baseCost: [2, 2], notSelf: true }) })),
    ],
  },
  "OP12-108": { abilities: [onPlay(search(5, { name: "Trafalgar Law" }))] },
  "OP12-112": { abilities: [trigger([ifThen(multicolor, [draw(2)])])] },
  "OP12-114": { abilities: [] },
  "OP12-115": {
    abilities: [
      counter([...counterBuff(2000), ifThen(lifeLe(2), [choose({ zone: "trash", name: "Trafalgar Law" }, 1, "[Trafalgar Law] z trashu do ruky", 0, "l"), { op: "move", v: "l", to: "hand" }])]),
    ],
  },
  "OP12-119": {
    abilities: [
      onPlay([deckToLife(1), { op: "costMod", v: "$self", amount: 2, until: "oppNextEndPhase" }], { optional: true, cost: [discard(1)] }),
      onKO([ifThen(oppTurn, [deckToLife(1)])]),
    ],
  },
  // Leader: [DON!! x1][On Your Opponent's Attack] If ≤ 5 active DON!!: rest any number, +2000 each to Leader or SHC Character.
  "OP13-001": {
    abilities: [onOppAttack([custom("restAnyDonForPower", { per: 2000 })], { cond: and(don(1), { c: "cmp", a: { n: "donActive" }, op: "<=", b: 5 }) })],
  },
  // Leader: [On Your Opponent's Attack][Once Per Turn] trash 1: opp −2000 this battle. [DON!! x1][Once Per Turn] When you take damage or your 6000+ base Character is K.O.'d: draw 1.
  "OP13-002": {
    abilities: [
      onOppAttack(power(oppLC(), -2000, "battle"), { once: true, optional: true, cost: [discard(1)] }),
      onEvent({ ev: "Damage", side: "me" }, [draw(1)], { once: true, onceKey: "draw", cond: don(1) }),
      onEvent({ ev: "KO", side: "me", f: { zone: "characters", basePower: [6000, 99999] } }, [draw(1)], { once: true, onceKey: "draw", cond: don(1) }),
    ],
  },
  // Leader: if ≥ 4 Life, −1000. [DON!! x1] If you have a Character cost ≥ 8: Leader and all Characters +1000.
  "OP13-004": {
    abilities: [
      statics([{ stat: "power", amount: -1000, f: SELF_LEADER() }], lifeGe(4)),
      statics([{ stat: "power", amount: 1000, f: myLC() }], and(don(1), has(myChar({ cost: [8, 99] })))),
    ],
  },
  "OP13-007": {
    abilities: [
      activateMain(power(oppChar(), -3000), {
        optional: true,
        cost: [{ op: "choose", v: "g", f: myLC(), min: 1, max: 1, label: "Komu dať 1 aktívne DON!!" }, { op: "giveDon", v: "g", n: 1, active: true }, trashSelf],
      }),
    ],
  },
  "OP13-016": { abilities: [onPlay([ifThen(leaderIs(["Sabo", "Portgas.D.Ace", "Monkey.D.Luffy"]), search(4, { cost: [3, 99] }))])] },
  "OP13-027": { abilities: [onPlay([activeDon(2)]), endOfTurn([ifThen(FILM_SH, [activeDon(1)])])] },
  "OP13-031": {
    abilities: [
      statics([{ stat: "kw", kw: "blocker", f: SELF }], lifeLe(1)),
      onPlay(playFrom("hand", { cost: [0, 5] }, 1, true), {
        optional: true,
        cost: [{ op: "choose", v: "r", f: myChar(), min: 1, max: 1, label: "Vráť svoju postavu do ruky" }, { op: "move", v: "r", to: "hand" }],
      }),
    ],
  },
  "OP13-037": { abilities: [onPlay([ifThen(FILM_SH, [activeDon(2)])]), endOfTurn([{ op: "activate", v: "$self" }])] },
  "OP13-040": {
    abilities: [main(noRefresh(oppChar({ rested: true, cost: [0, 7] }), 2), { optional: true, cost: [restDon(2)] }), counter(leaderBattle(3000))],
  },
  "OP13-042": { kw: ["blocker"], abilities: [onPlay([...drawDiscard(2, 1), ...giveDonLeader(2), ...giveDon(2, myChar())])] },
  "OP13-043": { abilities: [onPlay([ifThen(lifeLe(3), drawDiscard(2, 1))])] },
  "OP13-054": { abilities: [onPlay([ifThen(lifeLe(3), [draw(2)]), ...giveDonLeader(1)])] },
  "OP13-076": {
    abilities: [
      main([ifThen({ c: "cmp", a: { n: "donGivenTotal" }, op: ">=", b: 1 }, power(oppChar(), -8000))], { optional: true, cost: [restDon(5)] }),
      counter(counterBuff(3000), { optional: true, cost: [discard(1)] }),
    ],
  },
  // Leader: [Your Turn][Once Per Turn] When you play a Character with [Trigger]: give up to 2 rested DON!! to 1 Leader/Character.
  "OP13-100": { abilities: [onEvent({ ev: "CharPlayed", side: "me", f: { zone: "characters", hasTrigger: true } }, giveDon(2), { cond: yourTurn, once: true })] },
  "OP13-108": {
    abilities: [onPlay([ifThen(leaderTrait("Egghead"), [selfKw("rush")]), lifeToHand("opp", 1)]), trigger([ifThen(lifeLe(1), rest(oppChar({ cost: [0, 7] })))])],
  },
  "OP13-113": { abilities: [onPlay(search(4, { hasTrigger: true, notName: "Lilith" })), trigger([runOnPlay])] },
  "OP13-118": { kw: ["doubleAttack"], abilities: [onPlay([ifThen(multicolor, [activeDon(4)]), { op: "playerFlag", flag: "noPlayChars5", until: "turn" }])] },
  "OP14-018": {
    abilities: [counter([ifThen(thereIs({ power: [8000, 99999] }), counterBuff(4000))]), trigger(playFrom("hand", { color: "Red", power: [-99999, 2000] }))],
  },
  "OP14-019": { abilities: [main(search(4, { type: CH, any: [{ trait: "Supernovas" }, { trait: SH }] })), trigger([draw(1)])] },
  // Leader: +1000 if opponent's Leader is Slash. [Activate: Main][Once Per Turn] rest 1 card: if a Character cost ≥ 5, set 3 DON!! active; no Characters this turn.
  "OP14-020": {
    abilities: [
      statics([{ stat: "power", amount: 1000, f: SELF_LEADER() }], { c: "leader", f: { side: "opp", zone: "leader", attribute: "Slash" } }),
      activateMain([ifThen(thereIs({ cost: [5, 99] }), [activeDon(3)]), { op: "playerFlag", flag: "noPlayChars", until: "turn" }], {
        once: true,
        optional: true,
        cost: [custom("restCards", 1)],
      }),
    ],
  },
  "OP14-022": { abilities: [endOfTurn([ifThen(FILM_SH, [activeDon(2)])])] },
  "OP14-023": { abilities: [endOfTurn([{ op: "activate", v: "$self" }])] },
  "OP14-031": { kw: ["blocker"], abilities: [onPlay([...rest(oppChar({ cost: [0, 8] }), 2), later(activeDon(5))])] },
  "OP14-038": {
    abilities: [main([draw(1), ...rest(oppChar({ basePower: [-99999, 7000] }))], { optional: true, cost: [custom("restCards", 2)] }), counter(leaderBattle(3000))],
  },
  "OP14-039": {
    abilities: [onPlay([ifThen(leaderIs("Dracule Mihawk"), [draw(1)])]), endOfTurn([ifThen(leaderIs("Dracule Mihawk"), [activeDon(1)])])],
  },
  // Leader: [Opponent's Turn] When you play a Character: draw 1. [DON!! x1][Once Per Turn] When your {Amazon Lily}/{Kuja Pirates} 5000+ base Character is K.O.'d: opp top Life → hand.
  "OP14-041": {
    abilities: [
      onEvent({ ev: "CharPlayed", side: "me" }, [draw(1)], { cond: oppTurn }),
      onEvent({ ev: "KO", side: "me", f: { zone: "characters", any: [{ trait: "Amazon Lily" }, { trait: "Kuja Pirates" }], basePower: [5000, 99999] } }, [lifeToHand("opp", 1)], {
        once: true,
        cond: don(1),
      }),
    ],
  },
  "OP14-049": {
    abilities: [
      statics([{ stat: "kw", kw: "rush", f: SELF }], { c: "handTrashedThisTurn" }),
      onPlay([draw(2), ...bounce({ side: "any", zone: "characters", cost: [0, 7] })], { optional: true, cost: [restDon(2)] }),
    ],
  },
  "OP14-077": { abilities: [counter([...counterBuff(4000), ifThen(has(oppChar({ power: [6000, 99999] })), [addDon(1, "rested")])])] },
  "OP14-078": {
    abilities: [
      counter(
        [ifThen(leaderTrait(DP), [choose(myLC(), 1, "+2000 počas súboja a +2000 do konca ťahu", 0, "b"), { op: "power", v: "b", amount: 2000, until: "battle" }, { op: "power", v: "b", amount: 2000, until: "turn" }])],
        { optional: true, cost: [donMinus(1)] },
      ),
    ],
  },
  // Leader: [Activate: Main][Once Per Turn] K.O. 1 of your {TBP}: Leader and all Characters +1000. [When Attacking] trash 3: top deck → Life.
  "OP14-080": {
    abilities: [
      activateMain(powerAll(myLC(), 1000), {
        once: true,
        optional: true,
        cost: [{ op: "choose", v: "k", f: myChar({ trait: TBP }), min: 1, max: 1, label: "K.O. svoju postavu {Thriller Bark Pirates}" }, { op: "ko", v: "k" }],
      }),
      whenAttacking([deckToLife(1)], { optional: true, cost: [discard(3)] }),
    ],
  },
  "OP14-096": {
    abilities: [
      main(negate(oppChar({ cost: [0, 5] })), { optional: true, cost: [restDon(2)] }),
      counter([ifThen({ c: "cmp", a: { n: "trash" }, op: ">=", b: 10 }, counterBuff(4000))]),
    ],
  },
  "OP14-100": { abilities: [onKO(search(3, { trait: TBP })), trigger(playFrom("trash", { trait: TBP, cost: [0, 4] }, 1, true))] },
  "OP14-102": { abilities: [trigger(playFrom("trash", { trait: TBP, cost: [0, 4] }, 1, true))] },
  "OP14-103": {
    abilities: [
      onPlay([choose({ zone: "hand" }, 1, "Kartu z ruky navrch Life", 0, "h"), { op: "move", v: "h", to: "lifeTop" }], { optional: true, cost: [lifeToHand("me", 1, "topOrBottom")] }),
      triggerPlaySelf(),
    ],
  },
  "OP14-104": {
    abilities: [
      onPlay([
        choose({ zone: "trash", type: CH, trait: TBP, cost: [0, 4] }, 1, "Postava {Thriller Bark Pirates} z trashu", 0, "m"),
        ifVar("m", [oneOf([["Zahrať", [{ op: "play", v: "m" }]], ["Navrch Life lícom hore", [{ op: "move", v: "m", to: "lifeTop", faceUp: true }]]])]),
      ]),
      trigger(playFrom("trash", { cost: [0, 4] })),
    ],
  },
  "OP14-105": {
    abilities: [
      activateMain([all(myLC(), "a"), { op: "giveDon", v: "a", n: 1, each: true }], {
        once: true,
        optional: true,
        cost: [reveal(3, { any: [{ trait: "Amazon Lily" }, { trait: "Kuja Pirates" }] })],
      }),
      triggerPlaySelf(leaderTrait("Kuja Pirates")),
    ],
  },
  "OP14-107": { abilities: [onPlay([ifThen(lifeLe(3, "opp"), drawDiscard(2, 2))]), triggerPlaySelf(leaderTrait("Kuja Pirates"))] },
  "OP14-110": {
    abilities: [onKO(playFrom("trash", { cost: [0, 4], hasTrigger: true, notName: "Dr. Hogback" })), trigger(playFrom("trash", { trait: TBP, cost: [0, 4] }, 1, true))],
  },
  "OP14-111": {
    abilities: [
      onPlay(cannotAttack(oppChar({ cost: [0, 6] }))),
      onKO(cannotAttack(oppChar({ cost: [0, 6] }))),
      trigger(playFrom("trash", { trait: TBP, cost: [0, 4] }, 1, true)),
    ],
  },
  "OP14-112": {
    abilities: [
      onPlay([ifThen(leaderTrait("The Seven Warlords of the Sea"), [deckToLife(1)]), lifeToHand("opp", 1)]),
      trigger(playFrom("hand", { power: [-99999, 6000], hasTrigger: true })),
    ],
  },
  "OP14-114": { abilities: [activateMain(giveDon(1, myLC({ trait: "Kuja Pirates" })), { once: true }), triggerPlaySelf(leaderTrait("Kuja Pirates"))] },
  "OP14-117": { abilities: [counter(power(myLC({ trait: TBP }), 3000, "battle")), trigger(playFrom("trash", { trait: TBP, cost: [0, 4] }, 1, true))] },
};

function SELF_LEADER() {
  return { zone: "leader" as const, self: true };
}

void [bottom, costMod, flag, inHand, ko, leaderPower, lifeGe, oppDiscard, playSelf, replaceKO, runOnKO, selfPower, whenAttacking, faceDown, donGe];
