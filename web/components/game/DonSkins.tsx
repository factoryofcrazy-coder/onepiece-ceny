"use client";
// Výber DON!! skinu v lobby: náhľady, stav odomknutia a pokrok k ďalším.
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { cacheOnlineStats, DON_SKINS, isUnlocked, progressOf, ruleText, useDonSkin, useLocalDonStats } from "@/lib/donSkins";
import { loadRatings } from "@/lib/game";
import { Icon } from "./icons";

export default function DonSkins() {
  const { user } = useAuth();
  const local = useLocalDonStats();
  const { skin, choose } = useDonSkin();
  const [online, setOnline] = useState<{ games: number; wins: number } | null>(null);

  // online výhry a hry z rebríčka prihláseného hráča
  useEffect(() => {
    if (!user) return setOnline(null);
    let live = true;
    loadRatings([user.id])
      .then((m) => {
        const r = m.get(user.id);
        const v = { games: r?.games ?? 0, wins: r?.wins ?? 0 };
        if (!live) return;
        setOnline(v);
        cacheOnlineStats(v.games, v.wins);
      })
      .catch(() => live && setOnline(null));
    return () => {
      live = false;
    };
  }, [user]);

  const st = { ...local, ...(online ? { onlineGames: online.games, onlineWins: online.wins } : {}) };
  const open = DON_SKINS.filter((k) => isUnlocked(k, st)).length;

  return (
    <section className="gcard dskins" aria-labelledby="dskins-h">
      <div className="dskins-head">
        <div>
          <h3 id="dskins-h">DON!! skiny</h3>
          <p className="small muted">
            Vzhľad tvojich DON!! žetónov v hre. Ďalšie odomkneš hraním. Odomknuté {open} z {DON_SKINS.length}.
          </p>
        </div>
        <dl className="dskins-stats">
          <div>
            <dt>Výhry proti botovi</dt>
            <dd>{st.botWins}</dd>
          </div>
          <div>
            <dt>Odohrané hry</dt>
            <dd>{st.botGames + st.onlineGames}</dd>
          </div>
          <div>
            <dt>Online výhry</dt>
            <dd>{user ? st.onlineWins : "–"}</dd>
          </div>
        </dl>
      </div>
      <div className="dskins-grid" role="radiogroup" aria-label="DON!! skin">
        {DON_SKINS.map((k) => {
          const ok = isUnlocked(k, st);
          const on = skin.id === k.id;
          const p = progressOf(k.rule, st);
          return (
            <button
              key={k.id}
              role="radio"
              aria-checked={on}
              aria-disabled={!ok}
              className={`dskin ${on ? "on" : ""} ${ok ? "" : "locked"}`}
              onClick={() => ok && choose(k.id)}
              title={ok ? `Použiť skin ${k.name}` : `Zamknuté: ${ruleText(k.rule)}`}
            >
              <span className="dskin-art">
                {k.img ? <img src={k.img} alt="" loading="lazy" /> : <span className="dskin-classic" aria-hidden />}
                {!ok && (
                  <span className="dskin-lock" aria-hidden>
                    <Icon name="lock" size={18} />
                  </span>
                )}
                {on && (
                  <span className="dskin-on" aria-hidden>
                    <Icon name="check" size={13} />
                  </span>
                )}
              </span>
              <span className="dskin-name">{k.name}</span>
              <span className="dskin-req">
                {on ? "Používaš" : ok ? "Odomknutý" : `${ruleText(k.rule)} · ${Math.min(p.have, p.need)}/${p.need}`}
              </span>
              {!ok && (
                <span className="dskin-bar" aria-hidden>
                  <i style={{ width: `${Math.min(100, (p.have / p.need) * 100)}%` }} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {!user && <p className="small muted" style={{ margin: 0 }}>Online výhry sa počítajú po prihlásení. Výhry proti botovi sa ukladajú v tomto prehliadači.</p>}
    </section>
  );
}
