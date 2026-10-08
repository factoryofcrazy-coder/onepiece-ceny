#!/usr/bin/env python3
"""
One Piece TCG – porovnanie cien booster boxov a packov v SK/CZ e-shopoch + MSRP + Discord upozornenia.

Obchody: Card Empire, Pikazard, Veselý drak, iHRYsko (Smarty.sk len ako odkaz – blokuje boty).

Použitie:
    python onepiece_ceny.py               # lokálna stránka s tlačidlom Fetch (http://localhost:8765)
    python onepiece_ceny.py --watch 2     # stránka + automatický fetch každé 2 hodiny
    python onepiece_ceny.py --once        # raz stiahne ceny, pošle upozornenia, vytvorí docs/index.html
    python onepiece_ceny.py --test-discord   # pošle skúšobnú správu na Discord

Discord webhook: premenná prostredia DISCORD_WEBHOOK_URL alebo súbor discord_webhook.txt.
Iba štandardná knižnica Pythonu (3.8+), nič netreba inštalovať.
"""
import argparse
import csv
import html
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
HISTORY = DATA / "history.csv"          # len zmeny cien/dostupnosti (+ prvé výskyty)
CURRENT = DATA / "current.json"         # posledný stav každého obchodu
ALERT_STATE = DATA / "alerts_state.json"
DOCS = HERE / "docs"                    # statická stránka pre GitHub Pages
MSRP_FILE = HERE / "msrp.json"
CONFIG_FILE = HERE / "config.json"
HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/128.0 Safari/537.36",
    "Accept-Language": "sk,cs;q=0.9,en;q=0.8",
}
DELAY = 1.0          # pauza medzi stránkami toho istého obchodu (s)
MAX_PAGES = 10

# ---------------------------------------------------------------- obchody ---
SHOPS = {
    "cardempire": {"label": "Card Empire", "parser": "shoptet", "currency": "EUR",
                   "urls": ["https://www.cardempire.sk/booster-boxy-3/",
                            "https://www.cardempire.sk/booster-packy-2/"]},
    "pikazard":   {"label": "Pikazard", "parser": "shoptet", "currency": "EUR",
                   "urls": ["https://www.pikazard.eu/one-piece-tcg/"]},
    "veselydrak": {"label": "Veselý drak", "parser": "veselydrak", "currency": "EUR",
                   "urls": ["https://www.vesely-drak.sk/produkty/booster-box-one-piece/",
                            "https://www.vesely-drak.sk/produkty/booster-one-piece/"]},
    "ihrysko":    {"label": "iHRYsko", "parser": "jsonld", "currency": "EUR",
                   "urls": ["https://www.ihrysko.sk/one-piece-tcg-c100345"]},
    # Smarty.sk blokuje automatické sťahovanie (Cloudflare ochrana proti botom),
    # preto sa nesťahuje – na stránke je len odkaz na ich vyhľadávanie.
    "smarty":     {"label": "Smarty.sk", "parser": "smarty", "currency": "EUR", "enabled": False,
                   "link": "https://www.smarty.sk/Vyhladavanie?query=one+piece+tcg",
                   "urls": ["https://www.smarty.sk/Vyhladavanie?query=one+piece+tcg"]},
}

# ----------------------------------------------------- rozpoznanie produktu ---
SET_NAMES = {
    "romance dawn": "OP01", "romance of dawn": "OP01", "paramount war": "OP02",
    "pillars of strength": "OP03", "kingdoms of intrigue": "OP04",
    "awakening of the new era": "OP05", "wings of the captain": "OP06",
    "500 years": "OP07", "two legends": "OP08", "emperors in the new world": "OP09",
    "royal blood": "OP10", "fist of divine speed": "OP11", "legacy of the master": "OP12",
    "carrying on his will": "OP13", "azure sea": "OP14", "kami's island": "OP15",
    "kami´s island": "OP15", "kamis island": "OP15", "time of battle": "OP16",
    "strongest warriors": "OP17", "dominance of god": "OP18",
    "memorial collection": "EB01", "anime 25th": "EB02",
    "heroines edition vol. 2": "EB05", "heroines edition vol.2": "EB05", "heroines edition 2": "EB05",
    "heroines edition": "EB03", "egghead crisis": "EB04",
    "the best vol. 2": "PRB02", "the best vol.2": "PRB02", "the best 2": "PRB02", "the best": "PRB01",
}
CODE_RX = re.compile(r"\b(OP|EB|PRB|ST)\s?-?\s?(\d{1,2})\b", re.I)


def set_code(name):
    m = CODE_RX.search(name)
    if m:
        return f"{m.group(1).upper()}{int(m.group(2)):02d}"
    low = name.lower()
    for k, v in SET_NAMES.items():
        if k in low:
            return v
    return ""


def kind_of(name):
    n = name.lower()
    if re.search(r"illustration|premium card|collection set|gift|figúr|figur|sleeve|obal|album|playmat|"
                 r"podložk|promo|jump|tin\b|binder|deck box|storage|token|don!! card|card case", n):
        return "Iné"
    if "starter" in n or "deck set" in n or "ultra deck" in n:
        return "Starter"
    if re.search(r"\bcase\b", n):
        return "Case"
    if "double pack" in n:
        return "Double Pack"
    if re.search(r"booster box|display|\bbox\b|krabic", n):
        return "Box"
    if re.search(r"booster|pack|balíček|balicek|balík", n):
        return "Pack"
    return "Iné"


def lang_of(name):
    if re.search(r"čínsk|cinsk|chinese|\bcn\b|\bopc-?\d", name, re.I):
        return "CN"
    if re.search(r"kórej|korej|korean|\bkr\b", name, re.I):
        return "KR"
    if re.search(r"japon|japan|\bjp\b|\bjap\b", name, re.I):
        return "JP"
    return "EN"


def classify(name):
    return set_code(name), kind_of(name), lang_of(name)


# ---------------------------------------------------------------- sieť ------
def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode(r.headers.get_content_charset() or "utf-8", "replace")


