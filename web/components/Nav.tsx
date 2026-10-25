"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { GAME_PUBLIC } from "@/lib/config";
import { TCGS, useTcg } from "@/lib/tcg";

// Pokémon: ceny, karty, zbierka a master sety (decky a hra sú len pre One Piece)
const PK_LINKS = [
  { href: "/", label: "Ceny" },
  { href: "/karty", label: "Karty" },
  { href: "/zbierka", label: "Zbierka" },
  { href: "/master-sety", label: "Master sety" },
];

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
  const { tcg, setTcg } = useTcg();
  const router = useRouter();
  const links = tcg === "pokemon" ? PK_LINKS : LINKS;
  const pick = (t: typeof tcg) => {
    if (t === tcg) return;
    setTcg(t);
    // stránky, ktoré druhá hra nemá (decky, hra, import) → späť na ceny
    if (!PK_LINKS.some((l) => (l.href === "/" ? path === "/" : path.startsWith(l.href)))) router.push("/");
  };
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
          <span className="brand-name">
            Grand Line <b>Tracker</b>
          </span>
        </Link>
        <div className="tcg-switch" role="radiogroup" aria-label="Kartová hra">
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
        <nav className="links">
          {links.map((l) => (
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
