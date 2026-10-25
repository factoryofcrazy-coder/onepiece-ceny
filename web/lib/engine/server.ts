// Serverová logika online hry. Beží v Supabase Edge Function „game“, ktorá tento modul načíta
// z webu (/engine/server.js) – engine a skripty kariet sa tak nasadzujú spolu s webom.
import { buildDef } from "./cards";
import { applyAction, IllegalAction, newGame, viewFor } from "./engine";
import { DECK_ST01, DECK_ST26 } from "./fixtures";
import type { Action, CardDef, GameState, P } from "./types";

export const VERSION = "2026-10-25-clock";

/** každý hráč má na celú online hru 20 minút; čas plynie tomu, kto má práve konať (ťah, counter, voľba) */
export const CLOCK_MS = 20 * 60 * 1000;

/** kto má teraz konať a koľko mu zostáva (ms) – aj bez zápisu, pre klienta aj server */
export function clockNow(s: GameState, now = Date.now()): { actor: P; left: number; ms: [number, number] } | null {
  if (!s.clock || s.winner != null) return null;
  const actor: P = s.prompt ? s.prompt.p : s.active;
  const ms: [number, number] = [s.clock.ms[0], s.clock.ms[1]];
  ms[actor] = Math.max(0, ms[actor] - Math.max(0, now - s.clock.at));
  return { actor, left: ms[actor], ms };
}

export type Env = { URL: string; SERVICE: string; ANON: string; SITE: string };

const PRESETS: Record<string, { name: string; leader: string; cards: string[] }> = {
  st26: { ...DECK_ST26, name: "Starter: Fialový Luffy (ST-26)" },
  st01: { ...DECK_ST01, name: "Starter: Červený Luffy (ST-01)" },
};

