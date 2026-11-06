"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTcg } from "@/lib/tcg";
import { useLang } from "@/lib/lang";
import { navLabel } from "@/lib/i18n-nav";

const TABS = [
  { href: "/boxy", label: "Hodnoty boxov" },
  { href: "/ceny", label: "Ceny boxov" },
  { href: "/pohyby", label: "Pohyby cien" },
  { href: "/trh", label: "Index" },
];

/** Spoločné záložky trhových stránok (jedna položka „Trh" v menu). */
export default function MarketTabs() {
  const path = usePathname();
  const { tcg } = useTcg();
  const { lang, t } = useLang();
  // mimo One Piece má zmysel len porovnanie cien boxov
  const tabs = tcg === "pokemon" ? TABS.filter((t) => t.href === "/ceny") : TABS;
  if (tabs.length < 2) return null;
  return (
    <nav className="market-tabs" aria-label={t("Trh", "Market")}>
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={path === t.href ? "on" : ""} aria-current={path === t.href ? "page" : undefined}>
          {navLabel(t.label, lang)}
        </Link>
      ))}
    </nav>
  );
}
