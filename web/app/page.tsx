"use client";
import { useMemo, useState } from "react";
import { CountUp, DataError, Loading } from "@/components/ui";
import { OLD_SITE } from "@/lib/config";
import { eur, Offer, usePrices } from "@/lib/data";

type Product = {
  key: string;
  code: string;
  kind: string;
  lang: string;
  title: string;
  img: string | null;
  msrp: number | null;
  offers: Offer[];
  best: Offer | null;
  pct: number | null;
};

const KINDS = ["Box", "Pack", "Double Pack", "Starter", "Premium", "Illustration", "Kolekcia", "Case", "Doplnky", "Iné"];

function ago(ts?: string) {
  if (!ts) return "";
  const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 60) return `pred ${m} min`;
  if (m < 48 * 60) return `pred ${Math.round(m / 60)} h`;
  return `pred ${Math.round(m / 1440)} dňami`;
}

export default function PricesPage() {
  const { data, error } = usePrices();
  const [kind, setKind] = useState("Box");
  const [lang, setLang] = useState("EN");
  const [q, setQ] = useState("");
  const [stock, setStock] = useState(true);
  const [ba, setBa] = useState(false);
  const [sort, setSort] = useState("pct");

  const products = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, Product>();
    for (const o of data.offers) {
      const [, name, code, k, l] = o;
      const key = code ? `${code}|${k}|${l}` : `${name}|${k}|${l}`;
      let p = map.get(key);
      if (!p) {
        p = { key, code, kind: k, lang: l, title: name, img: null, msrp: null, offers: [], best: null, pct: null };
        map.set(key, p);
      }
      p.offers.push(o);
      if (!p.img && o[15]) p.img = o[15];
      if (p.msrp == null && o[10] != null) p.msrp = o[10];
      if (name.length < p.title.length) p.title = name;
    }
    for (const p of map.values()) {
      p.offers.sort((a, b) => Number(b[6]) - Number(a[6]) || a[5] - b[5]);
      p.best = p.offers.find((o) => o[6]) ?? null;
      p.pct = p.best && p.msrp ? (p.best[5] / p.msrp - 1) * 100 : null;
    }
    return [...map.values()];
  }, [data]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = products.filter(
      (p) =>
        (kind === "*" || p.kind === kind) &&
        (lang === "*" || p.lang === lang) &&
        (!stock || p.best) &&
        (!ba || p.offers.some((o) => o[6] && data?.pickup[o[0]])) &&
        (!s || p.title.toLowerCase().includes(s) || p.code.toLowerCase().includes(s)),
    );
    const price = (p: Product) => p.best?.[5] ?? p.offers[0]?.[5] ?? 1e9;
    list.sort((a, b) =>
      sort === "pct"
        ? (a.pct ?? 1e9) - (b.pct ?? 1e9) || price(a) - price(b)
        : sort === "price"
          ? price(a) - price(b)
          : b.code.localeCompare(a.code, undefined, { numeric: true }),
    );
    return list;
  }, [products, kind, lang, q, stock, ba, sort, data]);

  if (error) return <DataError error={error} file="prices" />;
  if (!data) return <Loading what="Načítavam ceny" shape="tiles" />;

  const failing = Object.entries(data.status).filter(([, s]) => !s.ok);

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <h1>Kde kúpiť box čo najbližšie k MSRP</h1>
          <p className="muted">
            {Object.keys(data.shops).length} obchodov v SK, CZ, DE, AT a JP, aktualizované {ago(data.updated)}.{" "}
            <a href={OLD_SITE} target="_blank" rel="noreferrer">
              Grafy vývoja cien
            </a>
          </p>
        </div>
        <WantedBoard products={products} shops={data.shops} />
      </section>

      <div className="filters">
        <label className="field">
          <span>Typ</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="*">Všetko</option>
            {KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Jazyk</span>
          <select value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="*">Všetky</option>
            <option>EN</option>
            <option>JP</option>
            <option>CN</option>
            <option>KR</option>
          </select>
        </label>
        <label className="field grow">
          <span>Hľadať</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="OP16, Azure Sea…" />
        </label>
        <label className="field">
          <span>Zoradiť</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="pct">Najbližšie k MSRP</option>
            <option value="price">Najlacnejšie</option>
            <option value="code">Najnovšie edície</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={stock} onChange={(e) => setStock(e.target.checked)} /> Skladom
        </label>
        <label className="check">
          <input type="checkbox" checked={ba} onChange={(e) => setBa(e.target.checked)} /> 📍 Osobne v BA
        </label>
      </div>

      {failing.length > 0 && (
        <p className="small warnline">
          ⚠ Nefungujú: {failing.map(([k]) => data.shops[k] ?? k).join(", ")} (ukazujú sa posledné známe ceny)
        </p>
      )}

      <p className="muted small">{shown.length} produktov</p>
      <div className="pgrid">
        {shown.map((p) => (
          <ProductCard key={p.key} p={p} shops={data.shops} pickup={data.pickup} th={data.th} />
        ))}
      </div>
    </>
  );
}