def get_json(url):
    return json.loads(fetch(url))


FX_FALLBACK = {"CZK": 24.3, "USD": 1.16, "JPY": 172.0}   # koľko jednotiek za 1 EUR


def fx_rates():
    try:
        r = get_json("https://api.frankfurter.app/latest?from=EUR&to=CZK,USD,JPY")["rates"]
        return {k: float(r[k]) for k in FX_FALLBACK}
    except Exception as e:  # noqa: BLE001
        say(f"  ! kurzy sa nepodarilo stiahnuť ({e}), použijem záložné")
        return dict(FX_FALLBACK)


def num(s):
    s = html.unescape(str(s)).replace("\xa0", "").replace(" ", "")
    s = re.sub(r"[^\d,.]", "", s)
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".") if s.rfind(",") > s.rfind(".") else s.replace(",", "")
    else:
        s = s.replace(",", ".")
    return float(s) if s else None


def clean(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s))).strip()


def absolute(base, href):
    return urllib.request.urljoin(base, html.unescape(href))


LOG_SINKS = []


def say(msg):
    print(msg, flush=True)
    for sink in LOG_SINKS:
        sink(msg.strip())


# ---------------------------------------------------------------- parsery ---
def parse_shoptet(page, base):
    out = []
    for chunk in page.split('data-micro="product"')[1:]:
        chunk = chunk[:6000]
        pid = re.search(r'data-micro-product-id="(\d+)"', chunk)
        name = re.search(r'data-micro="name"[^>]*>(.*?)</', chunk, re.S)
        href = re.search(r'href="([^"]+)"[^>]*data-micro="url"', chunk) or re.search(r'href="([^"]+)"', chunk)
        offer = re.search(r'data-micro="offer"([^>]*)>', chunk)
        if not (name and offer):
            continue
        attrs = offer.group(1)
        price = re.search(r'data-micro-price="([\d.]+)"', attrs)
        cur = re.search(r'data-micro-price-currency="(\w+)"', attrs)
        av = re.search(r'data-micro-availability="[^"]*/(\w+)"', attrs)
        out.append({"id": pid.group(1) if pid else clean(name.group(1)),
                    "name": clean(name.group(1)),
                    "url": absolute(base, href.group(1)) if href else base,
                    "price": float(price.group(1)) if price else None,
                    "currency": cur.group(1) if cur else None,
                    "inStock": bool(av and av.group(1) == "InStock")})
    return out


def parse_veselydrak(page, base):
    out = []
    for chunk in page.split('class="item-inner"')[1:]:
        chunk = chunk[:5000]
        a = re.search(r'class="product-name"[^>]*>\s*<a href="([^"]+)"[^>]*>(.*?)</a>', chunk, re.S)
        pr = re.search(r'class="price"[^>]*>(.*?)</span>', chunk, re.S)
        av = re.search(r'class="usual-price[^"]*"[^>]*>(.*?)</span>', chunk, re.S)
        if not (a and pr):
            continue
        ptxt = clean(pr.group(1))
        avtxt = clean(av.group(1)) if av else ""
        out.append({"id": a.group(1), "name": clean(a.group(2)), "url": absolute(base, a.group(1)),
                    "price": num(ptxt), "currency": "CZK" if "Kč" in ptxt else "EUR",
                    "inStock": bool(re.search(r"sklad", avtxt, re.I)) and not re.search(r"nie je|není|vypred", avtxt, re.I),
                    "availText": avtxt})
    return out


