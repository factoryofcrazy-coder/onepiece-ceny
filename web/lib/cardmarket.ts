// Ceny z Cardmarketu – verejný denný cenník (downloads.s3.cardmarket.com, One Piece = hra 18).
// Cardmarket má produkty bez našich ID variantov → párovanie:
//  1) náš set (OP-05, PRB-01…) → CM expanzie s rovnakými kódmi kariet; jazyk expanzie podľa zapečatených
//     produktov („(Non-English)“, „(Asia Region Legal)“ = japonská)
//  2) v rámci kódu: EN podľa ceny voči TCGplayer + poradia produktov, JP podľa poradia cien
//  3) poistka: > 4× rozdiel voči TCGplayer pri karte za ≥ 2 € = asi zlé spárovanie → ostane TCGplayer
// Promo (P-xxx) a DON!! sú na CM roztrúsené po desiatkach expanzií → ostávajú len TCGplayer.

const BASE = "https://downloads.s3.cardmarket.com/productCatalog/";
const GAME = 18;
const USD_EUR = 1.12; // len na porovnanie s TCGplayer pri párovaní

type CmProduct = { idProduct: number; name: string; idExpansion: number };
type CmPrice = { idProduct: number; trend: number | null; avg7: number | null; avg30: number | null; avg: number | null; low: number | null };
type CardLike = { id: string; code: string; set: string; usd: number | null };
export type CmFields = { cm?: number; cmLow?: number; cmJp?: number; cm7?: number; cm30?: number };
/** Verzia karty, ktorú má len Cardmarket (promo, pre-release, judge…) – v OPTCG API chýba. */
export type CmExtra = { id: string; code: string; label: string; cm?: number; cmLow?: number; cm7?: number; cm30?: number; idProduct: number; name: string };

/** Druh promo expanzie podľa názvov jej zapečatených produktov. */
function promoLabel(names: string[]) {
  const t = names.join(" | ");
  if (/Pre-Errata/i.test(t)) return "Pre-Errata";
  if (/Pre-Release/i.test(t)) return "Pre-Release";
  if (/Release Event/i.test(t)) return "Release Event";
  if (/Judge/i.test(t)) return "Judge";
  if (/Championship|Regional|Treasure Cup|Tournament/i.test(t)) return "Tournament promo";
  return "Promo";
}

const CODE_RX = /\(([A-Z]{1,4}\d{0,2}-\d{3})\)/;
const JP_RX = /Non-English|Asia Region|Japanese|Chinese/i;

