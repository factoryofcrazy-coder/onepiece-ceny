"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DataError, FilterBar, Loading } from "@/components/ui";
import { eur, SealedItem, setOrder, useSealed } from "@/lib/data";
import { formatPct } from "@/lib/price-series";
import { useTcg } from "@/lib/tcg";

const PAGE = 50;
const KINDS = ["Box", "Case", "Pack", "Double Pack", "Starter", "Premium", "Iné"];
const cmUrl = (name: string) => `https://www.cardmarket.com/en/OnePiece/Products/Search?searchString=${encodeURIComponent(name)}`;
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
  const [kind, setKind] = useState("Box");
  const [lang, setLang] = useState<"EN" | "JP">("EN");
  const [set, setSet] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"value" | "move">("value");
  const [limit, setLimit] = useState(PAGE);

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
          <button key={l} className={lang === l ? "on" : ""} aria-pressed={lang === l} onClick={() => (setLang(l), setLimit(PAGE))}>
            {l === "EN" ? "Anglické" : "Japonské"}
          </button>
        ))}
      </div>
      <FilterBar>
        <label className="field">
          <span>Druh</span>
          <select value={kind} onChange={(e) => (setKind(e.target.value), setLimit(PAGE))}>
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
          <select value={set} onChange={(e) => (setSet(e.target.value), setLimit(PAGE))}>
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
          <input value={q} onChange={(e) => (setQ(e.target.value), setLimit(PAGE))} placeholder="Napr. OP09, Romance Dawn…" />
        </label>
      </FilterBar>
      {list.length === 0 ? (
        <div className="empty">Pre tento výber nemáme žiadne produkty. Skús iný druh alebo jazyk.</div>
      ) : (
        <div className="vlist">
          {list.slice(0, limit).map((s, k) => {
            const pct = movePct(s);
            return (
              <a key={s.id} className="vrow" href={cmUrl(s.name)} target="_blank" rel="noreferrer">
                <span className="vrank">{k + 1}</span>
                <span className="vname">
                  <b>{s.name}</b>
                  <span className="small muted">
                    {s.set && <span className="tag tiny">{s.set}</span>} {s.kind}
                  </span>
                </span>
                {pct != null ? <span className={`vqty cmove ${pct > 0 ? "up" : pct < 0 ? "down" : ""}`}>{formatPct(pct)}</span> : <span className="vqty muted tiny">–</span>}
                {s.cmLow != null && <span className="vunit small muted">od {eur(s.cmLow)}</span>}
                <b className="vtotal">{eur(s.cm)}</b>
              </a>
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
      <p className="tiny muted">Pohyb je trend cena oproti 30-dňovému priemeru. Pri zriedka predávaných produktoch priemer chýba, tak sa pohyb nezobrazí.</p>
    </div>
  );
}
