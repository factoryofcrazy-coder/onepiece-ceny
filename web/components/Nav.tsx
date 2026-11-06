"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { UserBadge, useBadges } from "@/lib/gamify";
import { useNewReports } from "@/lib/reports";
import { GAME_PUBLIC } from "@/lib/config";
import { TCGS, useTcg } from "@/lib/tcg";
import SearchBox from "./SearchBox";
import ThemeToggle from "./ThemeToggle";
import LangToggle from "./LangToggle";
import { useLang } from "@/lib/lang";
import { navLabel } from "@/lib/i18n-nav";
import { DmNavIcon } from "./dm/DmLink";

// Pokémon: ceny, karty, zbierka a master sety (decky a hra sú len pre One Piece)
const PK_LINKS = [
  { href: "/ceny", label: "Ceny" },
  { href: "/karty", label: "Karty" },
  { href: "/zbierka", label: "Zbierka" },
  { href: "/master-sety", label: "Master sety" },
];

const LINKS = [
  { href: "/ceny", label: "Ceny" },
  { href: "/karty", label: "Karty" },
  { href: "/zbierka", label: "Zbierka" },
  { href: "/master-sety", label: "Master sety" },
  { href: "/decky", label: "Decky" },
  { href: "/skener", label: "Skener" },
  { href: "/trhovisko", label: "Trhovisko" },
  ...(GAME_PUBLIC
    ? [
        { href: "/hra", label: "Hra" },
        { href: "/rebricek", label: "Rebríček" },
      ]
    : []),
  { href: "/report", label: "Report" },
];

export default function Nav({ onMenu }: { onMenu?: () => void }) {
  const path = usePathname();
  const { user, profile, signOut, loading } = useAuth();
  const { tcg, setTcg } = useTcg();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [path]);
  const links = tcg === "pokemon" ? PK_LINKS : LINKS;
  const newReports = useNewReports();
  const badges = useBadges(!!user);
  const { lang, t: tx } = useLang();
  const pick = (t: typeof tcg) => {
    if (t === tcg) return;
    setTcg(t);
    // stránky, ktoré druhá hra nemá (decky, hra, import) → späť na ceny
    if (!PK_LINKS.some((l) => (l.href === "/" ? path === "/" : path.startsWith(l.href)))) router.push("/");
  };
  return (
    <header className="nav">
      <div className="wrap navin">
        <button className="tb-menu" onClick={onMenu} aria-label={tx("Otvoriť menu", "Open menu")}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <Link href="/" className="brand">
          <span className="logo" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M12 4.5 14.2 12 12 19.5 9.8 12Z" fill="currentColor" />
              <circle cx="12" cy="12" r="1.6" fill="#f2b84b" />
            </svg>
          </span>
          <span className="brand-name">
            Grand Line <b>Tracker</b>
          </span>
        </Link>
        {TCGS.length > 1 && (
        <div className="tcg-switch" role="radiogroup" aria-label={tx("Kartová hra", "Card game")}>
          {TCGS.map((t) => (
            <button
              key={t.id}
              role="radio"
              aria-checked={tcg === t.id}
              className={`tcg-${t.id} ${tcg === t.id ? "on" : ""}`}
              onClick={() => pick(t.id)}
              title={t.label}
            >
              <i aria-hidden />
              <span className="tcg-label">{t.label}</span>
              <span className="tcg-short">{t.short}</span>
            </button>
          ))}
        </div>
        )}
        <nav className="links">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={(l.href === "/" ? path === "/" : path.startsWith(l.href)) ? "on" : ""}
            >
              {navLabel(l.label, lang)}
              {l.href === "/report" && newReports > 0 && <span className="nav-badge">{newReports}</span>}
            </Link>
          ))}
        </nav>
        <SearchBox />
        <LangToggle />
        <ThemeToggle />
        <DmNavIcon />
        <div className="who">
          {loading ? null : user ? (
            <div className="acct">
              <button className="avatar" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-label={tx("Účet", "Account")}>
                {(profile?.username ?? user.email ?? "?").slice(0, 1).toUpperCase()}
              </button>
              {menu && (
                <>
                  <div className="acct-scrim" onClick={() => setMenu(false)} />
                  <div className="acct-menu" role="menu">
                    <div className="acct-who">
                      <b>
                        {profile?.username ?? tx("Môj účet", "My account")} <UserBadge badge={user ? badges.get(user.id) : undefined} compact />
                      </b>
                      <span className="tiny muted">{user.email}</span>
                    </div>
                    <Link href="/ucet" onClick={() => setMenu(false)}>
                      {tx("Môj účet", "My account")}
                    </Link>
                    <Link href="/zbierka" onClick={() => setMenu(false)}>
                      {tx("Moja zbierka", "My collection")}
                    </Link>
                    <Link href="/decky" onClick={() => setMenu(false)}>
                      {tx("Moje decky", "My decks")}
                    </Link>
                    <button onClick={() => (setMenu(false), signOut())}>{tx("Odhlásiť sa", "Sign out")}</button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Link className="login-btn" href="/login" aria-label={tx("Prihlásiť sa", "Sign in")}>
              <svg viewBox="0 0 24 24" aria-hidden>
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21a8 8 0 0 1 16 0" />
              </svg>
              <span>{tx("Prihlásiť", "Sign in")}</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
