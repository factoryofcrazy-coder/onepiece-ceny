"use client";
import { useEffect } from "react";
import { CardImg, Foil, Qty } from "@/components/ui";
import { eur } from "@/lib/data";
import { cardmarketPk, PK_TYPE_SK, PkCard } from "@/lib/pokemon";

export default function PkCardModal({
  card,
  official,
  onClose,
  qty,
  onSet,
}: {
  card: PkCard;
  official?: number;
  onClose: () => void;
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
        <Foil holo={card.v === "Reverse Holo" || /rare|illustration|ultra|secret|hyper/i.test(card.rarity)} className="big">
          <CardImg card={card} eager />
        </Foil>
        <div className="mtext">
          <h2>
            {card.name} {card.v && <span className="tag">{card.v}</span>}
          </h2>
          <p className="muted">
            {card.num}
            {official ? `/${official}` : ""} · {card.setName} · {card.rarity || "bez rarity"}
          </p>
          <dl className="stats">
            <dt>Typ</dt>
            <dd>
              {PK_TYPE_SK[card.type] ?? card.type}
              {card.stage ? ` · ${card.stage}` : ""}
            </dd>
            {card.types.length > 0 && (
              <>
                <dt>Element</dt>
                <dd>{card.types.join(" / ")}</dd>
              </>
            )}
            {card.hp != null && (
              <>
                <dt>HP</dt>
                <dd>{card.hp}</dd>
              </>
            )}
            {card.illustrator && (
              <>
                <dt>Ilustrácia</dt>
                <dd>{card.illustrator}</dd>
              </>
            )}
          </dl>
          <p>
            Trhová cena: <b>{eur(card.eur)}</b> <span className="muted small">(Cardmarket trend)</span>
          </p>
          <p className="row gap">
            <a className="btn ghost sm" target="_blank" rel="noreferrer" href={cardmarketPk(card)}>
              Cardmarket ↗
            </a>
            {qty !== undefined && <Qty n={qty} onSet={onSet} disabled={!onSet} />}
          </p>
        </div>
      </div>
    </div>
  );
}
