// Známe verzie kariet zo scrapera, cez server, aby prehliadač nepoznal adresu zdroja.
import { OLD_SITE } from "@/lib/data-source";

export async function GET() {
  try {
    const r = await fetch(OLD_SITE + "data/card-alts.json", { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!r.ok) return Response.json({}, { headers: { "Cache-Control": "no-store" } });
    return new Response(await r.text(), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" },
    });
  } catch {
    return Response.json({}, { headers: { "Cache-Control": "no-store" } });
  }
}
