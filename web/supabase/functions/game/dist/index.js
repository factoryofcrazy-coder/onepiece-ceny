// lib/engine/cards.ts
var SH = "Straw Hat Crew";
var myOne = (label, trait) => ({ op: "choose", var: "t", filter: { side: "me", zone: "leaderOrCharacters", trait }, min: 0, max: 1, label });
var SCRIPTS = {
  // ---------------------------------------------------------------- ST-01 Straw Hat Crew
  // [Activate: Main] [Once Per Turn] Give this Leader or 1 of your Characters up to 1 rested DON!! card.
  "ST01-001": { abilities: [{ when: "activateMain", oncePerTurn: true, steps: [{ op: "giveDon", n: 1, label: "Komu da\u0165 1 DON!!" }] }] },
  // [DON!! x2] [When Attacking] Opponent cannot activate a [Blocker] with 5000+ power. [Trigger] Play this card.
  "ST01-002": {
    abilities: [
      { when: "whenAttacking", cond: { c: "donAttached", n: 2 }, steps: [{ op: "noBlocker", minPower: 5e3 }] },
      { when: "trigger", steps: [{ op: "playSelf" }] }
    ]
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
          { op: "choose", var: "t", filter: { side: "me", zone: "leaderOrCharacters", notSelf: true }, min: 0, max: 1, label: "+1000 power do konca \u0165ahu" },
          { op: "power", var: "t", amount: 1e3, until: "turn" }
        ]
      }
    ]
  },
  "ST01-006": { keywords: ["blocker"], abilities: [] },
  // [Activate: Main] [Once Per Turn] Give up to 1 rested DON!! card to your Leader or 1 of your Characters.
  "ST01-007": { abilities: [{ when: "activateMain", oncePerTurn: true, steps: [{ op: "giveDon", n: 1, label: "Komu da\u0165 1 DON!!" }] }] },
  "ST01-008": { abilities: [] },
  "ST01-009": { abilities: [] },
  "ST01-010": { abilities: [] },
  // [On Play] Give up to 2 rested DON!! cards to your Leader or 1 of your Characters.
  "ST01-011": { abilities: [{ when: "onPlay", steps: [{ op: "giveDon", n: 2, label: "Komu da\u0165 2 DON!!" }] }] },
  // [Rush] [DON!! x2] [When Attacking] Your opponent cannot activate [Blocker] during this battle.
  "ST01-012": { keywords: ["rush"], abilities: [{ when: "whenAttacking", cond: { c: "donAttached", n: 2 }, steps: [{ op: "noBlocker" }] }] },
  // [DON!! x1] This Character gains +1000 power.
  "ST01-013": { abilities: [{ when: "static", cond: { c: "donAttached", n: 1 }, mods: [{ stat: "power", amount: 1e3, target: "self" }] }] },
  // [Counter] +3000 during this battle. [Trigger] +1000 during this turn.
  "ST01-014": {
    abilities: [
      { when: "counter", steps: [myOne("+3000 power po\u010Das s\xFAboja"), { op: "power", var: "t", amount: 3e3, until: "battle" }] },
      { when: "trigger", steps: [myOne("+1000 power do konca \u0165ahu"), { op: "power", var: "t", amount: 1e3, until: "turn" }] }
    ]
  },
  // [Main] K.O. up to 1 of your opponent's Characters with 6000 power or less. [Trigger] Activate this card's [Main] effect.
  "ST01-015": {
    abilities: [
      {
        when: "main",
        steps: [
          { op: "choose", var: "t", filter: { side: "opp", zone: "characters", maxPower: 6e3 }, min: 0, max: 1, label: "K.O. postavu s power \u2264 6000" },
          { op: "ko", var: "t" }
        ]
      },
      { when: "trigger", steps: [{ op: "runMain" }] }
    ]
  },
  // [Main] Straw Hat Crew Leader/Character – opponent cannot activate [Blocker] when it attacks this turn.
  // [Trigger] K.O. up to 1 of your opponent's [Blocker] Characters with a cost of 3 or less.
  "ST01-016": {
    abilities: [
      { when: "main", steps: [myOne("Kto nem\xF4\u017Ee by\u0165 zablokovan\xFD", SH), { op: "noBlockerThisTurn", var: "t" }] },
      {
        when: "trigger",
        steps: [
          { op: "choose", var: "t", filter: { side: "opp", zone: "characters", keyword: "blocker", maxCost: 3 }, min: 0, max: 1, label: "K.O. [Blocker] s cost \u2264 3" },
          { op: "ko", var: "t" }
        ]
      }
    ]
  },
  // [Activate: Main] You may rest this Stage: Up to 1 Straw Hat Crew Leader or Character gains +1000 power during this turn.
  "ST01-017": {
    abilities: [
      { when: "activateMain", cost: [{ op: "restSelf" }], steps: [myOne("+1000 power do konca \u0165ahu", SH), { op: "power", var: "t", amount: 1e3, until: "turn" }] }
    ]
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
          { op: "addDon", n: 1, state: "rested" }
        ]
      }
    ]
  },
  // Hand: -5 cost with a [San-Gorou]/[Sanji] Character with 7000+ base power. [On Play] Return all of your [San-Gorou] and [Sanji] Characters to hand.
  "ST26-001": {
    abilities: [
      { when: "static", handCost: { amount: -5, cond: { c: "hasCharacter", names: ["San-Gorou", "Sanji"], minBasePower: 7e3 } } },
      { when: "onPlay", steps: [{ op: "bounceMine", names: ["San-Gorou", "Sanji"] }] }
    ]
  },
  // [Blocker] [On Play] DON!! -2: Rest up to 1 of your opponent's DON!! cards or Characters with a cost of 1 or less.
  "ST26-002": {
    keywords: ["blocker"],
    abilities: [{ when: "onPlay", optional: true, cost: [{ op: "payDon", n: 2 }], steps: [{ op: "restOppDonOrChar", maxCost: 1 }] }]
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
          { op: "choose", var: "t", filter: { side: "opp", zone: "characters" }, min: 0, max: 2, label: "\u22122000 power do konca \u0165ahu" },
          { op: "power", var: "t", amount: -2e3, until: "turn" }
        ]
      }
    ]
  },
  // [On Play] / [When Attacking] DON!! -2: If your Leader is multicolored and your opponent has 5+ DON!! on their field,
  // your Straw Hat Crew Leader's base power becomes 7000 until the end of your opponent's next End Phase.
  "ST26-005": {
    abilities: ["onPlay", "whenAttacking"].map((when) => ({
      when,
      optional: true,
      cost: [{ op: "payDon", n: 2 }],
      steps: [
        {
          op: "if",
          cond: { c: "and", all: [{ c: "leaderMulticolor" }, { c: "donOnField", n: 5, side: "opp" }] },
          then: [{ op: "setBasePower", target: "myLeader", value: 7e3, until: "oppNextEndPhase", trait: SH }]
        }
      ]
    }))
  },
  "OP05-065": { abilities: [] },
  // [Blocker] [Opponent's Turn] If you have 10 DON!! cards on your field, this Character gains +1000 power.
  "OP05-066": {
    keywords: ["blocker"],
    abilities: [
      { when: "static", cond: { c: "and", all: [{ c: "turn", who: "opp" }, { c: "donOnField", n: 10 }] }, mods: [{ stat: "power", amount: 1e3, target: "self" }] }
    ]
  },
  // [DON!! x1] If you have 8 or more DON!! cards on your field, this Character gains [Rush].
  "OP05-070": {
    abilities: [
      { when: "static", cond: { c: "and", all: [{ c: "donAttached", n: 1 }, { c: "donOnField", n: 8 }] }, mods: [{ stat: "keyword", kw: "rush", target: "self" }] }
    ]
  },
  "OP09-063": { abilities: [] },
  // [On Play] You may return 1 or more DON!! cards: Give up to 2 rested DON!! cards to your Leader or 1 of your Characters.
  "OP09-070": {
    abilities: [{ when: "onPlay", optional: true, cost: [{ op: "payDon", n: 1, atLeast: true }], steps: [{ op: "giveDon", n: 2, label: "Komu da\u0165 2 DON!!" }] }]
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
          { op: "choose", var: "t", filter: { side: "opp", zone: "characters", maxPower: 6e3 }, min: 0, max: 1, label: "K.O. postavu s power \u2264 6000" },
          { op: "ko", var: "t" }
        ]
      },
      { when: "trigger", steps: [{ op: "addDon", n: 1, state: "active" }] }
    ]
  }
};
var KW = [
  [/\[Blocker\]/i, "blocker"],
  [/\[Rush\]/i, "rush"],
  [/\[Double Attack\]/i, "doubleAttack"],
  [/\[Banish\]/i, "banish"]
];
function hasEffectText(text) {
  const t = (text || "").replace(/NULL/g, "").replace(/\([^)]*\)/g, "").replace(/\[(Blocker|Rush|Double Attack|Banish)\]/gi, "").trim();
  return t.length > 0;
}
function buildDef(c) {
  const s = SCRIPTS[c.code];
  const text = c.text && c.text !== "NULL" ? c.text : "";
  const plainKw = KW.filter(([re]) => re.test(text.split(/\[DON!!|\[Opponent's Turn\]|\[Your Turn\]|If /)[0])).map(([, k]) => k);
  return {
    code: c.code,
    name: c.name,
    type: ["Leader", "Character", "Event", "Stage"].includes(c.type) ? c.type : "Character",
    colors: c.colors,
    cost: c.cost ?? 0,
    power: c.power ?? 0,
    counter: c.counter ?? 0,
    life: c.life ?? 0,
    traits: c.traits ? splitTraits(c.traits) : [],
    keywords: s?.keywords ?? plainKw,
    abilities: s?.abilities ?? [],
    scripted: !!s || !hasEffectText(text),
    text
  };
}
var KNOWN_TRAITS = [
  "Straw Hat Crew",
  "The Four Emperors",
  "Fish-Man",
  "Supernovas",
  "Animal",
  "Alabasta",
  "Navy",
  "Land of Wano",
  "Whitebeard Pirates",
  "Red-Haired Pirates",
  "Big Mom Pirates",
  "Animal Kingdom Pirates",
  "The Seven Warlords of the Sea",
  "Donquixote Pirates",
  "Revolutionary Army",
  "Heart Pirates",
  "Kid Pirates",
  "Egghead",
  "World Government",
  "CP9"
];
function splitTraits(s) {
  const out = [];
  let rest = ` ${s} `;
  for (const t of KNOWN_TRAITS) if (rest.includes(` ${t} `)) out.push(t), rest = rest.replace(` ${t} `, " ");
  rest.trim().split(/\s{2,}|\s*\/\s*/).filter(Boolean).forEach((x) => x.trim() && out.push(x.trim()));
  return out;
}

// lib/engine/rng.ts
function nextRand(seed) {
  let t = seed + 1831565813 >>> 0;
  let r = Math.imul(t ^ t >>> 15, 1 | t);
  r ^= r + Math.imul(r ^ r >>> 7, 61 | r);
  return [((r ^ r >>> 14) >>> 0) / 4294967296, t];
}
function shuffle(arr, seed) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    const [r, ns] = nextRand(s);
    s = ns;
    const j = Math.floor(r * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return [a, s];
}

// lib/engine/types.ts
var other = (p) => p === 0 ? 1 : 0;

// lib/engine/engine.ts
var MAX_DON = 10;
var MAX_CHARS = 5;
function newGame(decks, defs, seed = Date.now() % 2147483647, first = 0) {
  const s = {
    seed,
    turn: 0,
    active: first,
    first,
    phase: "setup",
    players: [null, null],
    cards: {},
    defs,
    mods: [],
    stack: [],
    pending: [],
    prompt: null,
    battle: null,
    usedOnce: [],
    donReturnedThisTurn: [0, 0],
    log: [],
    winner: null,
    nextId: 1
  };
  decks.forEach((d, i) => {
    const p = i;
    const mk = (code) => {
      const iid = `c${s.nextId++}`;
      s.cards[iid] = { iid, code, owner: p, rested: false, don: 0, playedTurn: 0 };
      return iid;
    };
    const leader = mk(d.leader);
    const [deck, seed2] = shuffle(d.cards.map(mk), s.seed);
    s.seed = seed2;
    s.players[p] = {
      name: d.name,
      leader,
      deck,
      hand: [],
      trash: [],
      life: [],
      characters: [],
      stage: null,
      donDeck: MAX_DON,
      donActive: 0,
      donRested: 0,
      mulliganDone: false
    };
    s.players[p].hand = s.players[p].deck.splice(0, 5);
  });
  s.prompt = { kind: "mulligan", p: first };
  return s;
}
var clone = (s) => {
  const { defs, ...rest } = s;
  return { ...structuredClone(rest), defs };
};
var def = (s, iid) => s.defs[s.cards[iid].code];
var pl = (s, p) => s.players[p];
var ownerOf = (s, iid) => s.cards[iid].owner;
var emit = (s, e) => {
  s.log.push(e);
  listen(s, e);
};
var info = (s, msg) => s.log.push({ t: "Info", msg });
var fieldOf = (s, p) => {
  const x = pl(s, p);
  return [x.leader, ...x.characters, ...x.stage ? [x.stage] : []];
};
var donOnField = (s, p) => {
  const x = pl(s, p);
  return x.donActive + x.donRested + fieldOf(s, p).reduce((a, i) => a + s.cards[i].don, 0);
};
var onField = (s, iid) => fieldOf(s, ownerOf(s, iid)).includes(iid);
function evalCond(s, c, source, controller) {
  if (!c) return true;
  switch (c.c) {
    case "donAttached":
      return s.cards[source].don >= c.n && s.active === controller;
    // DON!! xN platí len v tvojom ťahu
    case "turn":
      return c.who === "mine" ? s.active === controller : s.active !== controller;
    case "donOnField":
      return donOnField(s, c.side === "opp" ? other(controller) : controller) >= c.n;
    case "leaderMulticolor":
      return def(s, pl(s, controller).leader).colors.length > 1;
    case "hasCharacter":
      return pl(s, controller).characters.some((i) => {
        const d = def(s, i);
        return (!c.names || c.names.includes(d.name)) && (!c.trait || d.traits.includes(c.trait)) && (!c.minBasePower || basePower(s, i) >= c.minBasePower);
      });
    case "lifeAtMost":
      return pl(s, c.side === "opp" ? other(controller) : controller).life.length <= c.n;
    case "and":
      return c.all.every((x) => evalCond(s, x, source, controller));
    case "not":
      return !evalCond(s, c.x, source, controller);
  }
}
function activeStatics(s) {
  const out = [];
  for (const p of [0, 1])
    for (const src of fieldOf(s, p))
      for (const a of def(s, src).abilities)
        if (a.when === "static" && a.mods && evalCond(s, a.cond, src, p)) for (const m of a.mods) out.push({ src, p, m });
  return out;
}
var appliesTo = (s, target, src, p, iid) => target === "self" ? iid === src : target === "myLeader" ? iid === pl(s, p).leader : pl(s, p).characters.includes(iid);
function basePower(s, iid) {
  const set = s.mods.filter((m) => m.target === iid && m.kind === "basePower");
  return set.length ? set[set.length - 1].amount : def(s, iid).power;
}
function power(s, iid) {
  const c = s.cards[iid];
  let v = basePower(s, iid);
  if (s.active === c.owner) v += c.don * 1e3;
  for (const m of s.mods) if (m.target === iid && m.kind === "power") v += m.amount;
  for (const { src, p, m } of activeStatics(s)) if (m.stat === "power" && appliesTo(s, m.target, src, p, iid)) v += m.amount;
  return Math.max(0, v);
}
function cost(s, iid) {
  let v = def(s, iid).cost;
  for (const { src, p, m } of activeStatics(s))
    if (m.stat === "cost" && (m.target === "self" ? iid === src : pl(s, p).characters.includes(iid))) v += m.amount;
  return Math.max(0, v);
}
function handCost(s, iid) {
  const d = def(s, iid);
  let v = d.cost;
  for (const a of d.abilities) if (a.handCost && evalCond(s, a.handCost.cond, iid, ownerOf(s, iid))) v += a.handCost.amount;
  return Math.max(0, v);
}
function hasKw(s, iid, kw) {
  if (def(s, iid).keywords.includes(kw)) return true;
  for (const { src, m } of activeStatics(s)) if (m.stat === "keyword" && m.kw === kw && src === iid) return true;
  return false;
}
function candidates(s, f, source, controller) {
  const side = f.side === "me" ? controller : other(controller);
  const x = pl(s, side);
  let list = f.zone === "characters" ? [...x.characters] : f.zone === "leader" ? [x.leader] : [x.leader, ...x.characters];
  return list.filter((i) => {
    const d = def(s, i);
    if (f.notSelf && i === source) return false;
    if (f.maxCost != null && (d.type !== "Character" || cost(s, i) > f.maxCost)) return false;
    if (f.maxPower != null && power(s, i) > f.maxPower) return false;
    if (f.trait && !d.traits.includes(f.trait)) return false;
    if (f.keyword && !hasKw(s, i, f.keyword)) return false;
    if (f.rested != null && s.cards[i].rested !== f.rested) return false;
    return true;
  });
}
function listen(s, e) {
  if (e.t !== "DonReturned") return;
  s.donReturnedThisTurn[e.p] += e.n;
  for (const p of [0, 1])
    for (const src of fieldOf(s, p))
      def(s, src).abilities.forEach((a, k) => {
        if (a.when !== "onEvent" || !a.listen) return;
        if (a.listen.event === "DonReturned" && a.listen.side === "me" && e.p === p && e.n >= a.listen.min) queue(s, src, p, k);
      });
}
function queue(s, src, p, k) {
  const a = def(s, src).abilities[k];
  if (!evalCond(s, a.cond, src, p)) return;
  const key = `${src}:${k}`;
  if (a.oncePerTurn && (s.usedOnce.includes(key) || s.pending.some((x) => x.source === src && x.ability === k))) return;
  s.pending.push({ source: src, controller: p, ability: k, label: `${def(s, src).name}: ${a.when}` });
}
function queueWhen(s, src, when) {
  const p = ownerOf(s, src);
  def(s, src).abilities.forEach((a, k) => a.when === when && queue(s, src, p, k));
}
function startAbility(s, src, controller, k, kind = "ability") {
  const a = def(s, src).abilities[k];
  if (a.oncePerTurn) s.usedOnce.push(`${src}:${k}`);
  s.stack.push({
    source: src,
    controller,
    steps: [...a.steps ?? []],
    pc: 0,
    vars: {},
    label: `${def(s, src).name}`,
    costs: a.cost ?? [],
    ci: 0,
    optional: !!a.optional,
    asked: false,
    kind
  });
}
function draw(s, p, n) {
  for (let i = 0; i < n; i++) {
    const x = pl(s, p);
    if (!x.deck.length) return lose(s, p, "nem\xE1 kartu na \u0165ahanie");
    x.hand.push(x.deck.shift());
  }
  emit(s, { t: "CardDrawn", p, n });
}
function addDon(s, p, n, state) {
  const x = pl(s, p);
  const k = Math.min(n, x.donDeck);
  if (!k) return;
  x.donDeck -= k;
  if (state === "active") x.donActive += k;
  else x.donRested += k;
  emit(s, { t: "DonAdded", p, n: k, state });
}
function leaveField(s, iid) {
  const c = s.cards[iid];
  const x = pl(s, c.owner);
  x.donRested += c.don;
  c.don = 0;
  c.rested = false;
  x.characters = x.characters.filter((i) => i !== iid);
  if (x.stage === iid) x.stage = null;
  s.mods = s.mods.filter((m) => m.target !== iid);
}
function ko(s, iid) {
  if (!onField(s, iid) || def(s, iid).type === "Leader") return;
  leaveField(s, iid);
  pl(s, ownerOf(s, iid)).trash.push(iid);
  emit(s, { t: "KO", iid });
  queueWhen(s, iid, "onKO");
}
function bounce(s, iid) {
  if (!onField(s, iid) || def(s, iid).type === "Leader") return;
  leaveField(s, iid);
  pl(s, ownerOf(s, iid)).hand.push(iid);
}
function addMod(s, m) {
  s.mods.push({ ...m, setOnTurn: s.turn });
}
function lose(s, p, why) {
  if (s.winner != null) return;
  s.winner = other(p);
  s.phase = "over";
  s.prompt = null;
  info(s, `${pl(s, p).name} prehral \u2013 ${why}.`);
}
function putCharacter(s, iid) {
  const c = s.cards[iid];
  const x = pl(s, c.owner);
  x.hand = x.hand.filter((i) => i !== iid);
  x.life = x.life.filter((i) => i !== iid);
  c.rested = false;
  c.don = 0;
  c.playedTurn = s.turn;
  x.characters.push(iid);
  emit(s, { t: "CardPlayed", p: c.owner, iid });
  queueWhen(s, iid, "onPlay");
  if (x.characters.length > MAX_CHARS) s.prompt = { kind: "trashCharacter", p: c.owner, options: x.characters.filter((i) => i !== iid) };
}
function execStep(s, f, st) {
  const p = f.controller;
  const vars = (v) => v === "self" ? [f.source] : f.vars[v] ?? [];
  switch (st.op) {
    case "choose": {
      const opts = candidates(s, st.filter, f.source, p);
      if (!opts.length || st.max === 0) {
        f.vars[st.var] = [];
        return true;
      }
      s.prompt = { kind: "choose", p, label: st.label, options: opts, min: Math.min(st.min, opts.length), max: Math.min(st.max, opts.length) };
      return false;
    }
    case "draw":
      draw(s, p, st.n);
      return true;
    case "ko":
      vars(st.var).forEach((i) => ko(s, i));
      return true;
    case "rest":
      vars(st.var).forEach((i) => s.cards[i].rested = true);
      return true;
    case "bounce":
      vars(st.var).forEach((i) => bounce(s, i));
      return true;
    case "bounceMine":
      pl(s, p).characters.filter((i) => st.names.includes(def(s, i).name)).forEach((i) => bounce(s, i));
      return true;
    case "power":
      vars(st.var).forEach((i) => addMod(s, { target: i, kind: "power", amount: st.amount, until: st.until, owner: p }));
      return true;
    case "setBasePower": {
      const L = pl(s, p).leader;
      if (!st.trait || def(s, L).traits.includes(st.trait)) addMod(s, { target: L, kind: "basePower", amount: st.value, until: st.until, owner: p });
      return true;
    }
    case "addDon":
      addDon(s, p, st.n, st.state);
      return true;
    case "giveDon": {
      if (!pl(s, p).donRested) return true;
      s.prompt = { kind: "choose", p, label: st.label, options: [pl(s, p).leader, ...pl(s, p).characters], min: 0, max: 1 };
      return false;
    }
    case "restOppDonOrChar": {
      const o = other(p);
      const opts = [...pl(s, o).donActive ? ["don"] : [], ...pl(s, o).characters.filter((i) => !s.cards[i].rested && cost(s, i) <= st.maxCost)];
      if (!opts.length) return true;
      s.prompt = { kind: "choose", p, label: `Daj do rest s\xFAperov DON!! alebo postavu s cost \u2264 ${st.maxCost}`, options: opts, min: 0, max: 1 };
      return false;
    }
    case "noBlocker":
      if (s.battle) addMod(s, { target: s.battle.attacker, kind: st.minPower ? "noBlockerMinPower" : "noBlocker", amount: st.minPower ?? 0, until: "battle", owner: p });
      return true;
    case "noBlockerThisTurn":
      vars(st.var).forEach((i) => addMod(s, { target: i, kind: "noBlocker", amount: 0, until: "turn", owner: p }));
      return true;
    case "playSelf":
      if (def(s, f.source).type === "Character") putCharacter(s, f.source);
      f.kind = "ability";
      return true;
    case "runMain": {
      const k = def(s, f.source).abilities.findIndex((a) => a.when === "main");
      if (k >= 0) {
        const a = def(s, f.source).abilities[k];
        s.stack.push({ ...f, steps: a.steps ?? [], pc: 0, vars: {}, costs: a.cost ?? [], ci: 0, optional: !!a.optional, asked: false, kind: "ability" });
      }
      return true;
    }
    case "if": {
      const branch = evalCond(s, st.cond, f.source, p) ? st.then : st.else ?? [];
      f.steps = [...f.steps.slice(0, f.pc + 1), ...branch, ...f.steps.slice(f.pc + 1)];
      return true;
    }
  }
}
var canPayDon = (s, p, n) => donOnField(s, p) >= n;
function run(s) {
  for (let guard = 0; guard < 1e4; guard++) {
    if (s.winner != null || s.prompt) return;
    const f = s.stack[s.stack.length - 1];
    if (f) {
      if (f.ci < f.costs.length) {
        const c = f.costs[f.ci];
        const payable = c.op === "payDon" ? canPayDon(s, f.controller, c.n) : !s.cards[f.source].rested;
        if (!payable) {
          info(s, `${f.label}: cenu nie je mo\u017En\xE9 zaplati\u0165.`);
          finishFrame(s, f, false);
          continue;
        }
        if (f.optional && !f.asked) {
          s.prompt = { kind: "payCost", p: f.controller, label: `${f.label}: ${c.op === "payDon" ? `DON!! \u2212${c.n}${c.atLeast ? " alebo viac" : ""}` : "da\u0165 do rest"} \u2013 pou\u017Ei\u0165 efekt?` };
          return;
        }
        if (c.op === "payDon") {
          s.prompt = { kind: "donSource", p: f.controller, n: c.n, atLeast: !!c.atLeast, label: `${f.label}: vyber DON!! na vr\xE1tenie` };
          return;
        }
        s.cards[f.source].rested = true;
        f.ci++;
        continue;
      }
      if (f.optional && !f.asked && !f.costs.length) {
        f.asked = true;
      }
      if (f.pc < f.steps.length) {
        const st = f.steps[f.pc];
        if (execStep(s, f, st)) f.pc++;
        continue;
      }
      finishFrame(s, f, true);
      continue;
    }
    if (s.pending.length) {
      const mine = s.pending.filter((x) => x.controller === s.active);
      const group = mine.length ? mine : s.pending;
      if (group.length > 1) {
        s.prompt = { kind: "orderTriggers", p: group[0].controller, options: group.map((g) => s.pending.indexOf(g)) };
        return;
      }
      const next = group[0];
      s.pending.splice(s.pending.indexOf(next), 1);
      startPending(s, next);
      continue;
    }
    if (s.battle) {
      if (battleStep(s)) continue;
      return;
    }
    return;
  }
  throw new Error("Engine: nekone\u010Dn\xE1 slu\u010Dka");
}
function startPending(s, x) {
  if (!onField(s, x.source) && def(s, x.source).abilities[x.ability].when !== "onKO") return;
  startAbility(s, x.source, x.controller, x.ability);
}
function finishFrame(s, f, done) {
  s.stack.pop();
  if ((f.kind === "mainEvent" || f.kind === "counterEvent" || f.kind === "triggerEvent") && def(s, f.source).type === "Event") {
    const x = pl(s, ownerOf(s, f.source));
    if (!x.trash.includes(f.source)) x.trash.push(f.source);
  }
  void done;
}
function battleStep(s) {
  const b = s.battle;
  const def_ = other(s.active);
  if (b.step === "whenAttacking") {
    b.step = "block";
    const blockers = blockersFor(s);
    if (blockers.length) {
      s.prompt = { kind: "blocker", p: def_, options: blockers };
      return false;
    }
    b.step = "counter";
    return true;
  }
  if (b.step === "block") {
    b.step = "counter";
    return true;
  }
  if (b.step === "counter") {
    if (counterOptions(s, def_).length) {
      s.prompt = { kind: "counter", p: def_ };
      return false;
    }
    b.step = "damage";
    return true;
  }
  if (b.step === "damage") {
    b.step = "done";
    resolveDamage(s);
    return true;
  }
  s.mods = s.mods.filter((m) => m.until !== "battle");
  s.battle = null;
  s.phase = s.winner != null ? "over" : "main";
  return true;
}
function blockersFor(s) {
  const b = s.battle;
  const d = other(s.active);
  if (s.mods.some((m) => m.target === b.attacker && m.kind === "noBlocker")) return [];
  const minP = s.mods.filter((m) => m.target === b.attacker && m.kind === "noBlockerMinPower").map((m) => m.amount);
  return pl(s, d).characters.filter(
    (i) => i !== b.target && !s.cards[i].rested && hasKw(s, i, "blocker") && !minP.some((mp) => power(s, i) >= mp)
  );
}
function counterOptions(s, p) {
  const x = pl(s, p);
  return x.hand.filter((i) => {
    const d = def(s, i);
    if (d.type === "Character") return d.counter > 0;
    if (d.type === "Event") return d.abilities.some((a) => a.when === "counter") && x.donActive >= d.cost;
    return false;
  });
}
function resolveDamage(s) {
  const b = s.battle;
  const tp = ownerOf(s, b.target);
  if (b.hitsLeft == null) {
    const atk = power(s, b.attacker);
    const tgt = power(s, b.target);
    if (atk < tgt) return info(s, `\xDAtok ${atk} < ${tgt} \u2013 bez \xFA\u010Dinku.`);
    if (def(s, b.target).type !== "Leader") return ko(s, b.target);
    b.hitsLeft = hasKw(s, b.attacker, "doubleAttack") ? 2 : 1;
  }
  while (b.hitsLeft > 0) {
    b.hitsLeft--;
    const x = pl(s, tp);
    if (!x.life.length) return lose(s, tp, "dostal z\xE1sah s 0 Life");
    const card = x.life.shift();
    emit(s, { t: "LifeDamage", p: tp, n: 1 });
    if (hasKw(s, b.attacker, "banish")) {
      x.trash.push(card);
      continue;
    }
    x.hand.push(card);
    if (def(s, card).abilities.some((a) => a.when === "trigger")) {
      s.prompt = { kind: "trigger", p: tp, iid: card };
      if (b.hitsLeft > 0) b.step = "damage";
      return;
    }
  }
}
function startTurn(s) {
  s.turn++;
  const p = s.active;
  const x = pl(s, p);
  for (const i of fieldOf(s, p)) {
    x.donActive += s.cards[i].don;
    s.cards[i].don = 0;
    s.cards[i].rested = false;
  }
  x.donActive += x.donRested;
  x.donRested = 0;
  if (s.turn > 1) draw(s, p, 1);
  if (s.winner != null) return;
  addDon(s, p, s.turn === 1 ? 1 : 2, "active");
  s.phase = "main";
  run(s);
}
function endTurn(s) {
  const p = s.active;
  s.phase = "end";
  fieldOf(s, p).forEach((i) => queueWhen(s, i, "endOfTurn"));
  run(s);
  if (s.prompt) return;
  s.mods = s.mods.filter((m) => m.until !== "turn" && !(m.until === "oppNextEndPhase" && m.owner !== p));
  s.usedOnce = [];
  s.donReturnedThisTurn = [0, 0];
  s.active = other(p);
  startTurn(s);
}
function setupLife(s) {
  for (const p of [0, 1]) {
    const x = pl(s, p);
    const n = def(s, x.leader).life || 5;
    x.life = x.deck.splice(0, n).reverse();
  }
  s.active = s.first;
  startTurn(s);
}
var IllegalAction = class extends Error {
};
var fail = (msg) => {
  throw new IllegalAction(msg);
};
function applyAction(state, a) {
  if (state.winner != null) fail("Hra skon\u010Dila.");
  const s = clone(state);
  if (s.prompt) {
    if (a.type !== "answer") fail("Engine \u010Dak\xE1 na odpove\u010F.");
    if (s.prompt.p !== a.p) fail("Na rade je druh\xFD hr\xE1\u010D.");
    answer(s, a.choice);
    if (!s.prompt) run(s);
    return s;
  }
  if (a.type === "answer") fail("Nie je na \u010Do odpoveda\u0165.");
  if (a.type === "mulligan") fail("Mulligan nie je teraz mo\u017En\xFD.");
  if (a.p !== s.active) fail("Nie si na \u0165ahu.");
  if (s.phase !== "main" || s.stack.length || s.pending.length || s.battle) fail("Teraz sa to ned\xE1.");
  const x = pl(s, a.p);
  switch (a.type) {
    case "play": {
      if (!x.hand.includes(a.iid)) fail("Karta nie je v ruke.");
      const d = def(s, a.iid);
      if (d.type === "Event" && !d.abilities.some((ab) => ab.when === "main") && d.scripted) fail("Tento event sa ned\xE1 zahra\u0165 v Main f\xE1ze.");
      const c = handCost(s, a.iid);
      if (x.donActive < c) fail(`Potrebuje\u0161 ${c} akt\xEDvnych DON!!.`);
      x.donActive -= c;
      x.donRested += c;
      if (d.type === "Character") putCharacter(s, a.iid);
      else if (d.type === "Stage") {
        x.hand = x.hand.filter((i) => i !== a.iid);
        if (x.stage) leaveField(s, x.stage), x.trash.push(x.stage);
        x.stage = a.iid;
        s.cards[a.iid].playedTurn = s.turn;
        emit(s, { t: "CardPlayed", p: a.p, iid: a.iid });
        queueWhen(s, a.iid, "onPlay");
      } else {
        x.hand = x.hand.filter((i) => i !== a.iid);
        emit(s, { t: "CardPlayed", p: a.p, iid: a.iid });
        const k = d.abilities.findIndex((ab) => ab.when === "main");
        if (k >= 0) startAbility(s, a.iid, a.p, k, "mainEvent");
        else x.trash.push(a.iid);
      }
      break;
    }
    case "attachDon": {
      if (!x.donActive) fail("Nem\xE1\u0161 akt\xEDvny DON!!.");
      if (!fieldOf(s, a.p).includes(a.target) || a.target === x.stage) fail("DON!! sa d\xE1 da\u0165 len na leadera alebo postavu.");
      x.donActive--;
      s.cards[a.target].don++;
      break;
    }
    case "activate": {
      if (!fieldOf(s, a.p).includes(a.iid)) fail("Karta nie je na tvojom poli.");
      const ab = def(s, a.iid).abilities[a.ability];
      if (!ab || ab.when !== "activateMain") fail("T\xE1to schopnos\u0165 sa ned\xE1 aktivova\u0165.");
      if (ab.oncePerTurn && s.usedOnce.includes(`${a.iid}:${a.ability}`)) fail("U\u017E pou\u017Eit\xE9 tento \u0165ah.");
      if (!evalCond(s, ab.cond, a.iid, a.p)) fail("Podmienka nie je splnen\xE1.");
      startAbility(s, a.iid, a.p, a.ability);
      break;
    }
    case "attack": {
      if (s.turn <= 2) fail("V prvom \u0165ahu ka\u017Ed\xE9ho hr\xE1\u010Da sa ne\xFAto\u010D\xED.");
      if (!fieldOf(s, a.p).includes(a.attacker) || a.attacker === x.stage) fail("\xDAto\u010Di\u0165 m\xF4\u017Ee leader alebo postava.");
      const at = s.cards[a.attacker];
      if (at.rested) fail("\xDAto\u010Dn\xEDk je v rest.");
      if (def(s, a.attacker).type === "Character" && at.playedTurn === s.turn && !hasKw(s, a.attacker, "rush")) fail("Postava zahran\xE1 tento \u0165ah nem\xF4\u017Ee \xFAto\u010Di\u0165 (bez [Rush]).");
      const o = other(a.p);
      const tg = a.target;
      const okTarget = tg === pl(s, o).leader || pl(s, o).characters.includes(tg) && s.cards[tg].rested;
      if (!okTarget) fail("Cie\u013E mus\xED by\u0165 s\xFAperov leader alebo postava v rest.");
      at.rested = true;
      s.phase = "battle";
      s.battle = { attacker: a.attacker, target: tg, step: "whenAttacking", counterPower: 0 };
      emit(s, { t: "Attack", attacker: a.attacker, target: tg });
      queueWhen(s, a.attacker, "whenAttacking");
      break;
    }
    case "endTurn":
      endTurn(s);
      return s;
  }
  run(s);
  return s;
}
function answer(s, ch) {
  const pr = s.prompt;
  const f = s.stack[s.stack.length - 1];
  s.prompt = null;
  switch (pr.kind) {
    case "mulligan": {
      const x = pl(s, pr.p);
      if (ch.yes === true) {
        x.deck.push(...x.hand);
        x.hand = [];
        const [d, seed] = shuffle(x.deck, s.seed);
        s.seed = seed;
        x.deck = d;
        x.hand = x.deck.splice(0, 5);
      }
      x.mulliganDone = true;
      const o = other(pr.p);
      if (!pl(s, o).mulliganDone) s.prompt = { kind: "mulligan", p: o };
      else setupLife(s);
      return;
    }
    case "payCost": {
      f.asked = true;
      if (!ch.yes) finishFrame(s, f, false);
      return;
    }
    case "donSource": {
      const d = ch.don;
      if (!d) return fail("Ch\xFDba v\xFDber DON!!.");
      const x = pl(s, pr.p);
      const total = d.active + d.rested + Object.values(d.attached).reduce((a, b) => a + b, 0);
      if (pr.atLeast ? total < pr.n : total !== pr.n) return fail(`Vr\xE1\u0165 ${pr.atLeast ? "aspo\u0148 " : ""}${pr.n} DON!!.`);
      if (d.active > x.donActive || d.rested > x.donRested) return fail("To\u013Eko DON!! nem\xE1\u0161.");
      for (const [iid, n] of Object.entries(d.attached))
        if (!fieldOf(s, pr.p).includes(iid) || s.cards[iid].don < n) return fail("Na karte nie je to\u013Eko DON!!.");
      x.donActive -= d.active;
      x.donRested -= d.rested;
      for (const [iid, n] of Object.entries(d.attached)) s.cards[iid].don -= n;
      x.donDeck += total;
      f.ci++;
      emit(s, { t: "DonReturned", p: pr.p, n: total });
      return;
    }
    case "choose": {
      const pick = ch.pick ?? [];
      if (pick.some((i) => !pr.options.includes(i)) || pick.length < pr.min || pick.length > pr.max) return fail("Neplatn\xFD v\xFDber.");
      const st = f.steps[f.pc];
      if (st.op === "giveDon") {
        const x = pl(s, pr.p);
        if (pick[0]) {
          const n = Math.min(st.n, x.donRested);
          x.donRested -= n;
          s.cards[pick[0]].don += n;
        }
      } else if (st.op === "restOppDonOrChar") {
        const o = pl(s, other(pr.p));
        if (pick[0] === "don") o.donActive--, o.donRested++;
        else if (pick[0]) s.cards[pick[0]].rested = true;
      } else if (st.op === "choose") f.vars[st.var] = pick;
      f.pc++;
      return;
    }
    case "orderTriggers": {
      const k = ch.order;
      if (!pr.options.includes(k)) return fail("Neplatn\xE9 poradie.");
      const [x] = s.pending.splice(k, 1);
      startPending(s, x);
      return;
    }
    case "blocker": {
      const pick = ch.pick ?? [];
      if (pick[0]) {
        if (!pr.options.includes(pick[0])) return fail("Tento blocker sa ned\xE1 pou\u017Ei\u0165.");
        s.cards[pick[0]].rested = true;
        s.battle.target = pick[0];
        info(s, `${def(s, pick[0]).name} blokuje.`);
      }
      return;
    }
    case "counter": {
      const used = ch.counter ?? [];
      const x = pl(s, pr.p);
      const b = s.battle;
      if (!used.length) {
        b.step = "damage";
        return;
      }
      for (const iid of used) {
        if (!counterOptions(s, pr.p).includes(iid)) return fail("T\xFAto kartu nem\xF4\u017Ee\u0161 pou\u017Ei\u0165 ako counter.");
        const d = def(s, iid);
        x.hand = x.hand.filter((i) => i !== iid);
        if (d.type === "Character") {
          x.trash.push(iid);
          addMod(s, { target: b.target, kind: "power", amount: d.counter, until: "battle", owner: pr.p });
        } else {
          x.donActive -= d.cost;
          x.donRested += d.cost;
          const k = d.abilities.findIndex((a) => a.when === "counter");
          startAbility(s, iid, pr.p, k, "counterEvent");
        }
      }
      return;
    }
    case "trigger": {
      const x = pl(s, pr.p);
      if (ch.yes) {
        const k = def(s, pr.iid).abilities.findIndex((a) => a.when === "trigger");
        x.hand = x.hand.filter((i) => i !== pr.iid);
        startAbility(s, pr.iid, pr.p, k, def(s, pr.iid).type === "Event" ? "triggerEvent" : "ability");
        if (def(s, pr.iid).type !== "Event" && !def(s, pr.iid).abilities[k].steps?.some((st) => st.op === "playSelf")) x.trash.push(pr.iid);
      }
      return;
    }
    case "trashCharacter": {
      const pick = ch.pick ?? [];
      if (!pick[0] || !pr.options.includes(pick[0])) return fail("Vyber postavu na odhodenie.");
      leaveField(s, pick[0]);
      pl(s, pr.p).trash.push(pick[0]);
      return;
    }
  }
}
function viewFor(s, p) {
  const o = other(p);
  const v = clone(s);
  const hidden = /* @__PURE__ */ new Set([...s.players[o].hand, ...s.players[o].deck, ...s.players[p].deck, ...s.players[0].life, ...s.players[1].life]);
  if (s.prompt?.kind === "trigger") hidden.delete(s.prompt.iid);
  v.players[o].hand = v.players[o].hand.map(() => "hidden");
  v.players[o].deck = v.players[o].deck.map(() => "hidden");
  v.players[p].deck = v.players[p].deck.map(() => "hidden");
  v.players[0].life = v.players[0].life.map(() => "hidden");
  v.players[1].life = v.players[1].life.map(() => "hidden");
  const cards = {};
  for (const [iid, c] of Object.entries(v.cards)) if (!hidden.has(iid)) cards[iid] = c;
  v.cards = cards;
  const codes = new Set(Object.values(cards).map((c) => c.code));
  v.defs = Object.fromEntries(Object.entries(s.defs).filter(([k]) => codes.has(k)));
  v.seed = 0;
  return v;
}

// lib/engine/fixtures.ts
var ROWS = [
  ["ST01-001", "Monkey.D.Luffy", "Leader", "Red", null, 5e3, null, 5, "Straw Hat Crew Supernovas"],
  ["ST01-002", "Usopp", "Character", "Red", 2, 2e3, 1e3, null, "Straw Hat Crew"],
  ["ST01-003", "Karoo", "Character", "Red", 1, 3e3, 1e3, null, "Animal Alabasta"],
  ["ST01-004", "Sanji", "Character", "Red", 2, 4e3, 0, null, "Straw Hat Crew"],
  ["ST01-005", "Jinbe", "Character", "Red", 3, 5e3, 0, null, "Fish-Man Straw Hat Crew"],
  ["ST01-006", "Tony Tony.Chopper", "Character", "Red", 1, 1e3, 0, null, "Animal Straw Hat Crew"],
  ["ST01-007", "Nami", "Character", "Red", 1, 1e3, 1e3, null, "Straw Hat Crew"],
  ["ST01-008", "Nico Robin", "Character", "Red", 3, 5e3, 1e3, null, "Straw Hat Crew"],
  ["ST01-009", "Nefeltari Vivi", "Character", "Red", 2, 4e3, 1e3, null, "Alabasta"],
  ["ST01-010", "Franky", "Character", "Red", 4, 6e3, 1e3, null, "Straw Hat Crew"],
  ["ST01-011", "Brook", "Character", "Red", 2, 3e3, 2e3, null, "Straw Hat Crew"],
  ["ST01-012", "Monkey.D.Luffy", "Character", "Red", 5, 6e3, 0, null, "Straw Hat Crew Supernovas"],
  ["ST01-013", "Roronoa Zoro", "Character", "Red", 3, 5e3, 0, null, "Straw Hat Crew Supernovas"],
  ["ST01-014", "Guard Point", "Event", "Red", 1, null, null, null, "Animal Straw Hat Crew"],
  ["ST01-015", "Gum-Gum Jet Pistol", "Event", "Red", 4, null, null, null, "Straw Hat Crew Supernovas"],
  ["ST01-016", "Diable Jambe", "Event", "Red", 1, null, null, null, "Straw Hat Crew"],
  ["ST01-017", "Thousand Sunny", "Stage", "Red", 2, null, 0, null, "Straw Hat Crew"],
  ["OP09-061", "Monkey.D.Luffy", "Leader", "Purple/Black", null, 5e3, null, 4, "Straw Hat Crew The Four Emperors"],
  ["ST26-001", "Soba Mask", "Character", "Purple", 7, 9e3, 0, null, "Straw Hat Crew"],
  ["ST26-002", "Tony Tony.Chopper", "Character", "Purple", 3, 4e3, 1e3, null, "Animal Straw Hat Crew"],
  ["ST26-003", "Nico Robin", "Character", "Purple", 3, 4e3, 2e3, null, "Straw Hat Crew"],
  ["ST26-004", "General Franky", "Character", "Purple", 8, 1e4, 0, null, "Straw Hat Crew"],
  ["ST26-005", "Monkey.D.Luffy", "Character", "Purple", 6, 7e3, 0, null, "Straw Hat Crew"],
  ["OP05-065", "San-Gorou", "Character", "Purple", 6, 8e3, 1e3, null, "Straw Hat Crew"],
  ["OP05-066", "Jinbe", "Character", "Purple", 5, 6e3, 1e3, null, "Fish-Man Straw Hat Crew"],
  ["OP05-070", "Fra-Nosuke", "Character", "Purple", 5, 4e3, 2e3, null, "Straw Hat Crew"],
  ["OP09-063", "Usopp", "Character", "Purple", 4, 6e3, 1e3, null, "Straw Hat Crew"],
  ["OP09-070", "Nami", "Character", "Purple", 3, 2e3, 2e3, null, "Straw Hat Crew"],
  ["OP09-076", "Roronoa Zoro", "Character", "Purple", 3, 5e3, 0, null, "Straw Hat Crew"],
  ["OP09-077", "Gum-Gum Lightning", "Event", "Purple", 2, null, null, null, "Straw Hat Crew The Four Emperors"]
];
var FIXTURE_CARDS = ROWS.map(([code, name, type, colors, cost2, power2, counter, life, traits]) => ({
  code,
  name,
  type,
  colors: colors.split("/"),
  cost: cost2,
  power: power2,
  counter,
  life,
  traits,
  text: ""
}));
var DEFS = Object.fromEntries(FIXTURE_CARDS.map((c) => [c.code, buildDef(c)]));
var x4 = (codes) => codes.flatMap((c) => [c, c, c, c]);
var DECK_ST01 = {
  name: "\u010Cerven\xFD Luffy",
  leader: "ST01-001",
  cards: [
    ...x4(["ST01-002", "ST01-003", "ST01-004", "ST01-005", "ST01-006", "ST01-007", "ST01-008", "ST01-009", "ST01-010", "ST01-011", "ST01-012", "ST01-013"]),
    "ST01-014",
    "ST01-015"
  ]
};
var DECK_ST26 = {
  name: "Fialov\xFD Luffy",
  leader: "OP09-061",
  cards: x4(["ST26-001", "ST26-002", "ST26-003", "ST26-004", "ST26-005", "OP05-065", "OP05-066", "OP05-070", "OP09-063", "OP09-070", "OP09-076", "OP09-077"])
};

// supabase/functions/game/index.ts
var URL_ = Deno.env.get("SUPABASE_URL");
var SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
var ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "sb_publishable_E2xvBPHdCd4b76kzGJ89bw_8-5R4ee6";
var SITE = "https://grand-line-tracker-gilt.vercel.app";
var PRESETS = {
  st26: { ...DECK_ST26, name: "Starter: Fialov\xFD Luffy (ST-26)" },
  st01: { ...DECK_ST01, name: "Starter: \u010Cerven\xFD Luffy (ST-01)" }
};
var cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
var json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
var HttpError = class extends Error {
  constructor(status, msg) {
    super(msg);
    this.status = status;
  }
};
async function db(path, init = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE,
      ...SERVICE.startsWith("ey") ? { Authorization: `Bearer ${SERVICE}` } : {},
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...init.headers ?? {}
    }
  });
  const text = await r.text();
  if (!r.ok) throw new HttpError(500, `DB ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
var one = async (path) => (await db(path))[0] ?? null;
async function userOf(req) {
  const auth = req.headers.get("Authorization");
  if (!auth) throw new HttpError(401, "Nie si prihl\xE1sen\xFD.");
  const r = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: ANON, Authorization: auth } });
  if (!r.ok) throw new HttpError(401, "Nie si prihl\xE1sen\xFD.");
  const u = await r.json();
  const prof = await one(`profiles?id=eq.${u.id}&select=username`);
  return { id: u.id, name: prof?.username || (u.email ?? "hr\xE1\u010D").split("@")[0] };
}
async function deckOf(uid, d) {
  if (d?.preset && PRESETS[d.preset]) return PRESETS[d.preset];
  if (!d?.id || !/^[0-9a-f-]{36}$/.test(d.id)) throw new HttpError(400, "Vyber deck.");
  const row = await one(`decks?id=eq.${d.id}&user_id=eq.${uid}&select=name,leader_id,cards`);
  if (!row) throw new HttpError(404, "Deck sa nena\u0161iel.");
  const cards = Object.entries(row.cards ?? {}).flatMap(([c, n]) => Array(Math.max(0, Math.min(4, n | 0))).fill(c));
  if (!row.leader_id) throw new HttpError(400, "Deck nem\xE1 leadera.");
  if (cards.length < 40 || cards.length > 50) throw new HttpError(400, `Deck m\xE1 ${cards.length} kariet (treba 40\u201350).`);
  return { name: row.name, leader: row.leader_id, cards };
}
var cardCache = null;
async function defsFor(codes) {
  if (!cardCache || Date.now() - cardCache.at > 36e5) {
    const r = await fetch(`${SITE}/api/cards?v=4`);
    if (!r.ok) throw new HttpError(502, "Nepodarilo sa na\u010D\xEDta\u0165 datab\xE1zu kariet.");
    const data = await r.json();
    const m = /* @__PURE__ */ new Map();
    for (const c of data.cards) {
      const cur = m.get(c.code);
      if (!cur || cur.v && !c.v) m.set(c.code, c);
    }
    cardCache = { at: Date.now(), byCode: m };
  }
  const out = {};
  const missing = [];
  for (const code of new Set(codes)) {
    const c = cardCache.byCode.get(code);
    if (!c) missing.push(code);
    else out[code] = buildDef(c);
  }
  if (missing.length) throw new HttpError(400, `V datab\xE1ze ch\xFDbaj\xFA karty: ${missing.join(", ")}`);
  return out;
}
function randInt() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
}
function snapshot(g, s) {
  const seat = [g.host, g.guest];
  const actor = s.prompt ? s.prompt.p : s.active;
  const patch = { turn: s.turn, to_move: s.winner == null ? seat[actor] : null };
  if (s.winner != null) Object.assign(patch, { status: "done", winner: seat[s.winner], end_reason: g.end_reason ?? "game" });
  const views = [0, 1].map((p) => ({ player: seat[p], seat: p, view: viewFor(s, p) }));
  return { patch, views };
}
async function commit(id, version, patch, state, views) {
  const ok = await db("rpc/game_commit", {
    method: "POST",
    body: JSON.stringify({ p_id: id, p_version: version, p_patch: patch, p_state: state, p_views: views })
  });
  if (ok !== true) throw new HttpError(409, "Medzit\xFDm sa stav hry zmenil \u2013 sk\xFAs znova.");
}
async function handle(req) {
  const me = await userOf(req);
  const body = await req.json().catch(() => ({}));
  const op = body.op;
  if (op === "create") {
    const deck = await deckOf(me.id, body.deck);
    const open = await db(`games?host=eq.${me.id}&status=eq.open&select=id`);
    if (open.length >= 3) throw new HttpError(400, "M\xE1\u0161 u\u017E 3 otvoren\xE9 v\xFDzvy.");
    const [g2] = await db("games", {
      method: "POST",
      body: JSON.stringify({ host: me.id, host_name: me.name, host_leader: deck.leader, host_deck_name: deck.name, rated: body.rated !== false })
    });
    await db("game_private", { method: "POST", body: JSON.stringify({ game_id: g2.id, host_deck: deck }) });
    return { id: g2.id };
  }
  const id = String(body.id ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(400, "Ch\xFDba hra.");
  const g = await one(`games?id=eq.${id}&select=*`);
  if (!g) throw new HttpError(404, "Hra neexistuje.");
  if (op === "cancel") {
    if (g.host !== me.id || g.status !== "open") throw new HttpError(400, "V\xFDzvu u\u017E nejde zru\u0161i\u0165.");
    await commit(id, g.version, { status: "cancelled", end_reason: "cancel" }, null, []);
    return { ok: true };
  }
  if (op === "join") {
    if (g.status !== "open" || g.guest) throw new HttpError(400, "Do tejto hry sa u\u017E ned\xE1 prida\u0165.");
    if (g.host === me.id) throw new HttpError(400, "Nem\xF4\u017Ee\u0161 hra\u0165 s\xE1m proti sebe \u2013 po\u0161li v\xFDzvu kamo\u0161ovi.");
    const deck = await deckOf(me.id, body.deck);
    const priv2 = await one(`game_private?game_id=eq.${id}&select=host_deck`);
    const hd = priv2.host_deck;
    const defs = await defsFor([hd.leader, ...hd.cards, deck.leader, ...deck.cards]);
    const s2 = newGame(
      [
        { name: g.host_name, leader: hd.leader, cards: hd.cards },
        { name: me.name, leader: deck.leader, cards: deck.cards }
      ],
      defs,
      randInt() % 2147483646 + 1,
      randInt() % 2
    );
    const g2 = { ...g, guest: me.id };
    const { patch, views } = snapshot(g2, s2);
    Object.assign(patch, { status: "playing", guest: me.id, guest_name: me.name, guest_leader: deck.leader, guest_deck_name: deck.name, guest_deck: deck });
    await commit(id, g.version, patch, s2, views);
    return { ok: true };
  }
  const seat = g.host === me.id ? 0 : g.guest === me.id ? 1 : -1;
  if (seat === -1) throw new HttpError(403, "Nie si hr\xE1\u010Dom tejto hry.");
  if (g.status !== "playing") throw new HttpError(400, "Hra u\u017E skon\u010Dila.");
  const priv = await one(`game_private?game_id=eq.${id}&select=state`);
  let s = priv.state;
  if (op === "resign") {
    s = structuredClone(s);
    s.winner = 1 - seat;
    s.phase = "over";
    s.prompt = null;
    s.log.push({ t: "Info", msg: `${s.players[seat].name} sa vzdal.` });
    const { patch, views } = snapshot({ ...g, end_reason: "resign" }, s);
    await commit(id, g.version, patch, s, views);
    return { ok: true };
  }
  if (op === "act") {
    if (body.version != null && body.version !== g.version) throw new HttpError(409, "Medzit\xFDm sa stav hry zmenil \u2013 obnovujem.");
    const a = body.action;
    if (!a || typeof a !== "object" || a.p !== seat) throw new HttpError(400, "Teraz nie si na rade.");
    try {
      s = applyAction(s, a);
    } catch (e) {
      if (e instanceof IllegalAction) throw new HttpError(400, e.message);
      throw e;
    }
    const { patch, views } = snapshot(g, s);
    await commit(id, g.version, patch, s, views);
    return { ok: true, version: g.version + 1 };
  }
  throw new HttpError(400, "Nezn\xE1ma oper\xE1cia.");
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    return json(await handle(req));
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Chyba servera." }, 500);
  }
});
