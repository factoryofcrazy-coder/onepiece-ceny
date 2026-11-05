// Pravidlá reakcií vo verejnom chate: skutočná migrácia v Postgrese, volania ako z prehliadača.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [ANNA, BORIS, BAD] = [1, 2, 3].map(id);
const db = new PGlite();
const as = async <T,>(who: string | null, fn: () => Promise<T>) => {
  await db.query("select set_config('test.uid', $1, false)", [who ?? ""]);
  await db.exec(who ? "set role authenticated" : "set role anon");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
};
const add = (who: string, msg: number, emote = "kek") => as(who, () => db.query("insert into public.chat_reactions (message_id, emote) values ($1, $2)", [msg, emote]));
const count = async () => (await db.query<{ n: number }>("select count(*)::int n from public.chat_reactions")).rows[0].n;

beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    create table public.chat_messages (id bigint primary key, user_id uuid, deleted_at timestamptz);
    create table public.chat_bans (user_id uuid primary key);
    create table public.dm_conversations (id uuid primary key, user_a uuid, user_b uuid, status text);
    create table public.dm_members (conversation_id uuid, user_id uuid);
    create table public.dm_messages (id uuid primary key, conversation_id uuid, sender_id uuid, created_at timestamptz, ciphertext text, iv text, key_version smallint);
    create function public.dm_blocked_between(a uuid, b uuid) returns boolean language sql as 'select false';
  `);
  await db.query("insert into auth.users values ($1), ($2), ($3)", [ANNA, BORIS, BAD]);
  await db.exec(readFileSync("supabase/migrations/20261115_reactions.sql", "utf8"));
}, 60000);
beforeEach(async () => {
  await db.exec("truncate public.chat_messages cascade; truncate public.chat_bans;");
  await db.query("insert into public.chat_messages values (1, $1, null), (2, $1, now())", [BORIS]);
  await db.query("insert into public.chat_bans values ($1)", [BAD]);
});

describe("chat_reactions", () => {
  it("pridá vlastnú, viac rôznych, rovnakú dvakrát nie", async () => {
    await add(ANNA, 1);
    await add(ANNA, 1, "rip");
    await expect(add(ANNA, 1)).rejects.toThrow(/duplicate/);
    expect(await count()).toBe(2);
  });
  it("za iného sa pridať nedá", async () => {
    await expect(as(ANNA, () => db.query("insert into public.chat_reactions (message_id, user_id, emote) values (1, $1, 'kek')", [BORIS]))).rejects.toThrow(/permission denied/);
  });
  it("zrušiť ide len vlastnú", async () => {
    await add(ANNA, 1);
    await as(BORIS, () => db.exec("delete from public.chat_reactions"));
    expect(await count()).toBe(1);
    await as(ANNA, () => db.exec("delete from public.chat_reactions"));
    expect(await count()).toBe(0);
  });
  it("neznámy emot, zmazaná a neexistujúca správa, zablokovaný", async () => {
    await expect(add(ANNA, 1, "hack")).rejects.toThrow(/check/);
    await expect(add(ANNA, 2)).rejects.toThrow(/neexistuje/);
    await expect(add(ANNA, 99)).rejects.toThrow(/neexistuje/);
    await expect(add(BAD, 1)).rejects.toThrow(/zablokované/);
  });
  it("neprihlásený nevidí a nepridá", async () => {
    await expect(as(null, () => db.query("select * from public.chat_reactions"))).rejects.toThrow(/permission denied/);
    await expect(as(null, () => db.query("insert into public.chat_reactions (message_id, emote) values (1, 'kek')"))).rejects.toThrow(/permission denied/);
  });
  it("prihlásený vidí aj cudzie", async () => {
    await add(BORIS, 1);
    expect((await as(ANNA, () => db.query("select * from public.chat_reactions"))).rows.length).toBe(1);
  });
  it("limit 40 za minútu", async () => {
    for (let i = 3; i < 13; i++) await db.query("insert into public.chat_messages values ($1, $2, null)", [i, BORIS]);
    const em = ["kek", "pog", "rip", "cope", "beli"];
    let n = 0;
    await expect(
      (async () => {
        for (let m = 3; m < 13; m++) for (const e of em) (await add(ANNA, m, e), n++);
      })(),
    ).rejects.toThrow(/rýchlo/);
    expect(n).toBe(40);
  });
  it("reakcia zmizne so správou", async () => {
    await add(ANNA, 1);
    await db.exec("delete from public.chat_messages where id = 1");
    expect(await count()).toBe(0);
  });
});
