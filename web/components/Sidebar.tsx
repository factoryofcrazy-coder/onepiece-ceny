"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { DM_ENABLED, GAME_PUBLIC } from "@/lib/config";
import { levelProgress, loadBadges, onXpChanged, XP_SOURCES } from "@/lib/gamify";
import { useNewReports } from "@/lib/reports";
import { useDm } from "@/lib/dm/client";
import { sb } from "@/lib/supabase";

const ICONS: Record<string, string> = {
  home: "M3 11 12 3l9 8v10h-6v-6H9v6H3V11Z",
  prices: "M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8ZM7.5 6A1.500 1.500 0 1 0 7.500 9 1.500 1.500 0 0 0 7.500 6Z",
  cards: "M3 5h12v16H3V5Zm5-3h13v15h-3V5H8V2Z",
  scan: "M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M8 8h8v8H8V8Z",
  vault: "M4 7h16v13H4V7ZM2 7l3-3h14l3 3M10 12h4",
  sets: "M12 3 3 8l9 5 9-5-9-5ZM3 13l9 5 9-5",
  decks: "M6 3h12v18H6V3Zm3 4h6M9 11h6",
  game: "M6 8h12a4 4 0 0 1 4 4v3a3 3 0 0 1-5.500 1.500L15 15H9l-1.500 1.500A3 3 0 0 1 2 15v-3a4 4 0 0 1 4-4Zm1 3v3M5.500 12.500h3M16 12h.01M18 14h.01",
  rank: "M8 21h8M12 17v4M6 3h12v6a6 6 0 0 1-12 0V3ZM6 5H3v2a3 3 0 0 0 3 3M18 5h3v2a3 3 0 0 1-3 3",
  trade: "M7 7h13l-3-3M17 17H4l3 3",
  chat: "M21 12a8 8 0 0 1-8 8H4l2.200-3.300A8 8 0 1 1 21 12Z",
  mail: "M3 6h18v13H3V6Zm1 1 8 6 8-6",
  report: "M5 21V4h13l-2 4 2 4H5",
  import: "M12 3v12M7 10l5 5 5-5M4 21h16",
  app: "M7 2h10v20H7V2Zm4 17h2",
};
const Icon = ({ name }: { name: string }) => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.800" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={ICONS[name]} />
  </svg>
);

const GROUPS: { title: string; links: { href: string; label: string; icon: string }[] }[] = [
  {
    title: "Prehľad",
    links: [
      { href: "/", label: "Domov", icon: "home" },
      { href: "/karty", label: "Karty", icon: "cards" },
      { href: "/boxy", label: "Trh", icon: "prices" },
      { href: "/skener", label: "Skener", icon: "scan" },
    ],
  },
  {
    title: "Moje",
    links: [
      { href: "/zbierka", label: "Zbierka", icon: "vault" },
      { href: "/decky", label: "Decky", icon: "decks" },
      { href: "/master-sety", label: "Master sety", icon: "sets" },
      { href: "/import", label: "Import", icon: "import" },
    ],
  },
  {
    title: "Komunita",
    links: [
      ...(GAME_PUBLIC
        ? [
            { href: "/hra", label: "Hra", icon: "game" },
            { href: "/rebricek", label: "Rebríček", icon: "rank" },
          ]
        : []),
      { href: "/trhovisko", label: "Trhovisko", icon: "trade" },
      { href: "/novinky", label: "Novinky", icon: "mail" },
      { href: "/chat", label: "Chat", icon: "chat" },
      ...(DM_ENABLED ? [{ href: "/spravy", label: "Správy", icon: "mail" }] : []),
      { href: "/report", label: "Report", icon: "report" },
    ],
  },
];

const MARKET = ["/boxy", "/ceny", "/pohyby", "/trh"];
const active = (path: string, href: string) =>
  href === "/" ? path === "/" : href === "/boxy" ? MARKET.includes(path) : path === href || path.startsWith(href + "/");

