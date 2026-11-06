"use client";
import { plural } from "@/lib/sk";
import PkCollection from "@/components/pk/PkCollection";
import { useTcg } from "@/lib/tcg";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { collectionChange, collectionCsv, topMoves } from "@/lib/collector";
import { Copy, gradedCounts, loadCopies, portfolio } from "@/lib/copies";
import { formatPct, salesChange } from "@/lib/price-series";
import { Bar, CardImg, CardModal, CountUp, DataError, Foil, Loading, NeedLogin, OtherGameHint, OwnerPicker, PriceMove } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useCollection } from "@/lib/collection";
import { Card, eur, setKind, useCards, usePrices, cardEur } from "@/lib/data";

type Item = { card: Card; n: number; unit: number | null; total: number };

const SORTS = { total: "Celková hodnota", unit: "Cena za kus", move: "Pohyb ceny", qty: "Počet kusov", name: "Meno" } as const;
const signedEur = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${eur(Math.abs(v))}`;

function OpCollection() {
  const { user, loading } = useAuth();
  const { data, error } = useCards();
  const { data: prices } = usePrices();
  const usd = prices?.fx?.USD ?? 1.12;
  const [owner, setOwner] = useState<string | null>(null);
  const viewing = owner ?? user?.id ?? null;
  const mine = !!user && viewing === user.id;
  const { qty, setQty, loading: qLoading } = useCollection(viewing, mine);
  const [sort, setSort] = useState<keyof typeof SORTS>("total");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Card | null>(null);
  // null = tabuľka kusov ešte nie je v databáze, sekcia sa neukáže
  const [copies, setCopies] = useState<Copy[] | null>(null);
  const reloadCopies = useCallback(() => {
    if (mine) loadCopies().then(setCopies);
  }, [mine]);
  useEffect(() => {
    setCopies(null);
    reloadCopies();
  }, [reloadCopies]);

  const items = useMemo(() => {
    if (!data) return [];
    const out: Item[] = [];
    for (const [id, n] of Object.entries(qty)) {
      if (!(n > 0)) continue;
      const card = data.byId.get(id);
      if (!card) continue;
      const unit = cardEur(card, usd);
      out.push({ card, n, unit, total: (unit ?? 0) * n });
    }
    return out;
  }, [data, qty, usd]);

  const stats = useMemo(() => {
    const value = items.reduce((s, i) => s + i.total, 0);
    const pieces = items.reduce((s, i) => s + i.n, 0);
    const bySet = new Map<string, { id: string; name: string; value: number; n: number }>();
    const byRarity = new Map<string, { value: number; n: number }>();
    for (const i of items) {
      const s = bySet.get(i.card.set) ?? { id: i.card.set, name: i.card.setName, value: 0, n: 0 };
      s.value += i.total;
      s.n += i.n;
      bySet.set(i.card.set, s);
      const r = byRarity.get(i.card.rarity || "?") ?? { value: 0, n: 0 };
      r.value += i.total;
      r.n += i.n;
      byRarity.set(i.card.rarity || "?", r);
    }
    const sets = [...bySet.values()].sort((a, b) => b.value - a.value);
    const rarities = [...byRarity.entries()].sort((a, b) => b[1].value - a[1].value);
    const top = [...items].sort((a, b) => (b.unit ?? 0) - (a.unit ?? 0)).slice(0, 3);
    return { value, pieces, sets, rarities, top, unpriced: items.filter((i) => i.unit == null).length };
  }, [items]);

  const change = useMemo(() => collectionChange(items), [items]);
  const moves = useMemo(() => {
    const cards = items.map((i) => i.card);
    return { up: topMoves(cards, usd, "up", 1).slice(0, 3), down: topMoves(cards, usd, "down", 1).slice(0, 3) };
  }, [items, usd]);
  const profit = useMemo(() => {
    if (!copies || !data) return null;
    return portfolio(copies, (id) => cardEur(data.byId.get(id), usd));
  }, [copies, data, usd]);
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([collectionCsv(items, copies ?? [])], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `grand-line-zbierka-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const l = items.filter(
      (i) => !s || i.card.name.toLowerCase().includes(s) || i.card.id.toLowerCase().includes(s) || i.card.setName.toLowerCase().includes(s),
    );
    l.sort((a, b) =>
      sort === "total"
        ? b.total - a.total
        : sort === "move"
          ? Math.abs(salesChange(b.card)?.pct ?? -1) - Math.abs(salesChange(a.card)?.pct ?? -1)
        : sort === "unit"
          ? (b.unit ?? -1) - (a.unit ?? -1)
          : sort === "qty"
            ? b.n - a.n || b.total - a.total
            : a.card.name.localeCompare(b.card.name),
    );
    return l;
  }, [items, q, sort]);

  if (loading) return <Loading shape="tiles" />;
  if (!user) return <NeedLogin what="Zbierka" />;
  if (error) return <DataError error={error} file="cards" />;
  if (!data || qLoading) return <Loading what="Počítam hodnotu zbierky" shape="tiles" />;

  const maxSet = stats.sets[0]?.value || 1;

  return (
    <>
      <section className="vault">
        <div className="vault-copy">
          <p className="vault-label">{mine ? "Tvoja zbierka má hodnotu" : "Zbierka má hodnotu"}</p>
          <div className="vault-value">
            <CountUp value={stats.value} format={(v) => v.toLocaleString("sk-SK", { maximumFractionDigits: 0 })} />
            <small>€</small>
          </div>
          <p className="muted">
            Kusy: {stats.pieces}, rôzne karty: {items.length}, sety: {stats.sets.length}. Ceny: Cardmarket trend, kde chýba,
            TCGplayer prepočítaný na eurá
            {stats.unpriced > 0 && <>; {stats.unpriced} {plural(stats.unpriced, "karta zatiaľ nemá", "karty zatiaľ nemajú", "kariet zatiaľ nemá")} cenu</>}.
          </p>
          {mine && (
            <p className="tiny muted">
              Prihlásený ako <b>{user.email}</b>
            </p>
          )}
          <div className="row gap wrapr vault-actions">
            <OwnerPicker value={viewing} onChange={setOwner} />
            {mine && (
              <Link className="btn ghost sm" href="/import">
                Import z HoloDex
              </Link>
            )}
            {mine && items.length > 0 && (
              <button className="btn ghost sm" onClick={exportCsv}>
                Export do Excelu
              </button>
            )}
          </div>
        </div>
        {stats.top.length > 0 && (
          <div className="vault-top" aria-label="Najcennejšie karty">
            {stats.top.map((i, k) => (
              <button
                key={i.card.id}
                className="vault-card"
                style={{ ["--k" as any]: k }}
                onClick={() => setOpen(i.card)}
              >
                <Foil holo>
                  <CardImg card={i.card} />
                </Foil>
                <span className="vault-price">{eur(i.unit, 0)}</span>
                <span className="small vault-name">{i.card.name}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {items.length === 0 ? (
        <div className="empty">
          {mine ? (
            <>
              Zbierka je zatiaľ prázdna. Pridaj karty v <Link href="/karty">Kartách</Link>, naskenuj ich{" "}
              <Link href="/skener">Skenerom</Link> alebo ich <Link href="/import">naimportuj z HoloDex</Link>.
              <OtherGameHint qty={qty} game="onepiece" />
            </>
          ) : (
            "Tento kamoš zatiaľ nemá v zbierke žiadne karty."
          )}
        </div>
      ) : (
        <>
          {(change || (mine && copies)) && (
            <div className="collector-grid">
              {mine && profit && (
                <section className="panel collector">
                  <h2 className="sub">Zisk a strata</h2>
                  {copies && gradedCounts(copies).length > 0 && (
                    <p className="small">Hodnotené karty: {gradedCounts(copies).map(([g, n]) => `${g} ${n}×`).join(", ")}</p>
                  )}
                  {profit.counted > 0 ? (
                    <>
                      <p className="collector-big">
                        <b className={profit.diff > 0 ? "cmove up" : profit.diff < 0 ? "cmove down" : ""}>{signedEur(profit.diff)}</b>
                        {profit.pct != null && <span className="muted"> {formatPct(profit.pct)}</span>}
                      </p>
                      <p className="small muted">
                        Zaplatené {eur(profit.paid)}, dnešná hodnota {eur(profit.value)}. Počíta sa z {profit.counted} {plural(profit.counted, "kusu", "kusov", "kusov")}.
                      </p>
                      {profit.noPaid + profit.noValue > 0 && (
                        <p className="tiny muted">
                          Nezapočítané: {profit.noPaid > 0 && `${profit.noPaid} bez nákupnej ceny`}
                          {profit.noPaid > 0 && profit.noValue > 0 && ", "}
                          {profit.noValue > 0 && `${profit.noValue} bez hodnoty (pri gradovanej karte zapíš hodnotu podľa predajov)`}.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="small muted">Otvor kartu a v časti Moje kusy zapíš, za koľko si ju kúpil. Tu uvidíš, či si v pluse. Vidíš to len ty.</p>
                  )}
                </section>
              )}
              {change && (
                <section className="panel collector">
                  <h2 className="sub">Čo sa v zbierke hýbe</h2>
                  <p className="collector-big">
                    <b className={change.pct > 0 ? "cmove up" : change.pct < 0 ? "cmove down" : ""}>{formatPct(change.pct)}</b>
                  </p>
                  <p className="small muted">Priemerné predaje za 7 dní oproti 30 dňom. Ber to ako orientačné, ceny kariet bežne kolíšu.</p>
                  {[...moves.up, ...moves.down].map((m) => (
                    <button key={m.card.id} className="collector-row" onClick={() => setOpen(m.card)}>
                      <span>{m.card.name} <span className="muted tiny">{m.card.id}</span></span>
                      <span className={`cmove ${m.pct > 0 ? "up" : "down"}`}>{formatPct(m.pct)}</span>
                    </button>
                  ))}
                  <Link className="small" href="/pohyby">Všetky pohyby cien →</Link>
                </section>
              )}
            </div>
          )}

          <div className="vault-grid">
            <section className="panel vault-sets">
              <h2 className="sub">Hodnota podľa setov</h2>
              {stats.sets.map((s) => (
                <Link key={s.id} href={`/karty?set=${encodeURIComponent(s.id)}&own=have`} className="vs-row">
                  <span className="vs-name">
                    <b>{s.id}</b> <span className="muted small">{s.name}</span>
                  </span>
                  <Bar value={s.value} max={maxSet} />
                  <span className="vs-val">
                    {eur(s.value, 0)} <span className="muted tiny">{s.n} ks</span>
                  </span>
                </Link>
              ))}
            </section>
            <section className="panel vault-rar">
              <h2 className="sub">Podľa rarity</h2>
              <div className="rar-chips">
                {stats.rarities.map(([r, v]) => (
                  <div key={r} className="rar">
                    <b>{r}</b>
                    <span>{eur(v.value, 0)}</span>
                    <span className="muted tiny">{v.n} ks</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="filters">
            <label className="field grow">
              <span>Hľadať v zbierke</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="meno, kód alebo set" />
            </label>
            <label className="field">
              <span>Zoradiť</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as keyof typeof SORTS)}>
                {Object.entries(SORTS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="vlist">
            {list.map((i, k) => (
              <div key={i.card.id} className="vrow" onClick={() => setOpen(i.card)} style={{ ["--d" as any]: `${Math.min(k, 20) * 18}ms` }}>
                <span className="vrank">{k + 1}</span>
                <Foil holo={!!i.card.v} className="vthumb">
                  <CardImg card={i.card} />
                </Foil>
                <span className="vname">
                  <b>{i.card.name}</b>
                  <span className="small muted">
                    {i.card.id} · {setKind(i.card.set) === "other" ? "Promo" : setKind(i.card.set) === "don" ? "DON!!" : i.card.set}
                    {i.card.v && <span className="tag tiny">{i.card.v}</span>}
                    {" "}<PriceMove card={i.card} />
                  </span>
                </span>
                <span className="vqty">{i.n}×</span>
                <span className="vunit small muted">{i.unit != null ? eur(i.unit) : "bez ceny"}</span>
                <b className="vtotal">{i.unit != null ? eur(i.total) : "–"}</b>
              </div>
            ))}
          </div>
        </>
      )}

      {open && (
        <CardModal
          card={open}
          usd={usd}
          onClose={() => setOpen(null)}
          qty={qty[open.id] ?? 0}
          onSet={mine ? (v) => setQty(open.id, v) : undefined}
          onCopies={reloadCopies}
        />
      )}
    </>
  );
}

/** Prepínač hry v menu: One Piece alebo Pokémon verzia stránky. */
export default function Page() {
  const { tcg } = useTcg();
  return tcg === "pokemon" ? <PkCollection /> : <OpCollection />;
}
