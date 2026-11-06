"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTodayXp } from "@/components/Sidebar";
import { useAuth } from "@/lib/auth";
import { cardEur, eur, useCards, usePrices } from "@/lib/data";
import { useCollection } from "@/lib/collection";
import { topMoves } from "@/lib/collector";
import { formatPct, salesChange } from "@/lib/price-series";
import { indexed, loadMarketIndex, loadSpy, spyAligned } from "@/lib/market";
import { loadNews, NewsItem } from "@/lib/news";
import { levelProgress, loadBadges, rankName, rankOf, RankIcon, type Badge, XP_SOURCES } from "@/lib/gamify";
import { loadProfiles } from "@/lib/auth";
import { useTcg } from "@/lib/tcg";
import { useLang } from "@/lib/lang";

/** Čas do polnoci v Bratislave, vtedy sa denné XP vynulujú. */
function useResetCountdown() {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Bratislava", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(now);
      const g = (t: string) => Number(parts.find((x) => x.type === t)?.value ?? 0);
      setLeft(24 * 3600 - (g("hour") % 24) * 3600 - g("minute") * 60 - g("second"));
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);
  return left;
}
const pad = (n: number) => String(n).padStart(2, "0");

type Deal = { title: string; img: string | null; code: string; price: number; msrp: number; pct: number; shop: string; url: string };