def parse_jsonld(page, base):
    out = []
    for block in re.findall(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', page, re.S):
        try:
            data = json.loads(block)
        except ValueError:
            continue
        items = data.get("itemListElement", []) if isinstance(data, dict) and data.get("@type") == "ItemList" else []
        for li in items:
            p = li.get("item", li)
            if p.get("@type") != "Product":
                continue
            off = p.get("offers") or {}
            if isinstance(off, list):
                off = off[0] if off else {}
            out.append({"id": str(p.get("sku") or p.get("name")), "name": p.get("name", ""),
                        "url": off.get("url") or p.get("url") or base,
                        "price": num(off.get("price")) if off.get("price") is not None else None,
                        "currency": off.get("priceCurrency", "EUR"),
                        "inStock": "InStock" in str(off.get("availability", ""))})
    return out


def parse_smarty(page, base):
    out = []
    for chunk in page.split('class="productList-item"')[1:]:
        chunk = chunk[:8000]
        ga = re.search(r'data-gaitem=(["\'])(.*?)\1', chunk, re.I | re.S)
        url = re.search(r'data-url="([^"]+)"', chunk)
        pr = re.search(r'class="productList-item-price"[^>]*>(.*?)</div>', chunk, re.S)
        info = {}
        if ga:
            try:
                info = json.loads(html.unescape(ga.group(2)))
            except ValueError:
                info = {}
        name = info.get("name") or (clean(re.search(r'class="productList-item-title"[^>]*>(.*?)</a>', chunk, re.S).group(1))
                                    if re.search(r'class="productList-item-title"', chunk) else None)
        price = num(clean(pr.group(1))) if pr else info.get("pocketPrice") or info.get("fullPrice")
        if not name or price is None:
            continue
        avail = info.get("available", "")
        out.append({"id": info.get("id") or (url.group(1) if url else name), "name": name,
                    "url": absolute(base, url.group(1)) if url else base,
                    "price": float(price), "currency": "CZK",
                    "inStock": bool(re.search(r"skladem", avail, re.I)), "availText": avail})
    return out


PARSERS = {"shoptet": parse_shoptet, "veselydrak": parse_veselydrak,
           "jsonld": parse_jsonld, "smarty": parse_smarty}


def page_url(parser, url, n):
    if n == 1:
        return url
    if parser == "shoptet":
        return url.rstrip("/") + f"/strana-{n}/"
    return url + ("&" if "?" in url else "?") + f"page={n}"


def crawl(shop):
    parse = PARSERS[shop["parser"]]
    seen_ids, seen_urls, rows = set(), set(), []
    for start in shop["urls"]:
        for n in range(1, MAX_PAGES + 1):
            url = page_url(shop["parser"], start, n)
            page = None
            for attempt in range(2):
                try:
                    page = fetch(url)
                    break
                except urllib.error.HTTPError as e:
                    if n > 1:                     # za poslednou stranou niektoré obchody vrátia 404/500
                        break
                    if attempt == 1:
                        raise urllib.error.HTTPError(url, e.code, f"{e.reason} ({url})", e.headers, None)
                    time.sleep(3)
            if page is None:
                break
            new = []
            for i in parse(page, url):
                if i["id"] in seen_ids or i["url"] in seen_urls:
                    continue
                seen_ids.add(i["id"])
                seen_urls.add(i["url"])
                new.append(i)
            rows += new
            time.sleep(DELAY)
            if not new or shop["parser"] == "smarty":
                break
    return [r for r in rows if re.search(r"one\s*piece", r["name"], re.I) and r["price"]]


# ---------------------------------------------------------------- MSRP ------
def load_json(path, default):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default
    except ValueError as e:
        say(f"  ! {Path(path).name} má chybu v JSON ({e}) – použijem predvolené hodnoty")
        return default


def _lookup(table, code):
    if code in table:
        return table[code]
    fam = re.match(r"[A-Z]+", code or "")
    if fam and fam.group(0) in table:
        return table[fam.group(0)]
    return table.get("default")


def msrp_eur(code, kind, lang, msrp, fx):
    """MSRP v EUR vrátane DPH, alebo None ak sa nedá určiť."""
    ov = msrp.get("override_eur", {}).get(f"{code} {kind} {lang}")
    if ov:
        return float(ov)
    if not code or kind not in ("Box", "Pack") or lang not in ("EN", "JP"):
        return None
    vat = 1 + float(msrp.get("vat", 0.23))
    if lang == "EN":
        sec = msrp.get("en", {})
        pack = _lookup(sec.get("pack_usd", {}), code)
        per_pack = pack / fx["USD"] * vat if pack else None
    else:
        sec = msrp.get("jp", {})
        pack = _lookup(sec.get("pack_jpy", {}), code)
        per_pack = pack / 1.10 / fx["JPY"] * vat if pack else None   # JP cena je s 10 % JP daňou
    if per_pack is None:
        return None
    if kind == "Pack":
        return round(per_pack, 2)
    packs = _lookup(sec.get("box_packs", {}), code)
    return round(per_pack * packs, 2) if packs else None


def box_packs(code, lang, msrp):
    sec = msrp.get("en" if lang == "EN" else "jp", {})
    return _lookup(sec.get("box_packs", {}), code) if lang in ("EN", "JP") and code else None


# ---------------------------------------------------------------- dáta ------
FIELDS = ["timestamp", "shop", "name", "code", "kind", "lang", "price", "currency",
          "priceEUR", "inStock", "url"]


def load_history():
    if not HISTORY.exists():
        return []
    with HISTORY.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_current():
    cur = load_json(CURRENT, None)
    if cur:
        return cur
    # migrácia zo starej verzie: posledný snapshot každého obchodu z history.csv
    hist = load_history()
    last = {}
    for r in hist:
        last[r["shop"]] = r["timestamp"]
    shops = {}
    for r in hist:
        if r["timestamp"] == last.get(r["shop"]):
            s = shops.setdefault(r["shop"], {"ts": r["timestamp"], "ok": True, "items": []})
            s["items"].append({"name": r["name"], "url": r["url"], "price": float(r["price"]),
                               "currency": r["currency"], "eur": float(r["priceEUR"]),
                               "inStock": r["inStock"] == "1"})
    return {"updated": max(last.values()) if last else None, "fx": FX_FALLBACK, "shops": shops}


def append_changes(prev_cur, new_items_by_shop, ts):
    """Do history.csv zapíše len produkty, ktorým sa zmenila cena/dostupnosť (alebo sú nové)."""
    last = {}
    for s in prev_cur.get("shops", {}).values():
        for i in s.get("items", []):
            last[i["url"]] = (round(i["eur"], 2), bool(i["inStock"]))
    rows = []
    for shop, items in new_items_by_shop.items():
        for i in items:
            if last.get(i["url"]) == (round(i["eur"], 2), bool(i["inStock"])):
                continue
            code, kind, lang = classify(i["name"])
            rows.append({"timestamp": ts, "shop": shop, "name": i["name"], "code": code, "kind": kind,
                         "lang": lang, "price": i["price"], "currency": i["currency"],
                         "priceEUR": i["eur"], "inStock": int(i["inStock"]), "url": i["url"]})
    if rows:
        DATA.mkdir(exist_ok=True)
        new = not HISTORY.exists()
        with HISTORY.open("a", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=FIELDS)
            if new:
                w.writeheader()
            w.writerows(rows)
    return len(rows)


def snapshot(only=None):
    fx = fx_rates()
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    keys = [k for k in SHOPS if SHOPS[k].get("enabled", True) and (not only or k in only)]
    say(f"  kurz 1 € = {fx['CZK']:.2f} Kč = {fx['USD']:.3f} $ = {fx['JPY']:.1f} ¥, sťahujem {len(keys)} obchody…")

    def one(key):
        shop = SHOPS[key]
        try:
            items = crawl(shop)
        except Exception as e:  # noqa: BLE001
            say(f"  ✖ {shop['label']}: chyba – {e}")
            return key, None, str(e)
        out = []
        for i in items:
            cur = i.get("currency") or shop["currency"]
            eur = i["price"] / fx["CZK"] if cur == "CZK" else i["price"]
            out.append({"name": i["name"], "url": i["url"], "price": round(i["price"], 2), "currency": cur,
                        "eur": round(eur, 2), "inStock": bool(i["inStock"])})
        n_stock = sum(1 for i in out if i["inStock"])
        say(f"  ✔ {shop['label']}: {len(out)} produktov ({n_stock} skladom)"
            + ("" if out else " – nič sa nenašlo, obchod možno zmenil web"))
        return key, out, None

    with ThreadPoolExecutor(max_workers=len(keys) or 1) as ex:
        results = list(ex.map(one, keys))
    return ts, fx, results


# ------------------------------------------------------------- upozornenia --
def webhook_url():
    url = os.environ.get("DISCORD_WEBHOOK_URL", "").strip()
    f = HERE / "discord_webhook.txt"
    if not url and f.exists():
        url = f.read_text(encoding="utf-8").strip()
    return url or None


def discord_send(embeds, content=None):
    url = webhook_url()
    if not url:
        return False
    for i in range(0, max(len(embeds), 1), 10):          # Discord: max 10 embedov na správu
        body = {"username": "One Piece ceny", "embeds": embeds[i:i + 10]}
        if content and i == 0:
            body["content"] = content
        req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"),
                                     headers={"Content-Type": "application/json",
                                              "User-Agent": "onepiece-ceny (+discord webhook)"})
        for attempt in range(3):
            try:
                urllib.request.urlopen(req, timeout=20).read()
                break
            except urllib.error.HTTPError as e:
                if e.code == 429 and attempt < 2:
                    time.sleep(2)
                    continue
                say(f"  ! Discord chyba {e.code}: {e.read()[:200]!r}")
                return False
        time.sleep(0.6)
    return True


