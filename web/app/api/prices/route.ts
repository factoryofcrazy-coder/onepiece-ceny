// Ceny zo scrapera. Najprv docs/data/prices.json (z Pages alebo z gitu, novší), inak vytiahne dáta zo stránky (const P={...}).
// ?game=pokemon → docs/data/pokemon.json
import { fetchData, OLD_SITE } from "@/lib/data-source";

export const dynamic = "force-dynamic";

const tryJson = (file: string) => fetchData("data/" + file);

async function fromHtml() {
  const r = await fetch(OLD_SITE, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`GitHub Pages HTTP ${r.status}`);
  const html = await r.text();
  const line = html.split("\n").find((l) => l.trimStart().startsWith("const P="));
  if (!line) throw new Error("dáta sa na stránke nenašli");
  return JSON.parse(line.trim().slice("const P=".length).replace(/;\s*$/, ""));
}

export async function GET(req: Request) {
  const pokemon = new URL(req.url).searchParams.get("game") === "pokemon";
  try {
    const data = pokemon
      ? await tryJson("pokemon.json").then((d) => {
          if (!d) throw new Error("Pokémon ceny ešte nie sú stiahnuté");
          return d;
        })
      : ((await tryJson("prices.json").catch(() => null)) ?? (await fromHtml()));
    data.hist = undefined; // história je veľká, nová stránka ju zatiaľ nepotrebuje
    data.repo = undefined; // adresa zdroja sa von neposiela
    return Response.json(data, {
      headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=60" },
    });
  } catch (e: any) {
    return Response.json({ error: String(e?.message ?? e) }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
