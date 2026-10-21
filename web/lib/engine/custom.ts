// Efekty, ktoré sa nedajú pekne poskladať z DSL kociek. Každý handler sa správa ako krok:
// vráti true (hotovo) alebo false (čaká na odpoveď hráča – nastaví prompt a f.sub).
import type { EffectCtx, Frame } from "./engine";
import { addMod, cost, def, draw, fieldOf, hasKw, info, other, pl, power } from "./engine";
import type { GameState } from "./types";

type Handler = { run: (s: GameState, f: Frame, arg?: any) => boolean; canPay?: (s: GameState, c: EffectCtx, arg?: any) => boolean };

const activeField = (s: GameState, p: 0 | 1) => fieldOf(s, p).filter((i) => !s.cards[i].rested);

export const CUSTOM: Record<string, Handler> = {
  // OP13-001 Luffy: daj do rest ľubovoľný počet DON!!, za každý +2000 leaderovi alebo 1 postave Straw Hat Crew
  restAnyDonForPower: {
    run(s, f, arg) {
      const p = f.controller;
      const x = pl(s, p);
      if (f.sub?.phase === "target" && f.sub.done) {
        const n = f.sub.n as number;
        const t = f.sub.pick?.[0];
        x.donActive -= n;
        x.donRested += n;
        if (t) addMod(s, { target: t, kind: "power", amount: n * (arg?.per ?? 2000), until: "battle", owner: p });
        f.sub = undefined;
        return true;
      }
      if (f.sub?.phase === "n" && f.sub.done) {
        const n = f.sub.option as number;
        if (!n) return (f.sub = undefined), true;
        const opts = [x.leader, ...x.characters.filter((i) => def(s, i).traits.includes("Straw Hat Crew"))];
        s.prompt = { kind: "choose", p, label: `+${n * 2000} power počas súboja – komu?`, options: opts, min: 1, max: 1, zone: "leaderOrCharacters" };
        f.sub = { phase: "target", n, awaiting: true };
        return false;
      }
      const max = x.donActive;
      if (!max) return true;
      s.prompt = { kind: "oneOf", p, label: "Koľko DON!! dáš do rest? (každý = +2000)", options: Array.from({ length: max + 1 }, (_, i) => `${i} DON!!`) };
      f.sub = { phase: "n", awaiting: true };
      return false;
    },
  },

  // „rest N of your cards“ – DON!! alebo karty na poli
  restCards: {
    canPay: (s, c, n = 1) => pl(s, c.p).donActive + activeField(s, c.p).length >= n,
    run(s, f, n = 1) {
      const p = f.controller;
      const x = pl(s, p);
      if (f.sub?.done) {
        for (const i of f.sub.pick) s.cards[i].rested = true;
        const rest = n - f.sub.pick.length;
        const k = Math.min(rest, x.donActive);
        x.donActive -= k;
        x.donRested += k;
        f.sub = undefined;
        return true;
      }
      const cards = activeField(s, p);
      if (!cards.length || x.donActive >= n) {
        // najčastejšie sa platí DON!!-mi – ak ich je dosť, nepýtame sa
        if (x.donActive >= n) {
          x.donActive -= n;
          x.donRested += n;
          return true;
        }
      }
      const minCards = Math.max(0, n - x.donActive);
      s.prompt = { kind: "choose", p, label: `Daj do rest ${n} kariet (zvyšok zaplatia DON!!)`, options: cards, min: minCards, max: Math.min(n, cards.length), zone: "field" };
      f.sub = { awaiting: true };
      return false;
    },
  },

  // „Rest up to a total of N of your opponent's Characters or DON!! cards“ / „Rest up to 1 of your opponent's cards“
  restOppCardsOrDon: {
    run(s, f, arg) {
      const p = f.controller;
      const o = pl(s, other(p));
      const max = arg?.max ?? 1;
      if (f.sub?.done) {
        for (const i of f.sub.pick) s.cards[i].rested = true;
        const k = Math.min(max - f.sub.pick.length, o.donActive);
        o.donActive -= k;
        o.donRested += k;
        if (k) info(s, `${o.name}: ${k} DON!! do rest.`);
        f.sub = undefined;
        return true;
      }
      const opts = (arg?.chars ? o.characters : fieldOf(s, other(p)))
        .filter((i) => !s.cards[i].rested)
        .filter((i) => arg?.maxCost == null || (def(s, i).type === "Character" && cost(s, i) <= arg.maxCost));
      if (!opts.length) {
        const k = Math.min(max, o.donActive);
        o.donActive -= k;
        o.donRested += k;
        return true;
      }
      s.prompt = { kind: "choose", p, label: `Vyber až ${max} súperových kariet do rest (nevybraté miesta = súperove DON!!)`, options: opts, min: 0, max: Math.min(max, opts.length), zone: "field" };
      f.sub = { awaiting: true };
      return false;
    },
  },

  // OP16-080 Teach: zmeň cieľ útoku na tohto leadera alebo postavu {Blackbeard Pirates}
  changeTarget: {
    run(s, f) {
      const p = f.controller;
      if (!s.battle) return true;
      if (f.sub?.done) {
        if (f.sub.pick[0]) {
          s.battle.target = f.sub.pick[0];
          info(s, `Cieľ útoku zmenený na ${def(s, f.sub.pick[0]).name}.`);
        }
        f.sub = undefined;
        return true;
      }
      const x = pl(s, p);
      const opts = [x.leader, ...x.characters.filter((i) => def(s, i).traits.includes("Blackbeard Pirates"))].filter((i) => i !== s.battle!.target);
      if (!opts.length) return true;
      s.prompt = { kind: "choose", p, label: "Nový cieľ útoku", options: opts, min: 1, max: 1, zone: "leaderOrCharacters" };
      f.sub = { awaiting: true };
      return false;
    },
  },

  // OP17-039 Xebec: odhaľ vrch balíčka; ak má typ „Rocks Pirates“, potiahni 2
  xebecReveal: {
    run(s, f) {
      const x = pl(s, f.controller);
      const top = x.deck[0];
      if (!top) return true;
      const d = def(s, top);
      info(s, `Odhalená karta: ${d.name}`);
      if (d.traitText.toLowerCase().includes("rocks pirates")) draw(s, f.controller, 2);
      return true;
    },
  },

  // OP15-119 Luffy: odhaľ vrch Life, +1000 power za každý cost
  revealLifeTopPower: {
    run(s, f) {
      const x = pl(s, f.controller);
      const top = x.life[0];
      if (!top) return true;
      const d = def(s, top);
      info(s, `Odhalená Life karta: ${d.name} (cost ${d.cost})`);
      if (d.cost) addMod(s, { target: f.source, kind: "power", amount: d.cost * 1000, until: "turn", owner: f.controller });
      return true;
    },
  },

  lookOppLife: {
    run(s, f) {
      info(s, `${pl(s, f.controller).name} sa pozrel na súperove Life karty.`);
      return true;
    },
  },

  // „place N cards from your trash at the bottom of your deck“
  trashToDeckBottom: {
    canPay: (s, c, n = 3) => pl(s, c.p).trash.length >= n,
    run(s, f, n = 3) {
      const x = pl(s, f.controller);
      if (f.sub?.done) {
        for (const i of f.sub.pick) {
          x.trash = x.trash.filter((t) => t !== i);
          x.deck.push(i);
        }
        f.sub = undefined;
        return true;
      }
      s.prompt = { kind: "choose", p: f.controller, label: `Vyber ${n} karty z trashu – pôjdu pod balíček`, options: [...x.trash], min: n, max: n, zone: "trash" };
      f.sub = { awaiting: true };
      return false;
    },
  },

  // OP15-008 Krieg: všetkým súperovým postavám −1000 za každý DON!! na označenej postave
  kriegPower: {
    run(s, f) {
      const marked = s.mods.find((m) => m.kind === "flag" && m.flag === "marked" && m.owner === f.controller);
      const n = marked && s.cards[marked.target] ? s.cards[marked.target].don : 0;
      if (!n) return true;
      for (const i of pl(s, other(f.controller)).characters)
        addMod(s, { target: i, kind: "power", amount: -1000 * n, until: "turn", owner: f.controller });
      return true;
    },
  },

  // ST32-001 Kin'emon: daj do rest leadera alebo 1 DON!!
  restLeaderOrDon: {
    canPay: (s, c) => pl(s, c.p).donActive > 0 || !s.cards[pl(s, c.p).leader].rested,
    run(s, f) {
      const x = pl(s, f.controller);
      if (f.sub?.done) {
        if (f.sub.option === 0) s.cards[x.leader].rested = true;
        else (x.donActive--, x.donRested++);
        f.sub = undefined;
        return true;
      }
      const L = !s.cards[x.leader].rested;
      if (!L) return (x.donActive--, x.donRested++), true;
      if (!x.donActive) return (s.cards[x.leader].rested = true), true;
      s.prompt = { kind: "oneOf", p: f.controller, label: "Čo dáš do rest?", options: ["Leadera", "1 DON!!"] };
      f.sub = { awaiting: true };
      return false;
    },
  },

  // EB02-030: tento ťah: ak by tvoja postava bola K.O. v súboji, môžeš vyhodiť 1 kartu z ruky namiesto toho
  battleSaveThisTurn: {
    run(s, f) {
      for (const i of pl(s, f.controller).characters)
        addMod(s, { target: i, kind: "flag", amount: 0, flag: "battleSaveDiscard", until: "turn", owner: f.controller });
      return true;
    },
  },
};

void hasKw;
void power;