/** Dnešné XP sa dajú zobraziť v bočnom paneli aj na domovskej stránke. */
export function useTodayXp(userId?: string) {
  const path = usePathname();
  const [today, setToday] = useState<Record<string, number>>({});
  const [xp, setXp] = useState(0);
  const lastLoad = useRef(0);
  const load = useCallback(
    (fresh: boolean) => {
      if (!userId) return;
      const n = ++lastLoad.current; // starší výsledok, ktorý dobehne neskôr, nesmie prepísať novší
      sb()
        .from("xp_log")
        .select("source, points")
        .eq("day", new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bratislava" }))
        .then(({ data }) => n === lastLoad.current && data && setToday(Object.fromEntries((data as any[]).map((x) => [x.source, x.points]))));
      loadBadges(fresh).then((m) => n === lastLoad.current && setXp(m.get(userId)?.xp ?? 0));
    },
    [userId],
  );
  // po prechode na inú stránku (chat, report, zbierka) a po návrate do okna môžu byť XP iné
  useEffect(() => load(false), [load, path]);
  useEffect(() => {
    const again = () => document.visibilityState === "visible" && load(false);
    document.addEventListener("visibilitychange", again);
    const off = onXpChanged(() => load(true));
    return () => {
      document.removeEventListener("visibilitychange", again);
      off();
      lastLoad.current++; // po odchode už nič nenastavuj
    };
  }, [load]);
  return { today, xp };
}

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const path = usePathname();
  const { user, profile } = useAuth();
  const newReports = useNewReports();
  const { unread: dmUnread } = useDm();
  const { today, xp } = useTodayXp(user?.id);
  const p = levelProgress(xp);
  const done = XP_SOURCES.filter((s) => (today[s.id] ?? 0) >= s.cap).length;
  useEffect(onClose, [path]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {open && <div className="sb-scrim" onClick={onClose} />}
      <aside className={`sb ${open ? "open" : ""}`} aria-label="Hlavné menu">
        <Link href="/" className="sb-brand">
          <span className="logo" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9.500" stroke="currentColor" strokeWidth="1.600" />
              <path d="M12 4.500 14.200 12 12 19.500 9.800 12Z" fill="currentColor" />
            </svg>
          </span>
          <span>
            Grand Line <b>Tracker</b>
          </span>
        </Link>
        <nav className="sb-nav">
          {GROUPS.map((g) => (
            <div key={g.title} className="sb-group">
              <span className="sb-title">{g.title}</span>
              {g.links.map((l) => (
                <Link key={l.href} href={l.href} className={active(path, l.href) ? "on" : ""}>
                  <Icon name={l.icon} />
                  <span>{l.label}</span>
                  {l.href === "/report" && newReports > 0 && <span className="sb-pill">{newReports}</span>}
                  {l.href === "/spravy" && dmUnread > 0 && <span className="sb-pill">{dmUnread > 99 ? "99+" : dmUnread}</span>}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        {user ? (
          <div className="sb-quests">
            <span className="sb-title">Denné úlohy</span>
            <b>
              {done} z {XP_SOURCES.length} hotových
            </b>
            <div className="sb-dots" aria-hidden>
              {XP_SOURCES.map((s) => (
                <i key={s.id} className={(today[s.id] ?? 0) >= s.cap ? "on" : ""} />
              ))}
            </div>
          </div>
        ) : (
          <Link href="/aplikacia" className="sb-app">
            <Icon name="app" />
            <span>Aplikácia do mobilu</span>
          </Link>
        )}
        {user && (
          <Link href="/ucet" className="sb-user">
            <span className="sb-av">{(profile?.username ?? "?").slice(0, 1).toUpperCase()}</span>
            <span>
              <b>{profile?.username ?? "Môj účet"}</b>
              <i>Level {p.level}</i>
            </span>
          </Link>
        )}
      </aside>
    </>
  );
}
