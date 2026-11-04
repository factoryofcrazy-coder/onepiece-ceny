"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTodayXp } from "@/components/Sidebar";
import { useAuth } from "@/lib/auth";
import { eur, usePrices } from "@/lib/data";
import { levelProgress, loadBadges, rankOf, RankIcon, type Badge, XP_SOURCES } from "@/lib/gamify";
import { loadProfiles } from "@/lib/auth";
import { useTcg } from "@/lib/tcg";

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
  const { data } = usePrices(tcg);
  const { today, xp } = useTodayXp(user?.id);
  const left = useResetCountdown();
  const [top, setTop] = useState<(Badge & { id: string; name: string })[]>([]);

  useEffect(() => {
    if (!user) return;
    let live = true;
    Promise.all([loadBadges(), loadProfiles()]).then(([m, ps]) => {
      if (!live) return;
      const names = new Map(ps.map((p) => [p.id, p.username ?? "Hráč"]));
      setTop(
        [...m.entries()]
          .filter(([, b]) => b.games > 0)
          .sort((a, b) => b[1].elo - a[1].elo)
          .slice(0, 3)
          .map(([id, b]) => ({ ...b, id, name: names.get(id) ?? "Hráč" })),
      );
    });
    return () => {
      live = false;
    };
  }, [user]);

  // najvýhodnejšie boxy skladom oproti MSRP, z každej edície jeden
  const deals = useMemo<Deal[]>(() => {
    if (!data) return [];
    const best = new Map<string, Deal>();
    for (const o of data.offers) {
      const [shop, name, code, kind, lang, price, inStock, url, , , msrp, , preorder, , , img] = o as any[];
      if (kind !== "Box" || lang !== "EN" || !inStock || preorder || !msrp || !code) continue;
      const cur = best.get(code);
      if (!cur || price < cur.price) best.set(code, { title: name, img: img ?? cur?.img ?? null, code, price, msrp, pct: (price / msrp - 1) * 100, shop: data.shops[shop] ?? shop, url });
    }
    return [...best.values()].sort((a, b) => a.pct - b.pct).slice(0, 3);
  }, [data]);

  const p = levelProgress(xp);
  const name = profile?.username ?? "";
  return (
    <div className="dash">
      <section className="dash-hero">
        <div>
          <span className="dash-chip">{user ? `Level ${p.level}` : "Pre zberateľov a hráčov"}</span>
          <h1>{user ? `Vitaj späť${name ? `, ${name}` : ""}!` : "Všetko o One Piece kartách na jednom mieste"}</h1>
          <p>{user ? `Do levelu ${p.level + 1} ti chýba ${p.toNext} XP. Najviac získaš online hrou.` : "Porovnaj ceny boxov, spravuj zbierku, skenuj karty a zahraj si proti ostatným."}</p>
          <div className="dash-cta">
            <Link className="btn dash-btn" href={user ? "/hra" : "/login"}>
              {user ? "Zahrať si" : "Vytvoriť účet zadarmo"}
            </Link>
            <Link className="btn ghost" href="/skener">
              Skenovať karty
            </Link>
          </div>
          {user && (
            <div className="rk-bar dash-bar" role="progressbar" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Postup na ďalší level">
              <i style={{ width: `${p.pct}%` }} />
            </div>
          )}
        </div>
        {deals[0]?.img && <img className="dash-hero-img" src={deals[0].img} alt="" />}
      </section>

      <div className="dash-grid">
        <section className="dash-card dash-board">
          <div className="dash-head">
            <h2>Rebríček</h2>
            <Link href="/rebricek">Celý rebríček</Link>
          </div>
          {!loading && !user ? (
            <p className="muted small">
              Rebríček vidia prihlásení hráči. <Link href="/login">Prihlásiť sa</Link>
            </p>
          ) : top.length === 0 ? (
            <p className="muted small">Zatiaľ nikto neodohral hodnotenú hru. Buď prvý.</p>
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
                    <RankIcon rank={rankOf(t.elo)} size={15} /> {rankOf(t.elo).name}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="dash-timer">
          <span>Nové denné XP o</span>
          <b>{left == null ? "--:--:--" : `${pad(Math.floor(left / 3600))}:${pad(Math.floor((left % 3600) / 60))}:${pad(left % 60)}`}</b>
          <i>hodiny, minúty, sekundy</i>
        </section>

        {user && (
          <section className="dash-card dash-quests">
            <div className="dash-head">
              <h2>Denné úlohy</h2>
              <Link href="/ucet">Môj postup</Link>
            </div>
            <ul>
              {XP_SOURCES.slice(0, 5).map((s) => {
                const have = today[s.id] ?? 0;
                return (
                  <li key={s.id} className={have >= s.cap ? "done" : ""}>
                    <span>{s.label}</span>
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

      <section>
        <div className="dash-head">
          <h2>Najlepšie ceny boxov</h2>
          <Link href="/ceny">Všetky ceny</Link>
        </div>
        <div className="dash-deals">
          {deals.length === 0 && <p className="muted small">Načítavam ponuky…</p>}
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
  );
}
