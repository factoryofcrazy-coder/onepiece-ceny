// Zapečatené produkty (boxy, displaye, startery…) s reálnou trend cenou z Cardmarketu.
// Hotový súbor docs/data/sealed.json (generuje ho denne cards.yml; z Pages alebo z gitu, novší), inak zostavenie naživo.
import { fetchData } from "@/lib/data-source";
import { buildCards } from "@/lib/cards-build";
import { sealedProducts } from "@/lib/cardmarket";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const d = await fetchData("data/sealed.json", 10000);
  if (d && Array.isArray(d.sealed) && d.sealed.length)
    return new Response(JSON.stringify(d), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=600, s-maxage=86400, stale-while-revalidate=172800" } });
  try {
    const db = await buildCards();
    const sealed = await sealedProducts(db.cards as any);
    return Response.json({ updated: new Date().toISOString(), source: "cardmarket.com", sealed }, { headers: { "Cache-Control": "public, max-age=600, s-maxage=86400, stale-while-revalidate=172800" } });
  } catch (e: any) {
    return Response.json({ error: String(e?.message ?? e) }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
