// Oficiálny obrázok karty od Bandai (bez vodotlače). Bandai blokuje priame odkazy z iných stránok,
// preto ho stiahne server a Vercel CDN ho drží 30 dní. Keď Bandai obrázok nemá → presmerovanie na OPTCG API.
export const dynamic = "force-dynamic";

const SOURCES = (id: string) => [
  `https://en.onepiece-cardgame.com/images/cardlist/card/${id}.png`,
  `https://asia-en.onepiece-cardgame.com/images/cardlist/card/${id}.png`,
];

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(id)) return new Response("bad id", { status: 400 });
  for (const url of SOURCES(id)) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36", Accept: "image/*" },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      const type = r.headers.get("content-type") || "";
      if (r.ok && type.startsWith("image/")) {
        return new Response(r.body, {
          headers: { "Content-Type": type, "Cache-Control": "public, max-age=604800, s-maxage=2592000, immutable" },
        });
      }
    } catch {}
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://optcgapi.com/media/static/Card_Images/${id}.jpg`,
      "Cache-Control": "public, s-maxage=86400",
    },
  });
}
