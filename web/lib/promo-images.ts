// Obrázky pre promo verzie z Cardmarketu. Cardmarket obrázky verejne nedáva, preto ich hľadáme na TCGplayeri (cez tcgcsv.com):
// expanzia Cardmarketu sa páruje so skupinou TCGplayeru podľa toho, či majú rovnaké karty. Pre presnú zhodu vznikne presný obrázok.
// Kde sa verzia určiť nedá (zmiešané expanzie), ostane základná karta a príznak imgBase = obrázok je len ilustračný.
const TCG = "https://tcgcsv.com/tcgplayer/68";
const CM_LIST = "https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_18.json";
const MIN_OVERLAP = 0.9; // podiel spoločných kariet v oboch smeroch
const MIN_EXPANSION = 8; // malé expanzie sa dajú ľahko spárovať náhodou

export type TcgProduct = { group: string; name: string; number: string; img: string };
export type CmProduct = { idProduct: number; idExpansion: number };
type CardRow = { id: string; code: string; v: string; set: string; img: string; cmId?: number; imgBase?: boolean };

const large = (url: string) => url.replace(/_200w(\.\w+)$/, "_in_400x400$1");
const isPromoGroup = (g: string) => /Promotion|Revision/.test(g);

export function applyPromoImages(cards: CardRow[], cm: CmProduct[], tcg: TcgProduct[]) {
  const expansionOf = new Map(cm.map((p) => [p.idProduct, p.idExpansion]));
  const groups = new Map<string, Map<string, TcgProduct[]>>();
  const byNumber = new Map<string, TcgProduct[]>();
  for (const p of tcg) {
    if (!p.number || !p.img) continue;
    if (!groups.has(p.group)) groups.set(p.group, new Map());
    const g = groups.get(p.group)!;
    g.set(p.number, [...(g.get(p.number) ?? []), p]);
    byNumber.set(p.number, [...(byNumber.get(p.number) ?? []), p]);
  }

  const baseImg = new Map<string, string>();
  for (const c of cards) if (c.img && !c.v && !baseImg.has(c.code)) baseImg.set(c.code, c.img);

  const promos = cards.filter((c) => c.cmId && !c.img);
  const expansions = new Map<number, CardRow[]>();
  for (const c of promos) {
    const e = expansionOf.get(c.cmId!);
    if (e == null) continue;
    expansions.set(e, [...(expansions.get(e) ?? []), c]);
  }

  let exact = 0;
  for (const rows of expansions.values()) {
    if (rows.length < MIN_EXPANSION || rows.some((c) => /Errata/i.test(c.v))) continue;
    const codes = new Set(rows.map((c) => c.code));
    let best: { score: number; numbers: Map<string, TcgProduct[]> } | null = null;
    for (const [name, numbers] of groups) {
      if (isPromoGroup(name)) continue; // zmiešaná skupina, karta tam má viac rôznych verzií
      let both = 0;
      for (const code of codes) if (numbers.has(code)) both++;
      const coverage = both / codes.size;
      const precision = both / numbers.size;
      if (coverage >= MIN_OVERLAP && precision >= MIN_OVERLAP && (!best || coverage * precision > best.score))
        best = { score: coverage * precision, numbers };
    }
    if (!best) continue;
    const counts = new Map<string, number>();
    for (const c of rows) counts.set(c.code, (counts.get(c.code) ?? 0) + 1);
    for (const c of rows) {
      const found = best.numbers.get(c.code) ?? [];
      if (counts.get(c.code) === 1 && found.length === 1) {
        c.img = large(found[0].img);
        exact++;
      }
    }
  }

  // karty bez obrázka aj mimo Cardmarketu (napr. nová edícia): len keď je na TCGplayeri jednoznačná
  let filled = 0;
  for (const c of cards) {
    if (c.img || c.cmId || c.v || c.set === "DON") continue;
    const plain = (byNumber.get(c.code) ?? []).filter((p) => !/[(\[]/.test(p.name));
    if (plain.length === 1) {
      c.img = large(plain[0].img);
      filled++;
    }
  }

  let approx = 0;
  for (const c of promos) {
    if (c.img) continue;
    const b = baseImg.get(c.code);
    if (b) {
      c.img = b;
      c.imgBase = true;
      approx++;
    }
  }
  return { exact, filled, approx, without: promos.filter((c) => !c.img).length };
}

async function json(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { "User-Agent": "grand-line-tracker" } });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

/** Skupiny aj produkty TCGplayeru; jedna zlyhaná skupina nezastaví ostatné. */
export async function loadTcgProducts(): Promise<TcgProduct[]> {
  const { results: groups } = await json(`${TCG}/groups`);
  const out: TcgProduct[] = [];
  for (let i = 0; i < groups.length; i += 5) {
    await Promise.all(
      groups.slice(i, i + 5).map(async (g: any) => {
        try {
          const { results } = await json(`${TCG}/${g.groupId}/products`);
          for (const p of results)
            out.push({
              group: g.name,
              name: p.name,
              number: p.extendedData?.find((d: any) => d.name === "Number")?.value ?? "",
              img: p.imageUrl ?? "",
            });
        } catch (e: any) {
          console.error("TCGplayer skupina zlyhala:", g.name, e?.message ?? e);
        }
      }),
    );
  }
  return out;
}

export async function loadCmProducts(): Promise<CmProduct[]> {
  return (await json(CM_LIST)).products;
}
