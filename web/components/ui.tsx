"use client";
import Link from "next/link";
import { ReactNode, useEffect, useRef, useState } from "react";
import { loadProfiles, Profile, useAuth } from "@/lib/auth";
import type { Card } from "@/lib/data";
import { COLOR_SK, eur } from "@/lib/data";

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
    <div className="empty">
      {what} je len pre prihlásených. <Link href="/login">Prihlás sa</Link>.
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
  if (!user || list.length < 2) return null;
  return (
    <label className="field">
      <span>Kolekcia</span>
      <select value={value ?? user.id} onChange={(e) => onChange(e.target.value)}>
        {list.map((p) => (
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
}: {
  card: { img: string; name: string; code: string };
  className?: string;
  eager?: boolean;
}) {
  const sources = [card.img].filter(Boolean);
  const [i, setI] = useState(0);
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
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal" onClick={onClose}>
      <div className="mbox" onClick={(e) => e.stopPropagation()}>
        <button className="x" onClick={onClose} aria-label="zavrieť">
          ×
        </button>
        <Foil holo={!!card.v} className="big">
          <CardImg card={card} />
        </Foil>
        <div className="mtext">
          <h2>
            {card.name} {card.v && <span className="tag">{card.v}</span>}
          </h2>
          <p className="muted">
            {card.code} · {card.setName || card.set} · {card.rarity} · {card.type}
          </p>
          <p>
            <ColorDots colors={card.colors} /> {card.colors.map((c) => COLOR_SK[c] ?? c).join(" / ")}
          </p>
          <dl className="stats">
            {card.cost != null && (
              <>
                <dt>Cost</dt>
                <dd>{card.cost}</dd>
              </>
            )}
            {card.life != null && (
              <>
                <dt>Life</dt>
                <dd>{card.life}</dd>
              </>
            )}
            {card.power != null && (
              <>
                <dt>Power</dt>
                <dd>{card.power}</dd>
              </>
            )}
            {card.counter != null && (
              <>
                <dt>Counter</dt>
                <dd>+{card.counter}</dd>
              </>
            )}
            {card.attr && (
              <>
                <dt>Atribút</dt>
                <dd>{card.attr}</dd>
              </>
            )}
            {card.traits && (
              <>
                <dt>Typy</dt>
                <dd>{card.traits}</dd>
              </>
            )}
          </dl>
          {card.text && <p className="ctext">{card.text}</p>}
          <p>
            Trhová cena: <b>{card.usd != null ? eur(card.usd / usd) : "–"}</b>{" "}
            <span className="muted small">(TCGplayer ${card.usd ?? "–"})</span>
          </p>
          <p className="row gap">
            <a
              className="btn ghost sm"
              target="_blank"
              rel="noreferrer"
              href={`https://www.cardmarket.com/en/OnePiece/Products/Search?searchString=${encodeURIComponent(
                card.code,
              )}`}
            >
              Cardmarket ↗
            </a>
            {qty !== undefined && <Qty n={qty} onSet={onSet} disabled={!onSet} />}
          </p>
        </div>
      </div>
    </div>
  );
}

export function Bar({ value, max }: { value: number; max: number }) {
  const p = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="bar" title={`${value} / ${max}`}>
      <i style={{ width: `${p}%` }} className={p >= 100 ? "full" : ""} />
    </div>
  );
}
