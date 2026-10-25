"""Jednorazový prieskum: nájde Pokémon kategórie v kandidátskych obchodoch."""
import json, re, sys, urllib.request, concurrent.futures as cf
H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
     "Accept": "text/html,application/xhtml+xml,*/*;q=0.8", "Accept-Language": "sk,cs;q=0.9,de;q=0.8,en;q=0.7"}
DOM = [l.strip() for l in open(sys.argv[1]) if l.strip() and not l.startswith("#")]
def get(u):
    r = urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=25)
    return r.geturl(), r.read(3_000_000).decode("utf-8", "replace")
def plat(t):
    for k, p in [("shoptet", r"shoptet"), ("shopify", r"cdn\.shopify|Shopify\.theme"), ("upgates", r"upgates"),
                 ("woo", r"woocommerce|wp-content"), ("ecwid", r"ecwid"), ("presta", r"prestashop"), ("magento", r"Magento|mage/"),
                 ("shopware", r"shopware"), ("nop", r"nopCommerce|nop-"), ("eshop-rychle", r"eshop-rychle"), ("webareal", r"webareal"),
                 ("cloudflare", r"cf-chl|Just a moment")]:
        if re.search(p, t, re.I): return k
    return "?"
def one(d):
    res = {"d": d}
    for u in ([d] if d.startswith("http") else [f"https://www.{d}/", f"https://{d}/"]):
        try:
            fu, t = get(u)
            res.update(url=fu, plat=plat(t), ld="application/ld+json" in t)
            links = []
            for h in re.findall(r'href="([^"#]+)"', t):
                if re.search(r"pok[eé]mon|tcg", h, re.I) and h not in links: links.append(h)
            res["links"] = links[:25]
            break
        except Exception as e:
            res["err"] = str(e)[:120]
    if res.get("plat") == "shopify":
        for c in ["pokemon", "pokemon-tcg", "pokemon-karten", "pokemon-sammelkarten"]:
            try:
                j = json.loads(get(res["url"].rstrip("/") + f"/collections/{c}/products.json?limit=3")[1])
                res.setdefault("coll", {})[c] = [p["title"] for p in j.get("products", [])]
            except Exception as e:
                pass
    return res
with cf.ThreadPoolExecutor(16) as ex:
    for r in ex.map(one, DOM):
        print(json.dumps(r, ensure_ascii=False))
