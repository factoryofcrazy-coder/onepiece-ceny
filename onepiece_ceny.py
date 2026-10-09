#!/usr/bin/env python3
"""
One Piece TCG – porovnanie cien booster boxov a packov v SK/CZ e-shopoch + MSRP + Discord upozornenia.

Obchody: Card Empire, Pikazard, Veselý drak, iHRYsko (Smarty.sk len ako odkaz – blokuje boty).

Použitie:
    python onepiece_ceny.py               # stiahne ceny, nahrá na GitHub, otvorí stránku (http://localhost:8765)
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
import urllib.parse
import urllib.request
import webbrowser
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

VERSION = "2026-10-09f"
HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
HISTORY = DATA / "history.csv"          # len zmeny cien/dostupnosti (+ prvé výskyty)
CURRENT = DATA / "current.json"         # posledný stav každého obchodu
ALERT_STATE = DATA / "alerts_state.json"
DOCS = HERE / "docs"                    # statická stránka pre GitHub Pages
MSRP_FILE = HERE / "msrp.json"
CONFIG_FILE = HERE / "config.json"
IN_CLOUD = os.environ.get("GITHUB_ACTIONS") == "true"


def _enable_feeds():
    if feed_url():
        SHOPS["smarty"].update(enabled=True, parser="xmlfeed", cloud=True)
    elif not IN_CLOUD and saved_pages("smarty"):
        # Smarty: stránku si uložíš v prehliadači (Ctrl+S), skript ju načíta – bez obchádzania ochrany
        SHOPS["smarty"].update(enabled=True, parser="saved", cloud=False)
HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/128.0 Safari/537.36",
    "Accept-Language": "sk,cs;q=0.9,en;q=0.8",
}
DELAY = 1.0          # pauza medzi stránkami toho istého obchodu (s); Shoptet obchody majú 3 s
MIN_REFETCH_MIN = 30  # pri automatickom spustení nesťahuj obchod, ktorý sa sťahoval pred menej ako 30 min
MAX_PAGES = 10

# ---------------------------------------------------------------- obchody ---
SHOPS = {
    # Shoptet obchody blokujú servery GitHubu (HTTP 500) – sťahujú sa len z PC (cloud: False)
    "cardempire": {"label": "Card Empire", "parser": "shoptet", "currency": "EUR", "cloud": False,
                   "delay": 3, "urls": ["https://www.cardempire.sk/one-piece/"]},
    "pikazard":   {"label": "Pikazard", "parser": "shoptet", "currency": "EUR", "cloud": False, "delay": 3,
                   "urls": ["https://www.pikazard.eu/one-piece-tcg/"]},
    "veselydrak": {"label": "Veselý drak", "parser": "veselydrak", "currency": "EUR",
                   "urls": ["https://www.vesely-drak.sk/produkty/booster-box-one-piece/",
                            "https://www.vesely-drak.sk/produkty/booster-one-piece/",
                            "https://www.vesely-drak.sk/produkty/specialni-sety-one-piece/",
                            "https://www.vesely-drak.sk/produkty/starter-deck-one-piece/"]},
    "ihrysko":    {"label": "iHRYsko", "parser": "jsonld", "currency": "EUR",
                   "urls": ["https://www.ihrysko.sk/one-piece-tcg-c100345"]},
    "najada":     {"label": "Najáda", "parser": "jsonld", "currency": "EUR",
                   "urls": [{"url": "https://www.najada.games/karetni-hry/one-piece/booster-boxy", "kind": "Box"},
                            {"url": "https://www.najada.games/karetni-hry/one-piece/boostery", "kind": "Pack"},
                            "https://www.najada.games/karetni-hry/one-piece/asijske",
                            "https://www.najada.games/karetni-hry/one-piece/sberatelske-produkty",
                            "https://www.najada.games/karetni-hry/one-piece/starter-decky"]},
    "tolarie":    {"label": "Tolarie", "parser": "tolarie", "currency": "CZK",
                   "urls": [{"url": "https://www.tolarie.cz/koupit_produkty/katalog/70-one-piece/57-one-piece-booster-boxy/", "kind": "Box"},
                            {"url": "https://www.tolarie.cz/koupit_produkty/katalog/70-one-piece/72-one-piece-boostery/", "kind": "Pack"},
                            "https://www.tolarie.cz/koupit_produkty/katalog/70-one-piece/118-one-piece-kolekce/",
                            "https://www.tolarie.cz/koupit_produkty/katalog/70-one-piece/74-one-piece-starter-decky/"]},
    "cernyrytir": {"label": "Černý rytíř", "parser": "cernyrytir", "currency": "CZK",
                   "urls": ["https://eshop-api.cernyrytir.eu/api/public/merch/list#677"]},
    "nekonecno":  {"label": "Nekonečno", "parser": "shoptet", "currency": "EUR", "cloud": False, "delay": 3,
                   "urls": ["https://www.nekonecno.sk/one-piece-karty/"]},
    "pokemon4u":  {"label": "Pokemon4U", "parser": "shoptet", "currency": "CZK", "cloud": False, "delay": 3,
                   "urls": ["https://www.pokemon4u.cz/one-piece-karty/"]},
    "hrananetu":  {"label": "Hra na netu", "parser": "upgates", "currency": "CZK",
                   "urls": [{"url": "https://www.hrananetu.cz/one-piece-booster-boxy", "kind": "Box"},
                            {"url": "https://www.hrananetu.cz/one-piece-boostery", "kind": "Pack"},
                            "https://www.hrananetu.cz/one-piece-bundly",
                            "https://www.hrananetu.cz/one-piece-balicky"]},
    # Smarty.sk blokuje automatické sťahovanie webu (Cloudflare). Legálna cesta je ich affiliate
    # XML feed (eHUB – „XML feed na vyžiadanie u affiliate managera“). Keď je URL feedu nastavená
    # (SMARTY_FEED_URL / smarty_feed.txt), obchod sa zapne automaticky; inak je na stránke len odkaz.
    "smarty":     {"label": "Smarty.sk", "parser": "xmlfeed", "currency": "EUR", "enabled": False, "cloud": False,
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
PREORDER_RX = re.compile(r"(?:p[řr]edobjedn|pre-?order|presale|predpredaj)", re.I)
CODE_RX = re.compile(r"\b(OP|EB|PRB|ST|IB|SD)\s?-?\s?(\d{1,2})\b", re.I)


def set_code(name):
    low = name.lower()
    m = re.search(r"illustration box\s*vol\.?\s*(\d+)", low)
    if m:
        return f"IB{int(m.group(1)):02d}"
    m = re.search(r"best selection\s*vol\.?\s*(\d+)", low)
    if m:
        return f"BS{int(m.group(1)):02d}"
    m = re.search(r"card games fest\s*(\d{2})", low)
    if m:
        return f"FEST{m.group(1)}"
    if "set sail" in low:
        return "SD01"
    m = CODE_RX.search(name)
    if m:
        return f"{m.group(1).upper()}{int(m.group(2)):02d}"
    low = name.lower()
    for k, v in SET_NAMES.items():
        if k in low:
            return v
    return ""


ACCESSORY_RX = re.compile(r"sleeve|obal|album|playmat|podložk|binder|deck box|storage|card case|acryl|akryl|krabičk|"
                          r"krabick|protector|chránič|ochran|magnet|graded|trophy|holder|stojan|vitrín|display case|"
                          r"toploader|pouzdr|puzdr|samolep|sticker|panini", re.I)
KIND_GROUPS = {"Kolekcie": ("Premium", "Illustration", "Kolekcia"), "Ostatné": ("Doplnky", "Iné")}


def kind_of(name):
    n = name.lower()
    if ACCESSORY_RX.search(n):
        return "Doplnky"
    if re.search(r"figúr|figur|funko|promo|jump|tin\b|token|don!! card|trading cards", n):
        return "Iné"
    if "illustration" in n:
        return "Illustration"
    if re.search(r"premium card collection|best selection|card games fest", n):
        return "Premium"
    if "starter" in n or "deck set" in n or "ultra deck" in n or re.search(r"\bst[ -]?\d{1,2}\b", n):
        return "Starter"
    if re.search(r"\bcase\b", n):
        return "Case"
    if "double pack" in n:
        return "Double Pack"
    if re.search(r"special set|anniversary set|gift|collection set|collection box|bundle|kolekc|premium collection", n):
        return "Kolekcia"
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
    if re.search(r"asijsk|ázijsk|azijsk|asian\b", name, re.I):
        return "ASIA"
    if re.search(r"japon|japan|\bjp\b|\bjap\b", name, re.I):
        return "JP"
    return "EN"


EXCLUDE_RX = re.compile(r"acryl|akryl|krabičk|krabick|protector|chránič|ochran|magnet|graded|trophy|holder|stojan|vitrín|display case|toploader|pouzdr|puzdr|illustration|premium card|collection set|gift|figúr|figur|sleeve|obal|album|playmat|"
                        r"podložk|promo|jump|binder|deck box|storage|token|starter|deck set|samolep|sticker", re.I)


def classify(name, hint=None):
    kind = kind_of(name)
    if hint and kind == "Iné" and not EXCLUDE_RX.search(name):
        kind = hint                     # napr. "OP-17 The World's Strongest Warriors" v kategórii Booster boxy
    return set_code(name), kind, lang_of(name)


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
def first_img(chunk, base):
    m = re.search(r'<img[^>]+(?:data-src|src)="([^"]+\.(?:jpe?g|png|webp)[^"]*)"', chunk, re.I)
    if not m or "transparent" in m.group(1) or "loading.gif" in m.group(1):
        m = re.search(r'data-src="([^"]+)"', chunk)
    return absolute(base, m.group(1)) if m else None


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
        avtxt = re.search(r'class="availability"[^>]*>(.*?)</div>', chunk, re.S)
        avtxt = clean(avtxt.group(1)) if avtxt else ""
        out.append({"id": pid.group(1) if pid else clean(name.group(1)),
                    "name": clean(name.group(1)),
                    "url": absolute(base, href.group(1)) if href else base,
                    "price": float(price.group(1)) if price else None,
                    "currency": cur.group(1) if cur else None,
                    "img": first_img(chunk, base),
                    "inStock": bool(av and av.group(1) == "InStock") and not PREORDER_RX.search(avtxt),
                    "preorder": bool(av and av.group(1) == "PreOrder") or bool(PREORDER_RX.search(avtxt))})
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
        dsrc = re.search(r'data-src="([^"]+)"', chunk)
        out.append({"id": a.group(1), "name": clean(a.group(2)), "url": absolute(base, a.group(1)),
                    "price": num(ptxt), "currency": "CZK" if "Kč" in ptxt else "EUR",
                    "img": absolute(base, dsrc.group(1)) if dsrc else first_img(chunk, base),
                    "inStock": bool(re.search(r"sklad", avtxt, re.I)) and not re.search(r"nie je|není|vypred", avtxt, re.I),
                    "preorder": bool(PREORDER_RX.search(avtxt)) or bool(re.search(r'ribbon[^"]*"[^>]*>\s*<span>\s*P[řr]edobjedn', chunk, re.I)),
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
            price, cur = off.get("price"), off.get("priceCurrency")
            spec = off.get("priceSpecification")
            if price is None and spec:
                spec = spec[0] if isinstance(spec, list) else spec
                price, cur = spec.get("price"), spec.get("priceCurrency", cur)
            out.append({"id": str(p.get("sku") or p.get("name")), "name": html.unescape(p.get("name", "")),
                        "url": p.get("url") if off.get("url") in (None, "") else off.get("url"),
                        "price": num(price) if price is not None else None,
                        "currency": cur or "EUR",
                        "img": (p.get("image")[0] if isinstance(p.get("image"), list) and p.get("image") else
                                p.get("image") if isinstance(p.get("image"), str) else None),
                        "inStock": "InStock" in str(off.get("availability", "")),
                        "preorder": "PreOrder" in str(off.get("availability", ""))})
    return out


def parse_tolarie(page, base):
    out = []
    for chunk in page.split('<article class="slcard"')[1:]:
        chunk = chunk.split("</article>")[0]
        a = re.search(r'class="slcard__name"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', chunk, re.S) or \
            re.search(r'href="([^"]+)"[^>]*class="slcard__name"[^>]*>(.*?)</a>', chunk, re.S)
        pr = re.search(r'class="slcard__price"[^>]*>\s*<strong>(.*?)</strong>', chunk, re.S)
        st = re.search(r'class="slcard__stock ([^"]*)"', chunk)
        if not (a and pr):
            continue
        ptxt = clean(pr.group(1))
        out.append({"id": a.group(1), "name": clean(a.group(2)), "url": absolute(base, a.group(1)),
                    "price": num(ptxt), "currency": "EUR" if "€" in ptxt else "CZK",
                    "img": first_img(chunk, base),
                    "inStock": bool(st and "--ok" in st.group(1)),
                    "preorder": bool(PREORDER_RX.search(clean(chunk)))})
    return out


def parse_upgates(page, base):
    """Upgates e-shopy (napr. Hra na netu): <article class="... card-item ...">."""
    out = []
    for chunk in re.split(r'<article[^>]*class="[^"]*card-item', page)[1:]:
        chunk = chunk.split("</article>")[0]
        a = re.search(r'<h4[^>]*>\s*<a href="([^"]+)"[^>]*>(.*?)</a>', chunk, re.S)
        pr = re.search(r'class="p-i-price[^"]*"[^>]*>\s*<strong[^>]*>(.*?)</strong>', chunk, re.S)
        st = re.search(r'class="in-stock([^"]*)"[^>]*>(.*?)</div>', chunk, re.S)
        if not (a and pr):
            continue
        ptxt = clean(pr.group(1))
        sttxt = clean(st.group(2)) if st else ""
        out.append({"id": a.group(1), "name": clean(a.group(2)), "url": absolute(base, a.group(1)),
                    "price": num(ptxt), "currency": "EUR" if "€" in ptxt else "CZK",
                    "img": first_img(chunk, base),
                    "inStock": bool(st) and "in-stock--not" not in st.group(1) and not re.search(r"není|nie je", sttxt, re.I),
                    "preorder": bool(PREORDER_RX.search(sttxt))})
    return out


def crawl_cernyrytir(shop):
    """Černý rytíř má verejné JSON API (rovnaké, aké používa ich web)."""
    out = []
    for u in shop["urls"]:
        url, cat = u.split("#")
        body = json.dumps({"extendedFilter": {"categoryIds": [int(cat)]},
                           "pagination": {"page": 1, "rowsPerPage": 200, "rowsNumber": 0, "descending": False}})
        req = urllib.request.Request(url, data=body.encode("utf-8"), method="POST",
                                     headers={**HEADERS, "Content-Type": "application/json",
                                              "Accept": "application/json", "Origin": "https://cernyrytir.cz",
                                              "Referer": "https://cernyrytir.cz/"})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode("utf-8"))
        for it in data.get("list", []):
            title = next((t["textFull"] for t in it.get("productTextList", [])
                          if t.get("typeTxt") == "TITLE" and t.get("langCode") == "CZ"), None) or \
                next((t["textFull"] for t in it.get("productTextList", []) if t.get("typeTxt") == "TITLE"), "")
            price = it.get("priceSell")
            if not title or price is None:
                continue
            out.append({"id": it.get("productUid"), "name": title,
                        "url": f"https://cernyrytir.cz/merch/detail/{it.get('productUid')}",
                        "price": float(price), "currency": "CZK",
                        # e-shop sklad alebo predajňa v Prahe
                        "img": ("https://images.cernyrytir.eu/image/cernyrytir/v2?uid=" + it["imageUuid"][0] +
                                "&faceType=FRONT&imageType=MERCHANDISE&sizeType=BIG") if it.get("imageUuid") else None,
                        "inStock": (it.get("availEshopQty") or 0) > 0 or (it.get("availStoreQty") or 0) > 0,
                        "preorder": bool(it.get("presale"))})
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
        img = re.search(r'<img[^>]+(?:data-src|src)="([^"]+\.(?:jpe?g|png|webp)[^"]*)"', chunk, re.I)
        ptxt = pr.group(1) if pr else ""
        eur = "€" in ptxt or ("Kč" not in ptxt and "smarty.cz" not in base)
        out.append({"id": info.get("id") or (url.group(1) if url else name), "name": name,
                    "url": absolute(base, url.group(1)) if url else base,
                    "price": float(price), "currency": "EUR" if eur else "CZK",
                    "img": absolute(base, img.group(1)) if img and img.group(1).startswith(("http", "/")) else None,
                    "inStock": bool(re.search(r"skladom|skladem", avail, re.I)),
                    "preorder": bool(re.search(r"predobj|předobj|pripravujeme|připravujeme", avail, re.I)),
                    "availText": avail})
    return out


PARSERS = {"shoptet": parse_shoptet, "veselydrak": parse_veselydrak,
           "jsonld": parse_jsonld, "smarty": parse_smarty, "tolarie": parse_tolarie,
           "upgates": parse_upgates}


def page_url(parser, url, n):
    if n == 1:
        return url
    if parser == "shoptet":
        return url.rstrip("/") + f"/strana-{n}/"
    return url + ("&" if "?" in url else "?") + f"page={n}"


def feed_url():
    u = os.environ.get("SMARTY_FEED_URL", "").strip()
    f = HERE / "smarty_feed.txt"
    if not u and f.exists():
        u = f.read_text(encoding="utf-8").strip()
    return u or None


def crawl_xmlfeed(shop):
    """Produktový XML feed (Heureka / Google formát), číta sa po kúskoch – feed môže mať stovky MB."""
    import xml.etree.ElementTree as ET
    req = urllib.request.Request(feed_url(), headers={"User-Agent": HEADERS["User-Agent"]})
    out = []
    with urllib.request.urlopen(req, timeout=120) as r:
        for _, el in ET.iterparse(r, events=("end",)):
            tag = el.tag.split("}")[-1].upper()
            if tag not in ("SHOPITEM", "ITEM", "ENTRY"):
                continue
            f = {c.tag.split("}")[-1].upper(): (c.text or "").strip() for c in el}
            name = f.get("PRODUCTNAME") or f.get("PRODUCT") or f.get("TITLE") or ""
            if re.search(r"one\s*piece", name, re.I) and re.search(r"booster|box|display|pack|deck", name, re.I):
                price = num(f.get("PRICE_VAT") or f.get("PRICE") or f.get("SALE_PRICE") or "")
                av = (f.get("DELIVERY_DATE") or f.get("AVAILABILITY") or "").lower()
                out.append({"id": f.get("ITEM_ID") or f.get("ID") or f.get("URL") or name, "name": name,
                            "url": f.get("URL") or f.get("LINK") or "", "price": price,
                            "currency": "CZK" if "Kč" in (f.get("PRICE_VAT") or "") else shop["currency"],
                            "inStock": av in ("0", "in stock", "in_stock", "skladom", "skladem"),
                            "preorder": "preorder" in av or "pre-order" in av})
            el.clear()
    return out


IMPORT_DIR = HERE / "import"
SAVED_MAX_AGE_H = 72


def saved_pages(key):
    """Stránky obchodu uložené z prehliadača (Ctrl+S) v priečinku import/ alebo v Stiahnutých súboroch."""
    dirs = [IMPORT_DIR, Path.home() / "Downloads", Path.home() / "Stiahnuté"]
    now, out = time.time(), []
    for d in dirs:
        try:
            files = list(d.glob("*.htm*"))
        except OSError:
            continue
        for f in files:
            try:
                if (d != IMPORT_DIR and key not in f.name.lower()) or now - f.stat().st_mtime > SAVED_MAX_AGE_H * 3600:
                    continue
            except OSError:
                continue
            out.append(f)
    return sorted(out, key=lambda f: f.stat().st_mtime)


def saved_is_new(key):
    s = load_json(CURRENT, {}).get("shops", {}).get(key) if CURRENT.exists() else None
    files = saved_pages(key)
    if not files:
        return False
    if not s or not s.get("ts"):
        return True
    last = datetime.strptime(s["ts"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()
    return files[-1].stat().st_mtime > last


def crawl_saved(shop, key="smarty"):
    rows, seen = [], set()
    for f in saved_pages(key):
        page = f.read_text(encoding="utf-8", errors="replace")
        base = shop["link"]
        m = re.search(r'<link[^>]+rel="canonical"[^>]+href="([^"]+)"', page) or \
            re.search(r'saved from url=\(\d+\)(\S+)', page)
        if m:
            base = m.group(1)
        for i in parse_smarty(page, base):
            if i["url"] not in seen:
                seen.add(i["url"])
                rows.append(i)
        say(f"    · {f.name}: {len(rows)} produktov spolu")
    return rows


def crawl(shop):
    if shop["parser"] == "saved":
        return [r for r in crawl_saved(shop) if re.search(r"one\s*piece", r["name"], re.I) and r["price"]]
    if shop["parser"] == "xmlfeed":
        return [r for r in crawl_xmlfeed(shop) if r["price"]]
    if shop["parser"] == "cernyrytir":
        rows = crawl_cernyrytir(shop)
        return [r for r in rows if re.search(r"one\s*piece", r["name"], re.I) and r["price"]]
    parse = PARSERS[shop["parser"]]
    seen_ids, seen_urls, rows = set(), set(), []
    for entry in shop["urls"]:
        start, hint = (entry["url"], entry.get("kind")) if isinstance(entry, dict) else (entry, None)
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
                if hint:
                    i["hint"] = hint
                new.append(i)
            rows += new
            time.sleep(shop.get("delay", DELAY))
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


def packs_from_name(name):
    m = re.search(r"(\d{1,2})\s*(?:x\s*)?(?:booster|balíč|balic|packs?\b|bal\.)", name, re.I)
    return int(m.group(1)) if m and 4 <= int(m.group(1)) <= 36 else None


def box_packs(code, lang, msrp, name=""):
    n = packs_from_name(name) if name else None
    if n:
        return n
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
    # záloha / migrácia: posledný známy stav každého produktu z history.csv
    latest = {}
    for r in load_history():
        latest[(r["shop"], r["url"])] = r
    shops = {}
    for (shop, _), r in sorted(latest.items(), key=lambda kv: kv[1]["timestamp"]):
        s = shops.setdefault(shop, {"ts": r["timestamp"], "ok": True, "items": []})
        s["ts"] = max(s["ts"], r["timestamp"])
        s["items"].append({"name": r["name"], "url": r["url"], "price": float(r["price"]),
                           "currency": r["currency"], "eur": float(r["priceEUR"]),
                           "inStock": r["inStock"] == "1"})
    upd = max((s["ts"] for s in shops.values()), default=None)
    return {"updated": upd, "fx": FX_FALLBACK, "shops": shops}


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
            code, kind, lang = classify(i["name"], i.get("hint"))
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


def recently_fetched(key, minutes=MIN_REFETCH_MIN):
    s = load_json(CURRENT, {}).get("shops", {}).get(key) if CURRENT.exists() else None
    if not s or not s.get("ok") or not s.get("ts"):
        return False
    age = datetime.now(timezone.utc) - datetime.strptime(s["ts"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    return age.total_seconds() < minutes * 60


def snapshot(only=None, force=True):
    _enable_feeds()                         # stránka Smarty mohla byť uložená, kým beží server
    fx = fx_rates()
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    keys = [k for k in SHOPS if SHOPS[k].get("enabled", True) and (not only or k in only)
            and not (IN_CLOUD and SHOPS[k].get("cloud") is False)]
    # uložené stránky (Smarty) spracuj len keď pribudla novšia – inak ostanú posledné dáta
    keys = [k for k in keys if SHOPS[k]["parser"] != "saved" or saved_is_new(k)]
    if not force:
        skip = [k for k in keys if recently_fetched(k) and SHOPS[k]["parser"] != "saved"]
        if skip:
            say("  ⏭ preskakujem (stiahnuté pred < %d min): %s" % (MIN_REFETCH_MIN, ", ".join(SHOPS[k]["label"] for k in skip)))
        keys = [k for k in keys if k not in skip]
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
            item = {"name": i["name"], "url": i["url"], "price": round(i["price"], 2), "currency": cur,
                    "eur": round(eur, 2), "inStock": bool(i["inStock"])}
            if i.get("hint"):
                item["hint"] = i["hint"]
            if i.get("preorder"):
                item["preorder"] = True
            if i.get("img"):
                item["img"] = i["img"]
            out.append(item)
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
        target = url + ("&" if "?" in url else "?") + "wait=true"     # Discord potvrdí doručenie
        req = urllib.request.Request(target, data=json.dumps(body).encode("utf-8"), method="POST",
                                     headers={"Content-Type": "application/json",
                                              # Discord (Cloudflare) odmieta neznáme User-Agenty chybou 403/1010
                                              "User-Agent": "DiscordBot (https://github.com/factoryofcrazy-coder/onepiece-ceny, 1.0)"})
        for attempt in range(3):
            try:
                urllib.request.urlopen(req, timeout=20).read()
                break
            except urllib.error.HTTPError as e:
                if e.code == 429 and attempt < 2:
                    time.sleep(2)
                    continue
                detail = e.read()[:300].decode("utf-8", "replace")
                hint = {401: "webhook URL je neplatná", 404: "webhook bol zmazaný alebo URL je zlá",
                        403: "Discord odmietol požiadavku"}.get(e.code, "")
                say(f"  ✖ Discord chyba {e.code} {hint}: {detail}")
                return False
            except Exception as e:  # noqa: BLE001  (sieť, SSL…)
                say(f"  ✖ Discord nedostupný: {e}")
                return False
        time.sleep(0.6)
    return True


def eur(v):
    return f"{v:,.2f} €".replace(",", " ").replace(".", ",") if v is not None else "—"


def shipping_cfg(key):
    return load_json(CONFIG_FILE, {}).get("shipping", {}).get(key) or {}


def shipping_cost(key, price_eur):
    sh = shipping_cfg(key)
    if sh.get("cost") is None:
        return None
    if sh.get("free_from") is not None and price_eur >= float(sh["free_from"]):
        return 0.0
    return float(sh["cost"])


def shipping_note(key, price_eur):
    sh = shipping_cfg(key)
    parts = []
    c = shipping_cost(key, price_eur)
    if c is not None:
        parts.append("zdarma" if c == 0 else f"{eur(c)} ({sh.get('method', 'Packeta')})")
    if sh.get("pickup"):
        parts.append("osobný odber: " + sh["pickup"])
    return " · ".join(parts)


def cardmarket_url(name):
    q = re.sub(r"(?i)^one piece( tcg| card game| cg)?\s*[:\-–]?\s*", "", name)
    q = re.sub(r"(?i)\s*[-–(]\s*(japonsk\w*|japan|jp|en|asijsk\w*|korejsk\w*|čínsk\w*)\)?\s*$", "", q)
    q = re.sub(r"\s*\((OP|EB|PRB)-?\d+\)|\b(OP|EB|PRB)-?\d+\b", "", q).strip(" -–")
    return "https://www.cardmarket.com/en/OnePiece/Products/Search?searchString=" + urllib.parse.quote(q)


def local_now():
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("Europe/Bratislava"))
    except Exception:  # noqa: BLE001  (Windows bez tzdata – PC je v Bratislave)
        return datetime.now()


DIGEST_STATE = DATA / "digest_state.json"


def build_digest(cur, msrp, cfg):
    """Denný súhrn: najlepšie boxy skladom vs MSRP a zmeny za 24 h."""
    fx = cur["fx"]
    best = {}
    for key, s in cur["shops"].items():
        for i in s.get("items", []):
            if not i["inStock"]:
                continue
            code, kind, lang = classify(i["name"], i.get("hint"))
            m = msrp_eur(code, kind, lang, msrp, fx)
            if kind != "Box" or not m or i["eur"] < 0.4 * m:
                continue
            g = f"{code} {lang}"
            if g not in best or i["eur"] < best[g][0]:
                best[g] = (i["eur"], m, key, i)
    lines = {}
    for lang in ("EN", "JP"):
        rows = sorted(((v[0] / v[1] - 1) * 100, g, v) for g, v in best.items() if g.endswith(lang))[:5]
        lines[lang] = [f"`{p:+4.0f} %` **{g.split()[0]}** – [{eur(v[0])}]({v[3]['url']}) · {SHOPS.get(v[2], {}).get('label', v[2])}"
                       for p, g, v in rows]
    # zmeny za 24 h z histórie
    since = (datetime.now(timezone.utc).timestamp() - 86400)
    hist = load_history()
    last_before, changes = {}, []
    for r in hist:
        t = datetime.strptime(r["timestamp"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()
        code, kind, lang = classify(r["name"])
        if kind not in ("Box", "Case"):
            continue
        if t < since:
            last_before[r["url"]] = r
            continue
        old = last_before.get(r["url"])
        if old and r["inStock"] == "1" and old["inStock"] != "1":
            changes.append(f"✅ znova skladom: **{code or r['name'][:40]} {lang}** {eur(float(r['priceEUR']))} · {SHOPS.get(r['shop'], {}).get('label', r['shop'])}")
        elif old and r["inStock"] == "1" and float(r["priceEUR"]) < float(old["priceEUR"]) * 0.97:
            changes.append(f"📉 zlacnené: **{code or r['name'][:40]} {lang}** {eur(float(old['priceEUR']))} → {eur(float(r['priceEUR']))} · {SHOPS.get(r['shop'], {}).get('label', r['shop'])}")
        last_before[r["url"]] = r
    fields = [{"name": "🇬🇧 EN boxy skladom – najbližšie k MSRP", "value": "\n".join(lines["EN"]) or "nič skladom"},
              {"name": "🇯🇵 JP boxy skladom", "value": "\n".join(lines["JP"]) or "nič skladom"},
              {"name": "Zmeny za 24 h", "value": "\n".join(changes[:10]) or "žiadne"}]
    repo = os.environ.get("GITHUB_REPOSITORY") or gh_repo() or ""
    owner, _, name = repo.partition("/")
    url = f"https://{owner}.github.io/{name}/" if owner else None
    return {"title": "☀️ Denný súhrn One Piece cien", "url": url, "color": 0xD29922, "fields": fields,
            "footer": {"text": "% = rozdiel oproti MSRP (s 23 % DPH)"}}


def site_url():
    repo = os.environ.get("GITHUB_REPOSITORY") or gh_repo() or ""
    owner, _, name = repo.partition("/")
    return f"https://{owner}.github.io/{name}/" if owner and name else None


def compact_alerts(embeds):
    """Veľa upozornení naraz → jedna prehľadná správa namiesto stĺpca kariet."""
    lines = []
    for e in embeds[:25]:
        f = {x["name"]: x["value"] for x in e.get("fields", [])}
        lines.append(f"• [{e['title'][:70]}]({e['url']}) – **{f.get('Cena', '')}** · {f.get('Obchod', '')}\n"
                     f"  {e['description'].replace('🔥 ', '')}")
    more = f"\n…a ďalších {len(embeds) - 25}" if len(embeds) > 25 else ""
    return [{"title": f"🔔 {len(embeds)} ponúk", "url": site_url(), "color": 0x2DA44E,
             "description": ("\n".join(lines) + more)[:4000]}]


def maybe_send_digest(cur, msrp, cfg):
    d = cfg.get("digest", {})
    if not d.get("enabled", True) or not webhook_url():
        return
    now = local_now()
    state = load_json(DIGEST_STATE, {})
    if now.hour < int(d.get("hour", 8)) or state.get("last") == now.strftime("%Y-%m-%d"):
        return
    if discord_send([build_digest(cur, msrp, cfg)]):
        DIGEST_STATE.write_text(json.dumps({"last": now.strftime("%Y-%m-%d")}), encoding="utf-8")
        say("  ☀️ denný súhrn odoslaný na Discord")


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
    # obchod, ktorý ešte nemal žiadne dáta (práve pridaný), neposiela "nový produkt" za celý sortiment
    known_shops = {k for k, s in prev_cur.get("shops", {}).items() if s.get("items")}
    fx = cur["fx"]
    embeds, new_state = [], {}

    for key, s in cur["shops"].items():
        label = SHOPS.get(key, {}).get("label", key)
        for i in s.get("items", []):
            code, kind, lang = classify(i["name"], i.get("hint"))
            ident = f"{code} {kind} {lang}".upper()
            m = msrp_eur(code, kind, lang, msrp, fx)
            pct = (i["eur"] / m - 1) * 100 if m else None
            if pct is not None and pct < -60:
                continue                      # podozrivo lacné – skoro určite doplnok/zlé rozpoznanie, nie box
            reasons = []
            if i["inStock"]:
                if m and kind in kinds and lang in th and pct <= th[lang]:
                    reasons.append(f"{pct:+.0f} % oproti MSRP")
                if ident in watch and i["eur"] <= watch[ident]:
                    reasons.append(f"pod tvojou cieľovou cenou {eur(watch[ident])}")
                p = prev.get(i["url"])
                if a.get("back_in_stock_watchlist", True) and ident in watch and p and not p["inStock"]:
                    reasons.append("znova skladom")
                drop = float(a.get("watch_drop_pct", 10)) / 100
                if ident in watch and p and p["inStock"] and i["eur"] <= p["eur"] * (1 - drop):
                    reasons.append(f"📉 zlacnené o {(1 - i['eur'] / p['eur']) * 100:.0f} % ({eur(p['eur'])} → {eur(i['eur'])})")
            # nový produkt / predobjednávka – len keď sa dá kúpiť alebo objednať
            if a.get("new_products", True) and not first_run and key in known_shops and i["url"] not in prev \
                    and kind in kinds and (i["inStock"] or i.get("preorder")):
                reasons.append("🆕 spustená predobjednávka" if i.get("preorder") and not i["inStock"] else "nový produkt skladom")
            p = prev.get(i["url"])
            if a.get("preorders", True) and not first_run and p and i.get("preorder") and not p.get("preorder") \
                    and not i["inStock"] and kind in ("Box", "Case"):
                reasons.append("🆕 spustená predobjednávka")
            if not reasons:
                continue
            last = state.get(i["url"])
            new_state[i["url"]] = last if last is not None else i["eur"]
            if last is not None and i["eur"] > last * (1 - redrop) and "znova skladom" not in reasons \
                    and not any(r.startswith("📉") for r in reasons):
                continue                                  # už upozornené, cena výrazne neklesla
            new_state[i["url"]] = i["eur"]
            fields = [{"name": "Cena", "value": eur(i["eur"]) + (f" ({i['price']:.0f} Kč)" if i["currency"] == "CZK" else ""), "inline": True},
                      {"name": "MSRP", "value": eur(m) if m else "—", "inline": True},
                      {"name": "Obchod", "value": label, "inline": True}]
            bp = box_packs(code, lang, msrp, i["name"]) if kind == "Box" else None
            if bp:
                fields.append({"name": "Za balíček", "value": eur(i["eur"] / bp), "inline": True})
            ship = shipping_note(key, i["eur"])
            if ship:
                fields.append({"name": "Doprava", "value": ship, "inline": True})
            fields.append({"name": "Sklad", "value": "✅ skladom" if i["inStock"] else "🕒 predobjednávka", "inline": True})
            fields.append({"name": "Cardmarket", "value": f"[porovnať]({cardmarket_url(i['name'])})", "inline": True})
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
            code, kind, lang = classify(i["name"], i.get("hint"))
            offers.append([key, i["name"], code, kind, lang, i["eur"], i["inStock"], i["url"],
                           i["price"], i["currency"], msrp_eur(code, kind, lang, msrp, fx),
                           box_packs(code, lang, msrp, i["name"]) if kind == "Box" else None,
                           bool(i.get("preorder")), shipping_cost(key, i["eur"]), cardmarket_url(i["name"]),
                           i.get("img")])
    hist = {}
    for r in load_history():
        hist.setdefault(r["url"], []).append([r["timestamp"], float(r["priceEUR"]), r["inStock"] == "1"])
    used = set(cur.get("shops", {}))
    shops = {k: v["label"] for k, v in SHOPS.items() if v.get("enabled", True) or k in used}
    status = {k: {"ts": s.get("ts"), "ok": s.get("ok", True), "error": s.get("error"),
                  "pc": SHOPS.get(k, {}).get("cloud") is False}
              for k, s in cur.get("shops", {}).items()}
    links = [{"label": v["label"], "url": v["link"]} for v in SHOPS.values()
             if not v.get("enabled", True) and v.get("link")]
    pickup = {k: shipping_cfg(k).get("pickup") for k in SHOPS if shipping_cfg(k).get("pickup")}
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    cfg = load_json(CONFIG_FILE, {})
    th = cfg.get("alerts", {}).get("max_pct_vs_msrp", {"EN": 30, "JP": 150})
    return {"offers": offers, "hist": hist, "shops": shops, "status": status, "links": links,
            "updated": cur.get("updated"), "repo": repo or gh_repo() or "", "pickup": pickup,
            "th": th if isinstance(th, dict) else {"EN": th, "JP": th},
            "watch": cfg.get("watchlist", [])}


def render():
    return TEMPLATE.replace("__VERSION__", VERSION).replace("__PAYLOAD__", json.dumps(page_data(), ensure_ascii=False, separators=(",", ":")))


def build_static():
    DOCS.mkdir(exist_ok=True)
    (DOCS / "index.html").write_text(render(), encoding="utf-8")
    (DOCS / ".nojekyll").write_text("", encoding="utf-8")


# ------------------------------------------------- synchronizácia s GitHubom
SYNC_FILES = ["data/current.json", "data/history.csv", "data/alerts_state.json", "data/digest_state.json",
              "docs/index.html", "docs/.nojekyll"]


def gh_token():
    t = os.environ.get("GITHUB_SYNC_TOKEN", "").strip()
    f = HERE / "github_token.txt"
    if not t and f.exists():
        t = f.read_text(encoding="utf-8").strip()
    return t or None


def gh_repo():
    return load_json(CONFIG_FILE, {}).get("github_repo")


def gh_api(method, path, body=None, raw=False):
    req = urllib.request.Request(
        f"https://api.github.com/repos/{gh_repo()}/{path}", method=method,
        data=json.dumps(body).encode("utf-8") if body is not None else None,
        headers={"Authorization": f"Bearer {gh_token()}", "User-Agent": "onepiece-ceny",
                 "X-GitHub-Api-Version": "2022-11-28",
                 "Content-Type": "application/json",
                 "Accept": "application/vnd.github.raw" if raw else "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=40) as r:
        data = r.read()
    return data if raw else json.loads(data or b"{}")


def merge_history(remote_text):
    """Zjednotí lokálnu a vzdialenú history.csv (podľa času + URL)."""
    rows = {}
    for src in (remote_text, HISTORY.read_text(encoding="utf-8") if HISTORY.exists() else ""):
        for r in csv.DictReader(src.splitlines()):
            if r.get("timestamp") and r.get("url"):
                rows[(r["timestamp"], r["url"])] = r
    with HISTORY.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore")
        w.writeheader()
        w.writerows(sorted(rows.values(), key=lambda r: r["timestamp"]))


def merge_current(remote):
    """Pre každý obchod nechá novšie dáta (lokálne alebo z GitHubu)."""
    local = load_json(CURRENT, None) if CURRENT.exists() else None
    if not local:
        return remote
    out = dict(local)
    out["shops"] = dict(local.get("shops", {}))
    for k, s in remote.get("shops", {}).items():
        mine = out["shops"].get(k)
        if not mine or (s.get("ts") or "") > (mine.get("ts") or ""):
            out["shops"][k] = s
    out["updated"] = max(local.get("updated") or "", remote.get("updated") or "") or None
    return out


def sync_pull():
    """Stiahne zdieľané dáta z GitHubu a zlúči ich s lokálnymi."""
    head = gh_api("GET", "git/ref/heads/main")["object"]["sha"]
    DATA.mkdir(exist_ok=True)
    try:
        remote_cur = json.loads(gh_api("GET", f"contents/data/current.json?ref={head}", raw=True))
        CURRENT.write_text(json.dumps(merge_current(remote_cur), ensure_ascii=False, indent=1), encoding="utf-8")
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
    try:
        merge_history(gh_api("GET", f"contents/data/history.csv?ref={head}", raw=True).decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
    try:
        remote_state = json.loads(gh_api("GET", f"contents/data/alerts_state.json?ref={head}", raw=True))
        local_state = load_json(ALERT_STATE, {})
        ALERT_STATE.write_text(json.dumps({**local_state, **remote_state}, ensure_ascii=False, indent=0), encoding="utf-8")
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
    try:
        remote_d = json.loads(gh_api("GET", f"contents/data/digest_state.json?ref={head}", raw=True))
        if (remote_d.get("last") or "") > (load_json(DIGEST_STATE, {}).get("last") or ""):
            DIGEST_STATE.write_text(json.dumps(remote_d), encoding="utf-8")
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
    return head


def sync_push(message):
    """Nahrá dáta a stránku na GitHub jedným commitom (pri kolízii zlúči a skúsi znova)."""
    import base64
    for attempt in range(3):
        head = gh_api("GET", "git/ref/heads/main")["object"]["sha"]
        base_tree = gh_api("GET", f"git/commits/{head}")["tree"]["sha"]
        tree = []
        for rel in SYNC_FILES:
            f = HERE / rel
            if f.exists():
                blob = gh_api("POST", "git/blobs", {"content": base64.b64encode(f.read_bytes()).decode(),
                                                     "encoding": "base64"})
                tree.append({"path": rel, "mode": "100644", "type": "blob", "sha": blob["sha"]})
        new_tree = gh_api("POST", "git/trees", {"base_tree": base_tree, "tree": tree})
        if new_tree["sha"] == base_tree:
            return "bez zmien"
        commit = gh_api("POST", "git/commits", {"message": message, "tree": new_tree["sha"], "parents": [head]})
        try:
            gh_api("PATCH", "git/refs/heads/main", {"sha": commit["sha"], "force": False})
            return commit["sha"][:7]
        except urllib.error.HTTPError as e:
            if e.code != 422 or attempt == 2:
                raise
            sync_pull()                      # medzitým zapísal GitHub Actions – zlúč a skús znova
            build_static()
    return None


def sync_enabled():
    return not IN_CLOUD and bool(gh_token()) and bool(gh_repo())


def run_once(only=None, notify=True, force=True):
    say(datetime.now().strftime("%d.%m.%Y %H:%M") + " – sťahujem ceny")
    if sync_enabled():
        try:
            sync_pull()
            say(f"  ⇣ stiahnuté aktuálne dáta z GitHubu ({gh_repo()})")
        except Exception as e:  # noqa: BLE001
            say(f"  ! GitHub sync (stiahnutie) zlyhal: {e} – pokračujem s lokálnymi dátami")
    prev = load_current()
    first_run = not CURRENT.exists() and not prev.get("shops")
    ts, fx, results = snapshot(only, force=force)
    cur = {"updated": ts, "fx": fx, "shops": dict(prev.get("shops", {}))}
    fresh = {}
    for key, items, err in results:
        if items is None:                                   # obchod zlyhal – nechaj staré dáta
            old = cur["shops"].get(key, {"items": []})
            cur["shops"][key] = {**old, "ok": False, "error": err}
        else:
            # obrázok sa nesmie stratiť, ak ho tento beh (alebo staršia verzia programu) nepriniesol
            old_img = {i["url"]: i.get("img") for i in prev.get("shops", {}).get(key, {}).get("items", []) if i.get("img")}
            for i in items:
                if not i.get("img") and old_img.get(i["url"]):
                    i["img"] = old_img[i["url"]]
            cur["shops"][key] = {"ts": ts, "ok": True, "items": items}
            fresh[key] = items
    DATA.mkdir(exist_ok=True)
    n_changes = append_changes(prev, fresh, ts)
    CURRENT.write_text(json.dumps(cur, ensure_ascii=False, indent=1), encoding="utf-8")
    if notify:
        embeds = evaluate_alerts(prev, cur, load_json(MSRP_FILE, {}), load_json(CONFIG_FILE, {}), first_run)
        if embeds and webhook_url():
            discord_send(compact_alerts(embeds) if len(embeds) > 4 else embeds,
                         content=f"**{len(embeds)}** zaujímavých ponúk" + (f" · <{site_url()}>" if site_url() else ""))
            say(f"  🔔 odoslaných {len(embeds)} upozornení na Discord")
        elif embeds:
            say(f"  🔔 {len(embeds)} upozornení (Discord webhook nie je nastavený)")
        try:
            maybe_send_digest(cur, load_json(MSRP_FILE, {}), load_json(CONFIG_FILE, {}))
        except Exception as e:  # noqa: BLE001
            say(f"  ! denný súhrn zlyhal: {e}")
    build_static()
    total = sum(len(i) for i in fresh.values())
    if sync_enabled():
        try:
            r = sync_push("ceny z PC " + datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M"))
            say(f"  ⇡ nahraté na GitHub ({r}) – online stránka sa obnoví o ~1 min")
        except urllib.error.HTTPError as e:
            hint = " – skontroluj github_token.txt (oprávnenie Contents: Read and write)" if e.code in (401, 403, 404) else ""
            say(f"  ✖ GitHub sync zlyhal: HTTP {e.code}{hint}")
        except Exception as e:  # noqa: BLE001
            say(f"  ✖ GitHub sync zlyhal: {e}")
    elif not IN_CLOUD:
        say("  (GitHub sync vypnutý – chýba github_token.txt)")
    say(f"Hotovo – {total} produktov, {n_changes} zmien cien/dostupnosti")
    return cur


# ---------------------------------------------------------------- server ----
STATE = {"running": False, "log": [], "finished": None}
LOCK = threading.Lock()


def start_fetch(only=None, force=True):
    with LOCK:
        if STATE["running"]:
            return False
        STATE.update(running=True, log=[])

    def job():
        try:
            run_once(only, force=force)
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
            self._send(200, json.dumps({**STATE, "version": VERSION}, ensure_ascii=False), "application/json")
        else:
            self._send(404, "nenájdené", "text/plain; charset=utf-8")

    def do_POST(self):
        if self.path == "/api/shutdown":          # nová verzia programu prevezme port
            self._send(200, "{}", "application/json")
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return
        if self.path == "/api/fetch":
            self._send(200, json.dumps({"started": start_fetch(self.only)}), "application/json")
        else:
            self._send(404, "nenájdené", "text/plain; charset=utf-8")

    def log_message(self, *args):
        pass


def stop_old_instance(port):
    """Ak na porte beží staršia verzia programu, požiadaj ju o vypnutie (aby sa nezobrazoval starý vzhľad)."""
    try:
        st = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{port}/api/status", timeout=2).read())
    except Exception:  # noqa: BLE001
        return
    try:
        urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{port}/api/shutdown", data=b"", method="POST"),
                               timeout=2).read()
        print(f"Vypínam staršie spustenie programu ({st.get('version', 'stará verzia')})…")
        time.sleep(1.5)
    except Exception:  # noqa: BLE001
        print(f"! Na porte {port} beží staršia verzia programu – zavri jej okno, inak uvidíš starý vzhľad.")


def serve(port, only=None, open_browser=True, watch=None, fetch_on_start=True):
    Handler.only = only
    stop_old_instance(port)
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
    if fetch_on_start and not watch:
        start_fetch(only, force=False)
        print("Sťahujem aktuálne ceny…")
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
        print("Program bol nahradený novším spustením – toto okno môžeš zavrieť.")
    except KeyboardInterrupt:
        print("\nKoniec.")
    finally:
        srv.server_close()


def setup_wizard():
    """Uloží Discord webhook a GitHub token do lokálnych súborov (nenahrávajú sa na GitHub) a otestuje ich."""
    print("=== Nastavenie (Enter = ponechať / preskočiť) ===\n")
    print("1) Discord webhook URL (Discord → kanál → Upraviť → Integrácie → Webhooky → Kopírovať URL)")
    url = input("   vlož URL: ").strip()
    if url:
        if not re.match(r"https://(ptb\.|canary\.)?discord(app)?\.com/api/webhooks/\d+/[\w-]+$", url):
            print("   ✖ Toto nevyzerá ako Discord webhook URL – neuložené.")
        else:
            (HERE / "discord_webhook.txt").write_text(url, encoding="utf-8")
            ok = discord_send([{"title": "Test – upozornenia fungujú ✅", "color": 0x2DA44E,
                                "description": "Sem budú chodiť lacné One Piece ponuky."}])
            print("   ✔ uložené, skúšobná správa odoslaná – pozri Discord" if ok else "   ✖ uložené, ale Discord správu neprijal")
    print("\n2) GitHub token (github.com → Settings → Developer settings → Fine-grained tokens,")
    print("   repo onepiece-ceny, Contents: Read and write)")
    tok = input("   vlož token: ").strip()
    if tok:
        (HERE / "github_token.txt").write_text(tok, encoding="utf-8")
        try:
            gh_api("GET", "git/ref/heads/main")
            print(f"   ✔ uložené, prístup k {gh_repo()} funguje")
        except urllib.error.HTTPError as e:
            print(f"   ✖ uložené, ale GitHub vrátil HTTP {e.code} – skontroluj repozitár a oprávnenia tokenu")
    print("\nHotovo. Spusti spustit.bat.")


def main():
    _enable_feeds()
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--once", action="store_true", help="raz stiahnuť ceny, poslať upozornenia, vytvoriť docs/index.html")
    ap.add_argument("--watch", type=float, metavar="HODINY", help="automaticky sťahovať každých N hodín")
    ap.add_argument("--port", type=int, default=8765, help="port lokálnej stránky (predvolene 8765)")
    ap.add_argument("--no-browser", action="store_true", help="neotvárať prehliadač")
    ap.add_argument("--no-notify", action="store_true", help="neposielať upozornenia")
    ap.add_argument("--no-fetch", action="store_true", help="po spustení stránky nesťahovať hneď ceny")
    ap.add_argument("--rebuild", action="store_true", help="len prerobiť docs/index.html z uložených dát")
    ap.add_argument("--test-discord", action="store_true", help="poslať skúšobnú správu na Discord")
    ap.add_argument("--setup", action="store_true", help="sprievodca: uložiť Discord webhook a GitHub token")
    ap.add_argument("--only", help="čiarkou oddelené obchody: " + ",".join(SHOPS))
    a = ap.parse_args()
    only = set(a.only.split(",")) if a.only else None

    if a.setup:
        setup_wizard()
        return
    if a.test_discord:
        if not webhook_url():
            sys.exit("Webhook nie je nastavený (DISCORD_WEBHOOK_URL alebo discord_webhook.txt).")
        ok = discord_send([{"title": "Test – upozornenia fungujú ✅", "color": 0x2DA44E,
                            "description": "Sem budú chodiť lacné One Piece ponuky."}])
        print("✔ Odoslané – pozri Discord." if ok else "✖ Nepodarilo sa odoslať (dôvod je vyššie).")
        sys.exit(0 if ok else 1)
    if a.rebuild:
        build_static()
        print(f"Prerobené: {DOCS / 'index.html'}")
        return
    if a.once:
        run_once(only, notify=not a.no_notify)
        if not a.no_browser:
            webbrowser.open((DOCS / "index.html").as_uri())
        return
    serve(a.port, only, open_browser=not a.no_browser, watch=a.watch, fetch_on_start=not a.no_fetch)


TEMPLATE = r"""<!doctype html>
<html lang="sk"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>One Piece ceny</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>
:root{--bg:#f4f2ee;--card:#fff;--card2:#faf9f6;--ink:#1c1c1e;--mute:#6b6b70;--line:#e6e3dc;--acc:#c8102e;--acc2:#a50d26;
--good:#1a7f37;--goodbg:#e3f3e7;--warn:#9a6700;--warnbg:#fff4d6;--off:#a9a9ae;--r:14px;--shadow:0 1px 2px rgba(0,0,0,.04),0 4px 14px rgba(0,0,0,.05)}
@media (prefers-color-scheme:dark){:root{--bg:#121214;--card:#1c1c1f;--card2:#222226;--ink:#ececef;--mute:#9a9aa2;--line:#2d2d32;--acc:#ff5a6e;--acc2:#ff7486;
--good:#4ac26b;--goodbg:#163a21;--warn:#e3b341;--warnbg:#3a2f12;--off:#5d5d63;--shadow:none}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:inherit}.wrap{max-width:1360px;margin:0 auto;padding:22px 16px 60px}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:10px}
h1{font-size:24px;margin:0;letter-spacing:-.01em}.sub{color:var(--mute);margin-top:2px}
#fetchBtn{display:inline-flex;align-items:center;gap:8px;background:var(--acc);color:#fff;border:none;border-radius:12px;padding:11px 18px;font:600 15px system-ui,sans-serif;cursor:pointer;text-decoration:none;white-space:nowrap}
#fetchBtn:hover{background:var(--acc2)}#fetchBtn[disabled]{opacity:.6;cursor:progress}
#fetchBtn .spin{width:14px;height:14px;border:2px solid #fff6;border-top-color:#fff;border-radius:50%;display:none;animation:r .8s linear infinite}
#fetchBtn[disabled] .spin{display:inline-block}@keyframes r{to{transform:rotate(360deg)}}
.fhint{font-size:12px;color:var(--mute);margin-top:5px;text-align:right;max-width:280px}
.status{display:flex;flex-wrap:wrap;gap:4px 12px;color:var(--mute);font-size:12px;margin:6px 0 18px}
.status .bad{color:var(--warn)}.ext{display:inline-block;margin-left:4px;padding:1px 8px;border:1px solid var(--line);border-radius:7px;background:var(--card);text-decoration:none}
#log{display:none;font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;color:var(--mute);background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:12px;margin-bottom:16px}#log.on{display:block}
h2{font-size:15px;margin:0 0 10px;font-weight:650}h2 small{color:var(--mute);font-weight:400;margin-left:6px}
/* top ponuky */
.deals{display:grid;grid-template-columns:repeat(auto-fill,minmax(205px,1fr));gap:12px;margin-bottom:24px}
.deal{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:12px;display:flex;flex-direction:column;gap:6px;box-shadow:var(--shadow);text-decoration:none;position:relative}
.deal:hover{border-color:var(--acc)}
.deal .im{height:110px;display:flex;align-items:center;justify-content:center;background:var(--card2);border-radius:10px;overflow:hidden}
.deal .im img{max-width:100%;max-height:110px;object-fit:contain}
.deal .pr{font-size:22px;font-weight:750;letter-spacing:-.02em}.deal .shop{color:var(--mute);font-size:12px}
.deal .rank{position:absolute;top:8px;left:8px;background:var(--ink);color:var(--bg);font-size:11px;font-weight:700;border-radius:20px;padding:1px 7px}
/* filtre */
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px;position:sticky;top:0;z-index:5;background:var(--bg);padding:8px 0}
.seg{display:flex;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:2px}
.seg button{border:none;background:none;color:var(--ink);padding:5px 10px;border-radius:8px;cursor:pointer;font:inherit;white-space:nowrap}
.seg button.on{background:var(--ink);color:var(--bg)}
select,input[type=search],input[type=number]{padding:7px 10px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink);font:inherit}
input[type=search]{flex:1;min-width:150px}input[type=number]{width:96px}
label.chk{display:flex;gap:5px;align-items:center;color:var(--mute);cursor:pointer;white-space:nowrap}
.btn{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:10px;padding:7px 11px;cursor:pointer;font:inherit;white-space:nowrap}
.btn:hover{border-color:var(--acc)}
.count{color:var(--mute);font-size:12px;margin:-4px 0 10px}
/* karty produktov */
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,430px),1fr));gap:14px}
.pc{background:var(--card);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);display:flex;flex-direction:column;overflow:hidden}
.pc.hit{border-color:var(--good);box-shadow:0 0 0 2px var(--goodbg)}
.pc-head{display:flex;gap:12px;padding:14px 14px 10px}
.thumb{width:72px;height:72px;flex:none;border-radius:10px;background:var(--card2);display:flex;align-items:center;justify-content:center;overflow:hidden}
.thumb img{max-width:100%;max-height:100%;object-fit:contain}.thumb span{font-weight:800;color:var(--mute);font-size:13px}
.ttl{flex:1;min-width:0}.ttl .nm{font-weight:650;line-height:1.25;margin:3px 0 2px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.ttl .meta{color:var(--mute);font-size:12px}
.tag{display:inline-block;font-size:11px;padding:0 6px;border-radius:5px;border:1px solid var(--line);color:var(--mute);margin-right:3px;line-height:18px}
.tag.pre{color:var(--warn);border-color:var(--warn)}.tag.hit{color:var(--good);border-color:var(--good)}
.best{text-align:right;flex:none}.best .pr{font-size:21px;font-weight:750;letter-spacing:-.02em;white-space:nowrap}
.best .shop{color:var(--mute);font-size:12px}.best .none{color:var(--off);font-size:13px}
.star{border:none;background:none;cursor:pointer;font-size:19px;line-height:1;color:var(--off);padding:0 0 0 4px}.star.on{color:#e3a008}
.pct{font-size:11.5px;font-weight:650;padding:0 6px;border-radius:6px;white-space:nowrap}
.pct.lo{color:var(--good);background:var(--goodbg)}.pct.mid{color:var(--warn);background:var(--warnbg)}.pct.hi{color:var(--mute)}
.stats{display:flex;align-items:center;gap:12px;padding:0 14px 10px;color:var(--mute);font-size:12px;flex-wrap:wrap}
.stats svg{display:block}.stats b{color:var(--ink);font-weight:600}
.trend.dn{color:var(--good)}.trend.up{color:var(--acc)}
.target{display:flex;align-items:center;gap:5px}.target input{width:70px;padding:3px 6px;border-radius:7px}
.offers{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}
.offers li{display:grid;grid-template-columns:1fr auto auto;gap:4px 10px;align-items:center;padding:7px 14px;border-bottom:1px solid var(--line)}
.offers li:last-child{border-bottom:none}.offers li.top1{background:color-mix(in srgb,var(--good) 7%,transparent)}
.offers .s{font-weight:550;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.offers .s small{color:var(--mute);font-weight:400}
.offers .p{text-align:right;font-variant-numeric:tabular-nums;font-weight:650;white-space:nowrap}
.offers .x{font-size:11.5px;color:var(--mute);grid-column:1/-1;margin-top:-3px}
.offers .go{text-decoration:none;border:1px solid var(--line);border-radius:8px;padding:2px 8px;font-size:12px;white-space:nowrap}.offers .go:hover{border-color:var(--acc);color:var(--acc)}
.offers li.out{color:var(--off)}.offers li.out .p{font-weight:500}
.more{border:none;background:none;color:var(--mute);cursor:pointer;padding:7px 14px;text-align:left;font:inherit;font-size:12px;border-top:1px solid var(--line)}
.more:hover{color:var(--ink)}
.pc-foot{display:flex;gap:14px;padding:9px 14px;border-top:1px solid var(--line);background:var(--card2);font-size:12px;margin-top:auto}
.pc-foot a,.pc-foot button{color:var(--mute);text-decoration:none;background:none;border:none;cursor:pointer;font:inherit;padding:0}
.pc-foot a:hover,.pc-foot button:hover{color:var(--ink)}
.chartbox{height:220px;padding:10px 14px;border-top:1px solid var(--line)}
.empty{padding:50px 10px;text-align:center;color:var(--mute);grid-column:1/-1}
.toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:10px 16px;border-radius:10px;font-size:13px;opacity:0;transition:opacity .2s;pointer-events:none;z-index:20;max-width:90vw}
.toast.on{opacity:1}
@media (max-width:640px){h1{font-size:20px}.bar{overflow-x:auto;flex-wrap:nowrap;padding-bottom:10px}.bar>*{flex:none}
 input[type=search]{min-width:170px}.best .pr{font-size:18px}.thumb{width:56px;height:56px}.deals{grid-template-columns:repeat(2,1fr)}
 .deals{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:6px}.deal{flex:0 0 62%;scroll-snap-align:start}
 .deal .im{height:80px}.deal .im img{max-height:80px}.deal .pr{font-size:18px}.fhint{text-align:left}
 .pc-head{flex-wrap:wrap;position:relative;padding-right:40px}.ttl{flex:1 1 calc(100% - 70px)}
 .best{flex:1 1 100%;text-align:left;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
 .star{position:absolute;top:12px;right:12px}.offers li{padding:7px 12px}}
</style></head><body><div class="wrap">
<div class="top">
  <div><h1>One Piece TCG – ceny v obchodoch</h1>
  <div class="sub">MSRP = oficiálna cena Bandai v € s 23 % DPH · aktualizované <span id="upd">—</span></div></div>
  <div><a id="fetchBtn" href="#"><span class="spin"></span><span id="fetchLbl">⟳ Fetch nové ceny</span></a><div class="fhint" id="fhint"></div></div>
</div>
<div class="status" id="status"></div>
<div id="log"></div>

<section id="dealsSec"><h2>🔥 Najlepšie ponuky skladom <small>booster boxy najbližšie k MSRP (EN aj JP podľa ich prahu)</small></h2><div class="deals" id="deals"></div></section>

<div class="bar">
  <div class="seg" id="kind"><button data-v="Box" class="on">Boxy</button><button data-v="Pack">Packy</button><button data-v="Double Pack">Double</button><button data-v="Case">Cases</button><button data-v="Starter">Starter decky</button><button data-v="Kolekcie" title="Premium Card Collection, Illustration Box, špeciálne a darčekové sety">Kolekcie</button><button data-v="Ostatné" title="Obaly, albumy, figúrky…">Ostatné</button><button data-v="">Všetko</button></div>
  <div class="seg" id="lang"><button data-v="" class="on">Všetky</button><button data-v="EN">EN</button><button data-v="JP">JP</button><button data-v="CN">Ázia</button></div>
  <select id="set"><option value="">Všetky edície</option></select>
  <input type="number" id="maxp" placeholder="max €" min="0" step="5" title="Maximálna cena">
  <label class="chk"><input type="checkbox" id="stock" checked> skladom</label>
  <label class="chk"><input type="checkbox" id="under"> pod prahom</label>
  <label class="chk" id="pickupLbl"><input type="checkbox" id="pickup"> 📍 osobne BA</label>
  <label class="chk"><input type="checkbox" id="starred"> ⭐ sledované</label>
  <select id="sort"><option value="score">Najlepšie vs MSRP</option><option value="price">Najlacnejšie</option><option value="trend">Najväčší pokles</option><option value="code">Podľa edície</option></select>
  <input type="search" id="q" placeholder="Hľadať (OP09, Emperors…)">
  <button class="btn" id="exportBtn" title="Uloží ⭐ sledované do config.json → upozornenia na Discord">⭐ Export watchlistu</button>
</div>
<div class="count" id="count"></div>
<div class="grid" id="grid"></div>
</div>
<div class="toast" id="toast"></div>
<div style="text-align:center;color:var(--mute);font-size:11px;padding:0 0 24px">verzia __VERSION__</div>
<script>
const P=__PAYLOAD__;
const SHOPS=P.shops, SK=Object.keys(SHOPS), TH=P.th||{EN:30,JP:150};
// offer: [shop,name,code,kind,lang,eur,inStock,url,price,currency,msrp,packs,preorder,ship,cm,img]
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const eur=v=>v==null?"—":v.toLocaleString("sk-SK",{minimumFractionDigits:2,maximumFractionDigits:2})+" €";
const eur0=v=>v==null?"—":v.toLocaleString("sk-SK",{maximumFractionDigits:0})+" €";
const short=n=>n.replace(/^one piece( tcg| card game| cg)?\s*[:\-–]?\s*/i,"");
const pctOf=(v,m)=>m?(v/m-1)*100:null;
const pctCls=(p,lang)=>p==null?"hi":p<=(TH[lang]??30)?"lo":p<=(TH[lang]??30)+40?"mid":"hi";
const pctHtml=(p,lang)=>p==null?"":`<span class="pct ${pctCls(p,lang)}" title="rozdiel oproti MSRP">${p>0?"+":""}${p.toFixed(0)} %</span>`;
const LS=(()=>{try{localStorage.setItem("_t","1");localStorage.removeItem("_t");return localStorage}catch(e){return null}})();
const lsGet=(k,d)=>{try{return JSON.parse(LS.getItem(k))??d}catch(e){return d}}, lsSet=(k,v)=>{try{LS.setItem(k,JSON.stringify(v))}catch(e){}};
const toast=t=>{const el=document.getElementById("toast");el.textContent=t;el.classList.add("on");clearTimeout(toast._t);toast._t=setTimeout(()=>el.classList.remove("on"),2600)};

// ---- skupiny produktov
const keyOf=o=>o[2]?`${o[2]}|${o[3]}|${o[4]}`:`~${o[1].toLowerCase()}|${o[3]}|${o[4]}`;
const G={};
P.offers.forEach(o=>{const k=keyOf(o);const g=G[k]||(G[k]={key:k,code:o[2],kind:o[3],lang:o[4],name:o[1],msrp:null,packs:null,img:null,all:[]});
  g.all.push(o);if(o[10]!=null)g.msrp=o[10];if(o[11]&&!g.packs)g.packs=o[11];if(o[15]&&!g.img)g.img=o[15];});
Object.values(G).forEach(g=>{
  g.inst=g.all.filter(o=>o[6]).sort((a,b)=>a[5]-b[5]);
  g.best=g.inst[0]||null;
  g.pct=g.best&&g.msrp?pctOf(g.best[5],g.msrp):null;
  g.score=g.pct==null?Infinity:g.pct-(TH[g.lang]??50);
  g.pre=g.all.some(o=>o[12]&&!o[6]);
  g.pickup=g.inst.some(o=>P.pickup&&P.pickup[o[0]]);
  // denné minimum za 30 dní (z histórie zmien)
  const DAY=864e5, now=P.updated?new Date(P.updated).getTime():Date.now(), days=30;
  const ev=g.all.map(o=>({o,h:(P.hist[o[7]]||[]).map(x=>[new Date(x[0]).getTime(),x[1],x[2]]).sort((a,b)=>a[0]-b[0])}));
  const series=[];
  for(let d=days-1;d>=0;d--){const end=now-d*DAY;let mn=null;
    ev.forEach(({o,h})=>{let st=null;for(const x of h){if(x[0]<=end)st=x;else break;} if(d===0)st=[now,o[5],o[6]]; if(st&&st[2]&&(mn==null||st[1]<mn))mn=st[1];});
    series.push(mn);}
  g.series=series;
  const vals=series.filter(v=>v!=null);
  g.low30=vals.length?Math.min(...vals):null;
  const wk=series[series.length-8];
  g.trend=(g.best&&wk!=null)?(g.best[5]/wk-1)*100:null;
});
// sledované: localStorage + config.json watchlist
const W=lsGet("op_watch",{});
(P.watch||[]).forEach(w=>{const [c,k,l]=String(w.product||"").trim().split(/\s+/);if(!c)return;
  const key=`${c.toUpperCase()}|${k}|${(l||"EN").toUpperCase()}`; if(!(key in W))W[key]=w.max_eur??null;});
const isHit=g=>g.key in W&&W[g.key]!=null&&g.best&&g.best[5]<=W[g.key];

// ---- sparkline
function spark(arr,msrp){const v=arr.map((x,i)=>[i,x]).filter(p=>p[1]!=null);if(new Set(v.map(p=>p[1])).size<2)return '<span title="graf sa naplní, keď sa cena začne meniť">bez zmeny</span>';
  if(v.length<3)return '<span title="graf sa naplní po pár dňoch">málo dát</span>';
  const w=110,h=26,ys=v.map(p=>p[1]).concat(msrp?[msrp]:[]),mn=Math.min(...ys),mx=Math.max(...ys),rg=mx-mn||1;
  const X=i=>(i/(arr.length-1))*w, Y=y=>h-2-((y-mn)/rg)*(h-4);
  const d=v.map((p,j)=>(j?"L":"M")+X(p[0]).toFixed(1)+" "+Y(p[1]).toFixed(1)).join("");
  const m=msrp?`<line x1="0" x2="${w}" y1="${Y(msrp).toFixed(1)}" y2="${Y(msrp).toFixed(1)}" stroke="currentColor" stroke-dasharray="3 3" opacity=".35"/>`:"";
  const last=v[v.length-1];
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-label="vývoj najnižšej ceny 30 dní">${m}<path d="${d}" fill="none" stroke="var(--acc)" stroke-width="1.6"/><circle cx="${X(last[0])}" cy="${Y(last[1])}" r="2.4" fill="var(--acc)"/></svg>`;}

// ---- stav filtrov
const st=Object.assign({kind:"Box",lang:"",set:"",maxp:null,stock:true,under:false,pickup:false,starred:false,sort:"score",q:""},lsGet("op_filters",{}));
const open=new Set();
function rows(){const q=st.q.toLowerCase();
  const KG={Kolekcie:["Premium","Illustration","Kolekcia"],"Ostatné":["Doplnky","Iné"]};
  let r=Object.values(G).filter(g=>(!st.kind||(KG[st.kind]?KG[st.kind].includes(g.kind):g.kind===st.kind))&&(!st.lang||(st.lang==="CN"?["CN","KR","ASIA"].includes(g.lang):g.lang===st.lang))
    &&(!st.set||g.code===st.set)&&(!st.stock||g.best)&&(!st.maxp||(g.best&&g.best[5]<=st.maxp))
    &&(!st.under||(g.pct!=null&&g.pct<=(TH[g.lang]??30)))&&(!st.pickup||g.pickup)&&(!st.starred||g.key in W)
    &&(!q||(g.code+" "+g.all.map(o=>o[1]).join(" ")).toLowerCase().includes(q)));
  const by={score:(a,b)=>a.score-b.score||(a.best?a.best[5]:1e9)-(b.best?b.best[5]:1e9),
    price:(a,b)=>(a.best?a.best[5]:1e9)-(b.best?b.best[5]:1e9),
    trend:(a,b)=>(a.trend??1e9)-(b.trend??1e9),
    code:(a,b)=>(b.code||"").localeCompare(a.code||"",undefined,{numeric:true})||a.lang.localeCompare(b.lang)};
  return r.sort(by[st.sort]||by.score);}

function offerLi(g,o,i){const p=pctOf(o[5],g.msrp),pk=P.pickup&&P.pickup[o[0]];
  const ship=o[6]&&o[13]!=null?(o[13]===0?"doprava zdarma":`s dopravou ${eur(o[5]+o[13])}`):"";
  const extra=[o[9]!=="EUR"?`${Math.round(o[8]).toLocaleString("sk-SK")} Kč`:"",ship,pk?"📍 "+pk:"",o[12]&&!o[6]?"🕒 predobjednávka":""].filter(Boolean).join(" · ");
  return `<li class="${o[6]?"":"out"} ${o[6]&&i===0?"top1":""}"><span class="s">${esc(SHOPS[o[0]]||o[0])} <small title="${esc(o[1])}">${o[6]?"":o[12]?"· predobjednávka":"· vypredané"}</small></span>
    <span class="p">${eur(o[5])} ${o[6]?pctHtml(p,g.lang):""}</span><a class="go" href="${esc(o[7])}" target="_blank" rel="noopener">Otvoriť ↗</a>${extra?`<span class="x">${esc(extra)}</span>`:""}</li>`;}

function card(g){const b=g.best,tgt=W[g.key],starred=g.key in W,hit=isHit(g);
  const out=g.all.filter(o=>!o[6]).sort((a,b)=>(b[12]-a[12])||a[5]-b[5]);
  const showOut=open.has(g.key);
  const img=g.img?`<img src="${esc(g.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${esc(g.code||"OP")}'}))">`:`<span>${esc(g.code||"OP")}</span>`;
  const tr=g.trend==null||Math.abs(g.trend)<1?"":`<span class="trend ${g.trend<0?"dn":"up"}" title="oproti pred 7 dňami">${g.trend<0?"▼":"▲"} ${Math.abs(g.trend).toFixed(0)} % / 7 dní</span>`;
  return `<article class="pc ${hit?"hit":""}" data-k="${esc(g.key)}">
  <div class="pc-head"><div class="thumb">${img}</div>
    <div class="ttl"><div>${g.code?`<span class="tag">${esc(g.code)}</span>`:""}<span class="tag">${esc(g.lang)}</span><span class="tag">${esc(({Premium:"Premium Collection",Illustration:"Illustration Box",Kolekcia:"Kolekcia / set",Doplnky:"Doplnok"})[g.kind]||g.kind)}</span>${g.pre?'<span class="tag pre">predobjednávka</span>':""}${hit?'<span class="tag hit">🎯 pod cieľom</span>':""}</div>
      <div class="nm" title="${esc(g.name)}">${esc(short(g.name))}</div>
      ${g.msrp?`<div class="meta">MSRP ${eur(g.msrp)}${g.packs?` · ${eur(g.msrp/g.packs)}/bal.`:""}</div>`:""}</div>
    <div class="best">${b?`<div class="pr">${eur(b[5])}</div><div>${pctHtml(g.pct,g.lang)}</div><div class="shop">${esc(SHOPS[b[0]]||b[0])}${g.packs?` · ${eur(b[5]/g.packs)}/bal.`:""}</div>`:'<div class="none">nie je skladom</div>'}</div>
    <button class="star ${starred?"on":""}" data-star="${esc(g.key)}" title="${starred?"Prestať sledovať":"Sledovať"}">${starred?"★":"☆"}</button></div>
  <div class="stats"><span>30 dní min <b>${eur(g.low30)}</b></span>${spark(g.series,g.msrp)}${tr}
    ${starred?`<span class="target">🎯 cieľ <input type="number" min="0" step="5" value="${tgt??""}" data-tgt="${esc(g.key)}" placeholder="€"></span>`:""}</div>
  <ul class="offers">${g.inst.map((o,i)=>offerLi(g,o,i)).join("")}${showOut?out.map(o=>offerLi(g,o,99)).join(""):""}</ul>
  ${out.length?`<button class="more" data-more="${esc(g.key)}">${showOut?"▲ skryť nedostupné":`▼ ${out.length} nedostupné (${out.some(o=>o[12])?"vrátane predobjednávok":"vypredané"})`}</button>`:""}
  <div class="pc-foot"><a href="${esc(g.all[0][14])}" target="_blank" rel="noopener">Cardmarket ↗</a><button data-chart="${esc(g.key)}">📈 Graf</button></div></article>`;}

function deals(){const top=Object.values(G).filter(g=>g.kind==="Box"&&g.best&&g.msrp&&g.pct>-60&&["EN","JP"].includes(g.lang)).sort((a,b)=>a.score-b.score).slice(0,6);
  document.getElementById("dealsSec").style.display=top.length?"":"none";
  document.getElementById("deals").innerHTML=top.map((g,i)=>`<a class="deal" href="${esc(g.best[7])}" target="_blank" rel="noopener"><span class="rank">#${i+1}</span>
    <div class="im">${g.img?`<img src="${esc(g.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`:""}</div>
    <div>${g.code?`<span class="tag">${esc(g.code)}</span>`:""}<span class="tag">${esc(g.lang)}</span><span class="tag">Box</span></div>
    <div class="pr">${eur0(g.best[5])} ${pctHtml(g.pct,g.lang)}</div>
    <div class="shop">${esc(SHOPS[g.best[0]]||g.best[0])}${g.low30!=null&&g.best[5]<=g.low30?" · 🏷️ najnižšia za 30 dní":""}</div></a>`).join("");}

function draw(){lsSet("op_filters",st);Object.keys(charts).forEach(k=>{try{charts[k].c.destroy()}catch(e){}delete charts[k]});const R=rows();
  document.getElementById("count").textContent=`${R.length} produktov · ${R.reduce((n,g)=>n+g.inst.length,0)} ponúk skladom`;
  document.getElementById("grid").innerHTML=R.map(card).join("")||`<div class="empty">${P.offers.length?"Nič nevyhovuje filtru.":"Zatiaľ žiadne dáta – klikni Fetch nové ceny."}</div>`;}

// ---- graf v karte
const charts={};
function toggleChart(k,art){if(charts[k]){charts[k].c.destroy();charts[k].el.remove();delete charts[k];return;}
  const g=G[k],box=document.createElement("div");box.className="chartbox";box.innerHTML="<canvas></canvas>";art.querySelector(".pc-foot").before(box);
  const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const T=[...new Set(g.all.flatMap(o=>(P.hist[o[7]]||[]).map(h=>h[0])).concat(P.updated?[P.updated]:[]))].sort();
  const pal=["#c8102e","#1f6feb","#d29922","#2da44e","#8250df","#0a7ea4","#bf3989","#6e7781","#e16f24","#3fb950"];
  const ds=[...new Set(g.all.map(o=>o[0]))].map((s,i)=>{const offs=g.all.filter(o=>o[0]===s);
    const data=T.map(t=>{const vs=offs.map(o=>{const h=(P.hist[o[7]]||[]).filter(x=>x[0]<=t).sort((a,b)=>a[0]<b[0]?-1:1).pop();
      const cur=t===P.updated?[t,o[5],o[6]]:h;return cur&&cur[2]?cur[1]:null}).filter(v=>v!=null);return vs.length?Math.min(...vs):null;});
    return {label:SHOPS[s]||s,data,borderColor:pal[i%pal.length],backgroundColor:pal[i%pal.length],stepped:true,pointRadius:T.length>30?0:2.5};});
  if(g.msrp)ds.push({label:"MSRP",data:T.map(()=>g.msrp),borderColor:css("--mute"),borderDash:[6,4],pointRadius:0,borderWidth:1.2});
  if(typeof Chart==="undefined"){box.textContent="Graf sa nenačítal (offline).";charts[k]={c:{destroy(){}},el:box};return;}
  const c=new Chart(box.querySelector("canvas"),{type:"line",data:{labels:T.map(t=>new Date(t).toLocaleString("sk-SK",{day:"numeric",month:"numeric",hour:"2-digit",minute:"2-digit"})),datasets:ds},
    options:{maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{labels:{color:css("--ink"),boxWidth:12}},tooltip:{callbacks:{label:c=>c.dataset.label+": "+(c.raw==null?"nedostupné":eur(c.raw))}}},
    scales:{x:{grid:{color:css("--line")},ticks:{color:css("--mute"),maxRotation:0,autoSkip:true}},y:{grid:{color:css("--line")},ticks:{color:css("--mute"),callback:v=>eur0(v)}}}}});
  charts[k]={c,el:box};}

// ---- udalosti
const grid=document.getElementById("grid");
grid.addEventListener("click",e=>{const t=e.target.closest("[data-star],[data-more],[data-chart]");if(!t)return;
  if(t.dataset.star!=null){const k=t.dataset.star;if(k in W){delete W[k];toast("Odstránené zo sledovaných");}else{W[k]=G[k].best?Math.floor(G[k].best[5]*0.9/5)*5:null;toast("Sledované ⭐ – nastav cieľovú cenu a daj Export watchlistu");}lsSet("op_watch",W);draw();}
  else if(t.dataset.more!=null){const k=t.dataset.more;open.has(k)?open.delete(k):open.add(k);draw();}
  else if(t.dataset.chart!=null){toggleChart(t.dataset.chart,t.closest(".pc"));}});
grid.addEventListener("change",e=>{const t=e.target.closest("[data-tgt]");if(!t)return;W[t.dataset.tgt]=t.value?Number(t.value):null;lsSet("op_watch",W);draw();});
const seg=id=>document.querySelectorAll(`#${id} button`).forEach(b=>{b.classList.toggle("on",b.dataset.v===st[id]);b.onclick=()=>{document.querySelectorAll(`#${id} button`).forEach(x=>x.classList.remove("on"));b.classList.add("on");st[id]=b.dataset.v;draw();};});
seg("kind");seg("lang");
const sets=[...new Set(Object.values(G).map(g=>g.code).filter(Boolean))].sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
const selSet=document.getElementById("set");selSet.innerHTML+=sets.map(c=>`<option>${c}</option>`).join("");
const bind=(id,prop,key="value",conv=v=>v)=>{const el=document.getElementById(id);el[key]=st[prop]??(key==="checked"?false:"");el.addEventListener(key==="checked"?"change":"input",()=>{st[prop]=conv(el[key]);draw();});};
bind("set","set");bind("maxp","maxp","value",v=>v?Number(v):null);bind("sort","sort");bind("q","q");
["stock","under","pickup","starred"].forEach(k=>bind(k,k,"checked"));
if(!Object.keys(P.pickup||{}).length)document.getElementById("pickupLbl").style.display="none";
document.getElementById("exportBtn").onclick=async()=>{
  const list=Object.entries(W).filter(([k])=>!k.startsWith("~")).map(([k,v])=>{const [c,kd,l]=k.split("|");return {product:`${c} ${kd} ${l}`,max_eur:v??0};});
  if(!list.length){toast("Najprv označ produkty hviezdičkou ☆");return;}
  const txt='"watchlist": '+JSON.stringify(list,null,2);
  try{await navigator.clipboard.writeText(txt);toast("Skopírované – na GitHube nahraď časť \"watchlist\" v config.json");}catch(e){prompt("Skopíruj a vlož do config.json:",txt);}
  if(P.repo)setTimeout(()=>window.open(`https://github.com/${P.repo}/edit/main/config.json`,"_blank"),600);};

// ---- stav obchodov
const fmt=t=>t?new Date(t).toLocaleString("sk-SK",{day:"numeric",month:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
document.getElementById("upd").textContent=fmt(P.updated);
document.getElementById("status").innerHTML=SK.map(s=>{const x=P.status[s];if(!x)return `<span>${esc(SHOPS[s])}: zatiaľ nič</span>`;
  const old=x.ts&&(Date.now()-new Date(x.ts))>36e5*24;
  if(!x.ok)return `<span class="bad" title="${esc(x.error||"")}">⚠ ${esc(SHOPS[s])} (dáta z ${fmt(x.ts)})</span>`;
  return `<span class="${old?"bad":""}" title="${x.pc?"sťahuje sa pri spustení na PC":"sťahuje sa automaticky každé 2 h"}">${old?"⚠":"✔"} ${esc(SHOPS[s])}${x.pc?` · PC ${fmt(x.ts)}`:""}</span>`}).join("")
  +(P.links.length?`<span>Bez sťahovania:${P.links.map(l=>`<a class="ext" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join("")}</span>`:"");

// ---- Fetch: lokálny server → API; GitHub Pages → workflow
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
    fh.textContent="Otvorí GitHub → „Run workflow“. Automaticky každé 2 h.";return;}
  fh.textContent="Spusti: python onepiece_ceny.py";btn.style.opacity=.5;})();
btn.onclick=async e=>{if(mode==="gh")return;e.preventDefault();if(mode!=="local")return;
  btn.setAttribute("disabled","");lbl.textContent="Sťahujem…";logEl.classList.add("on");logEl.textContent="Spúšťam…";
  try{await fetch("/api/fetch",{method:"POST"});}catch(e){} poll();};
deals();draw();
</script></body></html>"""

if __name__ == "__main__":
    main()
