// Turnajové karty: promo (P-), PRB a starter decky ST04–ST34.
import {
  activateMain, addDon, and, CH, choose, counter, counterBuff, custom, discard, don, donGe, donLe, donMinus, draw, drawDiscard, giveDon, has,
  ifThen, ko, leaderIs, leaderPower, leaderTrait, leaderTraitIncl, lifeLe, lifeToHand, main, multicolor, myChar, myLC, onKO, onOppAttack, onPlay,
  oppChar, oppDiscard, oppTurn, oneOf, playFrom, power, rest, restDon, restSelf, reveal, Script, search, SELF, selfKw, statics, trashSelf, trigger,
  triggerPlaySelf, whenAttacking, yourTurn, deckToLife, trashLife, replaceRemoveByOpp, activeDon, costMod, handLe, handGe,
} from "../dsl";
import type { Cond, Step } from "../types";

const SH = "Straw Hat Crew";
const CG = "Cross Guild";
const twoBig: Cond = has(myChar({ baseCost: [5, 99] }), 2);
const runMain: Step = { op: "runAbility", which: "main" };

export const META_D: Record<string, Script> = {
  // Cannot attack. If Leader [Buggy], all Characters cost 3–4 cannot attack. [On Play] Play {Cross Guild} cost ≤ 6 from hand.
  "P-084": {
    abilities: [
      statics([{ stat: "cannotAttack", f: SELF }]),
      statics([{ stat: "cannotAttack", f: { side: "any", zone: "characters", cost: [3, 4] } }], leaderIs("Buggy")),
      onPlay(playFrom("hand", { trait: CG, cost: [0, 6] })),
    ],
  },
  "P-088": { abilities: [triggerPlaySelf(and(leaderTrait("Supernovas"), { c: "cmp", a: { n: "lifeBoth" }, op: "<=", b: 5 }))] },
  "P-093": {
    kw: ["blocker"],
    abilities: [onPlay([ifThen({ c: "cmp", a: { n: "donField" }, op: "<=", b: { n: "donField", side: "opp" } }, [addDon(1, "rested")])])],
  },
  "P-111": { abilities: [replaceRemoveByOpp(myChar({ trait: SH }), [restDon(1)], { once: true })] },
  "PRB02-003": { kw: ["blocker"], abilities: [onPlay([draw(2)], { optional: true, cost: [discard(1, { zone: "hand", type: CH, power: [6000, 99999] })] })] },
  // [Your Turn][On Play] If multicolored Leader and opponent ≤ 7 DON!!, opponent rests 1 active DON!! at the start of their next Main Phase.
  "PRB02-005": {
    abilities: [onPlay([ifThen(and(multicolor, donLe(7, "opp")), [{ op: "playerFlag", flag: "restDonAtMainStart", side: "opp", until: "permanent" }])], { cond: yourTurn })],
  },
  "PRB02-008": { kw: ["blocker"], abilities: [onKO([draw(2)])] },
  "PRB02-013": { abilities: [onPlay([ifThen(leaderTrait("Thriller Bark Pirates"), playFrom("trash", { cost: [0, 4] }, 1, true)), ...giveDon(1)])] },
  "ST01-011": { abilities: [onPlay(giveDon(2))] },
  "ST04-017": { abilities: [activateMain([ifThen(leaderTrait("Animal Kingdom Pirates"), [addDon(1, "rested")])], { optional: true, cost: [restSelf] })] },
  "ST07-007": { kw: ["blocker"], abilities: [triggerPlaySelf()] },
  // [Main] Your opponent chooses one: trash 1 card from top of their Life • you add top deck to your Life. [Trigger] Activate [Main].
  "ST07-015": {
    abilities: [
      main([oneOf([["Vyhodíš svoju vrchnú Life kartu", [trashLife("opp", 1)]], ["Súper pridá kartu z balíčka do Life", [deckToLife(1)]]], "opp")]),
      trigger([runMain]),
    ],
  },
  // Leader: [Activate: Main][Once Per Turn] If you have 0 or 8+ DON!! on field: +1 DON!! active.
  "ST10-002": { abilities: [activateMain([addDon(1)], { once: true, cond: { c: "or", any: [donLe(0), donGe(8)] } })] },
  "ST10-010": { kw: ["blocker"], abilities: [onPlay([ifThen(handGe(7, "opp"), [oppDiscard(2)])], { optional: true, cost: [donMinus(1)] })] },
  "ST14-007": {
    abilities: [
      onPlay([ifThen(has(myChar({ cost: [8, 99] })), costMod(oppChar(), -5))]),
      whenAttacking([ifThen(has(myChar({ cost: [8, 99] })), costMod(oppChar(), -5))]),
    ],
  },
  "ST14-017": {
    abilities: [statics([{ stat: "cost", amount: 1, f: myChar({ color: "Black", trait: SH }) }]), onPlay([ifThen(leaderTrait(SH), [draw(1)])])],
  },
  "ST15-004": { abilities: [onPlay([ifThen(leaderTraitIncl("Whitebeard Pirates"), power(oppChar(), -2000)), lifeToHand("me", 1)])] },
  "ST18-001": { abilities: [onPlay([ifThen(donGe(8), rest(oppChar({ cost: [0, 5] })))])] },
  "ST21-003": {
    abilities: [onPlay([choose(myChar({ trait: SH, power: [6000, 99999] }), 1, "Táto postava nebude blokovateľná", 0, "s"), { op: "flag", v: "s", flag: "noBlockerWhenAttacks", until: "turn" }])],
  },
  "ST21-014": { kw: ["rush"], abilities: [whenAttacking(giveDon(1))] },
  "ST21-017": {
    abilities: [main([...power(oppChar(), -5000), ifThen(has(myChar({ power: [6000, 99999] })), ko(oppChar({ power: [-99999, 2000] })))]), trigger([runMain])],
  },
  "ST22-002": {
    abilities: [
      onPlay(search(5, { traitIncl: "Whitebeard Pirates", notName: "Izo" })),
      onOppAttack([draw(1), { op: "handToDeck", n: 1, where: "bottom" }], { optional: true, cost: [trashSelf] }),
    ],
  },
  "ST22-015": {
    abilities: [
      main([
        ifThen(leaderTraitIncl("Whitebeard Pirates"), playFrom("hand", { name: "Edward.Newgate" })),
        { op: "may", cost: [lifeToHand("me", 1, "topOrBottom")], steps: leaderPower(2000, "oppNextEndPhase") },
      ]),
    ],
  },
  "ST23-001": { kw: ["blocker"], abilities: [statics([{ stat: "handCost", amount: -4 }], has(myChar({ power: [10000, 99999] })))] },
  "ST24-002": { abilities: [onPlay(search(5, { trait: "Supernovas" })), onOppAttack([activeDon(1)], { optional: true, cost: [trashSelf] })] },
  "ST24-004": {
    abilities: [
      onPlay([
        choose(oppChar(), 1, "Daj do rest a nebude aktívna – súperova postava", 0, "lb"),
        { op: "rest", v: "lb" },
        { op: "flag", v: "lb", flag: "noRefresh", until: "permanent" },
        ifThen(has(oppChar({ rested: true }), 2), leaderPower(2000, "oppNextEndPhase")),
      ]),
    ],
  },
  "ST25-001": { abilities: [statics([{ stat: "cost", amount: 1, f: SELF }], twoBig), onPlay([ifThen(leaderIs("Buggy"), drawDiscard(3, 2))])] },
  "ST25-002": {
    abilities: [statics([{ stat: "kw", kw: "blocker", f: SELF }, { stat: "cost", amount: 1, f: SELF }], twoBig), statics([{ stat: "power", amount: 5000, f: SELF }], oppTurn)],
  },
  "ST25-003": {
    abilities: [
      onPlay([...drawDiscard(2, 1), ...playFrom("hand", { trait: CG, cost: [0, 4] })]),
      replaceRemoveByOpp(myChar({ trait: CG }), [discard(1)], { once: true }),
    ],
  },
  "ST25-004": { abilities: [activateMain([ifThen(leaderIs("Buggy"), playFrom("hand", { trait: CG, cost: [0, 6] }))], { optional: true, cost: [discard(1), trashSelf] })] },
  "ST25-005": {
    abilities: [statics([{ stat: "kw", kw: "blocker", f: SELF }, { stat: "cost", amount: 1, f: SELF }], twoBig), onKO([ifThen(and(leaderIs("Buggy"), handLe(3)), [draw(1)])])],
  },
  // Leader: if you have a Character with ≥ 7000 base power, −2000. [Opponent's Turn] all your [Portgas.D.Ace] and [Monkey.D.Luffy] +3000.
  "ST30-001": {
    abilities: [
      statics([{ stat: "power", amount: -2000, f: { zone: "leader", self: true } }], has(myChar({ basePower: [7000, 99999] }))),
      statics([{ stat: "power", amount: 3000, f: myLC({ name: ["Portgas.D.Ace", "Monkey.D.Luffy"] }) }], oppTurn),
    ],
  },
  "ST30-004": { abilities: [onPlay(drawDiscard(3, 2), { optional: true, cost: [reveal(2, { type: CH, power: [6000, 6000] })] })] },
  "ST30-005": { abilities: [] },
  "ST30-012": { abilities: [onPlay([selfKw("rush")], { optional: true, cost: [restDon(1)] }), whenAttacking(rest(oppChar({ keyword: "blocker" })))] },
  "ST30-014": { abilities: [activateMain(giveDon(2, myChar({ basePower: [6000, 6000] }), 2, true), { optional: true, cost: [restSelf] })] },
  "ST30-016": {
    abilities: [
      counter([
        ...counterBuff(3000),
        ifThen(and(has(myChar({ name: "Portgas.D.Ace", basePower: [6000, 6000] })), has(myChar({ name: "Monkey.D.Luffy", basePower: [6000, 6000] }))), [draw(1)]),
      ]),
    ],
  },
  "ST31-001": {
    abilities: [statics([{ stat: "kw", kw: "rush", f: SELF }], don(2)), onPlay([draw(1), ...playFrom("hand", { trait: SH, cost: [0, 5], notName: "Sanji" })])],
  },
  "ST31-004": {
    abilities: [
      statics([{ stat: "kw", kw: "rush", f: SELF }], { c: "cmp", a: { n: "donGivenTotal" }, op: ">=", b: 3 }),
      onPlay(power(oppChar(), { n: "mul", a: { n: "count", f: { zone: "field", trait: SH } }, k: -1000 })),
    ],
  },
  "ST31-005": { abilities: [onPlay(search(5, { trait: SH })), activateMain(giveDon(1, myLC({ name: "Monkey.D.Luffy" })), { optional: true, cost: [restSelf] })] },
  "ST32-001": { abilities: [onPlay(drawDiscard(2, 1), { optional: true, cost: [custom("restLeaderOrDon")] })] },
  "ST32-002": {
    abilities: [onPlay([draw(1), choose(oppChar({ baseCost: [0, 6] }), 1, "Nedá sa dať do rest – súperova postava", 0, "od"), { op: "flag", v: "od", flag: "cannotBeRested", until: "oppNextEndPhase" }])],
  },
  "ST33-004": { kw: ["blocker"], abilities: [statics([{ stat: "handCost", amount: -3 }], { c: "handTrashedThisTurn" })] },
  "ST34-002": { abilities: [onPlay([ifThen(leaderTrait("Big Mom Pirates"), [addDon(1, "rested")]), ...ko(oppChar({ cost: [0, 2] }))])] },
  "ST34-003": { abilities: [onPlay(search(3, { trait: "Big Mom Pirates" }))] },
  "ST34-004": {
    abilities: [
      onPlay([deckToLife(1), choose(oppChar(), 1, "Base power sa stane 0 – súperova postava", 0, "z"), { op: "basePower", v: "z", value: 0, until: "turn" }], {
        optional: true,
        cost: [donMinus(4), discard(1)],
      }),
    ],
  },
};

void [counter, ko, lifeLe, main, trigger, oneOf];
