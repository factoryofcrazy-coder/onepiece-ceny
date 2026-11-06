"use client";
import Link from "next/link";
import { useTcg } from "@/lib/tcg";
import { useLang } from "@/lib/lang";

export default function Footer() {
  const { tcg } = useTcg();
  const { t } = useLang();
  return (
    <footer className="wrap foot">
      {tcg === "pokemon" ? (
        t(
          "Ceny zo SK, CZ, DE, AT a JP obchodov. Karty a ich ceny z TCGdex (Cardmarket). Neoficiálna stránka, nie je spojená s The Pokémon Company ani Nintendo.",
          "Prices from shops in SK, CZ, DE, AT and JP. Cards and their prices from TCGdex (Cardmarket). Unofficial site, not affiliated with The Pokémon Company or Nintendo.",
        )
      ) : (
        t(
          "Ceny zo SK, CZ, DE, AT a JP obchodov. Karty z optcgapi.com, ceny kariet z Cardmarketu (inak TCGplayer). Neoficiálna stránka, nie je spojená s Bandai.",
          "Prices from shops in SK, CZ, DE, AT and JP. Cards from optcgapi.com, card prices from Cardmarket (otherwise TCGplayer). Unofficial site, not affiliated with Bandai.",
        )
      )}
      <div className="foot-links">
        <Link href="/aplikacia">{t("Aplikácia do mobilu", "Mobile app")}</Link>
        <Link href="/report">Report</Link>
        <Link href="/sukromie">{t("Zásady súkromia", "Privacy policy")}</Link>
      </div>
    </footer>
  );
}
