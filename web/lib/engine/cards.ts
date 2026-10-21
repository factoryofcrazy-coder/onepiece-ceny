// Definície kariet pre engine: údaje z databázy kariet + skript efektu (DSL) podľa herného kódu.
import type { Script } from "./dsl";
import { SCRIPTS } from "./scripts";
import type { CardDef, Keyword } from "./types";

export type CardData = {
  code: string;
  name: string;
  type: string;
  colors: string[];
  cost: number | null;
  power: number | null;
  counter: number | null;
  life: number | null;
  traits: string;
  text: string;
  attr?: string;
};

export { SCRIPTS };

const KW: [RegExp, Keyword][] = [
  [/^\[Rush: ?Character\]/i, "rushChar"],
  [/^\[Blocker\]/i, "blocker"],
  [/^\[Rush\]/i, "rush"],
  [/^\[Double Attack\]/i, "doubleAttack"],
  [/^\[Banish\]/i, "banish"],
  [/^\[Unblockable\]/i, "unblockable"],
];
/** Kľúčové slová, ktorými text karty začína (bez podmienky). */
export function leadingKeywords(text: string): Keyword[] {
  let t = text.replace(/\([^)]*\)/g, "").trim();
  const out: Keyword[] = [];
  for (let guard = 0; guard < 6; guard++) {
    const hit = KW.find(([re]) => re.test(t));
    if (!hit) break;
    out.push(hit[1]);
    t = t.replace(hit[0], "").trim();
  }
  return out;
}
/** Má karta okrem úvodných kľúčových slov ešte nejaký efekt? */
export function hasEffectText(text: string): boolean {
  let t = (text || "").replace(/NULL/g, "").replace(/\([^)]*\)/g, "").replace(/This card has been officially errata'd\.?/gi, "").trim();
  for (let guard = 0; guard < 6; guard++) {
    const hit = KW.find(([re]) => re.test(t));
    if (!hit) break;
    t = t.replace(hit[0], "").trim();
  }
  return t.length > 0;
}

// viacslovné typy (traits) – dlhšie vyhrávajú, aby „Whitebeard Pirates Allies“ nebolo „Whitebeard Pirates“
const TRAITS = [
  "The Seven Warlords of the Sea", "Whitebeard Pirates Allies", "Former Whitebeard Pirates", "Animal Kingdom Pirates", "Thriller Bark Pirates",
  "Former Baroque Works", "Former Rocks Pirates", "Former Roger Pirates", "Donquixote Pirates", "Blackbeard Pirates", "Whitebeard Pirates",
  "Red-Haired Pirates", "Revolutionary Army", "The Vinsmoke Family", "The Four Emperors", "King of the Pirates", "Black Cat Pirates",
  "New Giant Pirates", "Big Mom Pirates", "Straw Hat Crew", "Hawkins Pirates", "Firetank Pirates", "Beautiful Pirates", "The Akazaya Nine",
  "The Sun Pirates", "Fish-Man Island", "Shandian Warrior", "Bonney Pirates", "Buggy Pirates", "Alvida Pirates", "Arlong Pirates",
  "Flying Pirates", "Drake Pirates", "Heart Pirates", "Krieg Pirates", "Kuja Pirates", "Foxy Pirates", "Rocks Pirates", "Roger Pirates",
  "Kid Pirates", "Baroque Works", "Muggy Kingdom", "Kouzuki Clan", "Land of Wano", "Punk Hazard", "Water Seven", "Amazon Lily",
  "Goa Kingdom", "Cross Guild", "Former Navy", "Impel Down", "Sky Island", "East Blue", "GERMA 66", "World Government",
].sort((a, b) => b.split(" ").length - a.split(" ").length);

export function splitTraits(s: string): string[] {
  const words = s.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let i = 0;
  while (i < words.length) {
    const hit = TRAITS.find((t) => {
      const tw = t.split(" ");
      return words.slice(i, i + tw.length).join(" ") === t;
    });
    if (hit) {
      out.push(hit);
      i += hit.split(" ").length;
    } else out.push(words[i++]);
  }
  return out;
}

export function buildDef(c: CardData): CardDef {
  const sc: Script | undefined = SCRIPTS[c.code];
  const text = c.text && c.text !== "NULL" ? c.text : "";
  const alias = [...text.matchAll(/also treat this card's name as \[([^\]]+)\](?: and \[([^\]]+)\])?/gi)].flatMap((m) => [m[1], m[2]].filter(Boolean) as string[]);
  return {
    code: c.code,
    name: c.name,
    names: [...(sc?.names ?? []), ...alias],
    type: (["Leader", "Character", "Event", "Stage"].includes(c.type) ? c.type : "Character") as CardDef["type"],
    colors: c.colors ?? [],
    cost: c.cost ?? 0,
    power: c.power ?? 0,
    counter: c.counter ?? 0,
    life: c.life ?? 0,
    traits: c.traits ? splitTraits(c.traits) : [],
    traitText: c.traits ?? "",
    attribute: c.attr ?? "",
    hasTrigger: /\[Trigger\]|\bTrigger Play this card/i.test(text),
    keywords: sc?.kw ?? leadingKeywords(text),
    abilities: sc?.abilities ?? [],
    scripted: !!sc || !hasEffectText(text),
    text,
    rules: sc?.rules,
  };
}
