import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

const db = new PGlite();
const free = async (n: string) => (await db.query<{ ok: boolean }>("select public.username_available($1) ok", [n])).rows[0].ok;

beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create table public.profiles (id int primary key, username text);
    insert into public.profiles values (1, 'Anon');
  `);
  await db.exec(readFileSync(new URL("../supabase/migrations/20261114_username_available.sql", import.meta.url), "utf8"));
});

describe("username_available", () => {
  it("obsadená prezývka, aj inak napísaná", async () => {
    expect(await free("Anon")).toBe(false);
    expect(await free("aNON")).toBe(false);
    expect(await free("  Anon ")).toBe(false);
  });
  it("voľná prezývka", async () => {
    expect(await free("Anon1")).toBe(true);
  });
  it("neprihlásený ju smie volať, ale zoznam prezývok nevidí", async () => {
    await db.exec("set role anon");
    expect(await free("Anon")).toBe(false);
    await expect(db.query("select username from public.profiles")).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
  });
});
