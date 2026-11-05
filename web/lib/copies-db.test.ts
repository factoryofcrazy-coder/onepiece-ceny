// Súkromie kusov zbierky: skutočná migrácia v Postgrese, volania ako z prehliadača.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [ANNA, BORIS] = [1, 2].map(id);
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
const add = (who: string, extra = "") => as(who, () => db.query(`insert into public.collection_copies (card_id, paid${extra ? ", " + extra.split("=")[0] : ""}) values ('A', 10${extra ? ", " + extra.split("=")[1] : ""})`));
const count = async () => (await db.query<{ n: number }>("select count(*)::int n from public.collection_copies")).rows[0].n;

beforeAll(async () => {
  const limits = readFileSync("supabase/migrations/20261104_accounts_feedback_limits.sql", "utf8");
  const fn = limits.match(/create or replace function public\.enforce_user_row_limit[\s\S]*?\$\$;/)![0];
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    insert into auth.users values ('${ANNA}'), ('${BORIS}');
    ${fn}
  `);
  await db.exec(readFileSync("supabase/migrations/20261119_collection_copies.sql", "utf8"));
}, 60000);

describe("kusy v zbierke", () => {
  it("každý vidí len svoje", async () => {
    await add(ANNA);
    await add(BORIS);
    const n = await as(ANNA, async () => (await db.query<{ user_id: string }>("select user_id from public.collection_copies")).rows);
    expect(n).toEqual([{ user_id: ANNA }]);
  });
  it("neprihlásený sa nedostane vôbec", async () => {
    await expect(as(null, () => db.query("select * from public.collection_copies"))).rejects.toThrow(/permission denied/);
  });
  it("cudzí kus sa nedá zmeniť, zmazať ani podstrčiť", async () => {
    const before = await count();
    await as(ANNA, () => db.query(`update public.collection_copies set paid = 1 where user_id = '${BORIS}'`));
    await as(ANNA, () => db.query(`delete from public.collection_copies where user_id = '${BORIS}'`));
    expect(await count()).toBe(before);
    const b = await db.query<{ paid: string }>(`select paid from public.collection_copies where user_id = '${BORIS}'`);
    expect(Number(b.rows[0].paid)).toBe(10);
    await expect(as(ANNA, () => db.query(`insert into public.collection_copies (user_id, card_id) values ('${BORIS}', 'X')`))).rejects.toThrow(/row-level security/);
    await expect(as(ANNA, () => db.query(`update public.collection_copies set user_id = '${BORIS}' where user_id = '${ANNA}'`))).rejects.toThrow(/row-level security/);
  });
  it("grading musí byť celý a nejde spolu so stavom", async () => {
    await expect(as(ANNA, () => db.query("insert into public.collection_copies (card_id, grader) values ('A', 'PSA')"))).rejects.toThrow();
    await expect(as(ANNA, () => db.query("insert into public.collection_copies (card_id, grade) values ('A', 9)"))).rejects.toThrow();
    await expect(as(ANNA, () => db.query("insert into public.collection_copies (card_id, grader, grade, cond) values ('A', 'PSA', 9, 'NM')"))).rejects.toThrow();
    await expect(as(ANNA, () => db.query("insert into public.collection_copies (card_id, grader, grade) values ('A', 'PSA', 11)"))).rejects.toThrow();
    await as(ANNA, () => db.query("insert into public.collection_copies (card_id, grader, grade) values ('A', 'PSA', 9.5)"));
  });
  it("certifikát len pri gradovanej karte a bez čudných znakov", async () => {
    await as(ANNA, () => db.query("insert into public.collection_copies (card_id, grader, grade, cert) values ('A', 'PSA', 10, '12345678')"));
    await expect(as(ANNA, () => db.query("insert into public.collection_copies (card_id, cert) values ('A', '123')"))).rejects.toThrow();
    await expect(as(ANNA, () => db.query("insert into public.collection_copies (card_id, grader, grade, cert) values ('A', 'PSA', 10, '<script>')"))).rejects.toThrow();
  });
  it("záporná cena a neznámy stav neprejdú", async () => {
    await expect(add(ANNA, "cond='XX'")).rejects.toThrow();
    await expect(as(ANNA, () => db.query("insert into public.collection_copies (card_id, paid) values ('A', -1)"))).rejects.toThrow();
  });
  it("zmazanie účtu zmaže aj kusy", async () => {
    await db.exec(`delete from auth.users where id = '${BORIS}'`);
    expect((await db.query(`select 1 from public.collection_copies where user_id = '${BORIS}'`)).rows).toEqual([]);
  });
});
