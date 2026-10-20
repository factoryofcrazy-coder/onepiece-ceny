"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Bar, DataError, Loading, NeedLogin, OwnerPicker } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useCollection } from "@/lib/collection";
import { eur, sortSets, useCards, usePrices } from "@/lib/data";

type Row = {
  id: string;
  name: string;
  base: number;
  baseHave: number;
  all: number;
  allHave: number;
  value: number;
  missingCost: number;
  missingBaseCost: number;
};

export default function MasterSets() {
  const { data, error } = useCards();
  const { data: prices } = usePrices();
  const { user, loading } = useAuth();
  const [owner, setOwner] = useState<string | null>(null);
  const viewing = owner ?? user?.id ?? null;
  const { qty } = useCollection(viewing, false);
  const [mode, setMode] = useState<"base" | "master">("base");
  const usd = prices?.fx?.USD ?? 1.12;

  const rows = useMemo(() => {
    if (!data) return [];
    const m = new Map<string, Row>();
    for (const c of data.cards) {
      if (!c.set) continue;
      let r = m.get(c.set);
      if (!r) {
        r = { id: c.set, name: c.setName, base: 0, baseHave: 0, all: 0, allHave: 0, value: 0, missingCost: 0, missingBaseCost: 0 };
        m.set(c.set, r);
      }
      const n = qty[c.id] ?? 0;
      const price = (c.usd ?? 0) / usd;
      r.all++;
      if (n) r.allHave++;
      else r.missingCost += price;
      if (!c.v) {
        r.base++;
        if (n) r.baseHave++;
        else r.missingBaseCost += price;
      }
      r.value += n * price;
    }
    return sortSets([...m.values()]);
  }, [data, qty, usd]);

  if (error) return <DataError error={error} file="cards" />;
  if (!data || loading) return <Loading />;
  if (!user) return <NeedLogin what="Master sety" />;

  const tot = rows.reduce(
    (a, r) => ({ have: a.have + (mode === "base" ? r.baseHave : r.allHave), all: a.all + (mode === "base" ? r.base : r.all), value: a.value + r.value }),
    { have: 0, all: 0, value: 0 },
  );

  return (
    <>
      <div className="head">
        <div>
          <h1>Master sety</h1>
          <p className="muted small">
            Spolu {tot.have} / {tot.all} kariet · hodnota kolekcie {eur(tot.value)} (TCGplayer)
          </p>
        </div>
        <div className="row gap">
          <div className="seg">
            <button className={mode === "base" ? "on" : ""} onClick={() => setMode("base")}>
              Základný set
            </button>
            <button className={mode === "master" ? "on" : ""} onClick={() => setMode("master")}>
              Master set (+ parallely)
            </button>
          </div>
          <OwnerPicker value={viewing} onChange={setOwner} />
        </div>
      </div>

      <div className="setlist">
        {rows.map((r) => {
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
              <div className="sname">
                <b>{r.id}</b> <span className="muted">{r.name}</span>
              </div>
              <Bar value={have} max={all} />
              <div className="snum">
                <b>{pct} %</b> <span className="muted small">{have}/{all}</span>
              </div>
              <div className="small muted sval">
                mám {eur(r.value, 0)} · chýba {eur(miss, 0)}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
