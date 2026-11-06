"use client";
import PkCards from "@/components/pk/PkCards";
import { useTcg } from "@/lib/tcg";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { salesChange } from "@/lib/price-series";
import { CardImg, CardModal, DataError, Foil, Loading, OwnerPicker, PriceMove, Qty, FilterBar } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useCollection } from "@/lib/collection";
import { useLang } from "@/lib/lang";
import { Card, COLOR_SK, COLORS, eur, SET_KIND_EN, SET_KIND_SK, SET_KINDS, setKind, sortSets, TYPE_SK, useCards, usePrices, cardEur } from "@/lib/data";
import { IMPORT_PUBLIC } from "@/lib/config";

const PAGE = 120;

function OpCardsPage() {
  const { t, lang } = useLang();
  const en = lang === "en";
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
    if (p.get("q")) setQ(p.get("q")!);
    // hľadanie z hornej lišty, aj keď už je človek na tejto stránke
    const onSearch = (e: Event) => setQ((e as CustomEvent<string>).detail);
    window.addEventListener("op-card-search", onSearch);
    return () => window.removeEventListener("op-card-search", onSearch);
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
        (!set || !!s || c.set === set) && // pri hľadaní sa ide cez všetky sety
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
    if (sort === "price") out.sort((a, b) => (cardEur(b, usd) ?? -1) - (cardEur(a, usd) ?? -1));
    else if (sort === "name") out.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "move") {
      const size = (c: Card) => ((c.cm ?? 0) >= 1 ? Math.abs(salesChange(c)?.pct ?? -1) : -1);
      out.sort((a, b) => size(b) - size(a));
    }
    return out;
  }, [data, set, q, color, type, rarity, variant, own, qty, sort]);

  if (error) return <DataError error={error} file="cards" />;
  if (!data) return <Loading what={t("Načítavam karty", "Loading cards")} shape="cards" />;

  const owned = list.filter((c) => qty[c.id] > 0);
  const value = owned.reduce((s, c) => s + (cardEur(c, usd) ?? 0) * qty[c.id], 0);

  return (
    <>
      <div className="head">
        <div>
          <h1>{t("Karty", "Cards")}</h1>
          <p className="muted small">
            {list.length} {t("kariet", "cards")}
            {viewing && (
              <>
                {" "}
                · {t("vlastnené", "owned")} {owned.length} · {t("hodnota", "value")} {eur(value)}
              </>
            )}
            {!user && t(" · prihlás sa a môžeš si značiť karty v zbierke", " · sign in to mark cards in your collection")}
          </p>
        </div>
        <div className="row gap wrapr">
          {user && IMPORT_PUBLIC && (
            <Link className="btn ghost sm" href="/import">
              {t("Import z HoloDex", "Import from HoloDex")}
            </Link>
          )}
          <OwnerPicker value={viewing} onChange={setOwner} />
        </div>
      </div>

      <FilterBar>
        <label className={`field keep ${q.trim() ? "dimmed" : ""}`}>
          <span>{q.trim() ? t("Set (hľadá sa vo všetkých)", "Set (searching all)") : "Set"}</span>
          <select value={set} onChange={(e) => setSet(e.target.value)}>
            <option value="">{t("Všetky sety", "All sets")}</option>
            {SET_KINDS.map((k) => {
              const g = sets.filter((x) => setKind(x.id) === k);
              return g.length ? (
                <optgroup key={k} label={`${(en ? SET_KIND_EN : SET_KIND_SK)[k]} (${g.length})`}>
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
          <span>{t("Hľadať", "Search")}</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Hľadá vo všetkých setoch: Luffy, OP01-001, Straw Hat…", "Searches all sets: Luffy, OP01-001, Straw Hat…")} />
        </label>
        <label className="field">
          <span>{t("Farba", "Color")}</span>
          <select value={color} onChange={(e) => setColor(e.target.value)}>
            <option value="">{t("Všetky", "All")}</option>
            {COLORS.map((c) => (
              <option key={c} value={c}>
                {en ? c : COLOR_SK[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("Typ", "Type")}</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">{t("Všetky", "All")}</option>
            {Object.entries(TYPE_SK).map(([k, v]) => (
              <option key={k} value={k}>
                {en ? k : v}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("Rarita", "Rarity")}</span>
          <select value={rarity} onChange={(e) => setRarity(e.target.value)}>
            <option value="">{t("Všetky", "All")}</option>
            {rarities.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("Verzia", "Version")}</span>
          <select value={variant} onChange={(e) => setVariant(e.target.value)}>
            <option value="all">{t("Všetky", "All")}</option>
            <option value="base">{t("Len základné", "Base only")}</option>
            <option value="alt">{t("Len parallel / alt art", "Parallel / alt art only")}</option>
          </select>
        </label>
        {viewing && (
          <label className="field">
            <span>{t("Vlastníctvo", "Owned")}</span>
            <select value={own} onChange={(e) => setOwn(e.target.value)}>
              <option value="all">{t("Všetky", "All")}</option>
              <option value="have">{t("Mám", "Have")}</option>
              <option value="missing">{t("Chýba", "Missing")}</option>
            </select>
          </label>
        )}
        <label className="field">
          <span>{t("Zoradiť", "Sort")}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="code">{t("Číslo", "Number")}</option>
            <option value="price">{t("Cena", "Price")}</option>
            <option value="move">{t("Pohyb ceny", "Price move")}</option>
            <option value="name">{t("Meno", "Name")}</option>
          </select>
        </label>
      </FilterBar>

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
                <span className="small cprice">{cardEur(c, usd) != null ? eur(cardEur(c, usd)) : ""}</span>
                <PriceMove card={c} />
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
            {t("Zobraziť ďalšie", "Show more")} ({list.length - limit})
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

/** Prepínač hry v menu: One Piece alebo Pokémon verzia stránky. */
export default function Page() {
  const { tcg } = useTcg();
  return tcg === "pokemon" ? <PkCards /> : <OpCardsPage />;
}
