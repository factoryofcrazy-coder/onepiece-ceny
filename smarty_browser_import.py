#!/usr/bin/env python3
"""Human-verified Smarty.sk HTML importer for onepiece_ceny.py.

Opens a normal visible Chromium window. If Smarty shows a Cloudflare check,
the user must complete it manually. It does not attempt to bypass challenges.
Rendered product pages are saved to ./import/ for the existing scraper parser.
"""
from __future__ import annotations

import argparse
import importlib.util
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlencode, urlsplit, urlunsplit, parse_qsl

HERE = Path(__file__).resolve().parent
DEFAULT_URL = "https://www.smarty.sk/Vyhladavanie/one-piece-karty?query=one%20piece%20tcg"
IMPORT_DIR = HERE / "import"


def load_parser():
    candidates = [HERE / "onepiece_ceny.py", HERE / "onepiece_ceny_fixed.py"]
    script = next((p for p in candidates if p.exists()), None)
    if script is None:
        raise RuntimeError("Nenašiel som onepiece_ceny.py ani onepiece_ceny_fixed.py v tomto priečinku.")
    spec = importlib.util.spec_from_file_location("onepiece_price_parser", script)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Neviem načítať parser zo súboru {script.name}.")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module.parse_smarty


def page_url(base_url: str, page_no: int) -> str:
    parts = urlsplit(base_url)
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k != "pg"]
    query.append(("pg", str(page_no)))
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def challenge_still_visible(page, response) -> bool:
    try:
        headers = response.headers if response else {}
        if str(headers.get("cf-mitigated", "")).lower() == "challenge":
            return True
        title = page.title().lower()
        body = page.locator("body").inner_text(timeout=4000).lower()
    except Exception:
        return True
    markers = (
        "checking your browser", "just a moment", "verify you are human",
        "performing security verification", "please wait while we verify",
        "attention required! | cloudflare", "enable javascript and cookies to continue",
    )
    return any(m in title or m in body[:8000] for m in markers)


def main() -> int:
    ap = argparse.ArgumentParser(description="Uloží produkty Smarty.sk po ručnom overení stránky.")
    ap.add_argument("--url", default=DEFAULT_URL, help="URL kategórie Smarty.sk")
    ap.add_argument("--max-pages", type=int, default=15, help="Maximum stránok (predvolene 15)")
    args = ap.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Chýba Playwright. Nainštaluj ho príkazmi:\n  python -m pip install playwright\n  python -m playwright install chromium")
        return 2

    try:
        parse_smarty = load_parser()
    except Exception as exc:
        print(f"Chyba parsera: {exc}")
        return 2

    IMPORT_DIR.mkdir(parents=True, exist_ok=True)
    saved_total = 0
    seen_urls: set[str] = set()

    print("Otváram normálne okno Chromium. Ak sa zobrazí overenie Smarty/Cloudflare, dokonči ho ručne v tomto okne.")
    print("Keď bude viditeľný zoznam produktov s cenami, vráť sa sem a stlač Enter.")
    print("Ak stránka prístup neudelí alebo overenie zostane zobrazené, skript sa zastaví.")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(locale="sk-SK", timezone_id="Europe/Bratislava")
        page = context.new_page()
        page.set_default_timeout(15000)
        try:
            response = page.goto(args.url, wait_until="domcontentloaded", timeout=60000)
            try:
                page.wait_for_load_state("networkidle", timeout=12000)
            except Exception:
                pass
            input("Po dokončení prípadného overenia a zobrazení produktov stlač Enter… ")
            page.wait_for_timeout(1200)

            for page_no in range(1, max(1, args.max_pages) + 1):
                target = page_url(args.url, page_no)
                if page_no > 1:
                    response = page.goto(target, wait_until="domcontentloaded", timeout=60000)
                    try:
                        page.wait_for_load_state("networkidle", timeout=10000)
                    except Exception:
                        pass
                    page.wait_for_timeout(1000)
                    if challenge_still_visible(page, response):
                        input(f"Smarty znovu žiada overenie na strane {page_no}. Dokonči ho v okne a stlač Enter… ")
                        page.wait_for_timeout(1200)

                if challenge_still_visible(page, response):
                    print("Stále je zobrazené overenie/403. Túto stránku neukladám. Požiadaj Smarty o povolenie IP alebo API/feed.")
                    break

                final_url = page.url
                content = page.content()
                items = parse_smarty(content, final_url)
                new_items = [i for i in items if i.get("url") and i["url"] not in seen_urls]
                for i in items:
                    if i.get("url"):
                        seen_urls.add(i["url"])

                if not items:
                    print(f"Strana {page_no}: parser nenašiel produkty s cenou; končím stránkovanie.")
                    break

                out = IMPORT_DIR / f"smarty_page_{page_no:02d}.html"
                out.write_text(content, encoding="utf-8")
                saved_total += len(new_items)
                print(f"Strana {page_no}: rozpoznaných {len(items)} produktov, {len(new_items)} nových; uložené {out.relative_to(HERE)}")

                # Ak URL nesprístupňuje skutočné stránkovanie, ďalšia strana sa často zopakuje.
                if page_no > 1 and not new_items:
                    print("Žiadne nové produkty na ďalšej strane; končím.")
                    break
                time.sleep(1.5)
        finally:
            context.close()
            browser.close()

    if saved_total:
        print(f"\nHotovo: približne {saved_total} unikátnych produktov v HTML súboroch priečinka import/.")
        print("Ceny sa načítajú pri ďalšom spustení: spustit.bat alebo")
        print("  python onepiece_ceny.py --only smarty --once --no-browser")
        return 0
    print("\nNenašli sa žiadne produkty. HTML sa neuložilo ako úspešný zber; over URL alebo si vypýtaj prístup cez API/XML feed.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
