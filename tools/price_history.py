#!/usr/bin/env python3
"""Denné uloženie cien kariet do Supabase a kontrola naplnenia databázy.

Spúšťa GitHub Action cards.yml po zostavení databázy kariet:
  python3 tools/price_history.py --cards docs/data/cards.json
Prostredie:
  SUPABASE_SERVICE_KEY  – service_role kľúč (GitHub secret) – bez neho sa krok preskočí
  DISCORD_WEBHOOK_URL   – kam ísť upozornenia; bez neho sa len vypíšu
  SUPABASE_URL          – predvolene projekt onepiece-tracker
Na Discord ide správa pri prekročení hranice naplnenia, v pondelok krátky prehľad a pri zlyhaní, lebo vynechaný deň sa už nedá doplniť.
"""
import argparse, datetime, json, os, sys, urllib.request

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://wpmarrzqzcfugtfjitot.supabase.co")


def cents(v):
    return None if v is None else round(float(v) * 100)


def rows_from(cards):
    """One Piece karty s cenami v centoch; Pokémon má vlastné ceny a sem nepatrí."""
    return [
        {"id": c["id"], "cm": cents(c.get("cm")), "low": cents(c.get("cmLow")), "jp": cents(c.get("cmJp")), "usd": cents(c.get("usd"))}
        for c in cards
        if not c["id"].startswith("pk:")
    ]


def mb(b):
    return f"{b / 1e6:.0f} MB"


def usage_text(u):
    """Text o naplnení bez názvov tabuliek a údajov o používateľoch."""
    s = f"Databáza: {mb(u['bytes'])} z {mb(u['limit'])} ({str(u['pct']).replace('.', ',')} %), z toho história cien {mb(u['history_bytes'])}."
    w = u.get("per_week")
    if w:
        left = (u["limit"] - u["bytes"]) / w
        s += f" Tempo {w / 1e6:.1f} MB za týždeň, limit približne o {left:.0f} týždňov.".replace(".", ",", 1)
    return s


def messages(u, today):
    out = []
    if u["alert"]:
        out.append(f"**Pozor, databáza prekročila {u['level']} %.** {usage_text(u)} Po prekročení limitu sa prepne len na čítanie.")
    elif today.weekday() == 0:
        out.append(usage_text(u))
    return out


def rpc(name, body, key):
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/rpc/{name}",
        data=json.dumps(body).encode(),
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def discord(text):
    url = os.environ.get("DISCORD_WEBHOOK_URL", "").strip()
    print(text)
    if not url:
        return
    req = urllib.request.Request(
        url,
        data=json.dumps({"content": text, "allowed_mentions": {"parse": []}}).encode(),
        headers={"Content-Type": "application/json", "User-Agent": "DiscordBot (https://github.com/factoryofcrazy-coder/onepiece-ceny, 1.0)"},
    )
    urllib.request.urlopen(req, timeout=20).read()


def fetch_spy():
    """Denné zatváracie kurzy SPY (S&P 500 ETF) za 3 mesiace z Yahoo Finance, bez kľúča."""
    req = urllib.request.Request(
        "https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=3mo&interval=1d",
        headers={"User-Agent": "Mozilla/5.0"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.load(r)
    res = d["chart"]["result"][0]
    ts, cl = res["timestamp"], res["indicators"]["quote"][0]["close"]
    return [
        {"day": datetime.datetime.fromtimestamp(t, datetime.timezone.utc).date().isoformat(), "close": round(c, 2)}
        for t, c in zip(ts, cl)
        if c is not None
    ]


def market_index(cards, sealed):
    """Priemerná trend cena koša v eurách: karty od 1 € a zapečatené boxy/startery. Index so základom 1000 počíta web."""
    vals = [c["cm"] for c in cards if not c["id"].startswith("pk:") and c.get("cm") and c["cm"] >= 1]
    vals += [s["cm"] for s in sealed if s.get("cm") and s.get("lang") == "EN" and s.get("kind") in ("Box", "Starter", "Premium")]
    if not vals:
        return None
    return {"value": round(sum(vals) / len(vals), 2), "items": len(vals)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cards", required=True)
    ap.add_argument("--sealed")
    a = ap.parse_args()
    key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    if not key:
        print("SUPABASE_SERVICE_KEY chýba, preskakujem")
        return 0
    today = datetime.datetime.now(datetime.timezone.utc).date()
    try:
        with open(a.cards, encoding="utf-8") as f:
            rows = rows_from(json.load(f)["cards"])
        res = rpc("record_card_prices", {"p_day": today.isoformat(), "p_rows": rows}, key)
        print(f"ceny: prijatých {res['received']}, zmenených {res['changed']}")
        for m in messages(rpc("db_usage_check", {}, key), today):
            discord(m)
    except Exception as e:
        print(f"chyba: {e}", file=sys.stderr)
        try:
            discord("**História cien:** dnešné uloženie alebo kontrola databázy zlyhali, pozri log úlohy Databáza kariet.")
        except Exception as e2:
            print(f"Discord: {e2}", file=sys.stderr)
        return 1
    # trhový index – zlyhanie nezhodí uloženie cien
    try:
        if a.sealed:
            with open(a.cards, encoding="utf-8") as f:
                cards = json.load(f)["cards"]
            with open(a.sealed, encoding="utf-8") as f:
                sealed = json.load(f).get("sealed", [])
            mi = market_index(cards, sealed)
            if mi:
                rpc("record_market_index", {"p_day": today.isoformat(), "p_value": mi["value"], "p_items": mi["items"]}, key)
                print(f"index: {mi['value']} € priemer, {mi['items']} položiek")
            spy = fetch_spy()
            if spy:
                rpc("record_spy", {"p_rows": spy}, key)
                print(f"SPY: {len(spy)} dní, posledný {spy[-1]['close']}")
    except Exception as e:
        print(f"index/SPY zlyhal (nekritické): {e}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