def eur(v):
    return f"{v:,.2f} €".replace(",", " ").replace(".", ",") if v is not None else "—"


def evaluate_alerts(prev_cur, cur, msrp, cfg, first_run):
    """Vráti zoznam embedov pre Discord a aktualizuje stav upozornení."""
    a = cfg.get("alerts", {})
    th = a.get("max_pct_vs_msrp", {"EN": 0})
    th = {l: float(th) for l in ("EN", "JP")} if not isinstance(th, dict) else {k: float(v) for k, v in th.items()}
    kinds = set(a.get("kinds", ["Box"]))
    redrop = float(a.get("realert_drop_pct", 3)) / 100
    watch = {}
    for w in cfg.get("watchlist", []):
        watch[" ".join(w.get("product", "").split()).upper()] = float(w.get("max_eur", 0))
    state = load_json(ALERT_STATE, {})
    prev = {i["url"]: i for s in prev_cur.get("shops", {}).values() for i in s.get("items", [])}
    fx = cur["fx"]
    embeds, new_state = [], {}

    for key, s in cur["shops"].items():
        label = SHOPS.get(key, {}).get("label", key)
        for i in s.get("items", []):
            code, kind, lang = classify(i["name"])
            ident = f"{code} {kind} {lang}".upper()
            m = msrp_eur(code, kind, lang, msrp, fx)
            pct = (i["eur"] / m - 1) * 100 if m else None
            reasons = []
            if i["inStock"]:
                if m and kind in kinds and lang in th and pct <= th[lang]:
                    reasons.append(f"{pct:+.0f} % oproti MSRP")
                if ident in watch and i["eur"] <= watch[ident]:
                    reasons.append(f"pod tvojou cieľovou cenou {eur(watch[ident])}")
                p = prev.get(i["url"])
                if a.get("back_in_stock_watchlist", True) and ident in watch and p and not p["inStock"]:
                    reasons.append("znova skladom")
            if a.get("new_products", True) and not first_run and i["url"] not in prev \
                    and kind in ("Box", "Pack", "Double Pack", "Case"):
                reasons.append("nový produkt v obchode")
            if not reasons:
                continue
            last = state.get(i["url"])
            new_state[i["url"]] = last if last is not None else i["eur"]
            if last is not None and i["eur"] > last * (1 - redrop) and "znova skladom" not in reasons:
                continue                                  # už upozornené, cena výrazne neklesla
            new_state[i["url"]] = i["eur"]
            fields = [{"name": "Cena", "value": eur(i["eur"]) + (f" ({i['price']:.0f} Kč)" if i["currency"] == "CZK" else ""), "inline": True},
                      {"name": "MSRP", "value": eur(m) if m else "—", "inline": True},
                      {"name": "Obchod", "value": label, "inline": True}]
            if kind == "Box" and box_packs(code, lang, msrp):
                fields.append({"name": "Za balíček", "value": eur(i["eur"] / box_packs(code, lang, msrp)), "inline": True})
            fields.append({"name": "Sklad", "value": "✅ skladom" if i["inStock"] else "❌ nedostupné", "inline": True})
            embeds.append({"title": i["name"][:250], "url": i["url"],
                           "description": "🔥 " + " · ".join(reasons),
                           "color": 0x2DA44E if (pct is not None and pct <= 0) or "cieľovou" in " ".join(reasons) else 0x1F6FEB,
                           "fields": fields})
    ALERT_STATE.write_text(json.dumps(new_state, ensure_ascii=False, indent=0), encoding="utf-8")
    return embeds


# ---------------------------------------------------------------- stránka ---
def page_data():
    cur = load_current()
    msrp = load_json(MSRP_FILE, {})
    fx = cur.get("fx") or FX_FALLBACK
    offers = []
    for key, s in cur.get("shops", {}).items():
        for i in s.get("items", []):
            code, kind, lang = classify(i["name"])
            offers.append([key, i["name"], code, kind, lang, i["eur"], i["inStock"], i["url"],
                           i["price"], i["currency"], msrp_eur(code, kind, lang, msrp, fx),
                           box_packs(code, lang, msrp) if kind == "Box" else None])
    hist = {}
    for r in load_history():
        hist.setdefault(r["url"], []).append([r["timestamp"], float(r["priceEUR"]), r["inStock"] == "1"])
    used = set(cur.get("shops", {}))
    shops = {k: v["label"] for k, v in SHOPS.items() if v.get("enabled", True) or k in used}
    status = {k: {"ts": s.get("ts"), "ok": s.get("ok", True), "error": s.get("error")}
              for k, s in cur.get("shops", {}).items()}
    links = [{"label": v["label"], "url": v["link"]} for v in SHOPS.values()
             if not v.get("enabled", True) and v.get("link")]
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    return {"offers": offers, "hist": hist, "shops": shops, "status": status, "links": links,
            "updated": cur.get("updated"), "repo": repo}


