"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Bar, DataError, Loading, NeedLogin, OwnerPicker } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useCollection } from "@/lib/collection";
import { eur } from "@/lib/data";
import { isPk, pkSetOf, usePkSets, usePkSetsMany } from "@/lib/pokemon";

type Row = {
  id: string;
  name: string;
  logo: string;
  date: string;
  base: number;
  baseHave: number;
  all: number | null; // null = set ešte nie je načítaný (nič z neho nemáš)
  allHave: number;
  value: number;
  missingCost: number | null;
  missingBaseCost: number | null;
};

/** Master sety Pokémon: základný set (každá karta raz) alebo master (aj reverse holo). */
export default function PkMasterSets() {
  const { data, error } = usePkSets();
  const { user, loading } = useAuth();
  const [owner, setOwner] = useState<string | null>(null);
  const viewing = owner ?? user?.id ?? null;
  const { qty } = useCollection(viewing, false);
  const [mode, setMode] = useState<"base" | "master">("base");
  const [series, setSeries] = useState("*mine");

  const ownedSets = useMemo(() => [...new Set(Object.keys(qty).filter((id) => isPk(id) && qty[id] > 0).map(pkSetOf))], [qty]);
  const { sets: loaded, pending } = usePkSetsMany(ownedSets);
  const seriesList = useMemo(() => [...new Set((data?.sets ?? []).map((s) => s.series || "Ostatné"))], [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.sets.map((s): Row => {
      const d = loaded.get(s.id);
      if (!d) {
        return {
          id: s.id, name: s.name, logo: s.logo, date: s.date, base: s.total, baseHave: 0, all: null, allHave: 0,
          value: 0, missingCost: null, missingBaseCost: null,
        };
      }
      const r: Row = { id: s.id, name: s.name, logo: s.logo, date: s.date, base: 0, baseHave: 0, all: 0, allHave: 0, value: 0, missingCost: 0, missingBaseCost: 0 };
      for (const c of d.cards) {
        const n = qty[c.id] ?? 0;
        const price = c.eur ?? 0;
        r.all!++;
        if (n) r.allHave++;
        else r.missingCost! += price;
        if (c.v !== "Reverse Holo") {
          r.base++;
          if (n) r.baseHave++;
          else r.missingBaseCost! += price;
        }
        r.value += n * price;
      }
      return r;
    });
  }, [data, loaded, qty]);

  const shown = rows.filter((r) =>
    series === "*mine" ? ownedSets.includes(r.id) : (data?.sets.find((s) => s.id === r.id)?.series || "Ostatné") === series,
  );

  if (error) return <DataError error={error} file="cards" />;
  if (!data || loading) return <Loading shape="rows" />;
  if (!user) return <NeedLogin what="Master sety" />;

  const tot = shown.reduce(
    (a, r) => ({
      have: a.have + (mode === "base" ? r.baseHave : r.allHave),
      all: a.all + (mode === "base" ? r.base : (r.all ?? r.base)),
      value: a.value + r.value,
    }),
    { have: 0, all: 0, value: 0 },
  );

  return (
    <>
      <div className="head">
        <div>
          <h1>Pokémon master sety</h1>
          <p className="muted small">
            Spolu {tot.have} / {tot.all} kariet · hodnota {eur(tot.value)} (Cardmarket)
            {pending > 0 && ` · načítavam ${pending} setov`}
          </p>
        </div>
        <div className="row gap wrapr">
          <label className="field">
            <span>Sety</span>
            <select value={series} onChange={(e) => setSeries(e.target.value)}>
              <option value="*mine">Ktoré zbieram ({ownedSets.length})</option>
              {seriesList.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <div className="seg">
            <button className={mode === "base" ? "on" : ""} onClick={() => setMode("base")}>
              Základný
            </button>
            <button className={mode === "master" ? "on" : ""} onClick={() => setMode("master")}>
              Master s reverse holo
            </button>
          </div>
          <OwnerPicker value={viewing} onChange={setOwner} />
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="empty">
          {series === "*mine" ? (
            <>
              Zatiaľ nezbieraš žiadny Pokémon set. Vyber sériu hore alebo pridaj karty v <Link href="/karty">Kartách</Link>.
            </>
          ) : (
            "V tejto sérii nie sú žiadne sety."
          )}
        </div>
      ) : (
        <div className="setlist">
          {shown.map((r) => {
            const have = mode === "base" ? r.baseHave : r.allHave;
            const all = mode === "base" ? r.base : r.all;
            const miss = mode === "base" ? r.missingBaseCost : r.missingCost;
            const pct = all ? Math.floor((have / all) * 100) : 0;
            return (
              <Link
                key={r.id}
                className="setrow"
                href={`/karty?set=${encodeURIComponent(r.id)}&own=missing${mode === "base" ? "&variant=base" : ""}`}
              >
                <div className="sname pk">
                  {r.logo ? <img className="pk-logo" src={r.logo} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = "hidden")} /> : null}
                  <span>
                    <b>{r.name}</b> <span className="muted small">{r.date.slice(0, 4)}</span>
                  </span>
                </div>
                <Bar value={have} max={all ?? r.base} />
                <div className="snum">
                  <b>{pct} %</b>{" "}
                  <span className="muted small">
                    {have}/{all ?? (mode === "master" ? `${r.base}+` : r.base)}
                  </span>
                </div>
                <div className="small muted sval">
                  {miss == null ? "otvor set pre ceny" : `mám ${eur(r.value, 0)} · chýba ${eur(miss, 0)}`}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
