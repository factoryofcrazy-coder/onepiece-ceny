// Databáza kariet z OPTCG API (zadarmo, bez kľúča). Vercel CDN odpoveď drží 24 h.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

export async function GET() {
  const lists = await Promise.all([...SOURCES.map(get), getPromos()]);
  const cards = new Map<string, ReturnType<typeof normalize>>();
  const sets = new Map<string, string>();
  for (const list of lists)
    for (const raw of list) {
      const c = normalize(raw);
      if (!c || cards.has(c.id)) continue;
      cards.set(c.id, c);
      if (c.set && !sets.has(c.set)) sets.set(c.set, c.setName || c.set);
    }
  if (cards.size < 300)
    return Response.json(
      { error: `OPTCG API vrátilo len ${cards.size} kariet` },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  const native = (c: any) => (c.code.replace(/-\d+$/, "").replace(/^([A-Z]+)(\d+)$/, "$1-$2") === c.set ? 0 : 1);
  const out = [...cards.values()].sort(
    (a: any, b: any) =>
      a.set.localeCompare(b.set) || native(a) - native(b) || a.code.localeCompare(b.code) || a.id.localeCompare(b.id),
  );
  return Response.json(
    {
      updated: new Date().toISOString(),
      source: "optcgapi.com",
      sets: [...sets].map(([id, name]) => ({ id, name })),
      cards: out,
    },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=172800" } },
  );
}
