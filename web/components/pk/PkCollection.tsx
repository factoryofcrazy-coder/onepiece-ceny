"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Bar, CardImg, CountUp, Foil, Loading, NeedLogin, OwnerPicker } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useCollection } from "@/lib/collection";
import { eur } from "@/lib/data";
import { isPk, PkCard, pkSetOf, usePkSetsMany } from "@/lib/pokemon";
import PkCardModal from "./PkCardModal";

type Item = { card: PkCard; n: number; unit: number | null; total: number };
const SORTS = { total: "Celková hodnota", unit: "Cena za kus", qty: "Počet kusov", name: "Meno" } as const;

/** Zbierka Pokémon kariet – hodnota podľa Cardmarketu. */
export default function PkCollection() {
  const { user, loading } = useAuth();
  const [owner, setOwner] = useState<string | null>(null);
  const viewing = owner ?? user?.id ?? null;
  const mine = !!user && viewing === user.id;
  const { qty, setQty, loading: qLoading } = useCollection(viewing, mine);
  const [sort, setSort] = useState<keyof typeof SORTS>("total");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<PkCard | null>(null);

  const ownedIds = useMemo(() => Object.keys(qty).filter((id) => isPk(id) && qty[id] > 0), [qty]);
  const setIds = useMemo(() => ownedIds.map(pkSetOf), [ownedIds]);
  const { byId, pending, failed } = usePkSetsMany(setIds);

  const items = useMemo(() => {
    const out: Item[] = [];
    for (const id of ownedIds) {
      const card = byId.get(id);
      if (!card) continue;
      const n = qty[id];
      out.push({ card, n, unit: card.eur, total: (card.eur ?? 0) * n });
    }
    return out;
  }, [ownedIds, byId, qty]);

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
    return {
      value,
      pieces,
      sets: [...bySet.values()].sort((a, b) => b.value - a.value),
      rarities: [...byRarity.entries()].sort((a, b) => b[1].value - a[1].value),
      top: [...items].sort((a, b) => (b.unit ?? 0) - (a.unit ?? 0)).slice(0, 3),
      unpriced: items.filter((i) => i.unit == null).length,
    };
  }, [items]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const l = items.filter(
      (i) => !s || i.card.name.toLowerCase().includes(s) || i.card.code.includes(s) || i.card.setName.toLowerCase().includes(s),
    );
    l.sort((a, b) =>
      sort === "total"
        ? b.total - a.total
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
  if (qLoading || (pending > 0 && !items.length)) return <Loading what="Počítam hodnotu zbierky" shape="tiles" />;

  const maxSet = stats.sets[0]?.value || 1;

  return (
    <>
      <section className="vault">
        <div className="vault-copy">
          <p className="vault-label">{mine ? "Tvoja Pokémon zbierka má hodnotu" : "Pokémon zbierka má hodnotu"}</p>
          <div className="vault-value">
            <CountUp value={stats.value} format={(v) => v.toLocaleString("sk-SK", { maximumFractionDigits: 0 })} />
            <small>€</small>
          </div>
          <p className="muted">
            {stats.pieces} kusov, {items.length} rôznych kariet zo {stats.sets.length} setov. Ceny z Cardmarketu (trend)
            {stats.unpriced > 0 && <>; {stats.unpriced} kariet zatiaľ nemá cenu</>}
            {pending > 0 && <>; dopočítavam ešte {pending} setov</>}
            {failed.length > 0 && <>; nepodarilo sa načítať: {failed.join(", ")}</>}.
          </p>
          <div className="row gap wrapr vault-actions">
            <OwnerPicker value={viewing} onChange={setOwner} />
          </div>
        </div>
        {stats.top.length > 0 && (
          <div className="vault-top" aria-label="Najcennejšie karty">
            {stats.top.map((i, k) => (
              <button key={i.card.id} className="vault-card" style={{ ["--k" as any]: k }} onClick={() => setOpen(i.card)}>
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
              Pokémon zbierka je zatiaľ prázdna. Pridaj karty v <Link href="/karty">Kartách</Link>.
            </>
          ) : (
            "Tento kamoš zatiaľ nemá v zbierke žiadne Pokémon karty."
          )}
        </div>
      ) : (
        <>
          <div className="vault-grid">
            <section className="panel vault-sets">
              <h2 className="sub">Hodnota podľa setov</h2>
              {stats.sets.map((s) => (
                <Link key={s.id} href={`/karty?set=${encodeURIComponent(s.id)}&own=have`} className="vs-row">
                  <span className="vs-name">
                    <b>{s.name}</b> <span className="muted small">{s.id}</span>
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
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="meno, číslo alebo set" />
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
                <Foil holo={i.card.v === "Reverse Holo"} className="vthumb">
                  <CardImg card={i.card} />
                </Foil>
                <span className="vname">
                  <b>{i.card.name}</b>
                  <span className="small muted">
                    {i.card.setName} · {i.card.num}
                    {i.card.v && <span className="tag tiny">{i.card.v}</span>}
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
        <PkCardModal card={open} onClose={() => setOpen(null)} qty={qty[open.id] ?? 0} onSet={mine ? (v) => setQty(open.id, v) : undefined} />
      )}
    </>
  );
}