async function getJson(path: string) {
  const r = await fetch(BASE + path, { cache: "no-store", signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Cardmarket ${path}: HTTP ${r.status}`);
  return r.json();
}

function variantOrder(c: CardLike): [number, number] {
  if (c.id === c.code) return [0, 0];
  const m = c.id.match(/_(p|r|pr)(\d+)$/);
  return m ? [{ p: 1, r: 2, pr: 3 }[m[1] as "p" | "r" | "pr"], parseInt(m[2])] : [9, 0];
}

function* permutations(n: number, k: number, used: boolean[] = [], cur: number[] = []): Generator<number[]> {
  if (cur.length === k) {
    yield cur.slice();
    return;
  }
  for (let i = 0; i < n; i++)
    if (!used[i]) {
      used[i] = true;
      cur.push(i);
      yield* permutations(n, k, used, cur);
      cur.pop();
      used[i] = false;
    }
}

/** Zapečatený produkt (box, display, starter…) s reálnou trhovou hodnotou z Cardmarketu. */
export type SealedProduct = { id: number; name: string; set: string | null; setName: string; kind: string; lang: "EN" | "JP"; cm?: number; cm7?: number; cm30?: number; cmLow?: number };

// Druh zapečateného produktu podľa názvu (poradie je dôležité).
const SEALED_SKIP = /sleeve|playmat|binder|portfolio|album|toploader|protector|deck box|storage|dice|gift card|playset|promo pack$|single/i;
function sealedKind(n: string): string | null {
  if (SEALED_SKIP.test(n)) return null;
  if (/booster box case|\bcase\b/i.test(n)) return "Case";
  if (/double pack|\bDP-?\d/i.test(n)) return "Double Pack";
  if (/booster box|\bdisplay\b|\bbox\b/i.test(n)) return "Box";
  if (/premium booster|premium/i.test(n)) return "Premium";
  if (/starter deck|structure deck|\bST-?\d/i.test(n)) return "Starter";
  if (/booster pack|\bpack\b|\bbooster\b/i.test(n)) return "Pack";
  return "Iné";
}

/** Zapečatené produkty One Piece s trend cenou z verejného cenníka Cardmarketu. */
export async function sealedProducts(cards: CardLike[]): Promise<SealedProduct[]> {
  const [pl, pg, ns] = await Promise.all([
    getJson(`productList/products_singles_${GAME}.json`),
    getJson(`priceGuide/price_guide_${GAME}.json`),
    getJson(`productList/products_nonsingles_${GAME}.json`),
  ]);
  const price = new Map<number, CmPrice>((pg.priceGuides as CmPrice[]).map((g) => [g.idProduct, g]));
  const tr = (id: number) => {
    const g = price.get(id);
    return g ? g.trend || g.avg7 || g.avg || null : null;
  };
  const r2 = (v: number | null | undefined) => (v ? Math.round(v * 100) / 100 : undefined);

  // jazyk expanzie podľa zapečatených produktov
  const votes = new Map<number, [number, number]>();
  for (const p of ns.products as CmProduct[]) {
    const v = votes.get(p.idExpansion) ?? [0, 0];
    v[JP_RX.test(p.name) ? 1 : 0]++;
    votes.set(p.idExpansion, v);
  }
  const lang = (e: number): "EN" | "JP" => (votes.get(e)?.[1] ?? 0) > (votes.get(e)?.[0] ?? 0) ? "JP" : "EN";

  // expanzia (CM) → náš set: podľa prekryvu kódov kariet jednotlivín
  const byExp = new Map<number, Set<string>>();
  for (const p of pl.products as CmProduct[]) {
    const m = p.name.match(CODE_RX);
    if (!m) continue;
    let s = byExp.get(p.idExpansion);
    if (!s) byExp.set(p.idExpansion, (s = new Set()));
    s.add(m[1]);
  }
  const setCodes = new Map<string, Set<string>>();
  for (const c of cards) {
    if (c.set === "P" || c.set === "DON" || c.set === "CM-PROMO") continue;
    let s = setCodes.get(c.set);
    if (!s) setCodes.set(c.set, (s = new Set()));
    s.add(c.code);
  }
  const setName = new Map(cards.map((c) => [c.set, (c as CardLike & { setName?: string }).setName ?? c.set]));
  const expSet = new Map<number, string>();
  for (const [e, codes] of byExp) {
    let bestSet: string | null = null, bestN = 0;
    for (const [S, cs] of setCodes) {
      const n = [...codes].filter((x) => cs.has(x)).length;
      if (n > bestN) (bestN = n), (bestSet = S);
    }
    if (bestSet && bestN >= Math.max(3, 0.4 * codes.size)) expSet.set(e, bestSet);
  }

  const out: SealedProduct[] = [];
  for (const p of ns.products as CmProduct[]) {
    const kind = sealedKind(p.name);
    if (!kind) continue;
    const t = tr(p.idProduct);
    if (!t) continue;
    const set = expSet.get(p.idExpansion) ?? null;
    out.push({
      id: p.idProduct,
      name: p.name.replace(/""/g, '"').trim(),
      set,
      setName: set ? setName.get(set) ?? set : "",
      kind,
      lang: lang(p.idExpansion),
      cm: r2(t),
      cm7: r2(price.get(p.idProduct)?.avg7),
      cm30: r2(price.get(p.idProduct)?.avg30),
      cmLow: r2(price.get(p.idProduct)?.low),
    });
  }
  out.sort((a, b) => (b.cm ?? 0) - (a.cm ?? 0));
  return out;
}

export async function cardmarketPrices(cards: CardLike[]): Promise<{ prices: Map<string, CmFields>; extras: CmExtra[] }> {
  const [pl, pg, ns] = await Promise.all([
    getJson(`productList/products_singles_${GAME}.json`),
    getJson(`priceGuide/price_guide_${GAME}.json`),
    getJson(`productList/products_nonsingles_${GAME}.json`),
  ]);
  const price = new Map<number, CmPrice>((pg.priceGuides as CmPrice[]).map((g) => [g.idProduct, g]));
  const tr = (id: number) => {
    const g = price.get(id);
    return g ? g.trend || g.avg7 || g.avg || null : null;
  };

  // jazyk expanzie podľa zapečatených produktov
  const votes = new Map<number, [number, number]>();
  const sealed = new Map<number, string[]>();
  for (const p of ns.products as CmProduct[]) {
    sealed.set(p.idExpansion, [...(sealed.get(p.idExpansion) ?? []), p.name]);
    const v = votes.get(p.idExpansion) ?? [0, 0];
    v[JP_RX.test(p.name) ? 1 : 0]++;
    votes.set(p.idExpansion, v);
  }
  const lang = (e: number) => {
    const v = votes.get(e);
    return v ? (v[1] > v[0] ? "JP" : "EN") : null;
  };

  // expanzia → kód → idProduct (zoradené)
  const byExp = new Map<number, Map<string, number[]>>();
  for (const p of pl.products as CmProduct[]) {
    const m = p.name.match(CODE_RX);
    if (!m) continue;
    let e = byExp.get(p.idExpansion);
    if (!e) byExp.set(p.idExpansion, (e = new Map()));
    e.set(m[1], [...(e.get(m[1]) ?? []), p.idProduct]);
  }
  byExp.forEach((e) => e.forEach((ids) => ids.sort((a, b) => a - b)));

  const sets = new Map<string, CardLike[]>();
  for (const c of cards) sets.set(c.set, [...(sets.get(c.set) ?? []), c]);

  const en = new Map<string, number>(), jp = new Map<string, number>();
  const used = new Set<number>(); // produkty priradené k našim verziám (aj tie odmietnuté poistkou)
  for (const [S, cs] of sets) {
    if (S === "P" || S === "DON") continue;
    const codes = new Set(cs.map((c) => c.code));
    const overlap = [...byExp]
      .map(([e, m]) => [[...codes].filter((c) => m.has(c)).length, e] as const)
      .filter(([n]) => n >= Math.max(3, 0.5 * codes.size))
      .sort((a, b) => b[0] - a[0]);
    const enExp = overlap.find(([, e]) => lang(e) === "EN")?.[1] ?? overlap.find(([, e]) => lang(e) === null)?.[1];
    const jpExp = overlap.find(([, e]) => lang(e) === "JP")?.[1];

    const groups = new Map<string, CardLike[]>();
    for (const c of cs) groups.set(c.code, [...(groups.get(c.code) ?? []), c]);
    for (const [code, vs] of groups) {
      vs.sort((a, b) => variantOrder(a)[0] - variantOrder(b)[0] || variantOrder(a)[1] - variantOrder(b)[1]);
      const ours = vs.map((c) => ({ id: c.id, eur: c.usd ? c.usd / USD_EUR : null }));

      // EN: najmenší súčet |log pomeru cien| + mierna preferencia poradia
      const prods = enExp != null ? byExp.get(enExp)?.get(code) ?? [] : [];
      if (prods.length) {
        const k = Math.min(ours.length, prods.length);
        let best: number[] | null = null;
        if (ours.length > 7 || prods.length > 7) best = [...Array(k).keys()];
        else {
          let bc = Infinity;
          for (const perm of permutations(prods.length, k)) {
            let cost = 0;
            perm.forEach((j, i) => {
              const u = ours[i].eur, t = tr(prods[j]);
              cost += (u && t ? Math.abs(Math.log((u + 0.1) / (t + 0.1))) : 0.7) + 0.15 * Math.abs(i - j);
            });
            if (cost < bc) (bc = cost), (best = perm);
          }
        }
        best!.forEach((j, i) => {
          used.add(prods[j]);
          const u = ours[i].eur, t = tr(prods[j]);
          if (u && t && Math.max(u, t) >= 2 && Math.abs(Math.log(t / u)) > Math.log(4)) return; // poistka
          en.set(ours[i].id, prods[j]);
        });
      }

      // JP: poradie cien (základná najlacnejšia … manga najdrahšia), bez cien poradie produktov
      const jprods = jpExp != null ? byExp.get(jpExp)?.get(code) ?? [] : [];
      if (jprods.length) {
        const k = Math.min(ours.length, jprods.length);
        const allPriced = ours.every((o) => o.eur != null);
        const o = allPriced ? [...ours].sort((a, b) => a.eur! - b.eur!) : ours;
        const p = allPriced ? [...jprods].sort((a, b) => (tr(a) ?? 0) - (tr(b) ?? 0)) : jprods;
        for (let i = 0; i < k; i++) jp.set(o[i].id, p[i]), used.add(p[i]);
      }
    }
  }

  const out = new Map<string, CmFields>();
  const r2 = (v: number | null | undefined) => (v ? Math.round(v * 100) / 100 : undefined);
  for (const c of cards) {
    const f: CmFields = {};
    const e = en.get(c.id), j = jp.get(c.id);
    if (e != null) {
      f.cm = r2(tr(e));
      f.cmLow = r2(price.get(e)?.low);
      f.cm7 = r2(price.get(e)?.avg7);
      f.cm30 = r2(price.get(e)?.avg30);
    }
    if (j != null) {
      const t = tr(j);
      // JP výrazne drahšia ako EN pri drahšej karte = asi zlé spárovanie
      if (!(t && f.cm && t > 5 * f.cm && t >= 2)) f.cmJp = r2(t);
    }
    if (f.cm || f.cmJp) out.set(c.id, f);
  }

  // verzie, ktoré má len Cardmarket: nepriradené produkty s kódom našej karty z nejaponských expanzií
  // (promo/pre-release/judge…; P-xxx promo sa nepárujú vôbec, tie by sa zdvojili)
  const codes = new Set(cards.map((c) => c.code));
  const extras: CmExtra[] = [];
  const perCode = new Map<string, number>();
  for (const p of pl.products as CmProduct[]) {
    const m = p.name.match(CODE_RX);
    if (!m || !codes.has(m[1]) || m[1].startsWith("P-") || used.has(p.idProduct) || lang(p.idExpansion) === "JP") continue;
    const t = tr(p.idProduct);
    if (!t) continue;
    const label = promoLabel(sealed.get(p.idExpansion) ?? []);
    perCode.set(m[1], (perCode.get(m[1]) ?? 0) + 1);
    extras.push({
      id: `${m[1]}_cm${p.idProduct}`,
      code: m[1],
      label,
      cm: r2(t),
      cmLow: r2(price.get(p.idProduct)?.low),
      cm7: r2(price.get(p.idProduct)?.avg7),
      cm30: r2(price.get(p.idProduct)?.avg30),
      idProduct: p.idProduct,
      name: p.name.replace(CODE_RX, "").replace(/""/g, '"').trim(),
    });
  }
  return { prices: out, extras };
}
