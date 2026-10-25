"use client";
import { useEffect, useMemo, useState } from "react";
import { CardImg, DataError, Foil, Loading, OwnerPicker, Qty } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useCollection } from "@/lib/collection";
import { eur } from "@/lib/data";
import { PK_TYPE_SK, PkCard, PkSet, usePkSearch, usePkSet, usePkSets } from "@/lib/pokemon";
import PkCardModal from "./PkCardModal";

const PAGE = 120;

/** Karty Pokémon: výber setu (TCGdex), ceny z Cardmarketu, značenie kolekcie vrátane reverse holo. */
export default function PkCards() {
  const { data: setsDb, error: setsErr } = usePkSets();
  const { user } = useAuth();
  const [owner, setOwner] = useState<string | null>(null);
  const viewing = owner ?? user?.id ?? null;
  const mine = !!user && viewing === user.id;
  const { qty, setQty } = useCollection(viewing, mine);

  const [set, setSet] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [rarity, setRarity] = useState("");
  const [variant, setVariant] = useState("all");
  const [own, setOwn] = useState("all");
  const [sort, setSort] = useState("num");
  const [global, setGlobal] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<PkCard | null>(null);

  // ?set=me02&own=missing&variant=base (odkaz z Master setov / zbierky)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("set")) setSet(p.get("set")!);
    if (p.get("own")) setOwn(p.get("own")!);
    if (p.get("variant")) setVariant(p.get("variant")!);
  }, []);
  const sets = setsDb?.sets ?? [];
  useEffect(() => {
    if (sets.length && !set && !new URLSearchParams(window.location.search).get("set")) setSet(sets[0].id);
  }, [sets, set]);
  useEffect(() => setLimit(PAGE), [set, q, type, rarity, variant, own, sort, viewing]);

  const { data, error } = usePkSet(set || null);
  const search = usePkSearch(global ? q : "");
  const bySeries = useMemo(() => {
    const m = new Map<string, PkSet[]>();
    for (const s of sets) m.set(s.series || "Ostatné", [...(m.get(s.series || "Ostatné") ?? []), s]);
    return [...m.entries()];
  }, [sets]);
  const rarities = useMemo(() => (data ? [...new Set(data.cards.map((c) => c.rarity).filter(Boolean))].sort() : []), [data]);

  const list = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase();
    const out = data.cards.filter(
      (c) =>
        (!type || c.type === type) &&
        (!rarity || c.rarity === rarity) &&
        (variant === "all" || (variant === "base" ? c.v !== "Reverse Holo" : c.v === "Reverse Holo")) &&
        (own === "all" || (own === "have" ? (qty[c.id] ?? 0) > 0 : !(qty[c.id] > 0))) &&
        (!s || c.name.toLowerCase().includes(s) || c.num.includes(s) || c.illustrator.toLowerCase().includes(s)),
    );
    if (sort === "price") out.sort((a, b) => (b.eur ?? -1) - (a.eur ?? -1));
    else if (sort === "name") out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [data, q, type, rarity, variant, own, qty, sort]);

  if (setsErr) return <DataError error={setsErr} file="cards" />;
  if (!setsDb) return <Loading what="Načítavam sety" shape="cards" />;

  const cur = sets.find((s) => s.id === set);
  const owned = list.filter((c) => qty[c.id] > 0);
  const value = owned.reduce((s, c) => s + (c.eur ?? 0) * qty[c.id], 0);

  return (
    <>
      <div className="head">
        <div>
          <h1>Pokémon karty</h1>
          <p className="muted small">
            {global ? `${search.data?.cards.length ?? "…"} nájdených vo všetkých setoch` : `${list.length} kariet`}
            {viewing && !global && (
              <>
                {" "}
                · vlastnené {owned.length} · hodnota {eur(value)}
              </>
            )}
            {!user && " · prihlás sa, aby si si mohol značiť kolekciu"}
          </p>
        </div>
        <div className="row gap wrapr">
          <OwnerPicker value={viewing} onChange={setOwner} />
        </div>
      </div>

      <div className="filters">
        <label className={`field ${global ? "dimmed" : ""}`}>
          <span>Set</span>
          <select value={set} onChange={(e) => (setSet(e.target.value), setGlobal(false))}>
            {bySeries.map(([series, list]) => (
              <optgroup key={series} label={series}>
                {list.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} ({x.date.slice(0, 4)})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="field grow">
          <span>Hľadať</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={global ? "Meno karty vo všetkých setoch: Charizard…" : "Meno, číslo alebo ilustrátor v tomto sete"} />
        </label>
        <label className="check">
          <input type="checkbox" checked={global} onChange={(e) => setGlobal(e.target.checked)} /> Vo všetkých setoch
        </label>
        {!global && (
          <>
            <label className="field">
              <span>Typ</span>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">Všetky</option>
                {Object.entries(PK_TYPE_SK).map(([k, v]) => (
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
                <option value="base">Bez reverse holo</option>
                <option value="rev">Len reverse holo</option>
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
                <option value="num">Číslo</option>
                <option value="price">Cena</option>
                <option value="name">Meno</option>
              </select>
            </label>
          </>
        )}
      </div>

      {global ? (
        q.trim().length < 2 ? (
          <div className="empty">Napíš aspoň 2 písmená mena karty.</div>
        ) : search.error ? (
          <DataError error={search.error} file="cards" />
        ) : !search.data ? (
          <Loading what="Hľadám" shape="cards" />
        ) : (
          <div className="cgrid">
            {search.data.cards.slice(0, limit).map((c) => {
              const s = sets.find((x) => x.id === c.set);
              return (
                <div
                  key={c.id}
                  className="ccell"
                  onClick={() => {
                    setSet(c.set);
                    setGlobal(false);
                    setQ(c.num);
                  }}
                  title="Otvoriť v sete (s cenou)"
                >
                  <Foil>
                    <CardImg card={c} />
                  </Foil>
                  <div className="cmeta">
                    <span className="small">{c.name}</span>
                    <span className="small muted">{s?.name ?? c.set}</span>
                  </div>
                  {viewing && <Qty n={qty[c.id] ?? 0} onSet={mine ? (v) => setQty(c.id, v) : undefined} disabled={!mine} />}
                </div>
              );
            })}
          </div>
        )
      ) : error ? (
        <DataError error={error} file="cards" />
      ) : !data ? (
        <Loading what="Načítavam set (prvé otvorenie trvá pár sekúnd)" shape="cards" />
      ) : (
        <>
          {cur && (
            <div className="pk-sethead">
              {cur.logo && <img className="pk-setlogo" src={cur.logo} alt="" onError={(e) => (e.currentTarget.style.display = "none")} />}
              <div>
                <h2>{cur.name}</h2>
                <span className="muted small">
                  {cur.series} · {cur.date} · {cur.official} kariet v sete, {cur.total} aj so secret rare
                </span>
              </div>
            </div>
          )}
          <div className="cgrid">
            {list.slice(0, limit).map((c) => {
              const n = qty[c.id] ?? 0;
              return (
                <div key={c.id} className={`ccell ${viewing && !n ? "missing" : ""}`} onClick={() => setOpen(c)}>
                  <Foil holo={c.v === "Reverse Holo" || /rare|illustration|ultra|secret|hyper/i.test(c.rarity)}>
                    <CardImg card={c} />
                  </Foil>
                  <div className="cmeta">
                    <span className="small pk-num">
                      {c.num}/{cur?.official ?? "?"}
                    </span>
                    <span className="small muted cprice">{c.eur != null ? eur(c.eur) : ""}</span>
                    {c.v && <span className="tag tiny">{c.v === "Reverse Holo" ? "Reverse" : c.v}</span>}
                  </div>
                  {viewing && <Qty n={n} onSet={mine ? (v) => setQty(c.id, v) : undefined} disabled={!mine} />}
                </div>
              );
            })}
          </div>
        </>
      )}
      {!global && list.length > limit && (
        <div className="center">
          <button className="btn ghost" onClick={() => setLimit(limit + PAGE)}>
            Zobraziť ďalšie ({list.length - limit})
          </button>
        </div>
      )}
      {open && (
        <PkCardModal
          card={open}
          official={cur?.official}
          onClose={() => setOpen(null)}
          qty={viewing ? qty[open.id] ?? 0 : undefined}
          onSet={mine ? (v) => setQty(open.id, v) : undefined}
        />
      )}
    </>
  );
}
