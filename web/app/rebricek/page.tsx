"use client";
import { UserBadge, useBadges } from "@/lib/gamify";
import { plural } from "@/lib/sk";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import "@/components/game/game.css";
import GameTeaser from "@/components/game/Teaser";
import { GAME_PUBLIC } from "@/lib/config";
import { CardImg, Loading } from "@/components/ui";
import { loadProfiles, useAuth } from "@/lib/auth";
import { useCards } from "@/lib/data";
import { ago, byCodeOf, GameRow, Rating } from "@/lib/game";
import { sb } from "@/lib/supabase";
import { useLang } from "@/lib/lang";

function RankingPage() {
  const badges = useBadges();
  const { t, lang } = useLang();
  const { user, loading } = useAuth();
  const { data: cards } = useCards();
  const byCode = useMemo(() => byCodeOf(cards?.cards), [cards]);
  const [rows, setRows] = useState<Rating[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [games, setGames] = useState<GameRow[]>([]);

  useEffect(() => {
    if (loading) return;
    const load = async () => {
      const [{ data: r }, profs, { data: gs }] = await Promise.all([
        sb().from("ratings").select("*").order("elo", { ascending: false }).limit(200),
        loadProfiles(),
        user ? sb().from("games").select("*").eq("status", "done").order("updated_at", { ascending: false }).limit(15) : Promise.resolve({ data: [] }),
      ]);
      setRows((r as Rating[]) ?? []);
      setNames(new Map(profs.map((p) => [p.id, p.username ?? t("hráč", "player")])));
      setGames((gs as GameRow[]) ?? []);
    };
    load();
    if (!user) return;
    const ch = sb()
      .channel("ranking")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "games" }, () => setTimeout(load, 400))
      .subscribe();
    return () => {
      sb().removeChannel(ch);
    };
  }, [user, loading]);

  if (loading) return <Loading what={t("Načítavam rebríček", "Loading leaderboard")} shape="rows" />;
  if (!rows) return <Loading what={t("Načítavam rebríček", "Loading leaderboard")} shape="rows" />;

  const nm = (id: string) => names.get(id) ?? t("hráč", "player");
  const top = rows.slice(0, 3);
  const pct = (r: Rating) => (r.games ? Math.round((100 * r.wins) / r.games) : 0);
  const order = [1, 0, 2].filter((i) => top[i]);

  return (
    <div className="glob">
      <div className="glob-hero">
        <div>
          <h1>{t("Rebríček", "Leaderboard")}</h1>
          <p className="muted">
            {t("ELO z hodnotených online hier. Každý začína na 1000; za výhru nad silnejším súperom získaš viac bodov.", "ELO from ranked online games. Everyone starts at 1000; beating a stronger opponent earns more points.")} <Link href={user ? "/hra" : "/login"}>{user ? t("Vyzvi kamoša →", "Challenge a friend →") : t("Prihlás sa a hraj →", "Sign in and play →")}</Link>
          </p>
        </div>
      </div>

      {!rows.length ? (
        <div className="empty">{t("Zatiaľ nikto neodohral hodnotenú hru. Buď prvý – vytvor výzvu v sekcii Hra.", "No one has played a ranked game yet. Be the first – create a challenge in Play.")}</div>
      ) : (
        <>
          {top.length >= 2 && (
            <div className="podium">
              {order.map((i) => {
                const r = top[i];
                return (
                  <div key={r.user_id} className={`pd p${i + 1}`} style={{ animationDelay: `${i * 90}ms` }}>
                    <div className="medal">{i + 1}</div>
                    <div className="n">{nm(r.user_id)}</div>
                    <div className="e">{r.elo}</div>
                    <div className="small muted">
                      {r.wins}V · {r.losses}P
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <table className="rank">
            <thead>
              <tr>
                <th>#</th>
                <th>{t("Hráč", "Player")}</th>
                <th>ELO</th>
                <th>{t("V – P", "W – L")}</th>
                <th className="hide-m">{t("Úspešnosť", "Win rate")}</th>
                <th className="hide-m">{t("Séria", "Streak")}</th>
                <th className="hide-m">Max</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.user_id} className={r.user_id === user?.id ? "me" : ""} style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
                  <td className="pos">{i + 1}</td>
                  <td>
                    <span className="who">
                      <span className="av">{nm(r.user_id).slice(0, 1).toUpperCase()}</span>
                      {nm(r.user_id)}
                      <UserBadge badge={{ elo: r.elo, games: r.games, xp: badges.get(r.user_id)?.xp ?? 0 }} />
                      {r.user_id === user?.id && <span className="tag dim">ty</span>}
                    </span>
                  </td>
                  <td className="elo">{r.elo}</td>
                  <td className="wl">
                    <b>{r.wins}</b> – <i>{r.losses}</i>
                  </td>
                  <td className="hide-m">{pct(r)} %</td>
                  <td className="hide-m">
                    {r.streak ? <span className={`streak ${r.streak < 0 ? "neg" : ""}`}>{r.streak > 0 ? `${r.streak} ${t(plural(r.streak, "výhra", "výhry", "výhier"), r.streak === 1 ? "win" : "wins")}` : `${-r.streak} ${t(plural(-r.streak, "prehra", "prehry", "prehier"), -r.streak === 1 ? "loss" : "losses")}`}</span> : "–"}
                  </td>
                  <td className="hide-m muted">{r.best_elo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {games.length > 0 && (
        <>
          <h2 className="sub">{t("Posledné zápasy", "Recent matches")}</h2>
          <div className="glist">
            {games.map((g) => {
              const winHost = g.winner === g.host;
              const wl = winHost ? g.host_leader : g.guest_leader;
              const c = wl ? byCode.get(wl) : undefined;
              return (
                <div key={g.id} className="grow-item">
                  <span className="lth">{c ? <CardImg card={c} /> : <i className="back" style={{ display: "block", height: "100%" }} />}</span>
                  <span style={{ minWidth: 0 }}>
                    <div className="t">
                      <span style={{ color: "#7ff0b8" }}>{winHost ? g.host_name : g.guest_name}</span> {t("porazil", "beat")} {winHost ? g.guest_name : g.host_name}
                    </div>
                    <div className="s">
                      {g.end_reason === "resign" ? t("súper sa vzdal", "opponent resigned") : g.end_reason === "time" ? t("vypršal čas", "time ran out") : t(`${g.turn} ťahov`, `${g.turn} turns`)} · {g.rated ? t("hodnotená", "ranked") : t("priateľská", "friendly")} · {ago(g.updated_at, lang)}
                    </div>
                  </span>
                  {g.rated && g.elo_delta != null && <span className="streak">±{g.elo_delta}</span>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function Page() {
  return GAME_PUBLIC ? <RankingPage /> : <GameTeaser />;
}
