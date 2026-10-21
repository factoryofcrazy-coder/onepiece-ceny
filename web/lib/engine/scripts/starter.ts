// Starter decky ST-01 (červený Luffy) a ST-26 (fialový Luffy) + ich reprinty.
import {
  activateMain, addDon, CH, choose, counter, counterBuff, donMinus, giveDon, ifThen, ko, leaderTrait, main, multicolor, myLC, onEvent, onPlay,
  oppChar, power, restSelf, Script, SELF, statics, trigger, triggerPlaySelf, whenAttacking, don, and, oppTurn, donGe, yourTurn,
} from "../dsl";
import type { Step } from "../types";

const SH = "Straw Hat Crew";

export const STARTER: Record<string, Script> = {
  // [Activate: Main] [Once Per Turn] Give this Leader or 1 of your Characters up to 1 rested DON!! card.
  "ST01-001": { abilities: [activateMain(giveDon(1), { once: true })] },
  // [DON!! x2] [When Attacking] Your opponent cannot activate a [Blocker] Character that has 5000 or more power during this battle. [Trigger] Play this card.
  "ST01-002": {
    abilities: [
      whenAttacking([{ op: "set", v: "a", from: "self" }, { op: "flag", v: "a", flag: "noBlockerMinPower5000", until: "battle" }], { cond: don(2) }),
      triggerPlaySelf(),
    ],
  },
  "ST01-003": { abilities: [] },
  // [DON!! x2] This Character gains [Rush].
  "ST01-004": { abilities: [statics([{ stat: "kw", kw: "rush", f: SELF }], don(2))] },
  // [DON!! x1] [When Attacking] Up to 1 of your Leader or Character cards other than this card gains +1000 power during this turn.
  "ST01-005": { abilities: [whenAttacking(power(myLC({ notSelf: true }), 1000), { cond: don(1) })] },
  "ST01-006": { kw: ["blocker"], abilities: [] },
  "ST01-007": { abilities: [activateMain(giveDon(1), { once: true })] },
  "ST01-008": { abilities: [] },
  "ST01-009": { abilities: [] },
  "ST01-010": { abilities: [] },
  // [On Play] Give up to 2 rested DON!! cards to your Leader or 1 of your Characters.
  "ST01-011": { abilities: [onPlay(giveDon(2))] },
  // [Rush] [DON!! x2] [When Attacking] Your opponent cannot activate [Blocker] during this battle.
  "ST01-012": { kw: ["rush"], abilities: [whenAttacking([{ op: "set", v: "a", from: "self" }, { op: "flag", v: "a", flag: "noBlockerWhenAttacks", until: "battle" }], { cond: don(2) })] },
  // [DON!! x1] This Character gains +1000 power.
  "ST01-013": { abilities: [statics([{ stat: "power", amount: 1000, f: SELF }], don(1))] },
  // [Counter] +3000 during this battle. [Trigger] +1000 during this turn.
  "ST01-014": { abilities: [counter(counterBuff(3000)), trigger(power(myLC(), 1000))] },
  // [Main] K.O. up to 1 of your opponent's Characters with 6000 power or less. [Trigger] Activate this card's [Main] effect.
  "ST01-015": { abilities: [main(ko(oppChar({ power: [-99999, 6000] }))), trigger([{ op: "runAbility", which: "main" }])] },
  // [Main] Up to 1 SHC Leader/Character: opponent cannot activate [Blocker] when it attacks this turn. [Trigger] K.O. up to 1 [Blocker] cost ≤ 3.
  "ST01-016": {
    abilities: [
      main([choose(myLC({ trait: SH }), 1, "Koho nebude možné zablokovať", 0, "n"), { op: "flag", v: "n", flag: "noBlockerWhenAttacks", until: "turn" }]),
      trigger(ko(oppChar({ keyword: "blocker", cost: [0, 3] }))),
    ],
  },
  // [Activate: Main] You may rest this Stage: Up to 1 SHC Leader or Character gains +1000 power during this turn.
  "ST01-017": { abilities: [activateMain(power(myLC({ trait: SH }), 1000), { optional: true, cost: [restSelf] })] },

  // [DON!! x1] All of your Characters gain +1 cost. [Your Turn] [Once Per Turn] When 2+ DON!! are returned: +1 active, +1 rested.
  "OP09-061": {
    abilities: [
      statics([{ stat: "cost", amount: 1, f: { zone: "characters" } }], don(1)),
      onEvent({ ev: "DonReturned", side: "me", min: 2 }, [addDon(1, "active"), addDon(1, "rested")], { cond: yourTurn, once: true }),
    ],
  },
  // Hand cost −5 with a [San-Gorou]/[Sanji] Character with 7000+ base power. [On Play] Return all your [San-Gorou] and [Sanji] Characters to hand.
  "ST26-001": {
    abilities: [
      statics([{ stat: "handCost", amount: -5 }], { c: "exists", f: { zone: "characters", name: ["San-Gorou", "Sanji"], basePower: [7000, 99999] } }),
      onPlay([{ op: "all", v: "b", f: { zone: "characters", name: ["San-Gorou", "Sanji"] } }, { op: "move", v: "b", to: "hand" }]),
    ],
  },
  // [Blocker] [On Play] DON!! −2: Rest up to 1 of your opponent's DON!! cards or Characters with a cost of 1 or less.
  "ST26-002": {
    kw: ["blocker"],
    abilities: [onPlay([{ op: "custom", fn: "restOppCardsOrDon", arg: { max: 1, chars: true, maxCost: 1 } } as Step], { optional: true, cost: [donMinus(2)] })],
  },
  "ST26-003": { abilities: [onPlay([addDon(1)], { optional: true, cost: [donMinus(2)] })] },
  "ST26-004": { abilities: [onPlay(power(oppChar(), -2000, "turn", 2), { optional: true, cost: [donMinus(2)] })] },
  // [On Play]/[When Attacking] DON!! −2: If your Leader is multicolored and your opponent has 5+ DON!!, your SHC Leader's base power becomes 7000 until the end of your opponent's next End Phase.
  "ST26-005": {
    abilities: (["onPlay", "whenAttacking"] as const).map((when) => ({
      when,
      optional: true,
      cost: [donMinus(2)],
      steps: [
        ifThen(and(multicolor, donGe(5, "opp"), leaderTrait(SH)), [
          { op: "set", v: "L", from: "myLeader" } as Step,
          { op: "basePower", v: "L", value: 7000, until: "oppNextEndPhase" } as Step,
        ]),
      ],
    })),
  },
  "OP05-065": { abilities: [] },
  // [Blocker] [Opponent's Turn] If you have 10 DON!! cards on your field, this Character gains +1000 power.
  "OP05-066": { kw: ["blocker"], abilities: [statics([{ stat: "power", amount: 1000, f: SELF }], and(oppTurn, donGe(10)))] },
  // [DON!! x1] If you have 8 or more DON!! cards on your field, this Character gains [Rush].
  "OP05-070": { abilities: [statics([{ stat: "kw", kw: "rush", f: SELF }], and(don(1), donGe(8)))] },
  "OP09-063": { abilities: [] },
  "OP09-070": { abilities: [onPlay(giveDon(2), { optional: true, cost: [donMinus(1, true)] })] },
  "OP09-076": { abilities: [onPlay([addDon(1)], { optional: true, cost: [donMinus(1, true)] })] },
  // [Main] DON!! −2: K.O. up to 1 of your opponent's Characters with 6000 power or less. [Trigger] Add up to 1 DON!! as active.
  "OP09-077": { abilities: [main(ko(oppChar({ power: [-99999, 6000] })), { optional: true, cost: [donMinus(2)] }), trigger([addDon(1)])] },
};
void CH;
