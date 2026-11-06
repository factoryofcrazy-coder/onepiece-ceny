// Anglické názvy položiek menu (bočné menu, mobilné menu, hlavička). Kľúč je slovenský názov.
import type { Lang } from "./lang-shared";

const EN: Record<string, string> = {
  Prehľad: "Overview",
  Moje: "My stuff",
  Komunita: "Community",
  Domov: "Home",
  Karty: "Cards",
  Trh: "Market",
  Skener: "Scanner",
  Zbierka: "Collection",
  Decky: "Decks",
  "Master sety": "Master sets",
  Import: "Import",
  Hra: "Play",
  Rebríček: "Leaderboard",
  Trhovisko: "Marketplace",
  Novinky: "News",
  Chat: "Chat",
  Správy: "Messages",
  Report: "Report",
  Ceny: "Prices",
  "Ceny boxov": "Box prices",
  "Hodnoty boxov": "Box values",
  "Pohyby cien": "Price moves",
  Index: "Index",
  "Trh (boxy, ceny, index)": "Market (boxes, prices, index)",
  "Čo si viem poskladať": "What can I build",
  "Import z HoloDex": "Import from HoloDex",
  "Aplikácia do mobilu": "Mobile app",
};

export const navLabel = (sk: string, lang: Lang) => (lang === "en" ? EN[sk] ?? sk : sk);
