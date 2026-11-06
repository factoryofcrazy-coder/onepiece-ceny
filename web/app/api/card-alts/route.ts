// Známe verzie kariet zo scrapera, cez server, aby prehliadač nepoznal adresu zdroja.
import { fetchData } from "@/lib/data-source";

export async function GET() {
  const d = await fetchData("data/card-alts.json");
  if (!d) return Response.json({}, { headers: { "Cache-Control": "no-store" } });
  return Response.json(d, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" },
  });
}
