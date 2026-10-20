"use client";
import { useEffect, useMemo, useState } from "react";
import { CardImg, CardModal, DataError, Foil, Loading, OwnerPicker, Qty } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useCollection } from "@/lib/collection";
import { Card, COLOR_SK, COLORS, eur, SET_KIND_SK, setKind, sortSets, TYPE_SK, useCards, usePrices } from "@/lib/data";

const PAGE = 120;

export default function CardsPage() {
  const { data, error } = useCards();
  const { data: prices } = usePrices();
  const { user } = useAuth();
  const [owner, setOwner] = useState<string | null>(null);
  const viewing = owner ?? user?.id ?? null;
  const mine = !!user && viewing === user.id;
  const { qty, setQty } = useCollection(viewing, mine);

  const [set, setSet] = useState("");
  const [q, setQ] = useState("");
  const [color, setColor] = useState("");
  const [type, setType] = useState("");
  const [rarity, setRarity] = useState("");
  const [variant, setVariant] = useState("all");
  const [own, setOwn] = useState("all");
  const [sort, setSort] = useState("code");
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<Card | null>(null);
  const usd = prices?.fx?.USD ?? 1.12;

  // ?set=OP-01&own=missing (odkaz z Master setov)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("set")) setSet(p.get("set")!);
    if (p.get("own")) setOwn(p.get("own")!);
    if (p.get("variant")) setVariant(p.get("variant")!);
  }, []);
  useEffect(() => setLimit(PAGE), [set, q, color, type, rarity, variant, own, sort, viewing]);

  const sets = useMemo(() => (data ? sortSets(data.sets) : []), [data]);
  useEffect(() => {
    if (data && !set && !new URLSearchParams(window.location.search).get("set")) setSet(sets[0]?.id ?? "");
  }, [data, sets, set]);
  const rarities = useMemo(() => (data ? [...new Set(data.cards.map((c) => c.rarity).filter(Boolean))].sort() : []), [data]);

  const list = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase();
    const out = data.cards.filter(
      (c) =>
        (!set || c.set === set) &&
        (!color || c.colors.includes(color)) &&
        (!type || c.type === type) &&
        (!rarity || c.rarity === rarity) &&
        (variant === "all" || (variant === "base" ? !c.v : !!c.v)) &&
        (own === "all" || (own === "have" ? (qty[c.id] ?? 0) > 0 : !(qty[c.id] > 0))) &&
        (!s ||
          c.name.toLowerCase().includes(s) ||
          c.code.toLowerCase().includes(s) ||
          c.traits.toLowerCase().includes(s) ||
          c.text.toLowerCase().includes(s)),
    );
    if (sort === "price") out.sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1));
    else if (sort === "name") out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [data, set, q, color, type, rarity, variant, own, qty, sort]);

  if (error) return <DataError error={error} file="cards" />;
  if (!data) return <Loading what="Načítavam karty" shape="cards" />;

  const owned = list.filter((c) => qty[c.id] > 0);
  const value = owned.reduce((s, c) => s + (c.usd ?? 0) * qty[c.id], 0) / usd;

  return (
    <>
      <div className="head">
        <div>
          <h1>Karty</h1>
          <p className="muted small">
            {list.length} kariet
            {viewing && (
              <>
                {" "}
                · vlastnené {owned.length} · hodnota {eur(value)}
              </>
            )}
            {!user && " · prihlás sa, aby si si mohol značiť kolekciu"}
          </p>
        </div>
        <OwnerPicker value={viewing} onChange={setOwner} />
      </div>

      <div className="filters">
        <label className="field">
          <span>Set</span>
          <select value={set} onChange={(e) => setSet(e.target.value)}>
            <option value="">Všetky sety</option>
            {(["booster", "starter", "other"] as const).map((k) => {
              const g = sets.filter((x) => setKind(x.id) === k);
              return g.length ? (
                <optgroup key={k} label={`${SET_KIND_SK[k]} (${g.length})`}>
                  {g.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.id} – {x.name}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}          </select>
        </label>
        <label className="field grow">
          <span>Hľadať</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Luffy, OP01-001, Straw Hat…" />
        </label>
        <label className="field">
          <span>Farba</span>
          <select value={color} onChange={(e) => setColor(e.target.value)}>
            <option value="">Všetky</option>
            {COLORS.map((c) => (
              <option key={c} value={c}>
                {COLOR_SK[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Typ</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Všetky</option>
            {Object.entries(TYPE_SK).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Rarita</span>
          <select value={rarity} onChange={(e) => setRarity(e.target.value)}>
            <option value="">Všetky</option>
            {rarities.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Verzia</span>
          <select value={variant} onChange={(e) => setVariant(e.target.value)}>
            <option value="all">Všetky</option>
            <option value="base">Len základné</option>
            <option value="alt">Len parallel / alt art</option>
          </select>
        </label>
        {viewing && (
          <label className="field">
            <span>Vlastníctvo</span>
            <select value={own} onChange={(e) => setOwn(e.target.value)}>
              <option value="all">Všetky</option>
              <option value="have">Mám</option>
              <option value="missing">Chýba</option>
            </select>
          </label>
        )}
        <label className="field">
          <span>Zoradiť</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="code">Číslo</option>
            <option value="price">Cena</option>
            <option value="name">Meno</option>
          </select>
        </label>
      </div>

      <div className="cgrid">
        {list.slice(0, limit).map((c) => {
          const n = qty[c.id] ?? 0;
          return (
            <div key={c.id} className={`ccell ${viewing && !n ? "missing" : ""}`} onClick={() => setOpen(c)}>
              <Foil holo={!!c.v}>
                <CardImg card={c} />
              </Foil>
              <div className="cmeta">
                <span className="small">{c.code}</span>
                <span className="small muted cprice">{c.usd != null ? eur(c.usd / usd) : ""}</span>
                {c.v && <span className="tag tiny">{c.v}</span>}
              </div>
              {viewing && <Qty n={n} onSet={mine ? (v) => setQty(c.id, v) : undefined} disabled={!mine} />}
            </div>
          );
        })}
      </div>
      {list.length > limit && (
        <div className="center">
          <button className="btn ghost" onClick={() => setLimit(limit + PAGE)}>
            Zobraziť ďalšie ({list.length - limit})
          </button>
        </div>
      )}
      {open && (
        <CardModal
          card={open}
          usd={usd}
          onClose={() => setOpen(null)}
          qty={viewing ? qty[open.id] ?? 0 : undefined}
          onSet={mine ? (v) => setQty(open.id, v) : undefined}
        />
      )}
    </>
  );
}
