"use client";
import PkMasterSets from "@/components/pk/PkMasterSets";
import { useTcg } from "@/lib/tcg";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Bar, DataError, Loading, NeedLogin, OwnerPicker } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/lang";
import { useCollection } from "@/lib/collection";
import { eur, SET_KINDS, SetKind, setKind, sortSets, useCards, usePrices, cardEur } from "@/lib/data";

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

function OpMasterSets() {
  const { t, lang } = useLang();
  const { data, error } = useCards();
  const { data: prices } = usePrices();
  const { user, loading } = useAuth();
  const [owner, setOwner] = useState<string | null>(null);
  const viewing = owner ?? user?.id ?? null;
  const { qty } = useCollection(viewing, false);
  const [mode, setMode] = useState<"base" | "master">("base");
  const [kind, setKindF] = useState<SetKind>("booster");
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
      const price = cardEur(c, usd) ?? 0;
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
  const shown = rows.filter((r) => setKind(r.id) === kind);

  if (error) return <DataError error={error} file="cards" />;
  if (!data || loading) return <Loading shape="rows" />;
  if (!user) return <NeedLogin what={t("Master sety", "Master sets")} />;

  const tot = shown.reduce(
    (a, r) => ({ have: a.have + (mode === "base" ? r.baseHave : r.allHave), all: a.all + (mode === "base" ? r.base : r.all), value: a.value + r.value }),
    { have: 0, all: 0, value: 0 },
  );

  return (
    <>
      <div className="head">
        <div>
          <h1>{t("Master sety", "Master sets")}</h1>
          <p className="muted small">
            {t("Spolu", "Total")} {tot.have} / {tot.all} {t("kariet", "cards")} · {t("hodnota zbierky", "collection value")} {eur(tot.value)} (Cardmarket)
          </p>
        </div>
        <div className="row gap">
          <div className="seg">
            {SET_KINDS.map((k) => (
              <button key={k} className={kind === k ? "on" : ""} onClick={() => setKindF(k)}>
                {(lang === "en" ? { booster: "Boosters", starter: "Starter decks", other: "Promo", don: "DON!!" } : { booster: "Boostery", starter: "Starter decky", other: "Promo", don: "DON!!" })[k]} (
                {rows.filter((r) => setKind(r.id) === k).length})
              </button>
            ))}
          </div>
          <div className="seg">
            <button className={mode === "base" ? "on" : ""} onClick={() => setMode("base")}>
              {t("Základný", "Base")}
            </button>
            <button className={mode === "master" ? "on" : ""} onClick={() => setMode("master")}>
              {t("Master s parallelmi", "Master with parallels")}
            </button>
          </div>
          <OwnerPicker value={viewing} onChange={setOwner} />
        </div>
      </div>

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
              <div className="sname">
                <b>{r.id}</b> <span className="muted">{r.name}</span>
              </div>
              <Bar value={have} max={all} />
              <div className="snum">
                <b>{pct} %</b> <span className="muted small">{have}/{all}</span>
              </div>
              <div className="small muted sval">
                {t("mám", "have")} {eur(r.value, 0)} · {t("chýba", "missing")} {eur(miss, 0)}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}

/** Prepínač hry v menu: One Piece alebo Pokémon verzia stránky. */
export default function Page() {
  const { tcg } = useTcg();
  return tcg === "pokemon" ? <PkMasterSets /> : <OpMasterSets />;
}
