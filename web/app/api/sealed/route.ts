// Zapečatené produkty (boxy, displaye, startery…) s reálnou trend cenou z Cardmarketu.
// Hotový súbor z GitHub Pages (docs/data/sealed.json, generuje ho denne cards.yml), inak zostavenie naživo.
import { OLD_SITE } from "@/lib/data-source";
import { buildCards } from "@/lib/cards-build";
import { sealedProducts } from "@/lib/cardmarket";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const r = await fetch(OLD_SITE + "data/sealed.json", { cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (r.ok) {
      const d = await r.json();
      if (Array.isArray(d.sealed) && d.sealed.length) return new Response(JSON.stringify(d), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=600, s-maxage=86400, stale-while-revalidate=172800" } });
    }
  } catch {
    /* skúsime naživo */
  }
  try {
    const db = await buildCards();
    const sealed = await sealedProducts(db.cards as any);
    return Response.json({ updated: new Date().toISOString(), source: "cardmarket.com", sealed }, { headers: { "Cache-Control": "public, max-age=600, s-maxage=86400, stale-while-revalidate=172800" } });
  } catch (e: any) {
    return Response.json({ error: String(e?.message ?? e) }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
