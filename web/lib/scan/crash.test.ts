import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

const A = "00000000-0000-4000-8000-000000000001", B = "00000000-0000-4000-8000-000000000002";
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
const log = (who: string | null) => as(who, () => db.query("insert into public.scan_crashes (ran_s, frames, cards_before, cards_after) values (60, 300, 5, 5)"));
const count = async () => (await db.query<{ n: number }>("select count(*)::int n from public.scan_crashes")).rows[0].n;

beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated;
  `);
  await db.query("insert into auth.users values ($1), ($2)", [A, B]);
  await db.exec(readFileSync("supabase/migrations/20261116_scan_crash_log.sql", "utf8"));
}, 60000);

describe("scan_crashes", () => {
  it("prihlásený zapíše o sebe, cudzí ani neprihlásený nie", async () => {
    await log(A);
    expect((await db.query<{ user_id: string }>("select user_id from public.scan_crashes")).rows[0].user_id).toBe(A);
    await expect(log(null)).rejects.toThrow(/permission denied/);
    await expect(as(A, () => db.query("insert into public.scan_crashes (user_id, ran_s) values ($1, 1)", [B]))).rejects.toThrow(/permission denied/);
  });
  it("záznamy si nikto z prehliadača neprečíta", async () => {
    await expect(as(A, () => db.query("select * from public.scan_crashes"))).rejects.toThrow(/permission denied/);
    await expect(as(A, () => db.exec("delete from public.scan_crashes"))).rejects.toThrow(/permission denied/);
  });
  it("najviac 30 za deň, ďalšie sa potichu nezapíšu", async () => {
    for (let i = 0; i < 35; i++) await log(B);
    expect((await db.query<{ n: number }>("select count(*)::int n from public.scan_crashes where user_id = $1", [B])).rows[0].n).toBe(30);
  });
  it("staré záznamy sa zmažú", async () => {
    await db.exec("update public.scan_crashes set created_at = now() - interval '91 days'");
    await log(A);
    expect(await count()).toBe(1);
  });
});
