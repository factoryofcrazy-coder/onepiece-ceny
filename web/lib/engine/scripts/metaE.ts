// Turnajové karty – doplnenie 11/2026 (EB05, Red-Haired Pirates, Blackbeard, East Blue, Supernovas…).
// Kde engine niečo nepodporuje, je to v komentári „zjednodušené“.
import {
  activate, activateMain, activeDon, addDon, and, bottom, bounce, CH, choose, counter, counterBuff, custom, deckToLife, discard, don, donGe, donMinus,
  draw, drawDiscard, endOfTurn, EV, flag, gainKw, giveDon, giveDonLeader, handGe, handLe, ifThen, inHand, inTrash, ko, leaderBattle, leaderIs,
  leaderPower, leaderTrait, leaderTraitIncl, lifeGe, lifeLe, lifeToHand, main, multicolor, myChar, myLC, negate, noRefresh, onEvent, onKO,
  onOppAttack, oneOf, onPlay, oppChar, oppDiscard, oppLC, oppTurn, playFrom, playSelf, power, powerAll, replaceRemoveByOpp, rest, restDon, restSelf,
  reveal, Script, search, SELF, selfKw, selfPower, statics, trashGe, trashLife, trashSelf, trigger, triggerPlaySelf, whenAttacking, yourTurn,
  anyChar, cannotAttack, has,
} from "../dsl";
import type { Cond, Step } from "../types";

const SH = "Straw Hat Crew";
const BB = "Blackbeard Pirates";
const RH = "Red-Haired Pirates";
const SN = "Supernovas";
const runMain: Step = { op: "runAbility", which: "main" };
const runOnPlay: Step = { op: "runAbility", which: "onPlay" };
const runOnKO: Step = { op: "runAbility", which: "onKO" };
const mill = (n: number): Step => ({ op: "mill", n });
const mayMill = (n: number): Step => ({ op: "may", label: `Vyhodiť ${n} ${n === 1 ? "kartu" : "karty"} z vrchu balíčka?`, cost: [], steps: [mill(n)] });
/** „Look at N cards … place them at the top or bottom of the deck in any order“ */
const scry = (n: number): Step[] => [
  { op: "look", n },
  choose({ zone: "look" }, n, "Ktoré karty dať POD balíček? (ostatné ostanú navrchu)", 0, "sc"),
  { op: "move", v: "sc", to: "deckBottom" },
  { op: "lookRest", to: "top" },
];
/** leader dostane base power 7000 do konca ťahu */
const leaderBase7000: Step[] = [{ op: "set", v: "lb", from: "myLeader" }, { op: "basePower", v: "lb", value: 7000, until: "turn" }];
const donLeOpp: Cond = { c: "cmp", a: { n: "donField" }, op: "<=", b: { n: "donField", side: "opp" } };
const oppBig8000: Cond = has(oppChar({ basePower: [8000, 99999] }));
const myAttackDamage = (zone: "characters" | "leader"): Cond => ({ c: "attackerIs", f: { zone, self: true } });
const restCards = (n: number): Step => custom("restCards", n);
/** pridaj kartu z ruky navrch Life */
const handToLife = (f: Parameters<typeof inHand>[0], faceUp: boolean, label: string): Step[] => [
  choose(inHand(f), 1, label, 0, "hl"),
  { op: "move", v: "hl", to: "lifeTop", faceUp },
];

