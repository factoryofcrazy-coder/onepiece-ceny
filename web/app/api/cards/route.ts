// Databáza kariet z OPTCG API (zadarmo, bez kľúča). Vercel CDN odpoveď drží 24 h.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const API = "https://optcgapi.com/api/";
const SOURCES = ["allSetCards/", "allSTCards/", "allPromoCards/"];

type Raw = Record<string, any>;

const num = (v: any) => {
  if (v === null || v === undefined || v === "" || v === "-" || v === "NULL") return null;
  const n = parseInt(String(v).replace(/,/g, ""), 10);
  return isNaN(n) ? null : n;
};
const money = (v: any) => {
  const n = parseFloat(v);
  return isNaN(n) ? null : Math.round(n * 100) / 100;
};
const str = (v: any) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));

function splitName(raw: string) {
  // "Roronoa Zoro (001)" -> ["Roronoa Zoro", ""]; "Kouzuki Oden (Alternate Art)" -> ["Kouzuki Oden", "Alternate Art"]
  const labels: string[] = [];
  const name = raw
    .replace(/\s*\(([^()]*)\)/g, (_, inner: string) => {
      if (!/^\d{1,3}$/.test(inner.trim())) labels.push(inner.trim());
      return "";
    })
    .replace(/\s+/g, " ")
    .trim();
  return [name || raw.trim(), labels.join(" · ")];
}

// OPTCG API spája niektoré sety ("OP14-EB04") → rozdelí sa podľa kódu karty: OP14-001 → OP-14, EB04-001 → EB-04
function setOf(rawSet: string, code: string, rawName: string): [string, string] {
  if (!/^OP\d+-EB\d+$/.test(rawSet)) return [rawSet, rawName];
  const m = code.match(/^(OP|EB)(\d+)-/);
  if (!m) return [rawSet, rawName];
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

export async function GET() {
  const lists = await Promise.all(SOURCES.map(get));
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
  const out = [...cards.values()].sort((a, b) =>
    a!.set === b!.set ? (a!.code === b!.code ? a!.id.localeCompare(b!.id) : a!.code.localeCompare(b!.code)) : a!.set.localeCompare(b!.set),
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
