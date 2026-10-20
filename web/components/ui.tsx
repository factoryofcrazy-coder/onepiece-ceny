"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { loadProfiles, Profile, useAuth } from "@/lib/auth";
import type { Card } from "@/lib/data";
import { COLOR_SK, eur } from "@/lib/data";

export function Loading({ what = "Načítavam" }: { what?: string }) {
  return <div className="empty">{what}…</div>;
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

// Oficiálne obrázky Bandai (bez vodotlače), záloha OPTCG API.
const bandaiImg = (id: string) => `/api/img/${encodeURIComponent(id)}`;

export function CardImg({ card, className = "" }: { card: Card; className?: string }) {
  const sources = [bandaiImg(card.id), card.img].filter(Boolean);
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
      loading="lazy"
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
        <CardImg card={card} className="big" />
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