export default function Home() {
  const { user, profile, loading } = useAuth();
  const { tcg } = useTcg();
  const { t, lang } = useLang();
  const { data: prices } = usePrices(tcg);
  const { data: cards, error: cardsErr } = useCards();
  const usd = prices?.fx?.USD ?? 1.12;
  const { qty } = useCollection(user?.id, !!user);
  const { today, xp } = useTodayXp(user?.id);
  const left = useResetCountdown();
  const [top, setTop] = useState<(Badge & { id: string; name: string })[]>([]);
  const [idxPts, setIdxPts] = useState<ReturnType<typeof indexed>>([]);
  const [spyIdx, setSpyIdx] = useState<(number | null)[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);

  useEffect(() => {
    loadNews().then(setNews);
    Promise.all([loadMarketIndex(), loadSpy()]).then(([mi, spy]) => {
      const ix = indexed(mi);
      setIdxPts(ix);
      setSpyIdx(spyAligned(ix.map((p) => p.day), spy));
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    let live = true;
    Promise.all([loadBadges(), loadProfiles()]).then(([m, ps]) => {
      if (!live) return;
      const names = new Map(ps.map((p) => [p.id, p.username ?? t("Hráč", "Player")]));
      setTop(
        [...m.entries()]
          .filter(([, b]) => b.games > 0)
          .sort((a, b) => b[1].elo - a[1].elo)
          .slice(0, 3)
          .map(([id, b]) => ({ ...b, id, name: names.get(id) ?? t("Hráč", "Player") })),
      );
    });
    return () => {
      live = false;
    };
  }, [user]);

  // hodnota zbierky
  const vault = useMemo(() => {
    if (!cards || !user) return null;
    let value = 0, pieces = 0, kinds = 0;
    for (const [id, n] of Object.entries(qty)) {
      if (!(n > 0)) continue;
      const card = cards.byId.get(id);
      if (!card) continue;
      value += (cardEur(card, usd) ?? 0) * n;
      pieces += n;
      kinds++;
    }
    return { value, pieces, kinds };
  }, [cards, qty, usd, user]);

  // trhový index
  const market = useMemo(() => {
    if (idxPts.length === 0) return null;
    const latest = idxPts[idxPts.length - 1], prev = idxPts[idxPts.length - 2];
    const spyLast = [...spyIdx].reverse().find((v) => v != null) ?? null;
    return {
      value: Math.round(latest.idx),
      pctDay: prev ? (latest.idx / prev.idx - 1) * 100 : null,
      spyAll: spyLast != null ? spyLast / 10 - 100 : null,
    };
  }, [idxPts, spyIdx]);

  // čo sa hýbe (zdražuje)
  const movers = useMemo(() => (cards ? topMoves(cards.cards, usd, "up", 5).slice(0, 4) : []), [cards, usd]);

  // najvýhodnejšie boxy skladom oproti MSRP
  const deals = useMemo<Deal[]>(() => {
    if (!prices) return [];
    const best = new Map<string, Deal>();
    for (const o of prices.offers) {
      const [shop, name, code, kind, lang, price, inStock, url, , , msrp, , preorder, , , img] = o as any[];
      if (kind !== "Box" || lang !== "EN" || !inStock || preorder || !msrp || !code) continue;
      const cur = best.get(code);
      if (!cur || price < cur.price) best.set(code, { title: name, img: img ?? cur?.img ?? null, code, price, msrp, pct: (price / msrp - 1) * 100, shop: prices.shops[shop] ?? shop, url });
    }
    return [...best.values()].sort((a, b) => a.pct - b.pct).slice(0, 3);
  }, [prices]);

  const pr = levelProgress(xp);
  const name = profile?.username ?? "";
  const pct = (v: number) => <span className={`cmove ${v > 0 ? "up" : v < 0 ? "down" : ""}`}>{formatPct(Math.round(v * 10) / 10)}</span>;

  return (
    <div className="dash">
      <img className="dash-banner" src="/art/banner.webp" width={2000} height={667} alt={t("Grand-Line.eu: postavy z One Piece na mori pod pirátskou vlajkou", "Grand-Line.eu: One Piece characters at sea under a pirate flag")} fetchPriority="high" />
      <section className="dash-hero">
        <div>
          <span className="dash-chip">{user ? `Level ${pr.level}` : t("Pre zberateľov a hráčov", "For collectors and players")}</span>
          <h1>{user ? t(`Vitaj späť${name ? `, ${name}` : ""}!`, `Welcome back${name ? `, ${name}` : ""}!`) : t("Všetko o One Piece kartách na jednom mieste", "Everything about One Piece cards in one place")}</h1>
          <p>{user ? t(`Do levelu ${pr.level + 1} ti chýba ${pr.toNext} XP. Najviac získaš online hrou.`, `You need ${pr.toNext} XP to reach level ${pr.level + 1}. Online games give the most.`) : t("Porovnaj ceny boxov, spravuj zbierku, skenuj karty a zahraj si proti ostatným.", "Compare box prices, manage your collection, scan cards and play against others.")}</p>
          <div className="dash-cta">
            <Link className="btn dash-btn" href={user ? "/zbierka" : "/login"}>
              {user ? t("Moja zbierka", "My collection") : t("Vytvoriť účet zadarmo", "Create a free account")}
            </Link>
            <Link className="btn ghost" href="/skener">
              {t("Skenovať karty", "Scan cards")}
            </Link>
          </div>
          {user && (
            <div className="rk-bar dash-bar" role="progressbar" aria-valuenow={pr.pct} aria-valuemin={0} aria-valuemax={100} aria-label={t("Postup na ďalší level", "Progress to next level")}>
              <i style={{ width: `${pr.pct}%` }} />
            </div>
          )}
        </div>
        {deals[0]?.img && <img className="dash-hero-img" src={deals[0].img} alt="" />}
      </section>

      {/* Prehľad: zbierka + trh */}
      <div className="dash-stats">
        {user && (
          <Link href="/zbierka" className="dash-stat">
            <span className="dash-stat-label">{t("Hodnota tvojej zbierky", "Your collection value")}</span>
            <b className="dash-stat-big">{vault ? eur(vault.value) : "…"}</b>
            {vault && <span className="dash-stat-sub muted small">{t(`${vault.pieces} kusov · ${vault.kinds} kariet`, `${vault.pieces} copies · ${vault.kinds} cards`)}</span>}
          </Link>
        )}
        <Link href="/trh" className="dash-stat is-market">
          <span className="dash-stat-label">{t("Trhový index", "Market index")}</span>
          <b className="dash-stat-big">{market ? market.value.toLocaleString("sk-SK") : "…"}</b>
          <span className="dash-stat-sub small">
            {market ? (
              <>
                {market.pctDay != null ? <>{t("za deň", "today")} {pct(market.pctDay)}</> : <span className="muted">{t("prvý deň", "first day")}</span>}
                {market.spyAll != null && <span className="muted"> · vs SPY {pct(market.spyAll)}</span>}
              </>
            ) : (
              <span className="muted">{t("zbiera sa denne", "collected daily")}</span>
            )}
          </span>
        </Link>
      </div>

      {/* Čo sa hýbe + najlepšie ceny boxov */}
      <div className="dash-two">
        <section className="dash-card">
          <div className="dash-head">
            <h2>{t("Čo sa hýbe", "What's moving")}</h2>
            <Link href="/pohyby">{t("Všetky pohyby", "All moves")}</Link>
          </div>
          {cardsErr ? (
            <p className="muted small">{t("Pohyby sa nepodarilo načítať.", "Moves could not be loaded.")} <Link href="/pohyby">{t("Skús Pohyby cien", "Try Price moves")}</Link>.</p>
          ) : !cards ? (
            <p className="muted small">{t("Načítavam…", "Loading…")}</p>
          ) : movers.length === 0 ? (
            <p className="muted small">{t("Teraz sa nič výrazne nehýbe.", "Nothing is moving much right now.")}</p>
          ) : (
            <ul className="dash-mv">
              {movers.map((m) => {
                const s = salesChange(m.card);
                return (
                  <li key={m.card.id}>
                    <Link href="/pohyby" className="dash-mv-name">
                      <b>{m.card.name}</b>
                      <i className="muted tiny">{m.card.code}{m.card.v ? ` · ${m.card.v}` : ""}</i>
                    </Link>
                    {s && pct(s.pct)}
                    <b className="dash-mv-price">{eur(m.price)}</b>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="dash-card">
          <div className="dash-head">
            <h2>{t("Najlepšie ceny boxov", "Best box prices")}</h2>
            <Link href="/ceny">{t("Všetky ceny", "All prices")}</Link>
          </div>
          <div className="dash-deals">
            {deals.length === 0 && <p className="muted small">{t("Načítavam ponuky…", "Loading offers…")}</p>}
            {deals.map((d) => (
              <a key={d.code} className="dash-deal" href={d.url} target="_blank" rel="noreferrer">
                <div className="dash-deal-img">{d.img ? <img src={d.img} alt="" loading="lazy" /> : <span>{d.code}</span>}</div>
                <div className="dash-deal-body">
                  <span className="tag dim">{d.code}</span>
                  <b>{d.title}</b>
                  <div className="dash-deal-row">
                    <strong>{eur(d.price)}</strong>
                    <i className={d.pct <= 0 ? "good" : ""}>
                      {d.pct > 0 ? "+" : ""}
                      {Math.round(d.pct)} % MSRP
                    </i>
                  </div>
                  <span className="tiny muted">{d.shop}</span>
                </div>
              </a>
            ))}
          </div>
        </section>
      </div>

      {/* Novinky */}
      {news.length > 0 && (
        <section className="dash-card">
          <div className="dash-head">
            <h2>{t("Novinky", "News")}</h2>
            <Link href="/novinky">{t("Všetky novinky", "All news")}</Link>
          </div>
          <div className="dash-news">
            {news.slice(0, 2).map((n) => (
              <Link key={n.id} href="/novinky" className="dash-news-item">
                {n.image && <img src={n.image} alt="" loading="lazy" />}
                <div>
                  <b>{n.title}</b>
                  {n.body && <span className="muted small">{n.body.slice(0, 120)}{n.body.length > 120 ? "…" : ""}</span>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Hra a komunita */}
      <div className="dash-grid">
        <section className="dash-card dash-board">
          <div className="dash-head">
            <h2>{t("Rebríček", "Leaderboard")}</h2>
            <Link href="/rebricek">{t("Celý rebríček", "Full leaderboard")}</Link>
          </div>
          {!loading && !user ? (
            <p className="muted small">
              {t("Rebríček vidia prihlásení hráči.", "The leaderboard is visible to signed-in players.")} <Link href="/login">{t("Prihlásiť sa", "Sign in")}</Link>
            </p>
          ) : top.length === 0 ? (
            <p className="muted small">{t("Zatiaľ nikto neodohral hodnotenú hru. Buď prvý.", "No one has played a ranked game yet. Be the first.")}</p>
          ) : (
            <ol>
              {top.map((t, i) => (
                <li key={t.id}>
                  <span className="dash-pos">{i + 1}</span>
                  <span className="dash-name">
                    <b>{t.name}</b>
                    <i>{t.elo} ELO</i>
                  </span>
                  <span className="dash-rank" style={{ color: rankOf(t.elo).color }}>
                    <RankIcon rank={rankOf(t.elo)} size={15} /> {rankName(rankOf(t.elo), lang)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="dash-timer">
          <span>{t("Nové denné XP o", "New daily XP in")}</span>
          <b>{left == null ? "--:--:--" : `${pad(Math.floor(left / 3600))}:${pad(Math.floor((left % 3600) / 60))}:${pad(left % 60)}`}</b>
          <i>{t("hodiny, minúty, sekundy", "hours, minutes, seconds")}</i>
        </section>

        {user && (
          <section className="dash-card dash-quests">
            <div className="dash-head">
              <h2>{t("Denné úlohy", "Daily quests")}</h2>
              <Link href="/ucet">{t("Môj postup", "My progress")}</Link>
            </div>
            <ul>
              {XP_SOURCES.slice(0, 5).map((s) => {
                const have = today[s.id] ?? 0;
                return (
                  <li key={s.id} className={have >= s.cap ? "done" : ""}>
                    <span>{lang === "en" ? s.en : s.label}</span>
                    <b>
                      {have}/{s.cap} XP
                    </b>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