function ProductCard({
  p,
  shops,
  pickup,
  th,
}: {
  p: Product;
  shops: Record<string, string>;
  pickup: Record<string, string>;
  th: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const good = p.pct != null && p.pct <= (th[p.lang] ?? 30);
  const list = open ? p.offers : p.offers.slice(0, 4);
  return (
    <article className={`pcard ${good ? "good" : ""}`}>
      <div className="ptop">
        {p.img ? <img src={p.img} alt="" loading="lazy" /> : <div className="pimg-ph">{p.kind}</div>}
        <div>
          <div className="row gap wrapr">
            {p.code && <span className="tag">{p.code}</span>}
            <span className="tag dim">{p.kind}</span>
            <span className="tag dim">{p.lang}</span>
          </div>
          <h3 title={p.title}>{p.title}</h3>
          <div className="pprice">
            <b>{p.best ? eur(p.best[5]) : "nie je skladom"}</b>
            {p.pct != null && (
              <span className={`pct ${good ? "ok" : p.pct > 100 ? "bad" : ""}`}>
                {p.pct > 0 ? "+" : ""}
                {p.pct.toFixed(0)} % vs MSRP
              </span>
            )}
          </div>
          {p.msrp != null && <div className="muted small">MSRP {eur(p.msrp)}</div>}
        </div>
      </div>
      <ul className="offers">
        {list.map((o, i) => (
          <li key={i} className={o[6] ? "" : "out"}>
            <a href={o[7]} target="_blank" rel="noreferrer">
              <i className={`sd ${o[6] ? "in" : ""}`} />
              {shops[o[0]] ?? o[0]}
              {pickup[o[0]] && <span title={pickup[o[0]]}> 📍</span>}
              {o[12] && <span className="tag tiny">predobj.</span>}
            </a>
            <span>
              {eur(o[5])}
              {o[13] != null && o[13] > 0 && <span className="muted tiny"> +{eur(o[13])}</span>}
            </span>
          </li>
        ))}
      </ul>
      <div className="row between">
        {p.offers.length > 4 ? (
          <button className="link small" onClick={() => setOpen(!open)}>
            {open ? "menej" : `všetkých ${p.offers.length} obchodov`}
          </button>
        ) : (
          <span />
        )}
        {p.offers[0]?.[14] && (
          <a className="small" href={p.offers[0][14]} target="_blank" rel="noreferrer">
            Cardmarket ↗
          </a>
        )}
      </div>
    </article>
  );
}

function WantedBoard({ products, shops }: { products: Product[]; shops: Record<string, string> }) {
  const pick = (lang: string) =>
    products
      .filter((p) => p.kind === "Box" && p.lang === lang && p.best && p.pct != null)
      .sort((a, b) => a.pct! - b.pct!);
  const top = [...pick("EN"), ...pick("JP")].slice(0, 3);
  if (!top.length) return null;
  return (
    <div className="wanted-board" aria-label="Najlepšie ponuky boxov">
      {top.map((p, i) => (
        <a
          key={p.key}
          className="wanted"
          href={p.best![7]}
          target="_blank"
          rel="noreferrer"
          style={{ ["--i" as any]: i, ["--tilt" as any]: `${[-2.5, 1.5, -1][i]}deg` }}
        >
          <span className="w-title">WANTED</span>
          <span className="w-frame">{p.img ? <img src={p.img} alt="" /> : <b>{p.code}</b>}</span>
          <span className="w-name">
            {p.code} {p.kind} {p.lang}
          </span>
          <span className="w-bounty">
            <CountUp value={p.best![5]} format={(v) => v.toLocaleString("sk-SK", { maximumFractionDigits: 0 })} />
            <small>€</small>
          </span>
          <span className="w-foot">
            {shops[p.best![0]] ?? p.best![0]} · {p.pct! > 0 ? "+" : ""}
            {p.pct!.toFixed(0)} % voči MSRP
          </span>
        </a>
      ))}
    </div>
  );
}
