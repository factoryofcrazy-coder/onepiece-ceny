// Zdroj dát zo scrapera. Importovať len na serveri (API routy), adresa sa nemá dostať do prehliadača.
export const OLD_SITE = "https://factoryofcrazy-coder.github.io/onepiece-ceny/";
// Ten istý priečinok docs/ priamo z gitu. Je aktuálny hneď po commite, aj keď nasadenie GitHub Pages zlyhá alebo mešká.
const RAW_SITE = "https://raw.githubusercontent.com/factoryofcrazy-coder/onepiece-ceny/main/docs/";

async function getJson(url: string, timeout: number): Promise<any | null> {
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeout) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

const stamp = (d: any) => (d && typeof d.updated === "string" ? Date.parse(d.updated) || 0 : -1);

/** Súbor z docs/ (napr. "data/cards.json") z Pages aj z gitu naraz; vráti novší podľa poľa `updated`, pri zhode Pages. */
export async function fetchData(path: string, timeout = 15000): Promise<any | null> {
  const [pages, raw] = await Promise.all([getJson(OLD_SITE + path, timeout), getJson(RAW_SITE + path, timeout)]);
  if (!pages) return raw;
  if (!raw) return pages;
  return stamp(raw) > stamp(pages) ? raw : pages;
}
