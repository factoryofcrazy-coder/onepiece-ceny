"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { GAME_PUBLIC } from "@/lib/config";
import { useNewReports } from "@/lib/reports";
import { useTcg } from "@/lib/tcg";

// Dolná navigácia na mobile (ako natívna appka). Na desktope sa nezobrazuje – tam je horné menu.
type Tab = { href: string; label: string; icon: ReactNode; main?: boolean };

const I = {
  home: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M3 11 12 3l9 8v10h-6v-6H9v6H3V11Z" />
    </svg>
  ),
  prices: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </svg>
  ),
  cards: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="5" width="12" height="16" rx="2" />
      <path d="M8 3h11a2 2 0 0 1 2 2v13" />
    </svg>
  ),
  scan: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <rect x="8.5" y="7.5" width="7" height="9" rx="1" />
    </svg>
  ),
  vault: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M4 7h16v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" />
      <path d="M2 7l3-3h14l3 3M10 12h4" />
    </svg>
  ),
  sets: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 3 3 8l9 5 9-5-9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  ),
};

const OP_TABS: Tab[] = [
  { href: "/", label: "Domov", icon: I.home },
  { href: "/karty", label: "Karty", icon: I.cards },
  { href: "/skener", label: "Skener", icon: I.scan, main: true },
  { href: "/zbierka", label: "Zbierka", icon: I.vault },
];
const OP_MORE = [
  { href: "/ceny", label: "Ceny boxov" },
  { href: "/boxy", label: "Hodnoty boxov" },
  { href: "/pohyby", label: "Pohyby cien" },
  { href: "/trh", label: "Trhový index" },
  { href: "/trhovisko", label: "Trhovisko" },
  { href: "/master-sety", label: "Master sety" },
  { href: "/decky", label: "Decky" },
  { href: "/decky/odporucanie", label: "Čo si viem poskladať" },
  ...(GAME_PUBLIC
    ? [
        { href: "/hra", label: "Hra" },
        { href: "/rebricek", label: "Rebríček" },
      ]
    : []),
  { href: "/import", label: "Import z HoloDex" },
  { href: "/novinky", label: "Novinky" },
  { href: "/chat", label: "Chat" },
  { href: "/report", label: "Report" },
  { href: "/aplikacia", label: "Aplikácia do mobilu" },
];
const PK_TABS: Tab[] = [
  { href: "/", label: "Ceny", icon: I.prices },
  { href: "/karty", label: "Karty", icon: I.cards },
  { href: "/zbierka", label: "Zbierka", icon: I.vault },
  { href: "/master-sety", label: "Master sety", icon: I.sets },
];

const active = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

export default function TabBar() {
  const path = usePathname();
  const { tcg } = useTcg();
  const [more, setMore] = useState(false);
  const newReports = useNewReports();
  useEffect(() => setMore(false), [path]);
  const tabs = tcg === "pokemon" ? PK_TABS : OP_TABS;
  const moreOn = tcg !== "pokemon" && OP_MORE.some((l) => active(path, l.href));

  return (
    <>
      {more && <div className="tb-scrim" onClick={() => setMore(false)} />}
      {more && (
        <div className="tb-sheet" role="dialog" aria-label="Ďalšie stránky">
          {OP_MORE.map((l) => (
            <Link key={l.href} href={l.href} className={active(path, l.href) ? "on" : ""}>
              {l.label}
              {l.href === "/report" && newReports > 0 && <span className="nav-badge">{newReports}</span>}
            </Link>
          ))}
        </div>
      )}
      <nav className="tabbar" aria-label="Hlavné menu">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className={`${t.main ? "main" : ""} ${active(path, t.href) ? "on" : ""}`}>
            <span className="tb-ic">{t.icon}</span>
            <span className="tb-l">{t.label}</span>
          </Link>
        ))}
        {tcg !== "pokemon" && (
          <button className={moreOn || more ? "on" : ""} onClick={() => setMore(!more)} aria-expanded={more}>
            <span className="tb-ic">{I.more}{newReports > 0 && <span className="nav-dot" aria-hidden />}</span>
            <span className="tb-l">Viac</span>
          </button>
        )}
      </nav>
    </>
  );
}
