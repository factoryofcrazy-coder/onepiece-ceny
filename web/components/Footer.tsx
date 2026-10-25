"use client";
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
          Ceny zo SK, CZ, DE, AT a JP obchodov. Karty a ich ceny z optcgapi.com (TCGplayer). Neoficiálna stránka, nie
          je spojená s Bandai.
        </>
      )}
    </footer>
  );
}
