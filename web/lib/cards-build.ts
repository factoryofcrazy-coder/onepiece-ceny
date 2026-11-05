import { cardmarketPrices } from "./cardmarket";
import { applyPromoImages, buildCardAlts, CardAlt, loadCmProducts, loadTcgProducts } from "./promo-images";
// Zostavenie databázy One Piece kariet z OPTCG API (zadarmo, bez kľúča) + ceny z Cardmarketu (lib/cardmarket.ts).
// Používa ho /api/cards (záloha) aj skript scripts/build-cards.ts (denne cez GitHub Actions → docs/data/cards.json).

const API = "https://optcgapi.com/api/";
const SOURCES = ["allSetCards/", "allSTCards/"];

type Raw = Record<string, any>;

const num = (v: any) => {
  if (v === null || v === undefined || v === "" || v === "-" || v === "NULL") return null;
  const n = parseInt(String(v).replace(/,/g, ""), 10);
  return isNaN(n) ? null : n;
};
const money = (v: any) => {
  const n = parseFloat(v);
  return isNaN(n) || n <= 0 ? null : Math.round(n * 100) / 100; // 0 = cena neznáma
};
const str = (v: any) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));

function splitName(raw: string) {
  // "Roronoa Zoro (001)" -> ["Roronoa Zoro", ""]; "Kouzuki Oden (Alternate Art)" -> ["Kouzuki Oden", "Alternate Art"]
  const labels: string[] = [];
  const name = raw
    .replace(/\s*\(([^()]*)\)/g, (_, inner: string) => {
      const t = inner.trim();
      if (!/^\d{1,3}$/.test(t) && !/^[A-Z]{1,4}\d{0,2}-\d{3}$/.test(t)) labels.push(t);
      return "";
    })
    .replace(/\s*\[([^\[\]]*)\]/g, (_, inner: string) => (labels.push(inner.trim()), "")) // promo: [Winner], [Finalist]
    .replace(/\s+-\s+[A-Z]{1,4}\d{0,2}-\d{3}$/, "") // "Jinbe - EB04-015" → "Jinbe"
    .replace(/\s+/g, " ")
    .trim();
  return [name || raw.trim(), labels.join(" · ")];
}

// OPTCG API spája niektoré sety ("OP14-EB04") → rozdelí sa podľa kódu karty: OP14-001 → OP-14, EB04-001 → EB-04
function setOf(rawSet: string, code: string, rawName: string): [string, string] {
  if (!/^OP\d+-EB\d+$/.test(rawSet)) return [rawSet, rawName];
  const m = code.match(/^(OP|EB)(\d+)-/);
  if (!m) return [rawSet.replace(/^OP(\d+)-.*$/, "OP-$1"), rawName]; // reprinty (ST/P…) → hlavný OP set
  const id = `${m[1]}-${m[2]}`;
  return [id, m[1] === "EB" ? `Extra Booster ${id}` : rawName];
}

function normalize(c: Raw) {
  const id = str(c.card_image_id) || str(c.card_set_id);
  if (!id) return null;
  const code = str(c.card_set_id) || id.split("_")[0];
  const [name, label] = splitName(str(c.card_name));
  const variant = id !== code;
  const [set, setName] = setOf(str(c.set_id), code, str(c.set_name));
  return {
    id,
    code,
    name,
    v: variant ? label || "Parallel" : "",
    set,
    setName,
    rarity: str(c.rarity),
    type: str(c.card_type),
    colors: str(c.card_color).split(/[\s/,]+/).filter(Boolean),
    cost: num(c.card_cost),
    power: num(c.card_power),
    counter: num(c.counter_amount),
    life: num(c.life),
    attr: str(c.attribute),
    traits: str(c.sub_types),
    text: str(c.card_text),
    img: str(c.card_image),
    usd: money(c.market_price),
  };
}

async function get(path: string): Promise<Raw[]> {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(API + path, {
        headers: { Accept: "application/json", "User-Agent": "grand-line-tracker/1.0" },
        cache: "no-store",
        signal: AbortSignal.timeout(25000),
      });
      if (r.ok) {
        const d = await r.json();
        if (Array.isArray(d)) return d;
      }
    } catch {}
  }
  return [];
}

// Promo karty: hromadný zoznam (allPromoCards) na OPTCG API občas padá → záloha karta po karte (P-001, P-002…).
async function getPromos(): Promise<Raw[]> {
  const all = await get("allPromoCards/");
  if (all.length > 50) return all;
  const out: Raw[] = [];
  const one = async (n: number) => {
    try {
      const r = await fetch(`${API}promos/card/P-${String(n).padStart(3, "0")}/`, {
        headers: { Accept: "application/json", "User-Agent": "grand-line-tracker/1.0" },
        cache: "no-store",
        signal: AbortSignal.timeout(9000),
      });
      if (!r.ok) return [];
      const d = await r.json();
      return Array.isArray(d) ? (d as Raw[]) : [];
    } catch {
      return [];
    }
  };
  for (let start = 1; start <= 400; start += 25) {
    const batch = await Promise.all(Array.from({ length: 25 }, (_, i) => one(start + i)));
    const found = batch.flat();
    out.push(...found);
    if (!found.length) break; // celá dávka prázdna → koniec promo čísel
  }
  return out;
}

