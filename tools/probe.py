"""Jednorazovo: stiahne Pokémon kategórie (HTML) do tools/probe/ na prípravu parserov."""
import gzip, re, sys, urllib.request, concurrent.futures as cf, pathlib
H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
     "Accept": "text/html,application/xhtml+xml,application/json,*/*;q=0.8", "Accept-Language": "sk,cs;q=0.9,de;q=0.8,en;q=0.7"}
out = pathlib.Path("tools/probe"); out.mkdir(exist_ok=True)
rows = [l.split() for l in open(sys.argv[1]) if l.strip() and not l.startswith("#")]
def one(r):
    name, url = r[0], r[1]
    try:
        x = urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=30)
        b = x.read(6_000_000)
        (out / f"{name}.html.gz").write_bytes(gzip.compress(b))
        t = b.decode("utf-8", "replace")
        return f"{name} OK {x.status} {len(b)} micro={t.count('data-micro=\"product\"')} ld={t.count('ld+json')} prod={len(re.findall(r'\"@type\"\\s*:\\s*\"Product\"', t))} {x.geturl()}"
    except Exception as e:
        return f"{name} ERR {str(e)[:100]} {url}"
with cf.ThreadPoolExecutor(12) as ex:
    res = list(ex.map(one, rows))
(out / "_summary.txt").write_text("\n".join(res))
