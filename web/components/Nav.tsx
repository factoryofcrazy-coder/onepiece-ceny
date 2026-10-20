"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

const LINKS = [
  { href: "/", label: "Ceny" },
  { href: "/karty", label: "Karty" },
  { href: "/master-sety", label: "Master sety" },
  { href: "/decky", label: "Decky" },
];

export default function Nav() {
  const path = usePathname();
  const { user, profile, signOut, loading } = useAuth();
  return (
    <header className="nav">
      <div className="wrap navin">
        <Link href="/" className="brand">
          <span className="logo">☠</span> Grand Line <b>Tracker</b>
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