export function createHandler(env: Env) {
  const URL_ = env.URL;
  const SERVICE = env.SERVICE;
  const ANON = env.ANON;
  const SITE = env.SITE;
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  class HttpError extends Error {
    constructor(public status: number, msg: string) {
      super(msg);
    }
  }

  async function db(path: string, init: RequestInit = {}) {
    const r = await fetch(`${URL_}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: SERVICE,
        ...(SERVICE.startsWith("ey") ? { Authorization: `Bearer ${SERVICE}` } : {}),
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...(init.headers ?? {}),
      },
    });
    const text = await r.text();
    if (!r.ok) throw new HttpError(500, `DB ${r.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }
  const one = async (path: string) => ((await db(path)) as any[])[0] ?? null;

  async function userOf(req: Request): Promise<{ id: string; name: string }> {
    const auth = req.headers.get("Authorization");
    if (!auth) throw new HttpError(401, "Nie si prihlásený.");
    const r = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: ANON, Authorization: auth } });
    if (!r.ok) throw new HttpError(401, "Nie si prihlásený.");
    const u = await r.json();
    const prof = await one(`profiles?id=eq.${u.id}&select=username`);
    return { id: u.id, name: prof?.username || (u.email ?? "hráč").split("@")[0] };
  }

  type Deck = { name: string; leader: string; cards: string[] };
  async function deckOf(uid: string, d: { preset?: string; id?: string; meta?: string }): Promise<Deck> {
    if (d?.preset && PRESETS[d.preset]) return PRESETS[d.preset];
    if (d?.meta) {
      const m = (await metaDecks()).find((x: any) => metaId(x) === d.meta);
      if (!m) throw new HttpError(404, "Turnajový deck sa nenašiel (rebríček sa mohol obnoviť).");
      const cards = Object.entries(m.cards as Record<string, number>).flatMap(([c, n]) => Array(n).fill(c));
      return { name: `${m.leaderName} – ${m.player} (#${m.placing})`, leader: m.leader, cards };
    }
    if (!d?.id || !/^[0-9a-f-]{36}$/.test(d.id)) throw new HttpError(400, "Vyber deck.");
    const row = await one(`decks?id=eq.${d.id}&user_id=eq.${uid}&select=name,leader_id,cards`);
    if (!row) throw new HttpError(404, "Deck sa nenašiel.");
    const cards = Object.entries((row.cards ?? {}) as Record<string, number>).flatMap(([c, n]) => Array(Math.max(0, Math.min(4, n | 0))).fill(c));
    if (!row.leader_id) throw new HttpError(400, "Deck nemá leadera.");
    if (cards.length < 40 || cards.length > 50) throw new HttpError(400, `Deck má ${cards.length} kariet (treba 40–50).`);
    return { name: row.name, leader: row.leader_id, cards };
  }

  let cardCache: { at: number; byCode: Map<string, any> } | null = null;
  let metaCache: { at: number; decks: any[] } | null = null;
  async function metaDecks(): Promise<any[]> {
    if (!metaCache || Date.now() - metaCache.at > 3600_000) {
      const r = await fetch(`${SITE}/api/meta`);
      if (!r.ok) throw new HttpError(502, "Nepodarilo sa načítať turnajové decky.");
      metaCache = { at: Date.now(), decks: (await r.json()).decks ?? [] };
    }
    return metaCache.decks;
  }
  async function defsFor(codes: string[]): Promise<Record<string, CardDef>> {
    if (!cardCache || Date.now() - cardCache.at > 3600_000) {
      const r = await fetch(`${SITE}/api/cards?v=4`);
      if (!r.ok) throw new HttpError(502, "Nepodarilo sa načítať databázu kariet.");
      const data = await r.json();
      const m = new Map<string, any>();
      for (const c of data.cards) {
        const cur = m.get(c.code);
        if (!cur || (cur.v && !c.v)) m.set(c.code, c);
      }
      cardCache = { at: Date.now(), byCode: m };
    }
    const out: Record<string, CardDef> = {};
    const missing: string[] = [];
    for (const code of new Set(codes)) {
      const c = cardCache.byCode.get(code);
      if (!c) missing.push(code);
      else out[code] = buildDef(c);
    }
    if (missing.length) throw new HttpError(400, `V databáze chýbajú karty: ${missing.join(", ")}`);
    return out;
  }

  function randInt() {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0];
  }

  /** pohľady oboch hráčov + metadáta pre zoznam hier */
  function snapshot(g: any, s: GameState) {
    const seat = [g.host, g.guest];
    const actor: P = s.prompt ? s.prompt.p : s.active;
    const patch: Record<string, unknown> = { turn: s.turn, to_move: s.winner == null ? seat[actor] : null };
    if (s.winner != null) Object.assign(patch, { status: "done", winner: seat[s.winner], end_reason: g.end_reason ?? "game" });
    const views = [0, 1].map((p) => ({ player: seat[p], seat: p, view: viewFor(s, p as P) }));
    return { patch, views };
  }

  async function commit(id: string, version: number, patch: unknown, state: unknown, views: unknown) {
    const ok = await db("rpc/game_commit", {
      method: "POST",
      body: JSON.stringify({ p_id: id, p_version: version, p_patch: patch, p_state: state, p_views: views }),
    });
    if (ok !== true) throw new HttpError(409, "Medzitým sa stav hry zmenil – skús znova.");
  }

  async function handle(req: Request) {
    const body = await req.json().catch(() => ({}));
    const op = body.op as string;
    if (op === "health") {
      const s = newGame([PRESETS.st26, PRESETS.st01], Object.fromEntries([] as [string, CardDef][]), 1, 0);
      return { ok: true, version: VERSION, cards: Object.keys(s.cards).length };
    }
    const me = await userOf(req);

    if (op === "create") {
      const deck = await deckOf(me.id, body.deck);
      const open = await db(`games?host=eq.${me.id}&status=eq.open&select=id`);
      if (open.length >= 3) throw new HttpError(400, "Máš už 3 otvorené výzvy.");
      const [g] = await db("games", {
        method: "POST",
        body: JSON.stringify({ host: me.id, host_name: me.name, host_leader: deck.leader, host_deck_name: deck.name, rated: body.rated !== false }),
      });
      await db("game_private", { method: "POST", body: JSON.stringify({ game_id: g.id, host_deck: deck }) });
      return { id: g.id };
    }

    const id = String(body.id ?? "");
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(400, "Chýba hra.");
    const g = await one(`games?id=eq.${id}&select=*`);
    if (!g) throw new HttpError(404, "Hra neexistuje.");

    if (op === "cancel") {
      if (g.host !== me.id || g.status !== "open") throw new HttpError(400, "Výzvu už nejde zrušiť.");
      await commit(id, g.version, { status: "cancelled", end_reason: "cancel" }, null, []);
      return { ok: true };
    }

    if (op === "join") {
      if (g.status !== "open" || g.guest) throw new HttpError(400, "Do tejto hry sa už nedá pridať.");
      if (g.host === me.id) throw new HttpError(400, "Nemôžeš hrať sám proti sebe – pošli výzvu kamošovi.");
      const deck = await deckOf(me.id, body.deck);
      const priv = await one(`game_private?game_id=eq.${id}&select=host_deck`);
      const hd = priv.host_deck as Deck;
      const defs = await defsFor([hd.leader, ...hd.cards, deck.leader, ...deck.cards]);
      const s = newGame(
        [
          { name: g.host_name, leader: hd.leader, cards: hd.cards },
          { name: me.name, leader: deck.leader, cards: deck.cards },
        ],
        defs,
        randInt() % 2147483646 + 1,
        (randInt() % 2) as P,
      );
      s.clock = { ms: [CLOCK_MS, CLOCK_MS], at: Date.now() };
      const g2 = { ...g, guest: me.id };
      const { patch, views } = snapshot(g2, s);
      Object.assign(patch, { status: "playing", guest: me.id, guest_name: me.name, guest_leader: deck.leader, guest_deck_name: deck.name, guest_deck: deck });
      await commit(id, g.version, patch, s, views);
      return { ok: true };
    }

    const seat: P | -1 = g.host === me.id ? 0 : g.guest === me.id ? 1 : -1;
    if (seat === -1) throw new HttpError(403, "Nie si hráčom tejto hry.");
    if (g.status !== "playing") throw new HttpError(400, "Hra už skončila.");
    const priv = await one(`game_private?game_id=eq.${id}&select=state`);
    let s = priv.state as GameState;

    /** hráčovi na rade vypršal čas → prehráva */
    const timeUp = async (actor: P) => {
      s = structuredClone(s);
      s.clock = { ms: clockNow(s)!.ms, at: Date.now() };
      s.winner = (1 - actor) as P;
      s.phase = "over";
      s.prompt = null;
      s.log.push({ t: "Info", msg: `${s.players[actor].name}: vypršal čas – prehráva.` });
      const { patch, views } = snapshot({ ...g, end_reason: "time" }, s);
      await commit(id, g.version, patch, s, views);
    };

    if (op === "timeout") {
      const c = clockNow(s);
      if (!c || c.left > 0) return { ok: false, left: c?.left ?? null };
      await timeUp(c.actor);
      return { ok: true };
    }

    if (op === "resign") {
      s = structuredClone(s);
      s.winner = (1 - seat) as P;
      s.phase = "over";
      s.prompt = null;
      s.log.push({ t: "Info", msg: `${s.players[seat].name} sa vzdal.` });
      const { patch, views } = snapshot({ ...g, end_reason: "resign" }, s);
      await commit(id, g.version, patch, s, views);
      return { ok: true };
    }

    if (op === "act") {
      if (body.version != null && body.version !== g.version) throw new HttpError(409, "Medzitým sa stav hry zmenil – obnovujem.");
      const a = body.action as Action;
      if (!a || typeof a !== "object" || a.p !== seat) throw new HttpError(400, "Teraz nie si na rade.");
      const c = clockNow(s);
      if (c && c.left <= 0) {
        await timeUp(c.actor);
        return { ok: true, timeout: true, version: g.version + 1 };
      }
      try {
        s = applyAction(s, a);
        if (c) s.clock = { ms: c.ms, at: Date.now() };
      } catch (e) {
        if (e instanceof IllegalAction) throw new HttpError(400, e.message);
        throw e;
      }
      const { patch, views } = snapshot(g, s);
      await commit(id, g.version, patch, s, views);
      return { ok: true, version: g.version + 1 };
    }

    throw new HttpError(400, "Neznáma operácia.");
  }


  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    try {
      return json(await handle(req));
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "Chyba servera." }, 500);
    }
  };
}

/** Stabilné ID turnajového decku (rovnaké na webe aj na serveri). */
export function metaId(d: { tournamentId?: string; tournament?: string; placing: number; leader: string; player: string }) {
  return `${d.tournamentId ?? d.tournament}:${d.placing}:${d.leader}:${d.player}`;
}
