// Vygeneruje docs/data/cards.json (databáza One Piece kariet) – spúšťa GitHub Action cards.yml.
// npm run build:cards
import { writeFileSync, mkdirSync } from "node:fs";
import { buildCards } from "../lib/cards-build";
import { sealedProducts } from "../lib/cardmarket";

const out = process.argv[2] ?? "../docs/data/cards.json";
buildCards().then(
  async (d) => {
    mkdirSync(out.replace(/\/[^/]+$/, ""), { recursive: true });
    const { alts, ...db } = d;
    writeFileSync(out, JSON.stringify(db));
    writeFileSync(out.replace(/[^/]+$/, "card-alts.json"), JSON.stringify(alts));
    console.log(`${d.cards.length} kariet, ${d.sets.length} setov → ${out}`);
    try {
      const sealed = await sealedProducts(d.cards as any);
      writeFileSync(out.replace(/[^/]+$/, "sealed.json"), JSON.stringify({ updated: new Date().toISOString(), source: "cardmarket.com", sealed }));
      console.log(`${sealed.length} zapečatených produktov → sealed.json`);
    } catch (e: any) {
      console.error("Sealed produkty zlyhali:", e?.message ?? e);
    }
  },
  (e) => {
    console.error("✖", e?.message ?? e);
    process.exit(1);
  },
);
