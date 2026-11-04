// Databáza kariet. Najprv hotový súbor z GitHub Pages (docs/data/cards.json, generuje ho denne GitHub Action –
// rýchle), inak zostavenie naživo z OPTCG API (pomalé, ~10 s). Vercel CDN odpoveď drží 24 h.
import { OLD_SITE } from "@/lib/config";
import { buildCards } from "@/lib/cards-build";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_AGE_H = 72; // starší súbor z Pages → radšej zostav naživo

async function fromPages(anyAge = false) {
  try {
    const r = await fetch(process.env.CARDS_JSON_URL || OLD_SITE + "data/cards.json", { cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const d = await r.json();
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
