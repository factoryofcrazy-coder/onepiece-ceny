"use client";
// Výber DON!! skinu v lobby: náhľady, stav odomknutia a pokrok k ďalším.
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { levelOf, loadBadges, rankIndex } from "@/lib/gamify";
import { cacheOnlineStats, cacheProgress, DON_SKINS, isUnlocked, progressOf, ruleText, skinName, useDonSkin, useLocalDonStats } from "@/lib/donSkins";
import { loadRatings } from "@/lib/game";
import { Icon } from "./icons";
import { useLang } from "@/lib/lang";

export default function DonSkins() {
  const { user } = useAuth();
  const { t, lang } = useLang();
  const local = useLocalDonStats();
  const { skin, choose } = useDonSkin();
  const [online, setOnline] = useState<{ games: number; wins: number } | null>(null);

  const [progress, setProgress] = useState<{ level: number; rankIndex: number } | null>(null);
  useEffect(() => {
    if (!user) return setProgress(null);
    let live = true;
    loadBadges().then((m) => {
      const b = m.get(user.id);
      const v = { level: b ? levelOf(b.xp) : 1, rankIndex: b && b.games > 0 ? rankIndex(b.elo) : -1 };
      if (!live) return;
      setProgress(v);
      cacheProgress(v.level, v.rankIndex);
    });
    return () => {
      live = false;
    };
  }, [user]);

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

  const st = { ...local, ...(online ? { onlineGames: online.games, onlineWins: online.wins } : {}), ...(progress ?? {}) };
  const open = DON_SKINS.filter((k) => isUnlocked(k, st)).length;

  return (
    <section className="gcard dskins" aria-labelledby="dskins-h">
      <div className="dskins-head">
        <div>
          <h3 id="dskins-h">{t("DON!! skiny", "DON!! skins")}</h3>
          <p className="small muted">
            {t(`Takto budú vyzerať tvoje DON!! v hre. Ďalšie si odomkneš hraním, zatiaľ máš ${open} z ${DON_SKINS.length}.`, `This is how your DON!! will look in game. Unlock more by playing – you have ${open} of ${DON_SKINS.length}.`)}
          </p>
        </div>
        <dl className="dskins-stats">
          <div>
            <dt title={t("Stredný a Ťažký bot", "Medium and Hard bot")}>{t("Výhry proti botovi", "Wins vs the bot")}</dt>
            <dd>{st.botWins}</dd>
          </div>
          <div>
            <dt>{t("Odohrané hry", "Games played")}</dt>
            <dd>{st.botGames + st.onlineGames}</dd>
          </div>
          <div>
            <dt>{t("Online výhry", "Online wins")}</dt>
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
              title={ok ? t(`Použiť skin ${k.name}`, `Use skin ${k.en}`) : `${t("Zamknuté", "Locked")}: ${ruleText(k.rule, lang)}`}
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
              <span className="dskin-name">{skinName(k, lang)}</span>
              <span className="dskin-req">
                {on ? t("Používaš", "In use") : ok ? t("Odomknutý", "Unlocked") : `${ruleText(k.rule, lang)} · ${Math.min(p.have, p.need)}/${p.need}`}
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
      {!user && <p className="small muted" style={{ margin: 0 }}>{t("Online výhry sa rátajú, keď si prihlásený. Výhry nad Stredným a Ťažkým botom si pamätá tento prehliadač.", "Online wins count when you're signed in. Wins against the Medium and Hard bot are remembered by this browser.")}</p>}
    </section>
  );
}
