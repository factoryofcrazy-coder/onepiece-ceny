// Pokémon karty z TCGdex (zadarmo, bez kľúča). Ceny z Cardmarketu (EUR, trend).
//   /api/pkcards            → zoznam setov (najnovšie prvé)
//   /api/pkcards?set=me02   → všetky karty setu vrátane reverse holo variantov a cien
//   /api/pkcards?q=charizard → hľadanie podľa mena vo všetkých setoch (bez cien – tie sú v detaile setu)
// Vercel CDN drží odpoveď 24 h (sety 12 h).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const API = "https://api.tcgdex.net/v2/en/";
const GQL = "https://api.tcgdex.net/v2/graphql";
const UA = { Accept: "application/json", "User-Agent": "grand-line-tracker/1.0" };
// séria, ktorú nezobrazujeme (digitálna hra Pokémon TCG Pocket)
const SKIP_SERIES = new Set(["tcgp"]);

type Raw = Record<string, any>;

async function getJson(url: string, init?: RequestInit, timeout = 20000): Promise<any> {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(url, { ...init, headers: { ...UA, ...(init?.headers ?? {}) }, cache: "no-store", signal: AbortSignal.timeout(timeout) });
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
    } catch {}
  }
  return null;
}

const money = (v: any) => {
  const n = typeof v === "number" ? v : parseFloat(v);
  return isNaN(n) || n <= 0 ? null : Math.round(n * 100) / 100;
};
const img = (base: string | undefined) => (base ? `${base}/high.webp` : "");

async function sets() {
  const [brief, gql] = await Promise.all([
    getJson(API + "sets"),
    getJson(GQL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "{ sets { id name releaseDate serie { id name } cardCount { total official } } }" }),
    }),
  ]);
  const meta = new Map<string, Raw>((gql?.data?.sets ?? []).map((s: Raw) => [s.id, s]));
  const list = (Array.isArray(brief) ? brief : [])
    .map((s: Raw) => {
      const m = meta.get(s.id) ?? {};
      return {
        id: s.id as string,
        name: s.name as string,
        series: (m.serie?.name as string) ?? "",
        seriesId: (m.serie?.id as string) ?? "",
        date: (m.releaseDate as string) ?? "",
        total: (s.cardCount?.total as number) ?? 0,
        official: (s.cardCount?.official as number) ?? 0,
        logo: s.logo ? `${s.logo}.webp` : "",
        symbol: s.symbol ? `${s.symbol}.webp` : "",
      };
    })
    .filter((s) => s.total > 0 && !SKIP_SERIES.has(s.seriesId));
  list.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  return list;
}

/** Ceny z Cardmarketu: základná karta = trend, reverse holo = trend-holo (ak chýba, priemer). */
function prices(d: Raw) {
  const cm = (d.variants_detailed ?? []).map((v: Raw) => v?.pricing?.cardmarket).find(Boolean) ?? d.pricing?.cardmarket ?? {};
  return { base: money(cm.trend) ?? money(cm.avg30) ?? money(cm.avg), holo: money(cm["trend-holo"]) ?? money(cm["avg30-holo"]) };
}

function cardsOf(d: Raw, setName: string) {
  const v = d.variants ?? {};
  const p = prices(d);
  const base = {
    code: d.id as string,
    name: d.name as string,
    num: d.localId as string,
    set: d.set?.id as string,
    setName: (d.set?.name as string) ?? setName,
    rarity: (d.rarity as string) ?? "",
    type: (d.category as string) ?? "", // Pokemon | Trainer | Energy
    types: (d.types as string[]) ?? [],
    hp: (d.hp as number) ?? null,
    stage: (d.stage as string) ?? "",
    illustrator: (d.illustrator as string) ?? "",
    img: img(d.image),
  };
  // základná verzia: normal, holo (ak normal neexistuje) alebo 1. edícia
  const mainV = v.normal ? "" : v.holo ? "Holo" : v.firstEdition ? "1st Edition" : "";
  const out = [{ ...base, id: `pk:${d.id}`, v: mainV, eur: p.base }];
  // reverse holo je pri Pokémonoch samostatná karta master setu
  if (v.reverse && (v.normal || v.holo)) out.push({ ...base, id: `pk:${d.id}_r`, v: "Reverse Holo", eur: p.holo ?? p.base });
  return out;
}

async function setCards(id: string) {
  const s = await getJson(API + "sets/" + encodeURIComponent(id));
  if (!s) return null;
  const brief: Raw[] = s.cards ?? [];
  const details: Raw[] = new Array(brief.length);
  let next = 0;
  const worker = async () => {
    while (next < brief.length) {
      const i = next++;
      details[i] = (await getJson(API + "cards/" + encodeURIComponent(brief[i].id), undefined, 15000)) ?? {
        ...brief[i],
        set: { id: s.id, name: s.name },
      };
    }
  };
  await Promise.all(Array.from({ length: 24 }, worker));
  const cards = details.flatMap((d) => cardsOf(d, s.name));
  return {
    set: {
      id: s.id,
      name: s.name,
      series: s.serie?.name ?? "",
      date: s.releaseDate ?? "",
      total: s.cardCount?.total ?? brief.length,
      official: s.cardCount?.official ?? brief.length,
      logo: s.logo ? `${s.logo}.webp` : "",
    },
    priced: cards.filter((c) => c.eur != null).length,
    cards,
  };
}

async function search(q: string) {
  const list = await getJson(API + "cards?name=" + encodeURIComponent(q) + "&pagination:itemsPerPage=250");
  return (Array.isArray(list) ? list : [])
    .filter((c: Raw) => c.image)
    .map((c: Raw) => ({ code: c.id, id: `pk:${c.id}`, name: c.name, num: c.localId, set: String(c.id).replace(/-[^-]+$/, ""), img: img(c.image) }));
}

const ok = (body: any, maxAge: number) =>
  Response.json(body, { headers: { "Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}` } });
const fail = (msg: string) => Response.json({ error: msg }, { status: 502, headers: { "Cache-Control": "no-store" } });

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const set = p.get("set");
  const q = p.get("q")?.trim();
  if (set) {
    if (!/^[\w.-]{1,30}$/.test(set)) return fail("neplatný set");
    const d = await setCards(set);
    if (!d || !d.cards.length) return fail(`set ${set} sa nepodarilo načítať z TCGdex`);
    return ok({ updated: new Date().toISOString(), source: "tcgdex.net", ...d }, d.priced ? 86400 : 3600);
  }
  if (q) {
    if (q.length < 2 || q.length > 60) return fail("hľadaj aspoň 2 znaky");
    return ok({ cards: await search(q) }, 86400);
  }
  const list = await sets();
  if (list.length < 50) return fail(`TCGdex vrátilo len ${list.length} setov`);
  return ok({ updated: new Date().toISOString(), source: "tcgdex.net", sets: list }, 43200);
}
