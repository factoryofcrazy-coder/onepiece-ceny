// Databáza kariet. Najprv hotový súbor docs/data/cards.json (generuje ho denne GitHub Action; z Pages alebo z gitu,
// podľa toho, ktorý je novší – rýchle), inak zostavenie naživo z OPTCG API (pomalé, ~10 s). Vercel CDN odpoveď drží 24 h.
import { fetchData } from "@/lib/data-source";
import { buildCards } from "@/lib/cards-build";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_AGE_H = 72; // starší súbor → radšej zostav naživo

async function fromPages(anyAge = false) {
  try {
    const d = process.env.CARDS_JSON_URL
      ? await fetch(process.env.CARDS_JSON_URL, { cache: "no-store", signal: AbortSignal.timeout(10000) }).then((r) => (r.ok ? r.json() : null))
      : await fetchData("data/cards.json", 10000);
    if (!d) return null;
    const age = (Date.now() - new Date(d.updated).getTime()) / 3.6e6;
    return Array.isArray(d.cards) && d.cards.length > 300 && (anyAge || age < MAX_AGE_H) ? d : null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    // 1) čerstvý súbor z Pages, 2) zostavenie naživo, 3) OPTCG API nejde → aj starší súbor z Pages
    const data =
      (await fromPages()) ??
      (await buildCards().catch(async (e) => {
        const old = await fromPages(true);
        if (old) return old;
        throw e;
      }));
    delete (data as any).alts; // zostavenie naživo: možné vzhľady sa posielajú zvlášť
    return Response.json(data, {
      headers: { "Cache-Control": "public, max-age=600, s-maxage=86400, stale-while-revalidate=172800" },
    });
  } catch (e: any) {
    return Response.json({ error: String(e?.message ?? e) }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
