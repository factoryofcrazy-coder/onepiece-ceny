"use client";
import Link from "next/link";
import { useTcg } from "@/lib/tcg";

export default function Footer() {
  const { tcg } = useTcg();
  return (
    <footer className="wrap foot">
      {tcg === "pokemon" ? (
        <>
          Ceny zo SK, CZ, DE, AT a JP obchodov. Karty a ich ceny z TCGdex (Cardmarket). Neoficiálna stránka, nie je
          spojená s The Pokémon Company ani Nintendo.
        </>
      ) : (
        <>
          Ceny zo SK, CZ, DE, AT a JP obchodov. Karty z optcgapi.com, ceny kariet z Cardmarketu (inak TCGplayer). Neoficiálna stránka, nie
          je spojená s Bandai.
        </>
      )}
      <div className="foot-links">
        <Link href="/aplikacia">Aplikácia do mobilu</Link>
        <Link href="/report">Report</Link>
        <Link href="/sukromie">Zásady súkromia</Link>
      </div>
    </footer>
  );
}