def render():
    return TEMPLATE.replace("__PAYLOAD__", json.dumps(page_data(), ensure_ascii=False, separators=(",", ":")))


def build_static():
    DOCS.mkdir(exist_ok=True)
    (DOCS / "index.html").write_text(render(), encoding="utf-8")
    (DOCS / ".nojekyll").write_text("", encoding="utf-8")


def run_once(only=None, notify=True):
    say(datetime.now().strftime("%d.%m.%Y %H:%M") + " – sťahujem ceny")
    prev = load_current()
    first_run = not CURRENT.exists() and not prev.get("shops")
    ts, fx, results = snapshot(only)
    cur = {"updated": ts, "fx": fx, "shops": dict(prev.get("shops", {}))}
    fresh = {}
    for key, items, err in results:
        if items is None:                                   # obchod zlyhal – nechaj staré dáta
            old = cur["shops"].get(key, {"items": []})
            cur["shops"][key] = {**old, "ok": False, "error": err}
        else:
            cur["shops"][key] = {"ts": ts, "ok": True, "items": items}
            fresh[key] = items
    DATA.mkdir(exist_ok=True)
    n_changes = append_changes(prev, fresh, ts)
    CURRENT.write_text(json.dumps(cur, ensure_ascii=False, indent=1), encoding="utf-8")
    if notify:
        embeds = evaluate_alerts(prev, cur, load_json(MSRP_FILE, {}), load_json(CONFIG_FILE, {}), first_run)
        if embeds and webhook_url():
            discord_send(embeds, content=f"**{len(embeds)}** zaujímavých ponúk")
            say(f"  🔔 odoslaných {len(embeds)} upozornení na Discord")
        elif embeds:
            say(f"  🔔 {len(embeds)} upozornení (Discord webhook nie je nastavený)")
    build_static()
    total = sum(len(i) for i in fresh.values())
    say(f"Hotovo – {total} produktov, {n_changes} zmien cien/dostupnosti")
    return cur


# ---------------------------------------------------------------- server ----
STATE = {"running": False, "log": [], "finished": None}
LOCK = threading.Lock()


def start_fetch(only=None):
    with LOCK:
        if STATE["running"]:
            return False
        STATE.update(running=True, log=[])

    def job():
        try:
            run_once(only)
        except Exception as e:  # noqa: BLE001
            say(f"✖ chyba: {e}")
        finally:
            STATE["running"] = False
            STATE["finished"] = time.time()
    threading.Thread(target=job, daemon=True).start()
    return True


LOG_SINKS.append(lambda m: STATE["log"].append(m) if STATE["running"] else None)


class Handler(BaseHTTPRequestHandler):
    only = None

    def _send(self, code, body, ctype):
        data = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/", "/index.html"):
            self._send(200, render(), "text/html; charset=utf-8")
        elif path == "/api/status":
            self._send(200, json.dumps(STATE, ensure_ascii=False), "application/json")
        else:
            self._send(404, "nenájdené", "text/plain; charset=utf-8")

    def do_POST(self):
        if self.path == "/api/fetch":
            self._send(200, json.dumps({"started": start_fetch(self.only)}), "application/json")
        else:
            self._send(404, "nenájdené", "text/plain; charset=utf-8")

    def log_message(self, *args):
        pass


def serve(port, only=None, open_browser=True, watch=None):
    Handler.only = only
    for p in range(port, port + 20):
        try:
            srv = ThreadingHTTPServer(("127.0.0.1", p), Handler)
            break
        except OSError:
            continue
    else:
        sys.exit("Nenašiel som voľný port.")
    url = f"http://localhost:{srv.server_address[1]}/"
    print(f"Stránka beží na {url}  (Ctrl+C = koniec)")
    if watch:
        def auto():
            while True:
                start_fetch(only)
                time.sleep(watch * 3600)
        threading.Thread(target=auto, daemon=True).start()
        print(f"Automatický fetch každých {watch:g} h")
    if open_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nKoniec.")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--once", action="store_true", help="raz stiahnuť ceny, poslať upozornenia, vytvoriť docs/index.html")
    ap.add_argument("--watch", type=float, metavar="HODINY", help="automaticky sťahovať každých N hodín")
    ap.add_argument("--port", type=int, default=8765, help="port lokálnej stránky (predvolene 8765)")
    ap.add_argument("--no-browser", action="store_true", help="neotvárať prehliadač")
    ap.add_argument("--no-notify", action="store_true", help="neposielať upozornenia")
    ap.add_argument("--rebuild", action="store_true", help="len prerobiť docs/index.html z uložených dát")
    ap.add_argument("--test-discord", action="store_true", help="poslať skúšobnú správu na Discord")
    ap.add_argument("--only", help="čiarkou oddelené obchody: " + ",".join(SHOPS))
    a = ap.parse_args()
    only = set(a.only.split(",")) if a.only else None

    if a.test_discord:
        if not webhook_url():
            sys.exit("Webhook nie je nastavený (DISCORD_WEBHOOK_URL alebo discord_webhook.txt).")
        ok = discord_send([{"title": "Test – upozornenia fungujú ✅", "color": 0x2DA44E,
                            "description": "Sem budú chodiť lacné One Piece ponuky."}])
        print("Odoslané." if ok else "Nepodarilo sa odoslať.")
        return
    if a.rebuild:
        build_static()
        print(f"Prerobené: {DOCS / 'index.html'}")
        return
    if a.once:
        run_once(only, notify=not a.no_notify)
        if not a.no_browser:
            webbrowser.open((DOCS / "index.html").as_uri())
        return
    serve(a.port, only, open_browser=not a.no_browser, watch=a.watch)


