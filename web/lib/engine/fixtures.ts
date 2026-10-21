// Testovacie dáta: karty ST-01 a ST-26 (štatistiky z OPTCG API) a decky z nich.
import { buildDef, CardData } from "./cards";
import type { CardDef } from "./types";

type Row = [code: string, name: string, type: string, colors: string, cost: number | null, power: number | null, counter: number | null, life: number | null, traits: string];

const ROWS: Row[] = [
  ["ST01-001", "Monkey.D.Luffy", "Leader", "Red", null, 5000, null, 5, "Straw Hat Crew Supernovas"],
  ["ST01-002", "Usopp", "Character", "Red", 2, 2000, 1000, null, "Straw Hat Crew"],
  ["ST01-003", "Karoo", "Character", "Red", 1, 3000, 1000, null, "Animal Alabasta"],
  ["ST01-004", "Sanji", "Character", "Red", 2, 4000, 0, null, "Straw Hat Crew"],
  ["ST01-005", "Jinbe", "Character", "Red", 3, 5000, 0, null, "Fish-Man Straw Hat Crew"],
  ["ST01-006", "Tony Tony.Chopper", "Character", "Red", 1, 1000, 0, null, "Animal Straw Hat Crew"],
  ["ST01-007", "Nami", "Character", "Red", 1, 1000, 1000, null, "Straw Hat Crew"],
  ["ST01-008", "Nico Robin", "Character", "Red", 3, 5000, 1000, null, "Straw Hat Crew"],
  ["ST01-009", "Nefeltari Vivi", "Character", "Red", 2, 4000, 1000, null, "Alabasta"],
  ["ST01-010", "Franky", "Character", "Red", 4, 6000, 1000, null, "Straw Hat Crew"],
  ["ST01-011", "Brook", "Character", "Red", 2, 3000, 2000, null, "Straw Hat Crew"],
  ["ST01-012", "Monkey.D.Luffy", "Character", "Red", 5, 6000, 0, null, "Straw Hat Crew Supernovas"],
  ["ST01-013", "Roronoa Zoro", "Character", "Red", 3, 5000, 0, null, "Straw Hat Crew Supernovas"],
  ["ST01-014", "Guard Point", "Event", "Red", 1, null, null, null, "Animal Straw Hat Crew"],
  ["ST01-015", "Gum-Gum Jet Pistol", "Event", "Red", 4, null, null, null, "Straw Hat Crew Supernovas"],
  ["ST01-016", "Diable Jambe", "Event", "Red", 1, null, null, null, "Straw Hat Crew"],
  ["ST01-017", "Thousand Sunny", "Stage", "Red", 2, null, 0, null, "Straw Hat Crew"],
  ["OP09-061", "Monkey.D.Luffy", "Leader", "Purple/Black", null, 5000, null, 4, "Straw Hat Crew The Four Emperors"],
  ["ST26-001", "Soba Mask", "Character", "Purple", 7, 9000, 0, null, "Straw Hat Crew"],
  ["ST26-002", "Tony Tony.Chopper", "Character", "Purple", 3, 4000, 1000, null, "Animal Straw Hat Crew"],
  ["ST26-003", "Nico Robin", "Character", "Purple", 3, 4000, 2000, null, "Straw Hat Crew"],
  ["ST26-004", "General Franky", "Character", "Purple", 8, 10000, 0, null, "Straw Hat Crew"],
  ["ST26-005", "Monkey.D.Luffy", "Character", "Purple", 6, 7000, 0, null, "Straw Hat Crew"],
  ["OP05-065", "San-Gorou", "Character", "Purple", 6, 8000, 1000, null, "Straw Hat Crew"],
  ["OP05-066", "Jinbe", "Character", "Purple", 5, 6000, 1000, null, "Fish-Man Straw Hat Crew"],
  ["OP05-070", "Fra-Nosuke", "Character", "Purple", 5, 4000, 2000, null, "Straw Hat Crew"],
  ["OP09-063", "Usopp", "Character", "Purple", 4, 6000, 1000, null, "Straw Hat Crew"],
  ["OP09-070", "Nami", "Character", "Purple", 3, 2000, 2000, null, "Straw Hat Crew"],
  ["OP09-076", "Roronoa Zoro", "Character", "Purple", 3, 5000, 0, null, "Straw Hat Crew"],
  ["OP09-077", "Gum-Gum Lightning", "Event", "Purple", 2, null, null, null, "Straw Hat Crew The Four Emperors"],
];

export const FIXTURE_CARDS: CardData[] = ROWS.map(([code, name, type, colors, cost, power, counter, life, traits]) => ({
  code, name, type, colors: colors.split("/"), cost, power, counter, life, traits, text: "",
}));

export const DEFS: Record<string, CardDef> = Object.fromEntries(FIXTURE_CARDS.map((c) => [c.code, buildDef(c)]));

const x4 = (codes: string[]) => codes.flatMap((c) => [c, c, c, c]);

/** ST-01 (Straw Hat Crew) – 50 kariet. */
export const DECK_ST01 = {
  name: "Červený Luffy",
  leader: "ST01-001",
  cards: [
    ...x4(["ST01-002", "ST01-003", "ST01-004", "ST01-005", "ST01-006", "ST01-007", "ST01-008", "ST01-009", "ST01-010", "ST01-011", "ST01-012", "ST01-013"]),
    "ST01-014", "ST01-015",
  ],
};

/** ST-26 (Purple/Black Luffy) – 48 kariet (čierne karty starter decku zatiaľ nie sú v databáze). */
export const DECK_ST26 = {
  name: "Fialový Luffy",
  leader: "OP09-061",
  cards: x4(["ST26-001", "ST26-002", "ST26-003", "ST26-004", "ST26-005", "OP05-065", "OP05-066", "OP05-070", "OP09-063", "OP09-070", "OP09-076", "OP09-077"]),
};
