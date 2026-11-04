// Obrázky pre promo verzie z Cardmarketu. Cardmarket obrázky verejne nedáva, preto ich hľadáme na TCGplayeri (cez tcgcsv.com):
// expanzia Cardmarketu sa páruje so skupinou TCGplayeru podľa toho, či majú rovnaké karty. Pre presnú zhodu vznikne presný obrázok.
// Kde sa verzia určiť nedá (zmiešané expanzie), ostane základná karta a príznak imgBase = obrázok je len ilustračný.
const TCG = "https://tcgcsv.com/tcgplayer/68";
const CM_LIST = "https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_18.json";
const MIN_OVERLAP = 0.9; // podiel spoločných kariet v oboch smeroch
const MIN_EXPANSION = 8; // malé expanzie sa dajú ľahko spárovať náhodou

export type TcgProduct = { group: string; name: string; number: string; img: string; usd?: number };
export type CmProduct = { idProduct: number; idExpansion: number };
type CardRow = {
  id: string;
  code: string;
  v: string;
  set: string;
  setName?: string;
  img: string;
  cmId?: number;
  imgBase?: boolean;
  usd?: number | null;
  cm?: number | null;
  cmLow?: number | null;
};

const large = (url: string) => url.replace(/_200w(\.\w+)$/, "_in_400x400$1");
const isPromoGroup = (g: string) => /Promotion|Revision/.test(g);
const TRUSTED_RATIO = 4; // cena CM a TCGplayeru sa pri tej istej verzii nelíši viac než 4-násobne
const TREND_FLOOR = 0.05; // trend pod 5 % ceny TCGplayeru je chyba z málo predajov, nie reálna cena

/** „Nami (055) (Super Rare Alternate Art)“ → „Alternate Art“; základná verzia → "" */
export function variantLabel(name: string) {
  const parts = [...name.matchAll(/\(([^()]+)\)/g)].map((m) => m[1]).map((t) => t.replace(/^[A-Z]{1,4}\d{0,2}-\d{1,3}\s*·?\s*/, "").trim()).filter((t) => t && !/^\d{1,3}$/.test(t));
  return parts.join(" · ").replace(/^Super Rare Alternate Art$/, "Alternate Art");
}

// Nová edícia: OPTCG API zatiaľ nepozná vzácne verzie a Cardmarket ich nerozlišuje v názve.
// Verzie jednej karty idú na Cardmarkete podľa čísla produktu v rovnakom poradí, v akom ich má TCGplayer podľa ceny.
// Páruje sa len pri rovnakom počte verzií a keď to potvrdia aj ceny.
function pairRareVersions(rows: CardRow[], numbers: Map<string, TcgProduct[]>, baseOf: Map<string, CardRow>) {
  let paired = 0;
  const byCode = new Map<string, CardRow[]>();
  for (const c of rows) if (!c.img) byCode.set(c.code, [...(byCode.get(c.code) ?? []), c]);
  for (const [code, list] of byCode) {
    const variants = (numbers.get(code) ?? []).filter((p) => variantLabel(p.name));
    if (variants.length !== list.length || variants.some((p) => !p.usd)) continue;
    const ours = [...list].sort((a, b) => a.cmId! - b.cmId!);
    const theirs = [...variants].sort((a, b) => a.usd! - b.usd!);
    const reliable = ours
      .map((c, i) => [c.cm ?? 0, theirs[i].usd!] as const)
      .filter(([cm, usd]) => cm >= TREND_FLOOR * usd);
    if (!reliable.length || reliable.some(([cm, usd]) => cm > usd * TRUSTED_RATIO || cm * TRUSTED_RATIO < usd)) continue;
    ours.forEach((c, i) => {
      const t = theirs[i];
      const base = baseOf.get(code);
      c.v = variantLabel(t.name);
      c.img = large(t.img);
      c.usd = t.usd;
      if (base) {
        c.set = base.set;
        c.setName = base.setName;
      }
      if ((c.cm ?? 0) < TREND_FLOOR * t.usd!) {
        c.cm = null;
        c.cmLow = null;
      }
      paired++;
    });
  }
  return paired;
}

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

  const baseOf = new Map<string, CardRow>();
  for (const c of cards) if (!c.v && !c.cmId && !baseOf.has(c.code)) baseOf.set(c.code, c);

  let exact = 0;
  let paired = 0;
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
    if (!best) {
      // expanzia je samotná edícia: karty z nej má jediná bežná skupina, ktorá má aj vzácne verzie
      const home = [...groups].filter(([name, numbers]) => !isPromoGroup(name) && !/Pre-Release|Release Event|Anniversary/.test(name) && [...codes].every((c) => numbers.has(c)));
      if (home.length === 1 && !rows.some((c) => /Errata/i.test(c.v))) paired += pairRareVersions(rows, home[0][1], baseOf);
      continue;
    }
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
    // „Nami (061)“ je základná verzia, zátvorka s číslom nerozlišuje; „(Alternate Art)“ áno
    const plain = (byNumber.get(c.code) ?? []).filter((p) => !/[(\[]/.test(p.name.replace(/\(\d{1,3}\)/g, "")));
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
  return { exact, paired, filled, approx, without: promos.filter((c) => !c.img).length };
}

export type CardAlt = { l: string; i: string };

/** „Možné vzhľady“: známe verzie karty pre promo záznamy, pri ktorých nevieme určiť tú presnú. */
export function buildCardAlts(cards: CardRow[], tcg: TcgProduct[]) {
  const wanted = new Set(cards.filter((c) => c.imgBase).map((c) => c.code));
  const out: Record<string, CardAlt[]> = {};
  for (const p of tcg) {
    if (!wanted.has(p.number) || !p.img) continue;
    const label = variantLabel(p.name);
    if (!label && !isPromoGroup(p.group)) continue; // základná verzia sa ukazuje aj tak
    const list = (out[p.number] ??= []);
    if (!list.some((x) => x.i === p.img)) list.push({ l: label || p.group, i: p.img });
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.l.localeCompare(b.l));
  return out;
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
          const [{ results }, prices] = await Promise.all([json(`${TCG}/${g.groupId}/products`), json(`${TCG}/${g.groupId}/prices`)]);
          const usd = new Map<number, number>();
          for (const x of prices.results) {
            const v = x.marketPrice ?? x.midPrice;
            if (v) usd.set(x.productId, Math.max(v, usd.get(x.productId) ?? 0));
          }
          for (const p of results)
            out.push({
              usd: usd.get(p.productId),
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
