// Test serverovej logiky online hry (lib/engine/server.ts) bez siete: falošný PostgREST + Auth, dvaja hráči odohrajú celé hry
// len z vlastných pohľadov (presne tak, ako to robí prehliadač).
import { beforeAll, describe, expect, it } from "vitest";
import { botAction } from "./bot";
import { FIXTURE_CARDS } from "./fixtures";
import type { Action, GameState } from "./types";

type Row = Record<string, any>;
const T: Record<string, Row[]> = { games: [], game_private: [], game_views: [], ratings: [], profiles: [], decks: [] };
const USERS: Record<string, { id: string; email: string }> = {
  ta: { id: "00000000-0000-4000-8000-00000000000a", email: "anna@x.sk" },
  tb: { id: "00000000-0000-4000-8000-00000000000b", email: "boris@x.sk" },
  tc: { id: "00000000-0000-4000-8000-00000000000c", email: "cyril@x.sk" },
};
T.profiles.push({ id: USERS.ta.id, username: "anna" }, { id: USERS.tb.id, username: "boris" });
let uuidN = 0;
const uuid = () => `11111111-1111-4111-8111-${String(++uuidN).padStart(12, "0")}`;

function commit(b: any) {
  const g = T.games.find((x) => x.id === b.p_id);
  if (!g || g.version !== b.p_version) return false;
  const was = g.status;
  const p = b.p_patch ?? {};
  for (const k of ["status", "guest", "guest_name", "guest_leader", "guest_deck_name", "turn", "winner", "end_reason"]) if (p[k] != null) g[k] = p[k];
  if ("to_move" in p) g.to_move = p.to_move;
  g.version++;
  const pr = T.game_private.find((x) => x.game_id === g.id);
  if (b.p_state) (pr.state = JSON.parse(JSON.stringify(b.p_state))), p.guest_deck && (pr.guest_deck = p.guest_deck);
  for (const v of b.p_views ?? []) {
    const cur = T.game_views.find((x) => x.game_id === g.id && x.player === v.player);
    const row = { game_id: g.id, player: v.player, seat: v.seat, version: g.version, view: JSON.parse(JSON.stringify(v.view)) };
    if (cur) Object.assign(cur, row);
    else T.game_views.push(row);
  }
  if (g.status === "done" && was !== "done" && g.rated && g.winner && g.guest) {
    const l = g.winner === g.host ? g.guest : g.host;
    for (const u of [g.winner, l]) if (!T.ratings.find((r) => r.user_id === u)) T.ratings.push({ user_id: u, elo: 1000, wins: 0, losses: 0, games: 0 });
    const W = T.ratings.find((r) => r.user_id === g.winner)!;
    const L = T.ratings.find((r) => r.user_id === l)!;
    const d = Math.max(1, Math.round(32 * (1 - 1 / (1 + 10 ** ((L.elo - W.elo) / 400)))));
    W.elo += d;
    W.wins++;
    W.games++;
    L.elo -= d;
    L.losses++;
    L.games++;
    g.elo_delta = d;
  }
  return true;
}

async function fakeFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(input);
  const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
  if (url.pathname === "/api/cards") return ok({ cards: FIXTURE_CARDS.map((c) => ({ ...c, v: "" })) });
  if (url.pathname === "/auth/v1/user") {
    const tok = String((init.headers as any)?.Authorization ?? "").replace("Bearer ", "");
    return USERS[tok] ? ok(USERS[tok]) : new Response("{}", { status: 401 });
  }
  const m = url.pathname.match(/^\/rest\/v1\/(.+)$/)!;
  const body = init.body ? JSON.parse(String(init.body)) : null;
  if (m[1] === "rpc/game_commit") return ok(commit(body));
  const rows = T[m[1]];
  if (init.method === "POST") {
    const r = m[1] === "games" ? { id: uuid(), status: "open", version: 0, turn: 0, rated: true, guest: null, ...body } : body;
    rows.push(r);
    return ok([r]);
  }
  const filters = [...url.searchParams.entries()].filter(([k]) => k !== "select");
  return ok(rows.filter((r) => filters.every(([k, v]) => String(r[k]) === v.replace(/^eq\./, ""))));
}

let handler: (r: Request) => Promise<Response>;
beforeAll(async () => {
  (globalThis as any).fetch = fakeFetch;
  const { createHandler } = await import("./server");
  handler = createHandler({ URL: "https://db.test", SERVICE: "eyService", ANON: "anon", SITE: "https://grand-line-tracker-gilt.vercel.app" });
});

async function call(tok: string | null, body: unknown) {
  const r = await handler(new Request("https://fn.test/game", { method: "POST", headers: tok ? { Authorization: `Bearer ${tok}` } : {}, body: JSON.stringify(body) }));
  return { status: r.status, ...(await r.json()) };
}
const viewOf = (gid: string, uid: string) => T.game_views.find((v) => v.game_id === gid && v.player === uid)!;