// DON!! karty majú vlastný zoznam a iné polia (don_id, optcg_don_name) → vlastný set „DON“.
function normalizeDon(c: Raw) {
  const n = parseInt(String(c.don_id ?? str(c.card_image_id).replace(/\D/g, "")), 10);
  if (!n) return null;
  const id = `DON-${String(n).padStart(3, "0")}`;
  const raw = str(c.card_name) || str(c.optcg_don_name) || "DON!! Card";
  const theme = raw.replace(/^DON!!\s*Card\s*/i, "").replace(/^\/\/\s*/, "").replace(/^\((.*)\)$/, "$1").trim();
  return {
    id,
    code: id,
    name: theme ? `DON!! ${theme}` : "DON!!",
    v: "",
    set: "DON",
    setName: "DON!! karty",
    rarity: str(c.rarity),
    type: "DON",
    colors: [] as string[],
    cost: null,
    power: null,
    counter: null,
    life: null,
    attr: "",
    traits: [str(c.set_id), str(c.set_name)].filter(Boolean).join(" "), // z akého produktu je
    text: str(c.card_text),
    img: str(c.card_image),
    usd: money(c.market_price),
  };
}

export async function buildCards() {
  const [setCards, stCards, promos, dons] = await Promise.all([...SOURCES.map(get), getPromos(), get("allDonCards/")]);
  const lists = [setCards, stCards, promos];
  const cards = new Map<string, ReturnType<typeof normalize>>();
  const sets = new Map<string, string>();
  for (const list of lists)
    for (const raw of list) {
      const c = normalize(raw);
      if (!c || cards.has(c.id)) continue;
      cards.set(c.id, c);
      if (c.set && !sets.has(c.set)) sets.set(c.set, c.setName || c.set);
    }
  for (const raw of dons) {
    const d = normalizeDon(raw);
    if (!d || cards.has(d.id)) continue;
    cards.set(d.id, d as any);
    if (!sets.has("DON")) sets.set("DON", "DON!! karty");
  }
  if (cards.size < 300) throw new Error(`OPTCG API vrátilo len ${cards.size} kariet`);
  const native = (c: any) => (c.code.replace(/-\d+$/, "").replace(/^([A-Z]+)(\d+)$/, "$1-$2") === c.set ? 0 : 1);
  const out = [...cards.values()].sort(
    (a: any, b: any) =>
      a.set.localeCompare(b.set) || native(a) - native(b) || a.code.localeCompare(b.code) || a.id.localeCompare(b.id),
  );
  // Cardmarket (EN + JP ceny) – keď nejde, ostanú len TCGplayer ceny
  let cmCount = 0;
  try {
    const { prices: cm, extras } = await cardmarketPrices(out as any);
    for (const c of out as any[]) {
      const f = cm.get(c.id);
      if (f) Object.assign(c, f), cmCount++;
    }
    // promo verzie len z Cardmarketu – údaje karty (typ, sila, text…) z našej základnej verzie
    const base = new Map<string, any>();
    for (const c of out as any[]) if (!base.has(c.code) || (!c.v && base.get(c.code).v)) base.set(c.code, c);
    for (const x of extras) {
      const b = base.get(x.code);
      if (!b) continue;
      (out as any[]).push({ ...b, id: x.id, v: x.label, set: "CM-PROMO", setName: "Promo verzie (Cardmarket)", rarity: b.rarity, img: "", usd: null, cm: x.cm, cmLow: x.cmLow, cm7: x.cm7, cm30: x.cm30, cmJp: undefined, cmId: x.idProduct });
    }
    if (extras.length) sets.set("CM-PROMO", "Promo verzie (Cardmarket)");
  } catch (e: any) {
    console.error("Cardmarket ceny zlyhali:", e?.message ?? e);
  }
  let alts: Record<string, CardAlt[]> = {};
  try {
    const tcg = await loadTcgProducts();
    const stats = applyPromoImages(out as any[], await loadCmProducts(), tcg);
    alts = buildCardAlts(out as any[], tcg);
    console.log(`Obrázky: presné ${stats.exact}, doplnené ${stats.filled}, ilustračné ${stats.approx}, bez obrázka ${stats.without}`);
  } catch (e: any) {
    console.error("Obrázky promo verzií zlyhali:", e?.message ?? e);
  }
  return {
    updated: new Date().toISOString(),
    source: cmCount ? "optcgapi.com + cardmarket.com" : "optcgapi.com",
    cmCards: cmCount,
    sets: [...sets].map(([id, name]) => ({ id, name })),
    cards: out,
    alts, // ukladá sa do samostatného súboru, sťahuje sa až v detaile karty
  };
}