export const META_E: Record<string, Script> = {
  // [On Play]/[When Attacking] Supernovas leader a žiadny iný [Cavendish]: 2 DON!! aktívne
  "EB01-012": (() => {
    const st = [ifThen(and(leaderTrait(SN), { c: "none", f: myChar({ name: "Cavendish", notSelf: true }) }), [activeDon(2)])];
    return { abilities: [onPlay(st), whenAttacking(st)] };
  })(),
  "EB01-013": {
    abilities: [activateMain([...playFrom("hand", { trait: "Land of Wano", cost: [0, 5], notName: "Kouzuki Hiyori" }), draw(1)], { optional: true, cost: [trashSelf] })],
  },
  "EB02-052": {
    abilities: [
      statics([{ stat: "kw", kw: "rush", f: SELF }], leaderTrait("Sky Island")),
      whenAttacking([ifThen(lifeLe(1), [deckToLife(1)]), selfPower(1000)], { optional: true, cost: [discard(1)] }),
    ],
  },
  "EB03-023": { abilities: [onPlay(scry(5))] },
  "EB03-028": { abilities: [onPlay([discard(1)]), activateMain([ifThen(handLe(4), [draw(2)])], { optional: true, cost: [trashSelf] })] },
  // [Your Turn][On Play] DON!! −1… text: „DON!! 1“ = daj 1 DON!! do rest
  "EB03-031": {
    abilities: [onPlay([ifThen(leaderIs("Sanji"), [custom("useEvent", { zone: "trash", f: { cost: [0, 7] } })])], { optional: true, cond: yourTurn, cost: [restDon(1)] })],
  },
  "EB04-001": {
    abilities: [
      statics([{ stat: "power", amount: 2000, f: { zone: "leader", self: true } }], and(oppTurn, lifeLe(1))),
      activateMain([...power(oppChar(), -1000), ifThen(lifeGe(2), [{ op: "may", label: "Pridať vrchnú Life kartu do ruky?", cost: [], steps: [lifeToHand("me", 1)] }])], { once: true }),
    ],
  },
  "EB04-029": {
    abilities: [
      main([ifThen(leaderIs("Sanji"), search(3, { any: [{ name: "Sanji" }, { type: EV }] }, 1, "trash"))]),
      counter(power(myLC({ name: "Sanji" }), 4000, "battle", 1, "+4000 power počas súboja – tvoj [Sanji]"), { optional: true, cost: [discard(1)] }),
    ],
  },
  "EB04-041": {
    abilities: [
      main([
        ifThen(and(leaderIs("Sanji"), donGe(4)), [
          oneOf([
            ["Zahrať [Sanji] z ruky", playFrom("hand", { name: "Sanji", power: [-99999, 6000] })],
            ["Zahrať [Sanji] z trashu", playFrom("trash", { name: "Sanji", power: [-99999, 6000] })],
          ]),
        ]),
      ]),
      trigger(drawDiscard(2, 1)),
    ],
  },
  "EB04-061": {
    abilities: [
      statics([{ stat: "handCost", amount: -1 }], lifeLe(1)),
      onPlay([...leaderPower(2000, "oppNextEndPhase"), selfKw("blocker", "oppNextEndPhase")], { optional: true, cost: [discard(1)] }),
    ],
  },
  "EB05-001": {
    abilities: [
      onPlay([ifThen(leaderTrait(SN), [draw(2), ...playFrom("hand", { power: [-99999, 2000] }, 2)])]),
      activateMain(power(oppLC({ power: [6000, 99999] }), -1000, "oppNextEndPhase"), { once: true }),
    ],
  },
  "EB05-004": {
    abilities: [onPlay([draw(2)], { optional: true, cost: [reveal(2, { type: EV })] }), onKO(playFrom("hand", { power: [-99999, 6000] }, 1, true))],
  },
  "EB05-007": {
    abilities: [
      onPlay([draw(1)], { optional: true, cost: [reveal(3, { any: [{ type: EV }, { trait: "Punk Hazard" }] })] }),
      endOfTurn([selfPower(5000, "oppNextEndPhase")]),
    ],
  },
  "EB05-008": {
    abilities: [
      main(power(oppChar({ rested: true }), -7000), {
        optional: true,
        cost: [{ op: "set", v: "gl", from: "myLeader" }, { op: "giveDon", v: "gl", n: 1, active: true }, reveal(2, { type: EV, color: "Red" })],
      }),
      counter([ifThen({ c: "none", f: myChar({ cost: [5, 99] }) }, counterBuff(4000))]),
    ],
  },
  "EB05-014": {
    abilities: [
      onPlay(search(5, { any: [{ name: "Megalo" }, { trait: "Neptunian" }] }, 2, "trash")),
      activateMain(gainKw(myChar({ trait: "Neptunian", power: [-99999, 6000] }), "rush"), { optional: true, cost: [restSelf] }),
    ],
  },
  "EB05-020": {
    abilities: [main([draw(2)], { optional: true, cond: leaderIs("Shirahoshi"), cost: [{ op: "set", v: "ls", from: "myLeader" }, { op: "rest", v: "ls" }] })],
  },
  "EB05-021": {
    abilities: [
      onPlay([draw(2), ...playFrom("hand", { trait: "Cross Guild", cost: [0, 8] }), { op: "playerFlag", flag: "noPlayChars", until: "turn" }]),
      whenAttacking(negate(oppChar())),
    ],
  },
  "EB05-023": { abilities: [onPlay([draw(3)], { optional: true, cost: [discard(2, inHand({ type: EV }))] })] },
  "EB05-025": { abilities: [onPlay(search(3, { trait: "Impel Down" })), trigger([runOnPlay])] },
  "EB05-028": { abilities: [onPlay([ifThen(handGe(9, "opp"), [oppDiscard(4)])])] },
  "EB05-030": {
    abilities: [main([ifThen(leaderIs("Nami"), bounce(anyChar({ cost: [0, 5] })))]), counter([draw(1), ...power(myLC(), 1000)])],
  },
  "EB05-031": {
    abilities: [
      onPlay([ifThen(leaderTrait("The Vinsmoke Family"), [mill(10)])], { optional: true, cost: [donMinus(1)] }),
      activateMain([ifThen(oppBig8000, [addDon(4)])], { optional: true, cost: [trashSelf] }),
    ],
  },
  "EB05-033": {
    abilities: [
      onPlay([
        ifThen(and(leaderTrait(SH), { c: "cmp", a: { n: "donField" }, op: "<=", b: { n: "sub", a: { n: "donField", side: "opp" }, b: 6 } }), [
          draw(3),
          discard(2),
          addDon(4, "rested"),
        ]),
      ]),
    ],
  },
  "EB05-034": { abilities: [onPlay([ifThen(donGe(7), power(oppChar(), -4000))], { optional: true, cost: [donMinus(2)] })] },
  "EB05-037": { abilities: [onPlay(search(3, { trait: "Animal Kingdom Pirates" }))] },
  "EB05-039": {
    abilities: [
      main([ifThen(leaderTrait("The Vinsmoke Family"), power(oppChar(), -4000))], { optional: true, cost: [restDon(1)] }),
      counter(leaderBattle(4000), { optional: true, cost: [restDon(1)] }),
    ],
  },
  "EB05-040": {
    abilities: [main([ifThen(leaderTrait("Donquixote Pirates"), drawDiscard(3, 1))], { optional: true, cost: [donMinus(1)] }), counter(leaderBattle(2000))],
  },
  "EB05-043": {
    abilities: [
      onKO([
        oneOf([
          ["K.O. súperovu postavu (cost ≤ 6)", ko(oppChar({ cost: [0, 6] }))],
          ["Daj do rest súperovu postavu (cost ≤ 6)", rest(oppChar({ cost: [0, 6] }))],
        ]),
      ]),
    ],
  },
  "EB05-046": {
    abilities: [
      statics([{ stat: "kw", kw: "blocker", f: SELF }, { stat: "power", amount: 3000, f: SELF }], oppBig8000),
      onOppAttack([ifThen(trashGe(10), leaderBase7000)], { optional: true, cost: [discard(1)] }),
    ],
  },
  "EB05-047": { abilities: [statics([{ stat: "cost", amount: 12, f: SELF }]), onPlay(playFrom("trash", { cost: [0, 2] }), { optional: true, cost: [discard(1)] })] },
  // zjednodušené: „cannot be K.O.'d in battle“ pre Big Mom postavy s 4000 base power engine nepodporuje
  "EB05-059": { abilities: [main([draw(1)]), trigger([draw(1), ...playFrom("hand", { power: [4000, 4000], hasTrigger: true })])] },
  "EB05-061": {
    abilities: [replaceRemoveByOpp(myChar({ basePower: [-99999, 6000] }), [lifeToHand("me", 1)], { once: true }), onPlay(playFrom("hand", { color: "Red", cost: [0, 2] }))],
  },
  // zjednodušené: „inej farby ako vrátená postava“ sa nekontroluje
  "OP01-002": {
    abilities: [activateMain([ifThen(has(myChar(), 5), [...bounce(myChar(), 1, "Vráť do ruky 1 svoju postavu"), ...playFrom("hand", { cost: [0, 5] })])], { once: true, cost: [restDon(2)] })],
  },
  "OP02-010": { abilities: [activateMain(playFrom("hand", { color: "Red", cost: [1, 1], notName: "Dogura" }), { optional: true, cost: [restSelf] })] },
  "OP03-044": { abilities: [onPlay(drawDiscard(2, 2))] },
  "OP03-047": {
    abilities: [
      onEvent({ ev: "Damage", side: "opp" }, [mayMill(7)], { cond: and(don(1), myAttackDamage("characters")) }),
      onPlay([...bounce(anyChar({ cost: [0, 3] })), mayMill(2)]),
    ],
  },
  "OP03-048": { abilities: [onPlay([ifThen(leaderIs("Nami"), bounce(oppChar({ cost: [0, 5] })))])] },
  "OP03-050": { kw: ["blocker"], abilities: [onKO([mayMill(1)])] },
  "OP03-054": { abilities: [counter([...counterBuff(2000), mayMill(1)]), trigger([draw(1), mayMill(1)])] },
  "OP03-055": {
    abilities: [counter([...leaderBattle(4000), mayMill(2)], { optional: true, cost: [discard(1)] }), trigger(bounce(anyChar({ cost: [0, 4] })))],
  },
  "OP03-056": { abilities: [main([draw(2)]), trigger([runMain])] },
  "OP03-057": { abilities: [main(bottom(anyChar({ cost: [0, 5] }))), trigger(bottom(anyChar({ cost: [0, 3] })))] },
  "OP04-041": { abilities: [onPlay(search(5, { trait: "East Blue" }), { optional: true, cost: [discard(2)] })] },
  "OP04-050": { abilities: [activateMain([draw(1)], { optional: true, cost: [discard(1), restSelf] })] },
  "OP04-056": { abilities: [main(bottom(anyChar())), trigger(bottom(anyChar({ cost: [0, 4] })))] },
  "OP06-106": {
    abilities: [onPlay(handToLife({}, false, "Ktorú kartu z ruky dáš navrch Life?"), { optional: true, cost: [lifeToHand("me", 1, "topOrBottom")] })],
  },
  // zjednodušené: DON!! súpera, ktoré sa neaktivujú, engine nepodporuje – len postava
  "OP07-026": { abilities: [onPlay(noRefresh(oppChar({ rested: true })))] },
  "OP07-096": {
    abilities: [main([draw(1), ifThen(trashGe(10), costModOpp(-3))]), trigger(ko(oppChar({ cost: [0, 3] })))],
  },
  "OP07-104": { abilities: [trigger([ifThen(leaderTrait("Egghead"), [draw(2)])])] },
  "OP09-050": { abilities: [whenAttacking(search(5, { type: EV, color: "Blue" }))] },
  "OP09-060": {
    abilities: [activateMain([ifThen(leaderTrait("Cross Guild"), [draw(2)])], { optional: true, cost: [{ op: "handToDeck", n: 2, where: "bottom" }, restSelf] })],
  },
  // Leader: vlastné [On Play] negované (pravidlo v engine), [Activate: Main] vyhoď 1: súperove [On Play] negované
  "OP09-081": {
    abilities: [activateMain([{ op: "playerFlag", flag: "noOnPlay", side: "opp", until: "oppNextEndPhase" }], { optional: true, cost: [discard(1)] })],
  },
  "OP09-083": { abilities: [activateMain([ifThen(leaderTrait(BB), costModOpp(-3))], { optional: true, cost: [restSelf] }), onKO([draw(1)])] },
  "OP09-084": {
    abilities: [
      activateMain(
        [
          ifThen(leaderTrait(BB), [
            oneOf([
              ["[Double Attack]", [selfKw("doubleAttack", "oppNextEndPhase")]],
              ["[Banish]", [selfKw("banish", "oppNextEndPhase")]],
              ["[Blocker]", [selfKw("blocker", "oppNextEndPhase")]],
            ]),
          ]),
        ],
        { once: true },
      ),
    ],
  },
  // zjednodušené: „nedá sa K.O. efektmi súpera“ → nedá sa odstrániť efektmi súpera
  "OP09-086": {
    abilities: [
      statics([{ stat: "protect", f: SELF }]),
      statics([{ stat: "power", amount: { n: "mul", a: { n: "div", a: { n: "trash" }, k: 4 }, k: 1000 }, f: SELF }], leaderTrait(BB)),
    ],
  },
  "OP09-089": { abilities: [activateMain([ifThen(leaderTrait(BB), [draw(1), ...costModOpp(-2)])], { optional: true, cost: [discard(1), trashSelf] })] },
  "OP09-090": { abilities: [activateMain([ifThen(leaderTrait(BB), ko(oppChar({ cost: [0, 1] })))], { optional: true, cost: [restSelf] }), onKO([draw(1)])] },
  "OP09-096": { abilities: [main(search(3, { trait: BB, notName: "My Era...Begins!!" }, 1, "trash")), trigger([runMain])] },
  "OP09-099": { abilities: [activateMain(search(3, { trait: BB }), { optional: true, cost: [discard(1), restSelf] })] },
  "OP09-104": {
    abilities: [
      onPlay([
        ...handToLife({ type: CH, trait: "Revolutionary Army" }, true, "Ktorú postavu {Revolutionary Army} dáš navrch Life (lícom hore)?"),
        ifThen(lifeGe(2), [lifeToHand("me", 1, "topOrBottom")]),
      ]),
      trigger([ifThen(multicolor, [draw(2)])]),
    ],
  },
  "OP10-018": { abilities: [counter([...counterBuff(3000), ...power(oppLC(), -2000)]), trigger(power(myLC(), 1000))] },
  "OP10-082": {
    abilities: [
      statics([{ stat: "protect", f: SELF }]),
      activateMain([draw(1), ...playFrom("trash", { trait: BB, cost: [0, 5], notName: "Kuzan" })], { optional: true, cost: [trashSelf] }),
    ],
  },
  "OP10-099": {
    abilities: [
      endOfTurn(
        [
          choose(myChar({ trait: SN, cost: [3, 8] }), 1, "Ktorú postavu {Supernovas} nastavíš ako aktívnu? (získa [Blocker])", 0, "kc"),
          { op: "activate", v: "kc" },
          { op: "kw", v: "kc", kw: "blocker", until: "oppNextEndPhase" },
        ],
        { optional: true, cost: [{ op: "lifeFace", side: "me", up: true, n: 1 }] },
      ),
    ],
  },
  "OP10-109": { abilities: [onKO([trashLife("opp", 1)]), trigger(drawDiscard(2, 1))] },
  "OP10-111": { abilities: [onPlay(search(5, { trait: SN, notName: "Monkey.D.Luffy" }))] },
  "OP10-112": { abilities: [onPlay([trashLife("opp", 1)], { optional: true, cost: [restSelf] }), endOfTurn([ifThen(lifeLe(2, "opp"), drawDiscard(1, 1))])] },
  "OP10-119": {
    abilities: [onPlay([...handToLife({ type: CH, trait: SN }, false, "Ktorú postavu {Supernovas} dáš navrch Life?"), ifThen(leaderTrait(SN), giveDonLeader(1))])],
  },
  "OP11-012": { abilities: [onEvent({ ev: "EventActivated", side: "opp" }, powerAll(myChar(), 2000), { once: true, cond: yourTurn })] },
  // zjednodušené: spúšťa sa pri každom K.O. (nielen efektom súpera)
  "OP11-035": {
    abilities: [
      onKO([{ op: "may", label: "Dať 1 DON!! do rest a zahrať Fish-Man/Merfolk (cost ≤ 4)?", cost: [restDon(1)], steps: playFrom("hand", { trait: ["Fish-Man", "Merfolk"], cost: [0, 4] }) }]),
      onPlay(rest(oppChar())),
    ],
  },
  "OP11-061": { abilities: [main(bottom(oppChar({ baseCost: [0, 4] }))), trigger(bottom(anyChar({ cost: [0, 1] })))] },
  "OP11-083": { kw: ["blocker"], abilities: [onPlay([discard(2)])] },
  "OP11-101": {
    kw: ["blocker"],
    abilities: [{ ...replaceRemoveByOpp(myChar({ trait: SN, notName: 'Capone"Gang"Bege' }), [], { once: true }), steps: [custom("saveToLife")] }],
  },
  "OP12-041": {
    abilities: [
      activateMain([custom("useEvent", { zone: "hand", f: { trait: SH, baseCost: [0, 3] } })], { once: true, cost: [restDon(1)] }),
      whenAttacking([ifThen(donLeOpp, [addDon(1, "rested")])]),
    ],
  },
  "OP12-060": {
    abilities: [
      main([
        ifThen(multicolor, [
          oneOf([
            ["Vráť súperovu postavu (cost ≤ 4) do ruky", bounce(oppChar({ cost: [0, 4] }))],
            ["Ak máš ≤ 6 kariet v ruke, potiahni 2", [ifThen(handLe(6), [draw(2)])]],
          ]),
        ]),
      ]),
    ],
  },
  "OP12-070": {
    abilities: [
      statics([{ stat: "power", amount: { n: "mul", a: { n: "div", a: { n: "count", f: inTrash({ type: EV }) }, k: 5 }, k: 1000 }, f: SELF }]),
      replaceRemoveByOpp(SELF, [donMinus(1)]),
    ],
  },
  "OP12-079": { abilities: [main([ifThen(leaderIs("Sanji"), search(3, {}, 1, "bottom"))])] },
  "OP12-118": { kw: ["blocker"], abilities: [onPlay([ifThen({ c: "cmp", a: { n: "restedCards" }, op: ">=", b: 8 }, [draw(2), discard(1), activeDon(1)])])] },
  "OP14-013": { abilities: [onPlay(search(5, { trait: SN, notName: "Monkey.D.Luffy" })), whenAttacking(power(oppChar(), -1000))] },
  "OP14-069": {
    abilities: [
      onPlay(
        [
          oneOf([
            ["K.O. súperovu postavu (cost ≤ 8)", [ifThen(leaderTrait("Donquixote Pirates"), ko(oppChar({ cost: [0, 8] })))]],
            ["Až 3 súperove postavy (cost ≤ 7) sa nedajú dať do rest", flag(oppChar({ cost: [0, 7] }), "cannotBeRested", "oppNextEndPhase", 3)],
          ]),
        ],
        { optional: true, cost: [donMinus(3)] },
      ),
    ],
  },
  "OP14-115": { abilities: [onKO([deckToLife(1), lifeToHand("me", 1)], { cond: oppTurn }), triggerPlaySelf(leaderTrait("Kuja Pirates"))] },
  "OP14-118": {
    abilities: [counter([ifThen(lifeLe(2), cannotAttack(oppChar({ rested: false }), "turn"))]), trigger(playFrom("hand", { power: [-99999, 6000], hasTrigger: true }))],
  },
  "OP15-069": { abilities: [replaceRemoveByOpp(myChar({ basePower: [-99999, 7000] }), [donMinus(1)])] },
  "OP15-103": { abilities: [trigger([draw(1), ifThen(lifeLe(2), [playSelf])])] },
  "OP16-109": { abilities: [onKO([ifThen(leaderTrait(BB), [draw(1), ...ko(oppChar({ cost: [0, 1] }), 2)])]), trigger([runOnKO])] },
  // Leader: cena „vyhoď 1 z ruky ALEBO daj 1 DON!! do rest“ ako voľba
  "OP17-020": {
    abilities: [
      activateMain(
        [
          oneOf([
            ["Vyhoď 1 kartu z ruky", [discard(1)]],
            ["Daj 1 DON!! do rest", [restDon(1)]],
          ]),
          ...noRefresh(oppChar({ rested: true })),
        ],
        { once: true, optional: true, cond: { c: "or", any: [handGe(1), { c: "cmp", a: { n: "donActive" }, op: ">=", b: 1 }] } },
      ),
    ],
  },
  "OP17-021": { abilities: [replaceRemoveByOpp(myChar({ traitIncl: RH }), [restCards(1)])] },
  "OP17-027": { kw: ["rushChar"], abilities: [onPlay([ifThen(leaderTraitIncl(RH), [draw(1), ...rest(oppChar(), 2)])])] },
  "OP17-029": { kw: ["blocker"], abilities: [onPlay([activeDon(1), ...rest(oppChar({ cost: [0, 2] }), 2)])] },
  "OP17-032": { abilities: [onPlay(search(3, { traitIncl: RH }))] },
  "OP17-033": { abilities: [onPlay(search(3, { traitIncl: RH })), onOppAttack(rest(oppLC()), { optional: true, cost: [trashSelf] })] },
  "OP17-036": {
    abilities: [
      main([...rest(oppChar()), ...ko(oppChar({ rested: true, cost: [0, 6] }), 2)], { optional: true, cost: [restDon(6)] }),
      counter(power(myLC({ name: "Shanks" }), 4000, "battle", 1, "+4000 power počas súboja – tvoj [Shanks]")),
    ],
  },
  "OP17-037": { abilities: [main(search(5, { traitIncl: RH })), counter(counterBuff(3000), { optional: true, cost: [restCards(1)] })] },
  "OP17-038": { abilities: [main(rest(oppChar()), { optional: true, cost: [restCards(4)] }), counter(counterBuff(3000), { optional: true, cost: [discard(1)] })] },
  "OP17-060": { abilities: [onPlay([ifThen(leaderTrait("Animal Kingdom Pirates"), [addDon(1)]), ...ko(oppChar({ power: [-99999, 3000] }))])] },
  "P-046": { abilities: [onPlay([custom("handToBottomRedraw")], { optional: true })] },
  // Leader: výhra pri prázdnom balíčku (pravidlo v engine); [DON!! x1] zásah do Life → môže vyhodiť 1 z vrchu balíčka
  "P-117": { abilities: [onEvent({ ev: "Damage", side: "opp" }, [mayMill(1)], { cond: and(don(1), myAttackDamage("leader")) })] },
  // zjednodušené: „namiesto dania do rest efektom súpera daj do rest inú postavu“ engine nepodporuje
  "PRB02-006": { kw: ["blocker"], abilities: [] },
  "PRB02-015": {
    abilities: [
      statics([{ stat: "kw", kw: "blocker", f: SELF }, { stat: "cost", amount: 4, f: SELF }], leaderTrait(BB)),
      onKO([ifThen(leaderTrait(BB), ko(oppChar({ baseCost: [0, 4] })))]),
    ],
  },
  "ST02-009": { abilities: [onPlay(activate(myChar({ trait: [SN, "Heart Pirates"], rested: true, cost: [0, 5] })))] },
  "ST16-004": { abilities: [onPlay(ko(oppChar({ rested: true })))] },
  "ST17-004": { kw: ["blocker"], abilities: [onPlay([...scry(3), ...giveDon(1, myLC({ trait: "The Seven Warlords of the Sea" }))])] },
  "ST27-003": { kw: ["blocker"], abilities: [onKO(playFrom("trash", { trait: BB, cost: [0, 5] }, 1, true))] },
  "ST27-005": {
    abilities: [
      activateMain(ko(anyChar({ cost: [0, 3] }), 1, "K.O. postavu (cost ≤ 3)"), { optional: true, cost: [restSelf] }),
      onKO([choose(inTrash({ color: "Black" }), 1, "Ktorú čiernu kartu z trashu vezmeš do ruky?", 0, "tb"), { op: "move", v: "tb", to: "hand" }]),
    ],
  },
  "ST29-015": { abilities: [counter([...counterBuff(2000), ifThen(lifeLe(1), power(oppLC(), -2000))])] },
  "ST30-002": { abilities: [onPlay(search(5, { type: CH, power: [6000, 6000] }))] },
  // text karty stratil názov atribútu – Zoro je [Slash]
  "ST32-005": { kw: ["rushChar"], abilities: [onPlay([ifThen({ c: "leader", f: { zone: "leader", attribute: "Slash" } }, rest(oppChar({ cost: [0, 2] })))])] },
  "ST36-002": { abilities: [onPlay([ifThen(leaderTrait("Kid Pirates"), [deckToLife(1)])], { cond: yourTurn }), triggerPlaySelf(lifeLe(3, "opp"))] },
  "ST36-003": { abilities: [trigger([draw(1), ifThen(leaderTrait(SN), leaderBase7000)])] },
  "ST36-004": { abilities: [onPlay([draw(2)], { optional: true, cost: [discard(1, inHand({ trait: SN }))] })] },
  // zjednodušené: zmena cieľa útoku na seba (Kid má 7000 base power) – cena: otoč Life lícom dole
  "ST36-005": {
    abilities: [
      onOppAttack([custom("redirectToSelf")], { once: true, optional: true, cost: [{ op: "lifeFace", side: "me", up: false, n: 1 }] }),
      activateMain(giveDonLeader(1), { once: true, optional: true, cost: [{ op: "lifeFace", side: "me", up: true, n: 1 }] }),
    ],
  },
};

/** „Give up to 1 of your opponent's Characters −N cost during this turn“ */
function costModOpp(n: number): Step[] {
  return [choose(oppChar(), 1, `${n} cost – súperova postava`, 0, "cm"), { op: "costMod", v: "cm", amount: n, until: "turn" }];
}
