import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

const db = new PGlite();
const record = async (day: string, rows: unknown[]) =>
  (await db.query<{ r: { received: number; changed: number } }>("select public.record_card_prices($1::date, $2::jsonb) r", [day, JSON.stringify(rows)])).rows[0].r;
const hist = async (id: string) =>
  (await db.query<{ day: string; cm: number | null }>(
    "select to_char(h.day,'YYYY-MM-DD') as day, h.cm from public.card_price_history h join public.card_price_latest l on l.id = h.card where l.card_id = $1 order by h.day",
    [id],
  )).rows;
const usage = async (limit: number) =>
  (await db.query<{ r: { pct: number; level: number; alert: boolean; per_week: number | null; bytes: number } }>("select public.db_usage_check($1) r", [limit])).rows[0].r;

beforeAll(async () => {
  await db.exec("create role anon; create role authenticated; create role service_role; grant usage on schema public to anon, authenticated, service_role;");
  await db.exec(readFileSync("supabase/migrations/20261117_card_price_history.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261118_card_price_series.sql", "utf8"));
}, 60000);

describe("história cien", () => {
  it("prvý deň uloží ceny, karta bez ceny riadok nemá", async () => {
    expect(await record("2026-11-06", [{ id: "A", cm: 100, low: 90, jp: null, usd: 120 }, { id: "B", cm: 200 }, { id: "NIC" }])).toEqual({ received: 3, changed: 2 });
    expect(await hist("A")).toEqual([{ day: "2026-11-06", cm: 100 }]);
    expect(await hist("NIC")).toEqual([]);
  });
  it("ukladá len zmeny", async () => {
    const r = await record("2026-11-07", [{ id: "A", cm: 100, low: 90, jp: null, usd: 120 }, { id: "B", cm: 250 }, { id: "NIC" }]);
    expect(r.changed).toBe(1);
    expect(await hist("A")).toHaveLength(1);
    expect(await hist("B")).toEqual([{ day: "2026-11-06", cm: 200 }, { day: "2026-11-07", cm: 250 }]);
  });
  it("opakovaný beh v ten istý deň nič nezdvojí a zmenu prepíše", async () => {
    const same = [{ id: "A", cm: 100, low: 90, jp: null, usd: 120 }, { id: "B", cm: 250 }];
    expect((await record("2026-11-07", same)).changed).toBe(0);
    expect((await record("2026-11-07", [{ id: "A", cm: 100, low: 90, jp: null, usd: 120 }, { id: "B", cm: 260 }])).changed).toBe(1);
    expect(await hist("B")).toEqual([{ day: "2026-11-06", cm: 200 }, { day: "2026-11-07", cm: 260 }]);
  });
  it("karta, ktorá v dávke nie je, sa nezmení; duplicita v dávke nevadí", async () => {
    expect((await record("2026-11-08", [{ id: "B", cm: 260 }, { id: "B", cm: 260 }])).changed).toBe(0);
    expect(await hist("A")).toHaveLength(1);
  });
  it("zmiznutá cena sa zapíše ako null a návrat ako nová cena", async () => {
    await record("2026-11-09", [{ id: "A", cm: null, low: 90, jp: null, usd: 120 }]);
    await record("2026-11-10", [{ id: "A", cm: 110, low: 90, jp: null, usd: 120 }]);
    expect((await hist("A")).map((x) => x.cm)).toEqual([100, null, 110]);
  });
  it("výpadok zdroja zastaví zápis a nič nezmení", async () => {
    await record("2026-11-11", Array.from({ length: 200 }, (_, i) => ({ id: `X${i}`, cm: 50 })));
    const before = (await db.query<{ n: number }>("select count(*)::int n from public.card_price_history")).rows[0].n;
    await expect(record("2026-11-12", Array.from({ length: 200 }, (_, i) => ({ id: `X${i}`, cm: i < 50 ? 60 : null })))).rejects.toThrow(/podozrivo málo/);
    expect((await db.query<{ n: number }>("select count(*)::int n from public.card_price_history")).rows[0].n).toBe(before);
  });
  it("z prehliadača sa k dátam ani funkciám nedostane", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await expect(db.query("select * from public.card_price_history")).rejects.toThrow(/permission denied/);
      await expect(db.query("select * from public.db_usage_log")).rejects.toThrow(/permission denied/);
      await expect(db.query("select public.record_card_prices('2026-11-13', '[]')")).rejects.toThrow(/permission denied/);
      await expect(db.query("select public.db_usage_check()")).rejects.toThrow(/permission denied/);
      await db.exec("reset role");
    }
  });
  it("service_role môže zapisovať", async () => {
    await db.exec("set role service_role");
    try {
      const rows = Array.from({ length: 200 }, (_, i) => ({ id: `X${i}`, cm: 50 }));
      expect((await record("2026-11-13", rows)).received).toBe(200);
    } finally {
      await db.exec("reset role");
    }
  });
});

