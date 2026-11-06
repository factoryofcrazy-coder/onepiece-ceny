#!/usr/bin/env python3
"""Týždenné zistenie cien kariet PSA, Beckett (BGS) a CGC z predajov na eBay cez Apify.

Spúšťa .github/workflows/graded.yml:
  python3 tools/graded_prices.py --cards docs/data/cards.json
Prostredie:
  APIFY_TOKEN           – bez neho sa krok preskočí
  SUPABASE_SERVICE_KEY  – service_role kľúč
  DISCORD_WEBHOOK_URL   – správa pri zlyhaní
  GRADED_CARDS          – koľko kódov za beh (predvolene 12)
  GRADED_BUDGET_USD     – strop za beh (predvolene 1); bezplatný kredit Apify je 5 USD mesačne
Jeden kód pokryje všetky jeho verzie, predaje sa rozdelia podľa názvu inzerátu.
"""
import argparse, datetime, json, os, re, statistics, sys, urllib.request

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://wpmarrzqzcfugtfjitot.supabase.co")
ACTOR = "compsapi~ebay-card-comps"
BATCH = 5  # synchrónne volanie Apify skončí po 300 s, preto po malých dávkach
MAX_SALES = 15  # na kód a firmu; pri 2,25 USD za 1 000 záznamov je to najviac asi 0,10 USD za kód
# Známky, ktoré sa dajú bežne dosiahnuť a predávajú sa. Každá firma zvlášť, inak by predaje PSA vytlačili ostatné.
GRADES = {"PSA": ["10", "9"], "BGS": ["10", "9.5", "9"], "CGC": ["10", "9.5", "9"]}
# Black Label a Pristine sú oveľa drahšie než bežná desiatka, v jednom mediáne by klamali.
TOP_LABEL = re.compile(r"\b(black\s*label|pristine|perfect)\b", re.I)
OTHER_LANG = re.compile(r"\b(japanese|japan|jpn|jp|chinese|korean)\b", re.I)
MANGA = re.compile(r"\b(manga|comic)\b", re.I)
ALT = re.compile(r"\b(parallel|alt(ernate)?[ -]?art|aa)\b", re.I)


def title_kind(title):
    if MANGA.search(title):
        return "manga"
    return "alt" if ALT.search(title) else "base"


def variant_kind(card):
    """Druh verzie, ktorý vieme z názvu inzerátu spoľahlivo určiť. None = radšej bez ceny než s cenou inej verzie."""
    v = card.get("v") or ""
    if not v:
        return "base"
    if "Manga" in v:
        return "manga"
    if v in ("Parallel", "Alternate Art"):
        return "alt"
    return None


def quantile(values, q):
    s = sorted(values)
    return s[min(len(s) - 1, int(q * len(s)))]


def build_rows(code, variants, sales):
    """Riadky pre databázu z predajov jedného kódu, v centoch USD, po verziách, firmách a známkach."""
    by_kind = {}
    for s in sales:
        title = s.get("title") or ""
        price, grade, grader = s.get("price"), s.get("grade"), s.get("grader")
        if not s.get("graded") or not price or grade is None or grader not in GRADES:
            continue
        if code.lower() not in title.lower() or OTHER_LANG.search(title) or TOP_LABEL.search(title):
            continue
        try:
            g = float(grade)
        except (TypeError, ValueError):
            continue
        by_kind.setdefault((title_kind(title), grader, g), []).append(s)
    rows = []
    for card in variants:
        kind = variant_kind(card)
        if kind is None:
            continue
        for (k, grader, g), group in by_kind.items():
            if k != kind:
                continue
            cents = [round(float(x["price"]) * 100) for x in group]
            dates = [str(x["last_sold"])[:10] for x in group if x.get("last_sold")]
            rows.append({
                "card": card["id"], "grader": grader, "grade": g, "median": round(statistics.median(cents)),
                "p25": quantile(cents, 0.25), "p75": quantile(cents, 0.75), "sales": len(cents),
                "last_sold": max(dates) if dates else None,
            })
    return rows


def post(url, body, headers, timeout):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", **headers})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
    return json.loads(raw) if raw else None


def rpc(name, body, key):
    return post(f"{SUPABASE_URL}/rest/v1/rpc/{name}", body, {"apikey": key, "Authorization": f"Bearer {key}"}, 60)


def fetch_sales(codes, token, charge, grader):
    url = f"https://api.apify.com/v2/acts/{ACTOR}/run-sync-get-dataset-items?maxTotalChargeUsd={charge:.2f}&timeout=280"
    body = {"cards": codes, "graded": "graded", "graders": [grader], "grades": GRADES[grader], "days": 180, "maxResults": MAX_SALES, "maxPages": 2, "language": "any", "matchAllWords": True, "keepJunk": False}
    return post(url, body, {"Authorization": f"Bearer {token}"}, 295) or []


def discord(text):
    url = os.environ.get("DISCORD_WEBHOOK_URL", "").strip()
    print(text)
    if url:
        post(url, {"content": text, "allowed_mentions": {"parse": []}}, {"User-Agent": "DiscordBot (https://github.com/factoryofcrazy-coder/onepiece-ceny, 1.0)"}, 20)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cards", required=True)
    a = ap.parse_args()
    token = os.environ.get("APIFY_TOKEN", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    if not token or not key:
        print("APIFY_TOKEN alebo SUPABASE_SERVICE_KEY chýba, preskakujem")
        return 0
    limit = int(os.environ.get("GRADED_CARDS", "12"))
    budget = float(os.environ.get("GRADED_BUDGET_USD", "1"))
    today = datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    try:
        with open(a.cards, encoding="utf-8") as f:
            cards = json.load(f)["cards"]
        by_code = {}
        for c in cards:
            if not c["id"].startswith("pk:"):
                by_code.setdefault(c["code"], []).append(c)
        codes = [r["code"] for r in rpc("graded_candidates", {"p_limit": limit}, key)]
        codes = [c for c in codes if c in by_code]
        batches = [codes[i:i + BATCH] for i in range(0, len(codes), BATCH)]
        saved = 0
        for batch in batches:
            sales = []
            for grader in GRADES:
                sales += fetch_sales(batch, token, budget / (len(batches) * len(GRADES)), grader)
            rows = []
            for code in batch:
                rows += build_rows(code, by_code[code], [s for s in sales if s.get("search") == code])
            # po každej dávke, nech sa pri výpadku nestratí, čo už je zaplatené
            saved += rpc("record_graded_prices", {"p_day": today, "p_codes": batch, "p_rows": rows}, key)
        print(f"kódov {len(codes)}, uložených cien {saved}")
    except Exception as e:
        print(f"chyba: {e}", file=sys.stderr)
        try:
            discord("**Ceny hodnotených kariet:** dnešné zisťovanie zlyhalo, pozri log úlohy.")
        except Exception as e2:
            print(f"Discord: {e2}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
