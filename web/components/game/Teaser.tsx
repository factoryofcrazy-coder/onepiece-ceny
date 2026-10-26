"use client";
import { CSSProperties, useMemo } from "react";
import { CardImg } from "@/components/ui";
import { Card, useCards } from "@/lib/data";

// Sneak peek hry – kým nie je verejná. Ukážková scéna je poskladaná zo skutočných kariet (štartér ST-01).
const LEADER = "ST01-001";
const FIELD = ["ST01-012", "ST01-006", "ST01-007"];
const HAND = ["ST01-004", "ST01-013", "ST01-014", "ST01-011", "ST01-016"];
const OPP = "OP01-060";

const COMING = [
  { t: "Automatické pravidlá", d: "Útoky, blokery, countery aj Life rieši hra za teba – stačí klikať." },
  { t: "Efekty kariet", d: "Stovky kariet z turnajových deckov majú naskriptované efekty." },
  { t: "Online s kamošmi", d: "Pošleš odkaz a hráš. Server drží stav, súper nevidí tvoju ruku." },
  { t: "Tréning proti botovi", d: "Vyskúšaj si deck skôr, než ho postavíš naživo." },
  { t: "Tvoje decky aj meta", d: "Hraj s deckom zo svojej zbierky alebo s turnajovým top deckom." },
  { t: "Rebríček", d: "ELO z hodnotených hier – kto je najsilnejší pirát v partii." },
];

export default function GameTeaser() {
  const { data } = useCards();
  const pick = useMemo(() => {
    const by = new Map<string, Card>();
    for (const c of data?.cards ?? []) if (!c.v && !by.has(c.code)) by.set(c.code, c);
    const get = (codes: string[]) => codes.map((c) => by.get(c)).filter((c): c is Card => !!c);
    return { leader: by.get(LEADER), opp: by.get(OPP), field: get(FIELD), hand: get(HAND) };
  }, [data]);

  return (
    <div className="teaser">
      <section className="teaser-hero">
        <div className="teaser-copy">
          <span className="teaser-badge">Pripravujeme</span>
          <h1>
            Hra <em>One Piece TCG</em> priamo v prehliadači
          </h1>
          <p className="muted">
            Ladíme posledné efekty a pravidlá. Čoskoro si tu zahráš so svojimi deckami – proti kamošom aj proti botovi.
          </p>
        </div>

        <div className="tz-board" aria-hidden>
          <div className="peek-row peek-opp">
            {pick.opp && <CardImg card={pick.opp} className="peek-card leader" />}
            <div className="peek-life">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} />
              ))}
            </div>
          </div>
          <div className="peek-row peek-field">
            {pick.field.map((c, i) => (
              <CardImg key={c.code} card={c} className={`peek-card${i === 1 ? " rested" : ""}`} />
            ))}
          </div>
          <div className="peek-row peek-me">
            {pick.leader && <CardImg card={pick.leader} className="peek-card leader glow" eager />}
            <div className="peek-don">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i}>DON!!</span>
              ))}
            </div>
          </div>
          <div className="peek-hand">
            {pick.hand.map((c, i) => (
              // vejár ruky
              <span key={c.code} className="peek-fan" style={{ "--i": i - (pick.hand.length - 1) / 2 } as CSSProperties}>
                <CardImg card={c} className="peek-card" />
              </span>
            ))}
          </div>
          <div className="peek-veil">
            <b>Sneak peek</b>
          </div>
        </div>
      </section>

      <h2 className="teaser-h2">Čo príde</h2>
      <div className="teaser-grid">
        {COMING.map((f) => (
          <div key={f.t} className="teaser-item">
            <b>{f.t}</b>
            <span className="muted">{f.d}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
