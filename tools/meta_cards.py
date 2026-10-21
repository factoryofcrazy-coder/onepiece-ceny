"""Stiahne turnajové top decky (z /api/meta webu) a údaje všetkých ich kariet (z /api/cards)
do web/lib/engine/meta-data.json – podklad pre skripty efektov a testy enginu."""
import json, urllib.request

SITE = "https://grand-line-tracker-gilt.vercel.app"

def get(path):
    req = urllib.request.Request(SITE + path, headers={"User-Agent": "grand-line-tracker-meta/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)

meta = get("/api/meta")
cards = get("/api/cards?v=4")["cards"]
by = {}
for c in cards:
    cur = by.get(c["code"])
    if cur is None or (cur.get("v") and not c.get("v")):
        by[c["code"]] = c

need = set()
for d in meta["decks"]:
    need.add(d["leader"]); need.update(d["cards"].keys())
out_cards = {}
missing = []
for code in sorted(need):
    c = by.get(code)
    if not c:
        missing.append(code); continue
    out_cards[code] = {k: c.get(k) for k in ("name", "type", "colors", "cost", "power", "counter", "life", "attr", "traits", "text")}
out = {"updated": meta["updated"], "tournaments": meta["tournaments"], "missing": missing,
       "decks": [{k: d[k] for k in ("leader", "leaderName", "player", "placing", "tournament", "players", "date", "cards")} for d in meta["decks"]],
       "cards": out_cards}
with open("web/lib/engine/meta-data.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=0)
print(len(meta["decks"]), "deckov,", len(out_cards), "kariet, chýba", missing)
