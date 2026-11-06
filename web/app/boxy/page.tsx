"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DataError, FilterBar, Loading, Qty } from "@/components/ui";
import { eur, Offer, SealedItem, setOrder, useSealed, usePrices } from "@/lib/data";
import { formatPct } from "@/lib/price-series";
import { useTcg } from "@/lib/tcg";
import { useAuth } from "@/lib/auth";
import { useSealedCollection } from "@/lib/sealed-collection";

const PER = 24;
const KINDS = ["Box", "Case", "Pack", "Double Pack", "Starter", "Premium", "Iné"];
const cmUrl = (name: string) => `https://www.cardmarket.com/en/OnePiece/Products/Search?searchString=${encodeURIComponent(name)}`;
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
/** Pohyb hodnoty: trend oproti 30-dňovému priemeru, ak ho poznáme. */
const movePct = (s: SealedItem) => (s.cm != null && s.cm30 ? (s.cm / s.cm30 - 1) * 100 : null);

export default function Page() {
  const { tcg } = useTcg();
  if (tcg === "pokemon")
    return (
      <div className="empty">
        Hodnoty boxov máme zatiaľ len pre One Piece. <Link href="/ceny">Ceny boxov v obchodoch →</Link>
      </div>
    );
  return <Boxes />;
}

function Boxes() {
  const { data, error } = useSealed();
  const { data: prices } = usePrices();
  const { user } = useAuth();
  const { qty, setQty } = useSealedCollection(user?.id, !!user);
  const [kind, setKind] = useState("Box");
  const [lang, setLang] = useState<"EN" | "JP">("EN");
  const [set, setSet] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"value" | "move">("value");
  const [page, setPage] = useState(0);

  // obrázky z e-shopov (prices.json): set+druh+jazyk → obrázok
  const imgOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of (prices?.offers ?? []) as Offer[]) {
      const img = o[15];
      if (!img) continue;
      const key = `${norm(o[2])}|${o[3]}|${o[4]}`;
      if (!m.has(key)) m.set(key, img);
    }
    return m;
  }, [prices]);
  const thumbFor = (s: SealedItem) => (s.set ? imgOf.get(`${norm(s.set)}|${s.kind}|${s.lang}`) : undefined);

  const sets = useMemo(() => {
    if (!data) return [];
    const m = new Map<string, string>();
    for (const s of data.sealed) if (s.set) m.set(s.set, s.setName || s.set);
    return [...m].sort((a, b) => {
      const [ra, na] = setOrder(a[0]), [rb, nb] = setOrder(b[0]);
      return ra - rb || na - nb;
    });
  }, [data]);

  const list = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    const out = data.sealed.filter(
      (s) => s.lang === lang && (kind === "*" || s.kind === kind) && (!set || s.set === set) && (!needle || s.name.toLowerCase().includes(needle)),
    );
    out.sort(sort === "move" ? (a, b) => (movePct(b) ?? -999) - (movePct(a) ?? -999) : (a, b) => (b.cm ?? 0) - (a.cm ?? 0));
    return out;
  }, [data, kind, lang, set, q, sort]);

  const pages = Math.max(1, Math.ceil(list.length / PER));
  useEffect(() => setPage(0), [kind, lang, set, q, sort]);
  const shown = list.slice(page * PER, page * PER + PER);

  if (error) return <DataError error={error} file="sealed" />;
  if (!data) return <Loading shape="rows" />;

  return (
    <div className="moves boxes">
      <h1>Hodnoty boxov</h1>
      <p className="muted moves-note">
        Reálna trhová hodnota zapečatených produktov podľa Cardmarketu (trend cena), nie pýtaná cena obchodov. Porovnanie cien v e-shopoch nájdeš v <Link href="/ceny">Ceny boxov</Link>.
      </p>
      <div className="pchart-range moves-dir" role="group" aria-label="Jazyk">
        {(["EN", "JP"] as const).map((l) => (
          <button key={l} className={lang === l ? "on" : ""} aria-pressed={lang === l} onClick={() => setLang(l)}>
            {l === "EN" ? "Anglické" : "Japonské"}
          </button>
        ))}
      </div>
      <FilterBar>
        <label className="field">
          <span>Druh</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="*">Všetky</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Set</span>
          <select value={set} onChange={(e) => setSet(e.target.value)}>
            <option value="">Všetky</option>
            {sets.map(([id, name]) => (
              <option key={id} value={id}>
                {id} – {name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Zoradiť</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as "value" | "move")}>
            <option value="value">Najdrahšie</option>
            <option value="move">Najväčší pohyb</option>
          </select>
        </label>
        <label className="field grow">
          <span>Hľadať</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Napr. OP09, Romance Dawn…" />
        </label>
      </FilterBar>
      {list.length === 0 ? (
        <div className="empty">Pre tento výber nemáme žiadne produkty. Skús iný druh alebo jazyk.</div>
      ) : (
        <>
          <div className="vlist">
            {shown.map((s, k) => {
              const pct = movePct(s);
              const img = thumbFor(s);
              return (
                <div key={s.id} className={`vrow${user ? " qrow" : ""}`}>
                  <span className="vrank">{page * PER + k + 1}</span>
                  <a className="boxthumb" href={cmUrl(s.name)} target="_blank" rel="noreferrer" aria-label={s.name}>
                    {img ? <img src={img} alt="" loading="lazy" /> : <span className="boxthumb-ph" aria-hidden />}
                  </a>
                  <a className="vname" href={cmUrl(s.name)} target="_blank" rel="noreferrer">
                    <b>{s.name}</b>
                    <span className="small muted">
                      {s.set && <span className="tag tiny">{s.set}</span>} {s.kind}
                    </span>
                  </a>
                  {pct != null ? <span className={`vqty cmove ${pct > 0 ? "up" : pct < 0 ? "down" : ""}`}>{formatPct(pct)}</span> : <span className="vqty muted tiny">–</span>}
                  {s.cmLow != null ? <span className="vunit small muted">od {eur(s.cmLow)}</span> : <span className="vunit" />}
                  <b className="vtotal">{eur(s.cm)}</b>
                  {user && (
                    <span className="boxqty">
                      <Qty n={qty[s.id] ?? 0} onSet={(v) => setQty(s.id, v)} />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {pages > 1 && (
            <div className="pager">
              <button className="btn ghost sm" disabled={page === 0} onClick={() => (setPage(page - 1), scrollTo({ top: 0 }))}>
                ← Späť
              </button>
              <span className="small muted">
                Strana {page + 1} z {pages} · {list.length} produktov
              </span>
              <button className="btn ghost sm" disabled={page >= pages - 1} onClick={() => (setPage(page + 1), scrollTo({ top: 0 }))}>
                Ďalej →
              </button>
            </div>
          )}
        </>
      )}
      <p className="tiny muted">Pohyb je trend cena oproti 30-dňovému priemeru. Pri zriedka predávaných produktoch priemer chýba, tak sa pohyb nezobrazí. Obrázky sú z e-shopov a nemusia presne sedieť s verziou produktu.</p>
    </div>
  );
}