TEMPLATE = r"""<!doctype html>
<html lang="sk"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>One Piece ceny</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>
:root{--bg:#f6f5f2;--card:#fff;--ink:#1d1d1f;--mute:#6b6b70;--line:#e4e2dc;--acc:#c8102e;--good:#1a7f37;--goodbg:#e3f3e7;--warn:#9a6700;--off:#b0b0b5}
@media (prefers-color-scheme:dark){:root{--bg:#141416;--card:#1e1e21;--ink:#ececef;--mute:#9a9aa2;--line:#2e2e33;--acc:#ff5a6e;--good:#4ac26b;--goodbg:#173a22;--warn:#d29922;--off:#5d5d63}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:1320px;margin:0 auto;padding:20px 16px 48px}
h1{font-size:22px;margin:0 0 2px}.sub{color:var(--mute)}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:12px}
.status{display:flex;flex-wrap:wrap;gap:6px 14px;color:var(--mute);font-size:12px;margin-bottom:14px}
.status .bad{color:var(--warn)}.status a{color:var(--ink)}
#fetchBtn{display:inline-flex;align-items:center;gap:8px;background:var(--acc);color:#fff;border:none;border-radius:10px;padding:10px 18px;font:600 15px system-ui,sans-serif;cursor:pointer;text-decoration:none}
#fetchBtn:hover{filter:brightness(1.08)}#fetchBtn[disabled]{opacity:.6;cursor:progress}
#fetchBtn .spin{width:14px;height:14px;border:2px solid #fff6;border-top-color:#fff;border-radius:50%;display:none;animation:r .8s linear infinite}
#fetchBtn[disabled] .spin{display:inline-block}@keyframes r{to{transform:rotate(360deg)}}
.fhint{font-size:12px;color:var(--mute);margin-top:4px;text-align:right;max-width:260px}
#log{display:none;font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;color:var(--mute);margin-bottom:16px}#log.on{display:block}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px}
.seg{display:flex}.seg button{border:1px solid var(--line);background:var(--card);color:var(--ink);padding:6px 11px;cursor:pointer;font:inherit}
.seg button:first-child{border-radius:8px 0 0 8px}.seg button:last-child{border-radius:0 8px 8px 0}
.seg button+button{border-left:none}.seg button.on{background:var(--ink);color:var(--bg)}
label.chk{display:flex;gap:6px;align-items:center;color:var(--mute);cursor:pointer}
select,input[type=search]{padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink);font:inherit}
input[type=search]{flex:1;min-width:160px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:16px}
.card h2{font-size:14px;margin:0 0 10px;color:var(--mute);font-weight:600}
.chart{position:relative;height:320px}.scroll{overflow:auto}
table{width:100%;border-collapse:collapse}th,td{padding:7px 9px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap;vertical-align:top}
th{font-weight:600;color:var(--mute);position:sticky;top:0;background:var(--card);z-index:1}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
tbody tr{cursor:pointer}tbody tr:hover td{background:color-mix(in srgb,var(--acc) 5%,transparent)}
tr.sel td{background:color-mix(in srgb,var(--acc) 10%,transparent)!important}
.tag{font-size:11px;padding:1px 6px;border-radius:5px;border:1px solid var(--line);color:var(--mute);margin-right:4px}
.p{display:inline-flex;flex-direction:column;align-items:flex-end;line-height:1.25}
.p a{color:inherit;text-decoration:none}.p a:hover{text-decoration:underline}
.p small,.msrp small{font-size:11px;color:var(--mute)}
.out a{color:var(--off)}.best{background:var(--goodbg);border-radius:6px;padding:1px 6px;color:var(--good);font-weight:700}
.pct{font-size:11px;font-weight:600}.pct.lo{color:var(--good)}.pct.hi{color:var(--mute)}.pct.vhi{color:var(--acc)}
.dash{color:var(--off)}.empty{padding:40px 10px;text-align:center;color:var(--mute)}
.ext{display:inline-block;margin-left:6px;padding:2px 9px;border:1px solid var(--line);border-radius:7px;background:var(--card);color:var(--ink);text-decoration:none}
.hint{color:var(--mute);font-size:12px;margin-top:6px}
</style></head><body><div class="wrap">
<div class="top">
  <div><h1>One Piece TCG – ceny v obchodoch</h1>
  <div class="sub">Ceny v € · MSRP = oficiálna cena Bandai prepočítaná na € vrátane 23 % DPH · aktualizované <span id="upd">—</span></div></div>
  <div><a id="fetchBtn" href="#"><span class="spin"></span><span id="fetchLbl">⟳ Fetch nové ceny</span></a><div class="fhint" id="fhint"></div></div>
</div>
<div class="status" id="status"></div>
<div class="card" id="log"></div>

<div class="bar">
  <div class="seg" id="kind"><button data-v="Box" class="on">Boxy</button><button data-v="Pack">Packy</button><button data-v="Double Pack">Double packy</button><button data-v="Case">Cases</button><button data-v="">Všetko</button></div>
  <div class="seg" id="lang"><button data-v="" class="on">Všetky</button><button data-v="EN">EN</button><button data-v="JP">JP</button><button data-v="CN">CN/KR</button></div>
  <label class="chk"><input type="checkbox" id="stock"> len skladom</label>
  <label class="chk"><input type="checkbox" id="under"> len pod MSRP</label>
  <select id="sort"><option value="code">Podľa edície</option><option value="pct">Najlepšie vs MSRP</option><option value="price">Najlacnejšie</option></select>
  <input type="search" id="q" placeholder="Hľadať (OP09, Emperors…)">
</div>

<div class="card"><h2>Zelená = najlacnejšie skladom · % = rozdiel oproti MSRP · sivá = vypredané · klik na riadok = graf</h2>
<div class="scroll"><table><thead><tr id="head"></tr></thead><tbody id="tb"></tbody></table></div></div>

<div class="card"><h2 id="ctitle">Vývoj ceny</h2><div class="chart"><canvas id="line"></canvas></div>
<div class="hint">Ukladajú sa len zmeny ceny/dostupnosti – čiara sa napĺňa s každým fetchom.</div></div>
</div>
<script>
const P=__PAYLOAD__;
const SHOPS=P.shops, SK=Object.keys(SHOPS);
// offer: [shop,name,code,kind,lang,eur,inStock,url,price,currency,msrp,packs]
const keyOf=o=>o[2]?`${o[2]}|${o[3]}|${o[4]}`:`~${o[1].toLowerCase()}|${o[3]}|${o[4]}`;
const groups={};
P.offers.forEach(o=>{const k=keyOf(o);const g=groups[k]||(groups[k]={key:k,code:o[2],kind:o[3],lang:o[4],name:o[1],msrp:o[10],packs:o[11],shops:{},all:[]});
  g.all.push(o); if(o[10]!=null)g.msrp=o[10];
  const p=g.shops[o[0]]; if(!p||(o[6]&&!p[6])||(o[6]===p[6]&&o[5]<p[5]))g.shops[o[0]]=o;});
const st={kind:"Box",lang:"",stock:false,under:false,sort:"code",q:"",sel:null};
const eur=v=>v==null?"—":v.toLocaleString("sk-SK",{minimumFractionDigits:2,maximumFractionDigits:2})+" €";
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const short=n=>n.replace(/^one piece( tcg| card game| cg)?\s*[:\-–]?\s*/i,"");
const pctOf=(v,m)=>m?(v/m-1)*100:null;
const pctHtml=p=>p==null?"":`<span class="pct ${p<=0?"lo":p>50?"vhi":"hi"}">${p>0?"+":""}${p.toFixed(0)} %</span>`;
function bestOf(g){let b=null;for(const s of SK){const o=g.shops[s];if(o&&o[6]&&(!b||o[5]<b[5]))b=o;}return b;}
function rows(){const q=st.q.toLowerCase();
  let r=Object.values(groups).filter(g=>(!st.kind||g.kind===st.kind)&&(!st.lang||(st.lang==="CN"?["CN","KR"].includes(g.lang):g.lang===st.lang))
    &&(!q||(g.code+" "+g.all.map(o=>o[1]).join(" ")).toLowerCase().includes(q))
    &&(!st.stock||bestOf(g))&&(!st.under||(bestOf(g)&&g.msrp&&bestOf(g)[5]<=g.msrp)));
  const bp=g=>{const b=bestOf(g);return b?b[5]:Infinity}, bpc=g=>{const b=bestOf(g);return b&&g.msrp?pctOf(b[5],g.msrp):Infinity};
  if(st.sort==="pct")r.sort((a,b)=>bpc(a)-bpc(b));
  else if(st.sort==="price")r.sort((a,b)=>bp(a)-bp(b));
  else r.sort((a,b)=>(b.code||"").localeCompare(a.code||"",undefined,{numeric:true})||a.lang.localeCompare(b.lang));
  return r;}
function draw(){
  document.getElementById("head").innerHTML=`<th>Produkt</th><th class="n">MSRP</th>`+SK.map(s=>`<th class="n">${esc(SHOPS[s])}</th>`).join("")+`<th class="n">Najlacnejšie skladom</th>`;
  const R=rows();
  document.getElementById("tb").innerHTML=R.map(g=>{const b=bestOf(g);
    const cells=SK.map(s=>{const o=g.shops[s]; if(!o)return `<td class="n"><span class="dash">—</span></td>`;
      const extra=g.all.filter(x=>x[0]===s).length>1?` <small title="obchod má viac variantov">+${g.all.filter(x=>x[0]===s).length-1}</small>`:"";
      return `<td class="n ${o[6]?"":"out"}"><span class="p"><a href="${esc(o[7])}" target="_blank" rel="noopener" title="${esc(o[1])}" class="${b&&o===b?"best":""}">${eur(o[5])}</a>${o[6]?pctHtml(pctOf(o[5],g.msrp)):"<small>vypredané</small>"}${o[9]!=="EUR"?`<small>${Math.round(o[8]).toLocaleString("sk-SK")} Kč</small>`:""}${extra}</span></td>`}).join("");
    const title=g.code?`<span class="tag">${g.code}</span><span class="tag">${g.lang}</span>${g.kind}`:`<span class="tag">${g.lang}</span>${esc(g.kind)}`;
    const per=b&&g.packs?`<br><small style="color:var(--mute)">${eur(b[5]/g.packs)} / balíček</small>`:"";
    return `<tr data-k="${esc(g.key)}" class="${st.sel===g.key?"sel":""}"><td>${title}<br><small style="color:var(--mute)">${esc(short(g.name).slice(0,62))}</small></td>
      <td class="n msrp">${g.msrp?eur(g.msrp):'<span class="dash">—</span>'}${g.msrp&&g.packs?`<br><small>${eur(g.msrp/g.packs)} / bal.</small>`:""}</td>${cells}
      <td class="n"><b>${b?eur(b[5]):"—"}</b> ${b?pctHtml(pctOf(b[5],g.msrp)):""}${b?`<br><small style="color:var(--mute)">${esc(SHOPS[b[0]]||b[0])}</small>`:""}${per}</td></tr>`}).join("")
    || `<tr><td colspan="${SK.length+3}" class="empty">${P.offers.length?"Nič nevyhovuje filtru.":"Zatiaľ žiadne dáta – klikni <b>Fetch nové ceny</b>."}</td></tr>`;
  if(!st.sel||!R.find(g=>g.key===st.sel))st.sel=R.length?R[0].key:null;
  document.querySelectorAll("tr[data-k]").forEach(tr=>tr.classList.toggle("sel",tr.dataset.k===st.sel));
  chart();}
let lc; const pal=["#c8102e","#1f6feb","#d29922","#2da44e","#8250df","#0a7ea4"];
function chart(){
  const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const g=groups[st.sel]; document.getElementById("ctitle").textContent=g?`Vývoj ceny – ${g.code||short(g.name)} ${g.kind} ${g.lang}`:"Vývoj ceny";
  lc&&lc.destroy(); if(!g)return;
  const now=P.updated; const ts=new Set(now?[now]:[]);
  const per={}; g.all.forEach(o=>{(P.hist[o[7]]||[]).forEach(h=>ts.add(h[0]));});
  const T=[...ts].sort();
  const ds=SK.map((s,i)=>{const offs=g.all.filter(o=>o[0]===s); if(!offs.length)return null;
    const series=offs.map(o=>{const h=(P.hist[o[7]]||[]).slice().sort((a,b)=>a[0]<b[0]?-1:1);let j=0,v=null;
      return T.map(t=>{while(j<h.length&&h[j][0]<=t){v=h[j][2]?h[j][1]:null;j++;} if(t===now)v=o[6]?o[5]:null; return v;});});
    const data=T.map((_,k)=>{const vs=series.map(x=>x[k]).filter(v=>v!=null);return vs.length?Math.min(...vs):null;});
    return {label:SHOPS[s],data,borderColor:pal[i%pal.length],backgroundColor:pal[i%pal.length],stepped:true,spanGaps:false,pointRadius:T.length>40?0:3};}).filter(Boolean);
  if(g.msrp)ds.push({label:"MSRP",data:T.map(()=>g.msrp),borderColor:css("--mute"),borderDash:[6,4],pointRadius:0,borderWidth:1.5});
  lc=new Chart(document.getElementById("line"),{type:"line",data:{labels:T.map(t=>new Date(t).toLocaleString("sk-SK",{day:"numeric",month:"numeric",hour:"2-digit",minute:"2-digit"})),datasets:ds},
    options:{maintainAspectRatio:false,interaction:{mode:"index",intersect:false},
      plugins:{legend:{labels:{color:css("--ink")}},tooltip:{callbacks:{label:c=>c.dataset.label+": "+(c.raw==null?"nedostupné":eur(c.raw))}}},
      scales:{x:{grid:{color:css("--line")},ticks:{color:css("--mute"),maxRotation:0,autoSkip:true}},y:{grid:{color:css("--line")},ticks:{color:css("--mute"),callback:v=>eur(v)}}}}});}
document.getElementById("tb").addEventListener("click",e=>{const tr=e.target.closest("tr[data-k]");if(!tr||e.target.closest("a"))return;st.sel=tr.dataset.k;draw();});
const seg=id=>document.querySelectorAll(`#${id} button`).forEach(b=>b.onclick=()=>{document.querySelectorAll(`#${id} button`).forEach(x=>x.classList.remove("on"));b.classList.add("on");st[id]=b.dataset.v;st.sel=null;draw();});
seg("kind");seg("lang");
document.getElementById("stock").onchange=e=>{st.stock=e.target.checked;st.sel=null;draw();};
document.getElementById("under").onchange=e=>{st.under=e.target.checked;st.sel=null;draw();};
document.getElementById("sort").onchange=e=>{st.sort=e.target.value;draw();};
document.getElementById("q").oninput=e=>{st.q=e.target.value;st.sel=null;draw();};
// stav obchodov
const fmt=t=>t?new Date(t).toLocaleString("sk-SK",{day:"numeric",month:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
document.getElementById("upd").textContent=fmt(P.updated);
document.getElementById("status").innerHTML=SK.map(s=>{const x=P.status[s];if(!x)return `<span>${esc(SHOPS[s])}: zatiaľ nič</span>`;
  return x.ok?`<span>✔ ${esc(SHOPS[s])}</span>`:`<span class="bad" title="${esc(x.error||"")}">⚠ ${esc(SHOPS[s])}: posledný fetch zlyhal, dáta z ${fmt(x.ts)}</span>`}).join("")
  +(P.links.length?`<span>Bez automatického sťahovania:${P.links.map(l=>`<a class="ext" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join("")}</span>`:"");
// Fetch: lokálny server → API; GitHub Pages → spustenie workflow
const btn=document.getElementById("fetchBtn"),lbl=document.getElementById("fetchLbl"),logEl=document.getElementById("log"),fh=document.getElementById("fhint");
const ghRepo=P.repo||(location.hostname.endsWith("github.io")?location.hostname.split(".")[0]+"/"+location.pathname.split("/")[1]:"");
let mode="none";
async function poll(){try{const s=await fetch("/api/status",{cache:"no-store"}).then(r=>r.json());
  if(s.log&&s.log.length){logEl.classList.add("on");logEl.textContent=s.log.join("\n");}
  if(s.running){btn.setAttribute("disabled","");lbl.textContent="Sťahujem…";setTimeout(poll,1000);}
  else if(btn.hasAttribute("disabled")){lbl.textContent="Hotovo, načítavam…";setTimeout(()=>location.reload(),600);}
 }catch(e){btn.removeAttribute("disabled");lbl.textContent="⟳ Fetch nové ceny";logEl.classList.add("on");logEl.textContent="Server neodpovedá – beží ešte python onepiece_ceny.py?";}}
(async()=>{
  if(location.protocol.startsWith("http")&&!location.hostname.endsWith("github.io")){
    try{const s=await fetch("/api/status").then(r=>r.json());mode="local";if(s.running){btn.setAttribute("disabled","");poll();}return;}catch(e){}}
  if(ghRepo){mode="gh";btn.href=`https://github.com/${ghRepo}/actions/workflows/fetch.yml`;btn.target="_blank";
    fh.textContent="Otvorí GitHub → klikni „Run workflow“. Stránka sa obnoví asi o 2 min. Automaticky beží každé 2 h.";return;}
  fh.textContent="Spusti: python onepiece_ceny.py";btn.style.opacity=.5;})();
btn.onclick=async e=>{if(mode==="gh")return;e.preventDefault();if(mode!=="local")return;
  btn.setAttribute("disabled","");lbl.textContent="Sťahujem…";logEl.classList.add("on");logEl.textContent="Spúšťam…";
  try{await fetch("/api/fetch",{method:"POST"});}catch(e){} poll();};
draw();
</script></body></html>"""

if __name__ == "__main__":
    main()