describe("edge function game", () => {
  it("bez prihlásenia nič", async () => {
    expect((await call(null, { op: "create", deck: { preset: "st26" } })).status).toBe(401);
  });

  it("výzva → pripojenie → celá hra iba z pohľadov hráčov → víťaz a ELO", async () => {
    for (let n = 0; n < 6; n++) {
      const { id } = await call("ta", { op: "create", deck: { preset: n % 2 ? "st01" : "st26" } });
      expect((await call("ta", { op: "join", id, deck: { preset: "st01" } })).status).toBe(400); // sám so sebou
      expect((await call("tb", { op: "join", id, deck: { preset: "st26" } })).status).toBe(200);
      expect((await call("tc", { op: "join", id, deck: { preset: "st26" } })).status).toBe(400); // už plná
      const g = T.games.find((x) => x.id === id)!;
      expect(g.status).toBe("playing");
      const seats = { [USERS.ta.id]: "ta", [USERS.tb.id]: "tb" };
      let steps = 0;
      while (g.status === "playing" && steps++ < 4000) {
        const uid = g.to_move as string;
        const v = viewOf(id, uid);
        const view = v.view as GameState;
        // skryté karty: súperova ruka a všetky balíčky/Life nie sú v pohľade
        const opp = view.players[1 - v.seat];
        expect(opp.hand.every((x) => x === "hidden")).toBe(true);
        expect(view.seed).toBe(0);
        let a: Action | null = botAction(view, v.seat);
        if (!a) a = { type: "endTurn", p: v.seat };
        const res = await call(seats[uid], { op: "act", id, action: a, version: v.version });
        if (res.status !== 200) {
          // bot v pohľade navrhol nelegálny ťah → ukonči ťah (rovnako ako UI)
          expect(res.status).toBe(400);
          const r2 = await call(seats[uid], { op: "act", id, action: { type: "endTurn", p: v.seat }, version: v.version });
          expect(r2.status).toBe(200);
        }
      }
      expect(g.status).toBe("done");
      expect([USERS.ta.id, USERS.tb.id]).toContain(g.winner);
      expect(g.elo_delta).toBeGreaterThan(0);
    }
    const ra = T.ratings.find((r) => r.user_id === USERS.ta.id)!;
    const rb = T.ratings.find((r) => r.user_id === USERS.tb.id)!;
    expect(ra.games).toBe(6);
    expect(ra.elo + rb.elo).toBe(2000);
  }, 120000);

  it("cudzí hráč, ťah za súpera a starý stav sú odmietnuté; vzdanie dá výhru súperovi", async () => {
    const { id } = await call("ta", { op: "create", deck: { preset: "st26" } });
    await call("tb", { op: "join", id, deck: { preset: "st01" } });
    const g = T.games.find((x) => x.id === id)!;
    const mover = g.to_move === USERS.ta.id ? "ta" : "tb";
    const waiter = mover === "ta" ? "tb" : "ta";
    const v = viewOf(id, USERS[mover].id);
    const wv = viewOf(id, USERS[waiter].id);
    expect((await call("tc", { op: "act", id, action: { type: "answer", p: v.seat, choice: { yes: false } } })).status).toBe(403);
    expect((await call(waiter, { op: "act", id, action: { type: "answer", p: v.seat, choice: { yes: false } } })).status).toBe(400);
    expect((await call(waiter, { op: "act", id, action: { type: "answer", p: wv.seat, choice: { yes: false } } })).status).toBe(400);
    expect((await call(mover, { op: "act", id, action: { type: "answer", p: v.seat, choice: { yes: false } }, version: v.version - 1 })).status).toBe(409);
    expect((await call(mover, { op: "act", id, action: { type: "answer", p: v.seat, choice: { yes: false } }, version: v.version })).status).toBe(200);
    expect((await call(waiter, { op: "resign", id })).status).toBe(200);
    expect(g.status).toBe("done");
    expect(g.winner).toBe(USERS[mover].id);
    expect(g.end_reason).toBe("resign");
    expect((await call(mover, { op: "act", id, action: { type: "endTurn", p: v.seat } })).status).toBe(400);
  });

  it("šachové hodiny: čas sa odpočítava hráčovi na rade, po 20 min prehráva", async () => {
    const { id } = await call("ta", { op: "create", deck: { preset: "st26" } });
    await call("tb", { op: "join", id, deck: { preset: "st01" } });
    const g = T.games.find((x) => x.id === id)!;
    const pr = T.game_private.find((x) => x.game_id === id)!;
    expect(pr.state.clock.ms).toEqual([20 * 60_000, 20 * 60_000]);
    const mover = g.to_move === USERS.ta.id ? "ta" : "tb";
    const waiter = mover === "ta" ? "tb" : "ta";
    const v = viewOf(id, USERS[mover].id);
    expect(v.view.clock).toBeTruthy(); // hodiny vidia obaja hráči
    // hráč na rade premýšľal 5 minút
    pr.state.clock.at -= 5 * 60_000;
    expect((await call(mover, { op: "act", id, action: { type: "answer", p: v.seat, choice: { yes: false } }, version: g.version })).status).toBe(200);
    const left = pr.state.clock.ms[v.seat];
    expect(left).toBeLessThanOrEqual(15 * 60_000 + 50);
    expect(left).toBeGreaterThan(15 * 60_000 - 2000);
    expect(pr.state.clock.ms[1 - v.seat]).toBe(20 * 60_000);
    // predčasná žiadosť o koniec na čas nič nespraví
    expect((await call(waiter, { op: "timeout", id })).ok).toBe(false);
    expect(g.status).toBe("playing");
    // hráčovi na rade vyprší čas
    const actor = pr.state.prompt ? pr.state.prompt.p : pr.state.active;
    pr.state.clock.at -= pr.state.clock.ms[actor] + 1000;
    expect((await call(waiter, { op: "timeout", id })).ok).toBe(true);
    expect(g.status).toBe("done");
    expect(g.end_reason).toBe("time");
    expect(g.winner).not.toBe(actor === 0 ? g.host : g.guest);
  });

  it("zrušenie výzvy len hostiteľom a max 3 otvorené výzvy", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await call("tb", { op: "create", deck: { preset: "st01" } })).id);
    expect((await call("tb", { op: "create", deck: { preset: "st01" } })).status).toBe(400);
    expect((await call("ta", { op: "cancel", id: ids[0] })).status).toBe(400);
    expect((await call("tb", { op: "cancel", id: ids[0] })).status).toBe(200);
    expect(T.games.find((x) => x.id === ids[0])!.status).toBe("cancelled");
  });
});
