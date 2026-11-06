"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CardImg, CardModal, DataError, FilterBar, Foil, Loading } from "@/components/ui";
import MarketTabs from "@/components/MarketTabs";
import { useAuth } from "@/lib/auth";
import { topMoves } from "@/lib/collector";
import { useCollection } from "@/lib/collection";
import { Card, eur, sortSets, useCards, usePrices } from "@/lib/data";
import { formatPct, salesChange } from "@/lib/price-series";
import { useTcg } from "@/lib/tcg";

const PAGE = 50;
const MIN_PRICES = [1, 5, 20, 100];

export default function Page() {
  const { tcg } = useTcg();
  if (tcg === "pokemon")
    return (
      <div className="empty">
        Pohyby cien máme zatiaľ len pre One Piece. <Link href="/karty">Späť na karty</Link>
      </div>
    );
  return <Moves />;
}

function Moves() {
  const { data, error } = useCards();
  const { data: prices } = usePrices();
  const usd = prices?.fx?.USD ?? 1.12;
  const { user } = useAuth();
  const { qty, setQty } = useCollection(user?.id, !!user);
  const [dir, setDir] = useState<"up" | "down">("up");
  const [min, setMin] = useState(5);
  const [set, setSet] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<Card | null>(null);

  const sets = useMemo(() => (data ? sortSets(data.sets) : []), [data]);
  const list = useMemo(() => (data ? topMoves(set ? data.cards.filter((c) => c.set === set) : data.cards, usd, dir, min) : []), [data, usd, dir, min, set]);

  if (error) return <DataError error={error} file="cards" />;
  if (!data) return <Loading shape="rows" />;

  return (
    <div className="moves">
      <MarketTabs />
      <h1>Pohyby cien</h1>
      <p className="muted moves-note">
        Priemerná predajná cena za posledných 7 dní oproti 30 dňom podľa Cardmarketu. Je to orientačné: kariet sa často predá málo a jeden predaj dokáže priemer pohnúť, preto sa oplatí pozrieť si aj ponuky.
      </p>
      <div className="pchart-range moves-dir" role="group" aria-label="Smer pohybu">
        <button className={dir === "up" ? "on" : ""} aria-pressed={dir === "up"} onClick={() => (setDir("up"), setLimit(PAGE))}>
          Zdražujú
        </button>
        <button className={dir === "down" ? "on" : ""} aria-pressed={dir === "down"} onClick={() => (setDir("down"), setLimit(PAGE))}>
          Zlacňujú
        </button>
      </div>
      <FilterBar>
        <label className="field">
          <span>Cena od</span>
          <select value={min} onChange={(e) => (setMin(Number(e.target.value)), setLimit(PAGE))}>
            {MIN_PRICES.map((m) => (
              <option key={m} value={m}>
                {m} €
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Set</span>
          <select value={set} onChange={(e) => (setSet(e.target.value), setLimit(PAGE))}>
            <option value="">Všetky</option>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id}
              </option>
            ))}
          </select>
        </label>
      </FilterBar>
      {list.length === 0 ? (
        <div className="empty">Pre tento výber nemáme žiadne pohyby. Skús nižšiu cenu alebo iný set.</div>
      ) : (
        <div className="vlist">
          {list.slice(0, limit).map((m, k) => {
            const s = salesChange(m.card)!;
            return (
              <div key={m.card.id} className="vrow" role="button" tabIndex={0} onClick={() => setOpen(m.card)} onKeyDown={(e) => e.key === "Enter" && setOpen(m.card)}>
                <span className="vrank">{k + 1}</span>
                <Foil holo={!!m.card.v} className="vthumb">
                  <CardImg card={m.card} />
                </Foil>
                <span className="vname">
                  <b>{m.card.name}</b>
                  <span className="small muted">
                    {m.card.id}
                    {m.card.v && <span className="tag tiny">{m.card.v}</span>}
                  </span>
                </span>
                <span className={`vqty cmove ${m.pct > 0 ? "up" : "down"}`}>{formatPct(m.pct)}</span>
                <span className="vunit small muted">
                  {eur(s.avg30)} → {eur(s.avg7)}
                </span>
                <b className="vtotal">{eur(m.price)}</b>
              </div>
            );
          })}
        </div>
      )}
      {list.length > limit && (
        <div className="center">
          <button className="btn ghost" onClick={() => setLimit(limit + PAGE)}>
            Zobraziť ďalšie ({list.length - limit})
          </button>
        </div>
      )}
      {open && <CardModal card={open} usd={usd} onClose={() => setOpen(null)} qty={user ? qty[open.id] ?? 0 : undefined} onSet={user ? (v) => setQty(open.id, v) : undefined} />}
    </div>
  );
}
