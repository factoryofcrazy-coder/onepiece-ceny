// Integračný test: skutočná migrácia v Postgrese (PGlite) a funkcia volaná tak ako z prehliadača.
import { PGlite } from "@electric-sql/pglite";
import { createDecipheriv, createECDH, hkdfSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanText, createDmHandler, normalize, snippet } from "./server";

const KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [ANNA, BORIS, CYRIL, ADMIN, NEW] = [1, 2, 3, 4, 5].map(id);
let db: PGlite;
let notified: any[] = [];
let n = 1000;
const uuid = () => id(++n);

const rpc = async (fn: string, args: Record<string, unknown>) => {
  const names = Object.keys(args);
  await db.exec("set role service_role");
  try {
    const sql = `select public.${fn}(${names.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`;
    const out = await db.query<{ r: any }>(sql, names.map((k) => args[k]));
    return out.rows[0].r;
  } finally {
    await db.exec("reset role");
  }
};

const handler = () =>
  createDmHandler(
    { URL: "", SERVICE: "", ANON: "", DM_KEYS: `1:${KEY}` },
    { rpc, authUser: async (a) => (a.startsWith("Bearer ") ? a.slice(7) : null), notify: async (x) => void notified.push(x) },
  );
const call = async (who: string | null, op: string, extra: Record<string, unknown> = {}) => {
  const r = await handler()(new Request("http://x/", { method: "POST", headers: who ? { Authorization: `Bearer ${who}` } : {}, body: JSON.stringify({ op, ...extra }) }));
  return { status: r.status, ...(await r.json()) } as { status: number; data: any; error: string };
};
const ok = async (who: string, op: string, extra: Record<string, unknown> = {}) => {
  const r = await call(who, op, extra);
  if (r.error) throw new Error(`${op}: ${r.error}`);
  return r.data;
};
const openConv = async (a: string, b: string) => (await ok(a, "open", { userId: b })).id as string;
const send = (a: string, conv: string, text: string, extra = {}) => ok(a, "send", { id: uuid(), conversationId: conv, text, ...extra });
const accepted = async (a = ANNA, b = BORIS) => {
  const c = await openConv(a, b);
  await send(a, c, "ahoj");
  await send(b, c, "čau");
  return c;
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema realtime;
    grant usage on schema auth, realtime, public to anon, authenticated, service_role;
    create table auth.users (id uuid primary key, created_at timestamptz not null default now() - interval '30 days');
    grant select on auth.users to service_role;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table realtime.messages (topic text, extension text); alter table realtime.messages enable row level security;
    create function realtime.topic() returns text language sql stable as $$ select current_setting('test.topic', true) $$;
    create publication supabase_realtime;
    create table public.profiles (id uuid primary key references auth.users on delete cascade, username text);
    create table public.admins (user_id uuid primary key);
    create table public.chat_bans (user_id uuid primary key);
    create table public.trade_listings (id uuid primary key, user_id uuid, card_id text, kind text, price numeric, cond text, lang text);
    grant select on public.profiles, public.admins, public.chat_bans, public.trade_listings to service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
  `);
  await db.exec(readFileSync("supabase/migrations/20261111_direct_messages.sql", "utf8"));
}, 60000);

beforeEach(async () => {
  notified = [];
  await db.exec(`
    truncate public.dm_reports, public.dm_blocks, public.dm_messages, public.dm_members, public.dm_conversations cascade;
    delete from public.chat_bans; delete from public.admins; delete from public.trade_listings; delete from public.profiles; delete from auth.users;
    insert into auth.users (id) values ('${ANNA}'), ('${BORIS}'), ('${CYRIL}'), ('${ADMIN}');
    insert into auth.users (id, created_at) values ('${NEW}', now());
    insert into public.profiles values ('${ANNA}', 'Anna'), ('${BORIS}', 'Boris'), ('${CYRIL}', 'Cyril'), ('${ADMIN}', 'Admin'), ('${NEW}', 'Nováčik');
    insert into public.admins values ('${ADMIN}');
  `);
});

describe("prístup a šifrovanie", () => {
  it("bez prihlásenia odmietne každú operáciu", async () => {
    expect((await call(null, "list")).status).toBe(401);
    expect((await call(null, "send", { id: uuid(), conversationId: id(9), text: "x" })).status).toBe(401);
  });
  it("odmietne neznámu operáciu aj názov z prototypu", async () => {
    expect((await call(ANNA, "drop")).status).toBe(400);
    expect((await call(ANNA, "constructor")).status).toBe(400);
  });
  it("v databáze je len šifra, príjemca dostane text", async () => {
    const c = await openConv(ANNA, BORIS);
    await send(ANNA, c, "tajná cena 42 eur");
    const row = (await db.query<any>("select ciphertext from public.dm_messages")).rows[0];
    expect(JSON.stringify(row)).not.toContain("tajná");
    expect(atob(row.ciphertext)).not.toContain("tajná");
    expect((await ok(BORIS, "history", { conversationId: c }))[0].body.text).toBe("tajná cena 42 eur");
  });
  it("správa presunutá v databáze do inej konverzácie sa nedá prečítať", async () => {
    const c = await accepted();
    const other = await accepted(ANNA, CYRIL);
    await db.exec(`update public.dm_messages set conversation_id = '${other}' where conversation_id = '${c}'`);
    const list = await ok(ANNA, "history", { conversationId: other });
    expect(list.filter((m: any) => m.unreadable)).toHaveLength(2);
    expect(list.filter((m: any) => !m.unreadable)).toHaveLength(2);
  });
  it("cudzí hráč nevidí históriu, neodošle, neprečíta ani nenahlási", async () => {
    const c = await accepted();
    const m = (await ok(ANNA, "history", { conversationId: c }))[0];
    expect((await call(CYRIL, "history", { conversationId: c })).error).toBe("Konverzácia sa nenašla.");
    expect((await call(CYRIL, "send", { id: uuid(), conversationId: c, text: "x" })).error).toBe("Konverzácia sa nenašla.");
    expect((await call(CYRIL, "read", { conversationId: c })).error).toBe("Konverzácia sa nenašla.");
    expect((await call(CYRIL, "report", { messageId: m.id })).error).toBe("Správu sa nepodarilo nahlásiť.");
    expect(await ok(CYRIL, "list")).toEqual([]);
  });
  it("použité id cudzej správy sa nedá prepísať, opakované odoslanie je bezpečné", async () => {
    const c = await accepted();
    const mine = await send(ANNA, c, "prvá");
    const count = async () => Number((await db.query<any>("select count(*) c from public.dm_messages")).rows[0].c);
    const before = await count();
    await ok(ANNA, "send", { id: mine.id, conversationId: c, text: "prvá" });
    expect(await count()).toBe(before);
    expect((await call(BORIS, "send", { id: mine.id, conversationId: c, text: "podvrh" })).error).toBe("Správu sa nepodarilo odoslať.");
    expect((await ok(BORIS, "history", { conversationId: c }))[0].body.text).toBe("prvá");
  });
  it("kontroluje vstup", async () => {
    const c = await openConv(ANNA, BORIS);
    expect((await call(ANNA, "send", { id: "zle", conversationId: c, text: "x" })).status).toBe(400);
    expect((await call(ANNA, "send", { id: uuid(), conversationId: c, text: "   " })).error).toBe("Správa je prázdna.");
    expect((await call(ANNA, "send", { id: uuid(), conversationId: c, text: "x".repeat(1001) })).status).toBe(400);
    expect((await call(ANNA, "send", { id: uuid(), conversationId: c, text: 5 })).status).toBe(400);
    expect((await call(ANNA, "send", { id: uuid(), conversationId: c, cardId: "<script>" })).error).toBe("Neplatná karta.");
    expect((await call(ANNA, "history", { conversationId: c, before: "včera" })).status).toBe(400);
    const r = await handler()(new Request("http://x/", { method: "POST", headers: { Authorization: `Bearer ${ANNA}` }, body: "x".repeat(20000) }));
    expect(r.status).toBe(413);
  });
  it("interná chyba neprezradí detail", async () => {
    const broken = createDmHandler({ URL: "", SERVICE: "", ANON: "", DM_KEYS: `1:${KEY}` }, { rpc: async () => { throw new Error("tajný detail databázy"); }, authUser: async () => ANNA });
    const r = await broken(new Request("http://x/", { method: "POST", body: JSON.stringify({ op: "list" }), headers: { Authorization: "Bearer a" } }));
    expect(r.status).toBe(500);
    expect(await r.text()).not.toContain("tajný");
  });
});

describe("práva v databáze", () => {
  const as = async <T,>(role: string, uid: string | null, fn: () => Promise<T>) => {
    await db.exec(`select set_config('test.uid', '${uid ?? ""}', false); set role ${role}`);
    try {
      return await fn();
    } finally {
      await db.exec("reset role; select set_config('test.uid', '', false)");
    }
  };
  it.each(["dm_messages", "dm_conversations", "dm_blocks", "dm_reports"])("klient nesmie čítať ani meniť %s", async (t) => {
    for (const role of ["anon", "authenticated"]) {
      await expect(as(role, ANNA, () => db.query(`select * from public.${t}`))).rejects.toThrow();
      await expect(as(role, ANNA, () => db.query(`delete from public.${t}`))).rejects.toThrow();
    }
  });
  it.each(["dm_open(p_me => $1, p_other => $1)", "dm_list(p_me => $1)", "dm_block_list(p_me => $1)", "dm_admin_reports(p_me => $1)"])("klient nesmie volať %s", async (f) => {
    for (const role of ["anon", "authenticated"]) {
      await expect(as(role, ANNA, () => db.query(`select public.${f}`, [ANNA]))).rejects.toThrow(/permission denied/);
    }
  });
  it("člen vidí riadky svojej konverzácie, cudzí a neprihlásený nie", async () => {
    await accepted();
    const q = "select user_id, unread from public.dm_members";
    expect((await as("authenticated", ANNA, () => db.query(q))).rows).toHaveLength(2);
    expect((await as("authenticated", CYRIL, () => db.query(q))).rows).toHaveLength(0);
    await expect(as("anon", null, () => db.query(q))).rejects.toThrow();
    await expect(as("authenticated", ANNA, () => db.query("update public.dm_members set unread = 0"))).rejects.toThrow();
  });
  it("signál Píše… funguje len členom prijatej konverzácie bez blokovania", async () => {
    const c = await accepted();
    const can = async (who: string | null, topic: string) => {
      await db.exec(`select set_config('test.uid', '${who ?? ""}', false)`);
      const r = await db.query<any>("select public.dm_can_signal($1) as v", [topic]);
      await db.exec("select set_config('test.uid', '', false)");
      return r.rows[0].v;
    };
    expect(await can(ANNA, `dm:${c}`)).toBe(true);
    expect(await can(CYRIL, `dm:${c}`)).toBe(false);
    expect(await can(null, `dm:${c}`)).toBe(false);
    expect(await can(ANNA, "dm:nie-uuid")).toBe(false);
    await ok(BORIS, "block", { userId: ANNA });
    expect(await can(ANNA, `dm:${c}`)).toBe(false);
  });
  it("zmazanie účtu odstráni jeho správy a konverzácie", async () => {
    await accepted();
    await db.exec(`delete from auth.users where id = '${ANNA}'`);
    expect((await db.query<any>("select count(*) c from public.dm_messages")).rows[0].c).toBe(0);
    expect(await ok(BORIS, "list")).toEqual([]);
  });
});

describe("žiadosti", () => {
  it("prvá správa je žiadosť, ďalšia musí počkať", async () => {
    const c = await openConv(ANNA, BORIS);
    await send(ANNA, c, "ahoj");
    expect(notified[0]).toMatchObject({ recipient: BORIS, isRequest: true });
    expect((await call(ANNA, "send", { id: uuid(), conversationId: c, text: "halo?" })).error).toBe("Počkaj, kým hráč prijme tvoju žiadosť.");
    const [conv] = await ok(BORIS, "list");
    expect(conv).toMatchObject({ incoming_request: true, status: "pending", unread: 1, other_name: "Anna" });
    expect(conv.last_message.body.text).toBe("ahoj");
  });
  it("otvorenie bez správy žiadosť neukáže", async () => {
    await openConv(ANNA, BORIS);
    expect(await ok(BORIS, "list")).toEqual([]);
    expect(await ok(ANNA, "list")).toHaveLength(1);
  });
  it("prijatím alebo odpoveďou sa dá písať ďalej", async () => {
    const c = await openConv(ANNA, BORIS);
    await send(ANNA, c, "ahoj");
    await ok(BORIS, "respond", { conversationId: c, accept: true });
    await send(ANNA, c, "ďalšia");
    const d = await openConv(ANNA, CYRIL);
    await send(ANNA, d, "ahoj");
    await send(CYRIL, d, "odpoveď");
    await send(ANNA, d, "super");
    expect(notified.at(-1).isRequest).toBe(false);
  });
  it("odmietnutie skryje konverzáciu a odosielateľovi ho neprezradí", async () => {
    const c = await openConv(ANNA, BORIS);
    await send(ANNA, c, "ahoj");
    await ok(BORIS, "respond", { conversationId: c, accept: false });
    expect(await ok(BORIS, "list")).toEqual([]);
    expect((await ok(ANNA, "list"))[0].status).toBe("pending");
    expect((await call(ANNA, "send", { id: uuid(), conversationId: c, text: "x" })).error).toBe("Počkaj, kým hráč prijme tvoju žiadosť.");
    expect((await call(ANNA, "respond", { conversationId: c, accept: true })).error).toBe("Žiadosť sa nenašla.");
    await send(BORIS, c, "rozmyslel som si to");
    await send(ANNA, c, "super");
  });
  it("žiadateľ si nemôže prijať vlastnú žiadosť", async () => {
    const c = await openConv(ANNA, BORIS);
    await send(ANNA, c, "ahoj");
    expect((await call(ANNA, "respond", { conversationId: c, accept: true })).error).toBe("Žiadosť sa nenašla.");
  });
  it("Prečítané sa pri žiadosti neprezradí, po prijatí áno", async () => {
    const c = await openConv(ANNA, BORIS);
    await send(ANNA, c, "ahoj");
    await ok(BORIS, "read", { conversationId: c });
    let [a] = await ok(ANNA, "list");
    expect(a.other_last_read_at).toBeNull();
    expect((await ok(BORIS, "list"))[0].unread).toBe(0);
    await ok(BORIS, "respond", { conversationId: c, accept: true });
    await ok(BORIS, "read", { conversationId: c });
    [a] = await ok(ANNA, "list");
    expect(a.other_last_read_at).not.toBeNull();
  });
  it("sám sebe ani neexistujúcemu sa napísať nedá", async () => {
    expect((await call(ANNA, "open", { userId: ANNA })).error).toBe("Sám sebe napísať nemôžeš.");
    expect((await call(ANNA, "open", { userId: id(99) })).error).toBe("Hráč sa nenašiel.");
  });
  it("opakované otvorenie vráti tú istú konverzáciu z oboch strán", async () => {
    expect(await openConv(ANNA, BORIS)).toBe(await openConv(BORIS, ANNA));
  });
});

describe("blokovanie a limity", () => {
  it("blokovanie zastaví otvorenie aj posielanie v oboch smeroch", async () => {
    const c = await accepted();
    await ok(BORIS, "block", { userId: ANNA });
    expect((await call(ANNA, "send", { id: uuid(), conversationId: c, text: "x" })).error).toBe("Tomuto hráčovi sa teraz nedá napísať.");
    expect((await call(BORIS, "send", { id: uuid(), conversationId: c, text: "x" })).error).toBe("Tomuto hráčovi sa teraz nedá napísať.");
    expect((await ok(BORIS, "blocks"))[0].name).toBe("Anna");
    await ok(BORIS, "block", { userId: ANNA, on: false });
    await send(ANNA, c, "znova");
  });
  it("blokovanie skryje hráča z hľadania", async () => {
    expect((await ok(ANNA, "find", { q: "bor" }))[0].name).toBe("Boris");
    await ok(BORIS, "block", { userId: ANNA });
    expect(await ok(ANNA, "find", { q: "bor" })).toEqual([]);
  });
  it("hľadanie hráča berie % a _ doslova", async () => {
    expect(await ok(ANNA, "find", { q: "%%" })).toEqual([]);
    expect(await ok(ANNA, "find", { q: "__" })).toEqual([]);
    expect(await ok(ANNA, "find", { q: "a" })).toEqual([]);
  });
  it("ban z chatu zastaví aj súkromné správy", async () => {
    const c = await accepted();
    await db.exec(`insert into public.chat_bans values ('${ANNA}')`);
    expect((await call(ANNA, "send", { id: uuid(), conversationId: c, text: "x" })).error).toBe("Máš zablokované písanie.");
    expect((await call(ANNA, "open", { userId: CYRIL })).error).toBe("Máš zablokované písanie.");
  });
  it("povolí 20 správ za minútu, potom odmietne", async () => {
    const c = await accepted();
    for (let i = 0; i < 19; i++) await send(ANNA, c, `s${i}`);
    expect((await call(ANNA, "send", { id: uuid(), conversationId: c, text: "21" })).error).toBe("Píšeš priveľmi rýchlo. Počkaj chvíľu.");
    await db.exec(`update public.dm_messages set created_at = now() - interval '2 minutes' where sender_id = '${ANNA}'`);
    await send(ANNA, c, "po minúte");
  });
  it("nový účet osloví 3 hráčov denne, starší 10", async () => {
    const others = [ANNA, BORIS, CYRIL];
    for (const o of others) await openConv(NEW, o);
    expect((await call(NEW, "open", { userId: ADMIN })).error).toContain("priveľa nových");
    await db.exec(`insert into auth.users (id) select ('00000000-0000-4000-8000-1' || lpad(i::text, 11, '0'))::uuid from generate_series(1, 11) i;
      insert into public.profiles select id, 'x' || id from auth.users where id::text like '00000000-0000-4000-8000-1%'`);
    const made = (await db.query<any>("select id from public.profiles where username like 'x%' order by id")).rows;
    for (const u of made.slice(0, 10)) await openConv(ANNA, u.id);
    expect((await call(ANNA, "open", { userId: made[10].id })).error).toContain("priveľa nových");
  });
});

describe("karty a ponuky", () => {
  it("cenu ponuky berie z databázy, nie od odosielateľa", async () => {
    const l = uuid();
    await db.exec(`insert into public.trade_listings values ('${l}', '${BORIS}', 'OP01-003', 'offer', 12.5, 'NM', 'EN')`);
    const c = await openConv(ANNA, BORIS);
    const m = await ok(ANNA, "send", { id: uuid(), conversationId: c, text: "", listingId: l, price: 1 });
    expect(m.body.card).toEqual({ id: "OP01-003", listing: { id: l, kind: "offer", price: 12.5, cond: "NM", lang: "EN" } });
    expect((await ok(BORIS, "history", { conversationId: c }))[0].body.card.listing.price).toBe(12.5);
    expect((await call(ANNA, "send", { id: uuid(), conversationId: c, listingId: id(77) })).error).toBe("Ponuka sa nenašla.");
  });
  it("kartu pošle aj bez textu", async () => {
    const c = await accepted();
    expect((await ok(ANNA, "send", { id: uuid(), conversationId: c, cardId: "OP05-119" })).body).toEqual({ text: "", card: { id: "OP05-119" } });
  });
});

describe("hľadanie", () => {
  it("nájde text bez ohľadu na diakritiku a len vo vlastných konverzáciách", async () => {
    const c = await accepted();
    await send(ANNA, c, "Pošleme to poštou v piatok");
    const d = await accepted(BORIS, CYRIL);
    await send(CYRIL, d, "postou aj u Cyrila");
    const mine = await ok(ANNA, "search", { q: "POŠTOU" });
    expect(mine.results).toHaveLength(1);
    expect(mine.results[0]).toMatchObject({ other_name: "Boris", conversation_id: c });
    expect(mine.results[0].snippet).toContain("poštou");
    expect((await ok(BORIS, "search", { q: "postou" })).results).toHaveLength(2);
    expect((await ok(ADMIN, "search", { q: "postou" })).results).toHaveLength(0);
  });
  it("nájde aj kartu a odmietne priveľmi krátky výraz", async () => {
    const c = await accepted();
    await ok(ANNA, "send", { id: uuid(), conversationId: c, cardId: "OP05-119" });
    expect((await ok(BORIS, "search", { q: "op05" })).results).toHaveLength(1);
    expect((await call(ANNA, "search", { q: "a" })).status).toBe(400);
  });
  it("nehľadá v správach z odmietnutej žiadosti", async () => {
    const c = await openConv(ANNA, BORIS);
    await send(ANNA, c, "nechcená ponuka");
    await ok(BORIS, "respond", { conversationId: c, accept: false });
    expect((await ok(BORIS, "search", { q: "nechcen" })).results).toHaveLength(0);
  });
  it("pomocné funkcie", () => {
    expect(normalize("Žlté Ľúbim")).toBe("zlte lubim");
    expect(cleanText(" a\u0000b‮c ")).toBe("abc");
    expect(snippet("x".repeat(100) + "cieľ" + "y".repeat(100), "ciel")).toContain("cieľ");
  });
});

describe("história a neprečítané", () => {
  it("počíta neprečítané, stránkuje a značí prečítané", async () => {
    const c = await accepted();
    await send(ANNA, c, "a");
    await send(ANNA, c, "b");
    expect((await ok(BORIS, "list"))[0].unread).toBe(2); // jeho odpoveď predošlé vynulovala
    await ok(BORIS, "read", { conversationId: c });
    const [b] = await ok(BORIS, "list");
    expect(b.unread).toBe(0);
    const page = await ok(ANNA, "history", { conversationId: c });
    expect(page.map((m: any) => m.body.text)).toEqual(["b", "a", "čau", "ahoj"]);
    const older = await ok(ANNA, "history", { conversationId: c, before: page[1].created_at });
    expect(older.map((m: any) => m.body.text)).toEqual(["čau", "ahoj"]);
  });
  it("upozornenie nedostane opakované odoslanie a jeho chyba správu nezastaví", async () => {
    const c = await accepted();
    notified = [];
    const mid = uuid();
    await ok(ANNA, "send", { id: mid, conversationId: c, text: "x" });
    await ok(ANNA, "send", { id: mid, conversationId: c, text: "x" });
    expect(notified).toHaveLength(1);
    const h = createDmHandler({ URL: "", SERVICE: "", ANON: "", DM_KEYS: `1:${KEY}` }, { rpc, authUser: async () => ANNA, notify: async () => { throw new Error("push"); } });
    const r = await h(new Request("http://x/", { method: "POST", headers: { Authorization: "Bearer x" }, body: JSON.stringify({ op: "send", id: uuid(), conversationId: c, text: "y" }) }));
    expect(r.status).toBe(200);
  });
});

describe("nahlásenia a správca", () => {
  it("správca vidí len nahlásenú správu, nie zvyšok konverzácie", async () => {
    const c = await accepted();
    const bad = await send(ANNA, c, "podvodná ponuka");
    await send(ANNA, c, "súkromná správa");
    expect((await ok(ADMIN, "history", { conversationId: c }).catch((e) => e.message))).toContain("nenašla");
    await ok(BORIS, "report", { messageId: bad.id, reason: "podvod" });
    const reports = await ok(ADMIN, "admin_reports");
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ reason: "podvod", sender_name: "Anna", reporter_name: "Boris" });
    expect(reports[0].body.text).toBe("podvodná ponuka");
    expect(JSON.stringify(reports)).not.toContain("súkromná");
    await ok(ADMIN, "admin_resolve", { id: reports[0].id });
    expect(await ok(ADMIN, "admin_reports")).toEqual([]);
  });
  it("vlastnú správu nahlásiť nejde, opakovanie sa neráta a bežný hráč nie je správca", async () => {
    const c = await accepted();
    const m = await send(ANNA, c, "x");
    expect((await call(ANNA, "report", { messageId: m.id })).error).toBe("Správu sa nepodarilo nahlásiť.");
    await ok(BORIS, "report", { messageId: m.id });
    await ok(BORIS, "report", { messageId: m.id });
    expect(await ok(ADMIN, "admin_reports")).toHaveLength(1);
    expect((await call(BORIS, "admin_reports")).error).toBe("Na toto nemáš oprávnenie.");
    expect((await call(BORIS, "admin_resolve", { id: 1 })).error).toBe("Na toto nemáš oprávnenie.");
  });
  it("nahlásená správa prežije zmazanie správ", async () => {
    const c = await accepted();
    const m = await send(ANNA, c, "dôkaz");
    await ok(BORIS, "report", { messageId: m.id });
    await db.exec("delete from public.dm_messages");
    expect((await ok(ADMIN, "admin_reports"))[0].body.text).toBe("dôkaz");
  });
});

describe("notifikácie", () => {
  const ua = createECDH("prime256v1");
  ua.generateKeys();
  const srv = createECDH("prime256v1");
  srv.generateKeys();
  const device = { endpoint: "https://fcm.googleapis.com/fcm/send/boris", p256dh: ua.getPublicKey().toString("base64url"), auth: Buffer.alloc(16, 3).toString("base64url") };
  const decrypt = (data: Uint8Array) => {
    const b = Buffer.from(data);
    const asPublic = b.subarray(21, 21 + b[20]);
    const body = b.subarray(21 + b[20]);
    const ikm = Buffer.from(hkdfSync("sha256", ua.computeSecret(asPublic), Buffer.alloc(16, 3), Buffer.concat([Buffer.from("WebPush: info\0"), ua.getPublicKey(), asPublic]), 32));
    const salt = b.subarray(0, 16);
    const d = createDecipheriv("aes-128-gcm", Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16)), Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12)));
    d.setAuthTag(body.subarray(body.length - 16));
    const out = Buffer.concat([d.update(body.subarray(0, body.length - 16)), d.final()]);
    return JSON.parse(out.subarray(0, out.length - 1).toString());
  };
  const live = (status = 201) => {
    const sent: any[] = [];
    const h = createDmHandler(
      { URL: "", SERVICE: "", ANON: "", DM_KEYS: `1:${KEY}`, VAPID_PUBLIC: srv.getPublicKey().toString("base64url"), VAPID_PRIVATE: srv.getPrivateKey().toString("base64url") },
      { rpc, authUser: async (a) => a.slice(7), pushFetch: (async (u: string, init: any) => { sent.push({ u, body: decrypt(init.body), auth: init.headers.Authorization }); return new Response(null, { status }); }) as any },
    );
    const run = async (who: string, op: string, extra = {}) => {
      const r = await h(new Request("http://x/", { method: "POST", headers: { Authorization: `Bearer ${who}` }, body: JSON.stringify({ op, ...extra }) }));
      return { status: r.status, ...(await r.json()) } as any;
    };
    return { sent, run };
  };
  const conv = async (run: any) => {
    const c = (await run(ANNA, "open", { userId: BORIS })).data.id;
    await run(ANNA, "send", { id: uuid(), conversationId: c, text: "prvá" });
    await run(BORIS, "send", { id: uuid(), conversationId: c, text: "odpoveď" });
    return c;
  };
  it("pošle meno a text šifrovane, po skrytí textu len upozornenie", async () => {
    const { sent, run } = live();
    await run(BORIS, "push_subscribe", device);
    const c = await conv(run);
    sent.length = 0;
    await run(ANNA, "send", { id: uuid(), conversationId: c, text: "Áno, poštou" });
    expect(sent[0].u).toBe(device.endpoint);
    expect(sent[0].body).toMatchObject({ title: "Anna", body: "Áno, poštou", url: `/spravy?c=${c}`, unread: 1 });
    await run(BORIS, "settings_set", { showText: false });
    expect((await run(BORIS, "settings")).data.show_text).toBe(false);
    await run(ANNA, "send", { id: uuid(), conversationId: c, text: "tajné" });
    expect(sent[1].body.body).toBe("Nová správa");
  });
  it("žiadosť od cudzieho je bez textu", async () => {
    const { sent, run } = live();
    await run(BORIS, "push_subscribe", device);
    const c = (await run(ANNA, "open", { userId: BORIS })).data.id;
    await run(ANNA, "send", { id: uuid(), conversationId: c, text: "kúp si podvod https://zly.sk" });
    expect(sent[0].body).toMatchObject({ title: "Anna", body: "Žiadosť o správu" });
    expect(JSON.stringify(sent[0].body)).not.toContain("podvod");
  });
  it("neplatné zariadenie zabudne a odosielateľ o chybe nevie", async () => {
    const { sent, run } = live(410);
    await run(BORIS, "push_subscribe", device);
    const c = await conv(run);
    expect(sent.length).toBeGreaterThan(0);
    expect((await db.query<any>("select count(*) c from public.dm_push_subscriptions")).rows[0].c).toBe(0);
    expect((await run(ANNA, "send", { id: uuid(), conversationId: c, text: "ďalej" })).status).toBe(200);
  });
  it("odmietne cudziu adresu a neplatné kľúče, odhlásiť môže len vlastník", async () => {
    const { run } = live();
    expect((await run(BORIS, "push_subscribe", { ...device, endpoint: "https://169.254.169.254/x" })).status).toBe(400);
    expect((await run(BORIS, "push_subscribe", { ...device, p256dh: "krátky" })).status).toBe(400);
    await run(BORIS, "push_subscribe", device);
    await run(ANNA, "push_unsubscribe", { endpoint: device.endpoint });
    expect((await db.query<any>("select count(*) c from public.dm_push_subscriptions")).rows[0].c).toBe(1);
    await run(BORIS, "push_unsubscribe", { endpoint: device.endpoint });
    expect((await db.query<any>("select count(*) c from public.dm_push_subscriptions")).rows[0].c).toBe(0);
  });
  it("zariadenie prejde na nový účet a staršie nad 10 sa zmažú", async () => {
    const { run } = live();
    await run(BORIS, "push_subscribe", device);
    await run(ANNA, "push_subscribe", device);
    expect((await db.query<any>("select user_id from public.dm_push_subscriptions")).rows).toEqual([{ user_id: ANNA }]);
    for (let i = 0; i < 12; i++) await run(BORIS, "push_subscribe", { ...device, endpoint: `${device.endpoint}${i}` });
    expect((await db.query<any>(`select count(*) c from public.dm_push_subscriptions where user_id = '${BORIS}'`)).rows[0].c).toBe(10);
  });
  it("klient sa k tabuľkám notifikácií nedostane a bez kľúčov server nič neposiela", async () => {
    for (const t of ["dm_push_subscriptions", "dm_settings"]) {
      await db.exec("set role authenticated");
      await expect(db.query(`select * from public.${t}`)).rejects.toThrow();
      await db.exec("reset role");
    }
    expect((await ok(ANNA, "push_config")).publicKey).toBeNull();
    const { run } = live();
    expect((await run(ANNA, "push_config")).data.publicKey).toBeTruthy();
    expect(JSON.stringify((await run(ANNA, "push_config")).data)).not.toContain(srv.getPrivateKey().toString("base64url"));
  });
});

describe("uchovávanie", () => {
  it("zmaže správy a konverzácie staršie ako 12 mesiacov, novšie nechá", async () => {
    const old = await accepted();
    const fresh = await accepted(ANNA, CYRIL);
    await db.exec(`update public.dm_messages set created_at = now() - interval '13 months' where conversation_id = '${old}';
      update public.dm_conversations set last_message_at = now() - interval '13 months' where id = '${old}'`);
    await db.exec("set role anon");
    await db.query("select public.dm_cleanup()");
    await db.exec("reset role");
    const left = (await db.query<any>("select distinct conversation_id from public.dm_messages")).rows;
    expect(left).toEqual([{ conversation_id: fresh }]);
    expect((await db.query<any>("select count(*) c from public.dm_conversations")).rows[0].c).toBe(1);
  });
});
