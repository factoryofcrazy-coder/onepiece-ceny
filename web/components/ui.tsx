"use client";
import { useTcg } from "@/lib/tcg";
import Link from "next/link";
import { ReactNode, useEffect, useRef, useState } from "react";
import { loadProfiles, Profile, useAuth } from "@/lib/auth";
import type { Card } from "@/lib/data";
import { cardEur, COLOR_SK, eur, thumb } from "@/lib/data";

/** Kostra namiesto „Načítavam…“ – tvar zodpovedá obsahu, ktorý príde. */
export function Loading({ what = "Načítavam", shape = "cards" }: { what?: string; shape?: "cards" | "rows" | "tiles" }) {
  const n = shape === "rows" ? 8 : 12;
  return (
    <div className={`skel skel-${shape}`} role="status" aria-label={what}>
      <div className="skel-head" />
      <div className="skel-grid">
        {Array.from({ length: n }, (_, i) => (
          <div key={i} className="skel-item" style={{ animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
    </div>
  );
}

/** Karta, ktorá sa nakláňa za kurzorom; parallely/alt arty dostanú holografický lesk. */
export function Foil({ children, holo, className = "" }: { children: ReactNode; holo?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType === "touch") return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--mx", `${x * 100}%`);
    el.style.setProperty("--my", `${y * 100}%`);
    el.style.setProperty("--rx", `${(0.5 - y) * 16}deg`);
    el.style.setProperty("--ry", `${(x - 0.5) * 20}deg`);
    el.classList.add("on");
  };
  const leave = () => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove("on");
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  };
  return (
    <div ref={ref} className={`foil ${holo ? "holo" : ""} ${className}`} onPointerMove={move} onPointerLeave={leave}>
      {children}
      <i className="shine" aria-hidden />
    </div>
  );
}

/** Číslo, ktoré sa pri prvom zobrazení napočíta (odmena na plagáte). */
export function CountUp({ value, format }: { value: number; format: (v: number) => string }) {
  const [v, setV] = useState(value);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setV(value);
    let raf = 0;
    const t0 = performance.now();
    const dur = 1100;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      setV(value * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(v)}</>;
}

export function DataError({ error, file }: { error: string; file: string }) {
  return (
    <div className="empty warn">
      {file === "cards" ? "Databázu kariet" : "Ceny"} sa teraz nepodarilo načítať ({error}).
      <p className="small">
        <button className="btn ghost sm" onClick={() => window.location.reload()}>
          Skúsiť znova
        </button>
      </p>
    </div>
  );
}

export function NeedLogin({ what }: { what: string }) {
  return (
    <div className="empty need">
      <span className="need-ic" aria-hidden>
        <svg viewBox="0 0 24 24">
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      </span>
      <h2>{what} je pre prihlásených</h2>
      <p>Prihlás sa a ukladaj si karty, decky aj zbierku – uvidíš ich na mobile aj na počítači.</p>
      <Link className="btn" href="/login">
        Prihlásiť sa
      </Link>
    </div>
  );
}

/** Výber, čiu kolekciu pozerám (moju alebo kamoša). */
export function OwnerPicker({ value, onChange }: { value: string | null; onChange: (id: string) => void }) {
  const { user } = useAuth();
  const [list, setList] = useState<Profile[]>([]);
  useEffect(() => {
    if (user) loadProfiles().then(setList);
  }, [user]);
  // vlastná kolekcia je v zozname vždy – aj keď účtu chýba riadok v profiles (inak by select ukázal cudzie meno)
  const me = list.find((p) => p.id === user?.id);
  const all = user ? [{ id: user.id, username: me?.username ?? user.email?.split("@")[0] ?? "ja" }, ...list.filter((p) => p.id !== user.id)] : [];
  if (!user || all.length < 2) return null;
  return (
    <label className="field">
      <span>Kolekcia</span>
      <select value={value ?? user.id} onChange={(e) => onChange(e.target.value)}>
        {all.map((p) => (
          <option key={p.id} value={p.id}>
            {p.id === user.id ? `Moja (${p.username})` : p.username}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ColorDots({ colors }: { colors: string[] }) {
  return (
    <span className="dots">
      {colors.map((c) => (
        <i key={c} className={`dot c-${c}`} title={COLOR_SK[c] ?? c} />
      ))}
    </span>
  );
}

export function Qty({ n, onSet, disabled }: { n: number; onSet?: (n: number) => void; disabled?: boolean }) {
  if (disabled || !onSet) return n ? <span className="qty ro">×{n}</span> : null;
  return (
    <span className="qty" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => onSet(n - 1)} disabled={n <= 0} aria-label="menej">
        −
      </button>
      <b>{n}</b>
      <button onClick={() => onSet(n + 1)} aria-label="viac">
        +
      </button>
    </span>
  );
}

export function CardImg({
  card,
  className = "",
  eager = false,
  full = false,
}: {
  card: { img: string; name: string; code: string };
  className?: string;
  eager?: boolean;
  /** veľký obrázok (detail karty) – inak zmenšený náhľad */
  full?: boolean;
}) {
  // náhľad (wsrv.nl) → pri chybe pôvodný obrázok → zástupný blok
  const small = full ? "" : thumb(card.img, 240);
  const sources = [...new Set([small, card.img].filter(Boolean))];
  const [i, setI] = useState(0);
  const srcSet = !full && i === 0 && small !== card.img ? `${small} 240w, ${thumb(card.img, 360)} 360w` : undefined;
  if (i >= sources.length)
    return (
      <div className={`cimg ph ${className}`}>
        <b>{card.code}</b>
        <span>{card.name}</span>
      </div>
    );
  return (
    <img
      key={sources[i]}
      className={`cimg ${className}`}
      src={sources[i]}
      srcSet={srcSet}
      sizes={srcSet ? "(max-width: 720px) 45vw, 180px" : undefined}
      decoding="async"
      alt={`${card.name} ${card.code}`}
      loading={eager ? "eager" : "lazy"}
      onError={() => setI(i + 1)}
    />
  );
}

export function CardModal({
  card,
  onClose,
  usd,
  qty,
  onSet,
}: {
  card: Card;
  onClose: () => void;
  usd: number;
  qty?: number;
  onSet?: (n: number) => void;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    // pozadie sa pod otvoreným detailom neposúva
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  const main = cardEur(card, usd);
  const src = card.cm != null ? "Cardmarket trend" : card.usd != null ? "TCGplayer (USA)" : "";
  const stats = [
    ["Cost", card.cost],
    ["Life", card.life],
    ["Power", card.power],
    ["Counter", card.counter != null ? `+${card.counter}` : null],
  ].filter(([, v]) => v != null) as [string, string | number][];
  return (
    <div className="modal" onClick={onClose}>
      <div className="mbox cd" role="dialog" aria-modal="true" aria-label={card.name} onClick={(e) => e.stopPropagation()}>
        <span className="cd-grip" aria-hidden />
        <button className="x" onClick={onClose} aria-label="Zavrieť">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        <div className="cd-art">
          <Foil holo={!!card.v} className="big">
            <CardImg card={card} full eager />
          </Foil>
        </div>
        <div className="cd-head">
          <div className="cd-tags">
            <span className="chip">{card.set}</span>
            {card.rarity && <span className="chip">{card.rarity}</span>}
            {card.v && <span className="chip hot">{card.v}</span>}
          </div>
          <h2>{card.name}</h2>
          <p className="muted small">
            {card.code} · {TYPE_SK_UI[card.type] ?? card.type}
            {card.colors.length > 0 && (
              <>
                {" · "}
                <ColorDots colors={card.colors} /> {card.colors.map((c) => COLOR_SK[c] ?? c).join(" / ")}
              </>
            )}
          </p>
        </div>
        <div className="cd-price">
          <div className="cd-pmain">
            <span className="cd-plabel">{src || "Cena"}</span>
            <b>{main != null ? eur(main) : "–"}</b>
            {card.cmLow != null && <span className="cd-psub">najlacnejšia ponuka od {eur(card.cmLow)}</span>}
          </div>
          <div className="cd-palt">
            {card.cmJp != null && (
              <span>
                <i>Japonská</i> {eur(card.cmJp)}
              </span>
            )}
            {card.cm != null && card.usd != null && (
              <span>
                <i>TCGplayer</i> {eur(card.usd / usd)}
              </span>
            )}
          </div>
          <div className="cd-actions">
            {qty !== undefined && <Qty n={qty} onSet={onSet} disabled={!onSet} />}
            <a
              className="btn ghost sm"
              target="_blank"
              rel="noreferrer"
              href={`https://www.cardmarket.com/en/OnePiece/Products/Search?searchString=${encodeURIComponent(card.code)}`}
            >
              Cardmarket ↗
            </a>
          </div>
        </div>
        <div className="cd-rest">
          {stats.length > 0 && (
            <div className="cd-stats">
              {stats.map(([k, v]) => (
                <div key={k}>
                  <span>{k}</span>
                  <b>{v}</b>
                </div>
              ))}
              {card.attr && (
                <div>
                  <span>Atribút</span>
                  <b className="small">{card.attr}</b>
                </div>
              )}
            </div>
          )}
          {card.traits && <p className="cd-traits">{card.traits}</p>}
          {card.text && <p className="ctext">{card.text}</p>}
        </div>
      </div>
    </div>
  );
}
const TYPE_SK_UI: Record<string, string> = { Character: "Postava", Leader: "Leader", Event: "Event", Stage: "Stage", DON: "DON!!" };

export function Bar({ value, max }: { value: number; max: number }) {
  const p = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="bar" title={`${value} / ${max}`}>
      <i style={{ width: `${p}%` }} className={p >= 100 ? "full" : ""} />
    </div>
  );
}

/** Prázdna zbierka v jednej hre, ale karty v druhej → ponúkni prepnutie (ľahko sa to pomýli). */
export function OtherGameHint({ qty, game }: { qty: Record<string, number>; game: "onepiece" | "pokemon" }) {
  const { setTcg } = useTcg();
  const other = Object.entries(qty).filter(([id, n]) => n > 0 && (game === "onepiece" ? id.startsWith("pk:") : !id.startsWith("pk:"))).length;
  if (!other) return null;
  const to = game === "onepiece" ? "pokemon" : "onepiece";
  return (
    <p className="other-game">
      V {to === "pokemon" ? "Pokémon" : "One Piece"} zbierke máš <b>{other}</b> {other === 1 ? "kartu" : other < 5 ? "karty" : "kariet"}.{" "}
      <button className="btn sm" onClick={() => setTcg(to)}>
        Prepnúť na {to === "pokemon" ? "Pokémon" : "One Piece"}
      </button>
    </p>
  );
}

/** Lišta filtrov. Na mobile ukáže len vyhľadávanie (+ polia s triedou „keep“) a tlačidlo Filtre, ktoré rozbalí zvyšok. */
export function FilterBar({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`filters ${open ? "open" : ""}`}>
      {children}
      <button type="button" className="filters-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M4 6h16M7 12h10M10 18h4" />
        </svg>
        {open ? "Menej" : "Filtre"}
      </button>
    </div>
  );
}
