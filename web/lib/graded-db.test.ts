// Ceny hodnotených kariet: skutočná migrácia v Postgrese.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

const db = new PGlite();
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const cands = async (lim = 10, days = 30) => (await db.query<{ code: string }>("select code from public.graded_candidates($1, 500, $2)", [lim, days])).rows.map((r) => r.code);
const today = "(now() at time zone 'utc')::date";

beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon, authenticated, service_role;
    create table public.collection (user_id uuid, card_id text, qty int);
    create table public.card_price_latest (id int generated always as identity primary key, card_id text unique, cm int);
    insert into public.card_price_latest (card_id, cm) values ('LACNA', 100), ('DRAHA', 90000), ('MOJA', 800), ('MOJA_p1', 5000), ('DRUHA', 700);
    insert into public.collection values ('${U(1)}', 'MOJA_p1', 1), ('${U(2)}', 'MOJA', 2), ('${U(1)}', 'DRUHA', 1), ('${U(1)}', 'pk:x', 5), ('${U(3)}', 'LACNA', 3), ('${U(3)}', 'DRAHA', 0);
  `);
  await db.exec(readFileSync("supabase/migrations/20261120_graded_prices.sql", "utf8"));
}, 60000);

describe("výber kariet", () => {
  it("najprv najviac vlastnené, potom drahé, lacné a Pokémon nie, varianty spolu", async () => expect(await cands()).toEqual(["MOJA", "DRUHA", "DRAHA"]));
  it("limit", async () => expect(await cands(1)).toEqual(["MOJA"]));
  it("nedávno zisťovaná sa preskočí, stará sa vráti", async () => {
    await db.query(`select public.record_graded_prices(${today}, array['MOJA'], '[]'::jsonb)`);
    expect(await cands()).toEqual(["DRUHA", "DRAHA"]);
    await db.exec(`update public.card_graded_checked set checked_on = ${today} - 40 where code = 'MOJA'`);
    expect(await cands()).toContain("MOJA");
  });
});

describe("ukladanie a prístup", () => {
  const rows = (median: number) => JSON.stringify([{ card: "MOJA", grader: "PSA", grade: 10, median, p25: 1, p75: 2, sales: 8, last_sold: "2026-10-30" }]);
  it("uloží a prepíše bez duplicity", async () => {
    await db.query("select public.record_graded_prices('2026-11-01', array['MOJA'], $1::jsonb)", [rows(100)]);
    await db.query("select public.record_graded_prices('2026-11-08', array['MOJA'], $1::jsonb)", [rows(200)]);
    const r = await db.query<{ median: number }>("select median from public.card_graded_prices");
    expect(r.rows).toEqual([{ median: 200 }]);
  });
  it("návštevník ceny číta, nezapíše a nezavolá funkcie", async () => {
    await db.exec("set role anon");
    try {
      expect((await db.query("select * from public.card_graded_prices")).rows).toHaveLength(1);
      await expect(db.query("insert into public.card_graded_prices (card_id, grader, grade, median, p25, p75, sales, fetched_on) values ('X','PSA',10,1,1,1,1,'2026-01-01')")).rejects.toThrow(/permission denied/);
      await expect(db.query("select * from public.graded_candidates(5)")).rejects.toThrow(/permission denied/);
      await expect(db.query("select public.record_graded_prices('2026-01-01', array['X'], '[]'::jsonb)")).rejects.toThrow(/permission denied/);
      await expect(db.query("select * from public.card_graded_checked")).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });
});