describe("naplnenie databázy", () => {
  it("upozorní raz pri prekročení vyššej hranice", async () => {
    const size = (await usage(1e12)).bytes;
    expect((await usage(1e12)).alert).toBe(false);
    const at = (pct: number) => Math.round((size * 100) / pct);
    const a = await usage(at(60));
    expect([a.level, a.alert]).toEqual([50, true]);
    expect((await usage(at(60))).alert).toBe(false);
    const b = await usage(at(90));
    expect([b.level, b.alert]).toEqual([85, true]);
    expect((await usage(at(60))).alert).toBe(false);
    expect((await usage(at(90))).alert).toBe(true);
  });
  it("tempo počíta z dní pred týždňom a viac", async () => {
    await db.exec("delete from public.db_usage_log");
    expect((await usage(1e12)).per_week).toBeNull();
    const size = (await usage(1e12)).bytes;
    await db.query("insert into public.db_usage_log (day, bytes) values ((now() at time zone 'utc')::date - 14, $1)", [size - 2_000_000]);
    const w = (await usage(1e12)).per_week!;
    expect(w).toBeGreaterThan(900_000);
    expect(w).toBeLessThan(1_100_000);
  });
});

describe("graf v detaile karty", () => {
  const series = async (id: string, role = "anon") => {
    await db.exec(`set role ${role}`);
    try {
      return (await db.query<{ r: { through: string | null; points: { day: string; cm: number | null; usd: number | null }[] } }>("select public.card_price_series($1) r", [id])).rows[0].r;
    } finally {
      await db.exec("reset role");
    }
  };

  it("návštevník dostane len dni a ceny vybranej karty, v poradí", async () => {
    await db.exec("delete from public.card_price_latest"); // poistka proti výpadku by inak počítala karty z predošlých testov
    await record("2027-03-01", [{ id: "GRAF", cm: 100, usd: 110 }, { id: "INA", cm: 5 }]);
    await record("2027-03-02", [{ id: "GRAF", cm: 120, usd: 110 }, { id: "INA", cm: 5 }]);
    const s = await series("GRAF");
    expect(s.points).toEqual([{ day: "2027-03-01", cm: 100, usd: 110 }, { day: "2027-03-02", cm: 120, usd: 110 }]);
    expect(Object.keys(s).sort()).toEqual(["points", "through"]);
  });
  it("through je posledný úspešný deň", async () => {
    await db.query("insert into public.db_usage_log (day, bytes) values ('2099-01-01', 1)");
    expect((await series("GRAF")).through).toBe("2099-01-01");
    await db.query("delete from public.db_usage_log where day = '2099-01-01'");
  });
  it("neznáma karta je prázdna, nie chyba", async () => expect((await series("NEEXISTUJE")).points).toEqual([]));
  it("tabuľky ostávajú bez priameho prístupu", async () => {
    await db.exec("set role anon");
    await expect(db.query("select * from public.card_price_history")).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from public.db_usage_log")).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
  });
});
