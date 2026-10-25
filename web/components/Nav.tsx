"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { GAME_PUBLIC } from "@/lib/config";

const LINKS = [
  { href: "/", label: "Ceny" },
  { href: "/karty", label: "Karty" },
  { href: "/zbierka", label: "Zbierka" },
  { href: "/master-sety", label: "Master sety" },
  { href: "/decky", label: "Decky" },
  ...(GAME_PUBLIC
    ? [
        { href: "/hra", label: "Hra" },
        { href: "/rebricek", label: "Rebríček" },
      ]
    : []),
];

export default function Nav() {
  const path = usePathname();
  const { user, profile, signOut, loading } = useAuth();
  return (
    <header className="nav">
      <div className="wrap navin">
        <Link href="/" className="brand">
          <span className="logo" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M12 4.5 14.2 12 12 19.5 9.8 12Z" fill="currentColor" />
              <circle cx="12" cy="12" r="1.6" fill="#f2b84b" />
            </svg>
          </span>
          Grand Line <b>Tracker</b>
        </Link>
        <nav className="links">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={(l.href === "/" ? path === "/" : path.startsWith(l.href)) ? "on" : ""}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="who">
          {loading ? null : user ? (
            <>
              <span className="muted small">{profile?.username ?? user.email}</span>
              <button className="btn ghost sm" onClick={signOut}>
                Odhlásiť
              </button>
            </>
          ) : (
            <Link className="btn sm" href="/login">
              Prihlásiť
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
