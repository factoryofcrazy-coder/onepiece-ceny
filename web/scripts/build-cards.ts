// Vygeneruje docs/data/cards.json (databáza One Piece kariet) – spúšťa GitHub Action cards.yml.
// npm run build:cards
import { writeFileSync, mkdirSync } from "node:fs";
import { buildCards } from "../lib/cards-build";

const out = process.argv[2] ?? "../docs/data/cards.json";
buildCards().then(
  (d) => {
    mkdirSync(out.replace(/\/[^/]+$/, ""), { recursive: true });
    const { alts, ...db } = d;
    writeFileSync(out, JSON.stringify(db));
    writeFileSync(out.replace(/[^/]+$/, "card-alts.json"), JSON.stringify(alts));
    console.log(`${d.cards.length} kariet, ${d.sets.length} setov → ${out}`);
  },
  (e) => {
    console.error("✖", e?.message ?? e);
    process.exit(1);
  },
);
