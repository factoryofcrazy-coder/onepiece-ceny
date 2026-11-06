"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Loading, NeedLogin } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { authError, nickError } from "@/lib/authErrors";
import { sb } from "@/lib/supabase";
import { levelProgress, loadBadges, RankIcon, rankName, RANKS, rankOf, XP_SOURCES, type Badge } from "@/lib/gamify";
import { useLang } from "@/lib/lang";


export default function Account() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const { t, lang } = useLang();
  const CONFIRM = lang === "en" ? "DELETE" : "ZMAZAŤ";
  const [nick, setNick] = useState("");
  const [nickMsg, setNickMsg] = useState<{ t: string; ok?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [delErr, setDelErr] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [passOk, setPassOk] = useState(false);

  useEffect(() => setNick(profile?.username ?? ""), [profile?.username]);
  const [badge, setBadge] = useState<Badge | null>(null);
  const [today, setToday] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!user) return;
    loadBadges(true).then((m) => setBadge(m.get(user.id) ?? { elo: 1000, games: 0, xp: 0 }));
    sb()
      .from("xp_log")
      .select("source, points")
      .eq("day", new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bratislava" }))
      .then(({ data }) => setToday(Object.fromEntries(((data as any[]) ?? []).map((x) => [x.source, x.points]))));
  }, [user]);
  useEffect(() => setPassOk(new URLSearchParams(window.location.search).get("heslo") === "ok"), []);

  if (loading) return <Loading what={t("Načítavam účet", "Loading account")} />;
  if (!user) return <NeedLogin what={t("Účet", "Account")} />;

  const saveNick = async (e: React.FormEvent) => {
    e.preventDefault();
    const bad = nickError(nick, lang);
    if (bad) return setNickMsg({ t: bad });
    setSaving(true);
    setNickMsg(null);
    const { error } = await sb().from("profiles").update({ username: nick.trim() }).eq("id", user.id);
    setSaving(false);
    if (error) return setNickMsg({ t: error.code === "23505" ? t("Túto prezývku už niekto má.", "This nickname is taken.") : error.code === "23514" ? t("Takáto prezývka sa nedá použiť.", "This nickname can't be used.") : authError(error, lang) });
    await refreshProfile();
    setNickMsg({ t: t("Prezývka je uložená. V už rozohraných hrách ostane stará.", "Nickname saved. Games in progress keep the old one."), ok: true });
  };

  const remove = async () => {
    setDeleting(true);
    setDelErr("");
    const { error } = await sb().rpc("delete_my_account");
    if (error) {
      setDeleting(false);
      return setDelErr(authError(error, lang));
    }
    await sb().auth.signOut({ scope: "local" });
    window.location.assign("/");
  };

  return (
    <div className="ucet">
      <h1>{t("Môj účet", "My account")}</h1>
      {passOk && <p className="okc">{t("Heslo je zmenené.", "Password changed.")}</p>}

      {badge && (
        <section className="ucet-card rk-card">
          <h2>{t("Tvoj postup", "Your progress")}</h2>
          {(() => {
            const p = levelProgress(badge.xp);
            const rank = rankOf(badge.elo);
            const next = RANKS[RANKS.indexOf(rank) + 1];
            return (
              <>
                <div className="rk-top">
                  <div>
                    <b className="rk-big">Level {p.level}</b>
                    <div className="rk-bar" role="progressbar" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100} aria-label={t("Postup na ďalší level", "Progress to next level")}>
                      <i style={{ width: `${p.pct}%` }} />
                    </div>
                    <span className="tiny muted">
                      {t(`${badge.xp} XP, do levelu ${p.level + 1} chýba ${p.toNext} XP`, `${badge.xp} XP, ${p.toNext} XP to level ${p.level + 1}`)}
                    </span>
                  </div>
                  <div>
                    {badge.games > 0 ? (
                      <>
                        <b className="rk-big" style={{ color: rank.color }}>
                          <RankIcon rank={rank} size={20} /> {rankName(rank, lang)}
                        </b>
                        <span className="tiny muted">
                          ELO {badge.elo}
                          {next ? `, ${rankName(next, lang)} ${t("od", "from")} ${next.min}` : t(", najvyšší rank", ", top rank")}
                        </span>
                      </>
                    ) : (
                      <>
                        <b className="rk-big">{t("Bez ranku", "No rank")}</b>
                        <span className="tiny muted">
                          {t("Rank získaš prvou", "You get a rank with your first")} <Link href="/hra">{t("hodnotenou online hrou", "ranked online game")}</Link>.
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <h3 className="rk-h">{t("Dnešné XP", "Today's XP")}</h3>
                <ul className="rk-list">
                  {XP_SOURCES.map((x) => (
                    <li key={x.id}>
                      <span>
                        {lang === "en" ? x.en : x.label} <i className="tiny muted">{lang === "en" ? x.hintEn : x.hint}</i>
                      </span>
                      <b className={(today[x.id] ?? 0) >= x.cap ? "okc" : ""}>
                        {today[x.id] ?? 0}/{x.cap}
                      </b>
                    </li>
                  ))}
                </ul>
                <h3 className="rk-h">{t("Ranky podľa ELO", "Ranks by ELO")}</h3>
                <ul className="rk-ranks">
                  {RANKS.map((r) => (
                    <li key={r.id} className={badge.games > 0 && r.id === rank.id ? "on" : ""}>
                      <RankIcon rank={r} size={18} />
                      <span>{rankName(r, lang)}</span>
                      <i className="tiny muted">{r.min ? `${t("od", "from")} ${r.min}` : t("štart", "start")}</i>
                    </li>
                  ))}
                </ul>
              </>
            );
          })()}
        </section>
      )}

      <section className="ucet-card">
        <h2>{t("Prezývka", "Nickname")}</h2>
        <p className="muted small">{t("Uvidia ju ostatní hráči v rebríčku, v hre aj na trhovisku.", "Other players see it on the leaderboard, in games and on the marketplace.")}</p>
        <form onSubmit={saveNick} className="ucet-row">
          <input aria-label={t("Prezývka", "Nickname")} required minLength={3} maxLength={24} value={nick} onChange={(e) => setNick(e.target.value)} />
          <button className="btn" disabled={saving || nick.trim() === (profile?.username ?? "")}>
            {saving ? t("Ukladám…", "Saving…") : t("Uložiť", "Save")}
          </button>
        </form>
        {nickMsg && <p className={nickMsg.ok ? "okc small" : "badc small"}>{nickMsg.t}</p>}
      </section>

      <section className="ucet-card">
        <h2>{t("Prihlásenie", "Sign-in")}</h2>
        <p className="muted small">E-mail: {user.email}. {t("Ostatní ho nevidia.", "Others can't see it.")}</p>
        <Link className="btn ghost sm" href="/nove-heslo">
          {t("Zmeniť heslo", "Change password")}
        </Link>
      </section>

      <section className="ucet-card ucet-danger">
        <h2>{t("Zmazať účet", "Delete account")}</h2>
        <p className="muted small">
          {t("Natrvalo zmaže účet, zbierku, decky, ponuky na trhovisku a hodnotenie v rebríčku. Zmažú sa aj hry, ktoré si založil, takže zmiznú aj súperom z histórie. Vrátiť sa to nedá.", "Permanently deletes your account, collection, decks, marketplace listings and leaderboard rating. Games you created are deleted too, so they disappear from your opponents' history. This can't be undone.")}
        </p>
        <label className="field">
          <span>{t("Na potvrdenie napíš", "To confirm, type")} {CONFIRM}</span>
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        </label>
        <button className="btn danger ghost" disabled={confirm !== CONFIRM || deleting} onClick={remove}>
          {deleting ? t("Mažem…", "Deleting…") : t("Natrvalo zmazať účet", "Permanently delete account")}
        </button>
        {delErr && <p className="badc small">{delErr}</p>}
      </section>

      <p className="small muted">
        {t("Viac o tom, aké údaje ukladáme, nájdeš v", "More about what data we store is in the")} <Link href="/sukromie">{t("zásadách súkromia", "privacy policy")}</Link>.
      </p>
    </div>
  );
}
