#!/usr/bin/env python3
"""Denný report zbierky na Discord: hodnota podľa Cardmarketu, zmena oproti predchádzajúcej
databáze kariet, 5 kariet najviac hore a 5 najviac dole.

Spúšťa GitHub Action cards.yml po zostavení novej databázy kariet:
  python3 tools/collection_report.py --old /tmp/cards-old.json --new docs/data/cards.json
Prostredie:
  SUPABASE_SERVICE_KEY  – service_role kľúč (číta zbierku; GitHub secret) – bez neho sa report preskočí
  DISCORD_WEBHOOK_URL   – webhook (ten istý ako pre ceny boxov)
  REPORT_USERS          – používateľské mená oddelené čiarkou (predvolene „hobo“)
  SUPABASE_URL          – predvolene projekt onepiece-tracker
Cena karty = Cardmarket trend (EN); keď chýba, TCGplayer prepočítaný na EUR (rovnako ako na webe).
"""
import argparse, json, os, sys, urllib.parse, urllib.request

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://wpmarrzqzcfugtfjitot.supabase.co")
SITE = "https://grand-line-tracker-gilt.vercel.app"
USD_EUR = 1.12


def price(c):
    if not c:
        return None
    if c.get("cm") is not None:
        return float(c["cm"])
    return float(c["usd"]) / USD_EUR if c.get("usd") is not None else None


def sb(path, key):
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{path}", headers={"apikey": key, "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def collection(username, key):
    prof = sb(f"profiles?select=id,username&username=eq.{urllib.parse.quote(username)}", key)
    if not prof:
        return None
    uid, out, start = prof[0]["id"], {}, 0
    while True:
        rows = sb(f"collection?select=card_id,qty&user_id=eq.{uid}&qty=gt.0&order=card_id&offset={start}&limit=1000", key)
        for r in rows:
            out[r["card_id"]] = r["qty"]
        if len(rows) < 1000:
            return out
        start += 1000


def eur(v, sign=False):
    s = f"{abs(v):,.2f}".replace(",", " ").replace(".", ",") + " €"
    return ("+" if v >= 0 else "−") + s if sign else s


def report(username, qty, old, new):
    rows, v_old, v_new, priced = [], 0.0, 0.0, 0
    for cid, n in qty.items():
        if cid.startswith("pk:"):
            continue                                  # Pokémon karty majú vlastné ceny (TCGdex)
        a, b = price(old.get(cid)), price(new.get(cid))
        if b is None:
            continue
        priced += 1
        v_new += b * n
        v_old += (a if a is not None else b) * n
        if a is not None and abs(b - a) >= 0.01:
            rows.append((round((b - a) * n, 2), cid, n, a, b))
    if not priced:
        return None
    diff = v_new - v_old
    pct = diff / v_old * 100 if v_old else 0
    up = sorted([r for r in rows if r[0] > 0], key=lambda r: -r[0])[:5]
    down = sorted([r for r in rows if r[0] < 0], key=lambda r: r[0])[:5]

    def line(r):
        d, cid, n, a, b = r
        c = new.get(cid, {})
        name = c.get("name", cid) + (f" ({c['v']})" if c.get("v") else "")
        k = f" ×{n}" if n > 1 else ""
        return f"**{name}** `{cid}`{k}\n{eur(a)} → {eur(b)} · **{eur(d, True)}**"

    pct_s = ("+" if pct >= 0 else "−") + f"{abs(pct):.1f}".replace(".", ",") + " %"
    arrow = "📈" if diff > 0.005 else "📉" if diff < -0.005 else "➖"
    fields = []
    if up:
        fields.append({"name": "🟢 Najviac stúpli", "value": "\n".join(map(line, up))[:1024], "inline": False})
    if down:
        fields.append({"name": "🔴 Najviac klesli", "value": "\n".join(map(line, down))[:1024], "inline": False})
    if not fields:
        fields.append({"name": "Bez zmeny", "value": "Ceny kariet v zbierke sa od včera nezmenili.", "inline": False})
    return {
        "title": f"{arrow} Zbierka {username}: {eur(v_new)}",
        "url": f"{SITE}/zbierka",
        "description": f"Zmena za deň: **{eur(diff, True)}** ({pct_s}) · {priced} rôznych kariet s cenou",
        "color": 0x2DA44E if diff > 0.005 else 0xCF222E if diff < -0.005 else 0x8AA0B8,
        "fields": fields,
        "footer": {"text": "Cardmarket trend (kde chýba, TCGplayer) · Grand Line Tracker"},
    }


def send(webhook, embeds, content=None):
    body = {"username": "One Piece zbierka", "embeds": embeds}
    if content:
        body["content"] = content
    req = urllib.request.Request(webhook + ("&" if "?" in webhook else "?") + "wait=true", data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "User-Agent": "DiscordBot (https://github.com/factoryofcrazy-coder/onepiece-ceny, 1.0)"})
    urllib.request.urlopen(req, timeout=20).read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--old", required=True)
    ap.add_argument("--new", required=True)
    ap.add_argument("--dry-run", action="store_true", help="len vypísať, neposielať")
    ap.add_argument("--qty-json", help="zbierka zo súboru {card_id: qty} (test bez Supabase)")
    ap.add_argument("--content", help="text nad správou (napr. TEST)")
    a = ap.parse_args()
    key, webhook = os.environ.get("SUPABASE_SERVICE_KEY", ""), os.environ.get("DISCORD_WEBHOOK_URL", "")
    if not os.path.exists(a.old):
        print("predchádzajúca databáza kariet chýba – report preskočený"); return 0
    old_d, new_d = json.load(open(a.old)), json.load(open(a.new))
    if old_d.get("updated") == new_d.get("updated"):
        print("databáza sa nezmenila – report preskočený"); return 0
    old = {c["id"]: c for c in old_d["cards"]}
    new = {c["id"]: c for c in new_d["cards"]}
    users = [u.strip() for u in os.environ.get("REPORT_USERS", "hobo").split(",") if u.strip()]
    if not a.qty_json and not key:
        print("SUPABASE_SERVICE_KEY nie je nastavený – report zbierky preskočený"); return 0
    embeds = []
    for u in users:
        qty = json.load(open(a.qty_json)) if a.qty_json else collection(u, key)
        if not qty:
            print(f"{u}: zbierka je prázdna alebo používateľ neexistuje"); continue
        e = report(u, qty, old, new)
        if e:
            embeds.append(e)
    if not embeds:
        return 0
    if a.dry_run or not webhook:
        print(json.dumps(embeds, ensure_ascii=False, indent=1)); return 0
    send(webhook, embeds[:10], a.content)
    print(f"report odoslaný (zbierky: {len(embeds)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
