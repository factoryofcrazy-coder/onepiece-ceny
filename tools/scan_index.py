#!/usr/bin/env python3
"""Doplní index skenera kariet o nové karty (GitHub Action scan-index.yml, týždenne).

Index = pre každý obrázok karty 256-rozmerný odtlačok z modelu web/public/scan/op-model.onnx
(EfficientNet-B0 + naučená projekcia). Záznam = normalizovaný súčet odtlačku čistého obrázka
a priemeru odtlačkov niekoľkých „pokazených“ verzií (perspektíva, odlesk, rozmazanie…) – rovnako
ako pri pôvodnom výpočte. Model sa nepretrénúva; nové karty sa len doplnia.

Zdroje obrázkov na kartu (každý = samostatný záznam s rovnakým ID karty):
  - OPTCG API obrázok (v databáze kariet, s nápisom SAMPLE)
  - oficiálny čistý obrázok Bandai (JP stránka, rovnaké ID) – fotky skutočných kariet sa mu podobajú viac
Použitie: python3 tools/scan_index.py [--cards docs/data/cards.json] [--max 400]
"""
import argparse, io, json, os, sys, time, urllib.error, urllib.request
import numpy as np, cv2, onnxruntime as ort

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCAN = os.path.join(ROOT, "web", "public", "scan")
W, H, IW, IH, DIM = 300, 420, 224, 313, 256
MEAN, STD = np.array([0.485, 0.456, 0.406]), np.array([0.229, 0.224, 0.225])
UA = {"User-Agent": "grand-line-tracker/1.0 (card scanner index)"}
NAUG = 4
rng = np.random.default_rng(7)


def fetch(url, tries=3):
    for t in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(3 * (t + 1))
        except Exception:
            time.sleep(3 * (t + 1))
    return None


def decode(data):
    im = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR) if data else None
    return None if im is None else cv2.resize(im, (W, H), interpolation=cv2.INTER_AREA)


def aug(card, bgs):
    """Karta na pozadí, perspektíva, odlesk obalu, fólia, svetlo, rozmazanie, nepresný rámik."""
    S = 1.6; cw, ch = int(W * S), int(H * S)
    bg = np.full((ch, cw, 3), rng.integers(5, 60), np.uint8) if rng.random() < 0.5 or not bgs else cv2.resize(bgs[rng.integers(len(bgs))], (cw, ch))
    bg = (bg * rng.uniform(0.3, 0.8)).astype(np.uint8)
    ox, oy = (cw - W) // 2, (ch - H) // 2
    src = np.float32([[0, 0], [W, 0], [W, H], [0, H]])
    dst = (src + [ox, oy] + rng.normal(0, 0.04 * W, (4, 2))).astype(np.float32)
    Mw = cv2.getPerspectiveTransform(src, dst)
    mask = cv2.warpPerspective(np.full((H, W), 255, np.uint8), Mw, (cw, ch))
    img = np.where(mask[..., None] > 0, cv2.warpPerspective(card, Mw, (cw, ch)), bg)
    if rng.random() < 0.7:
        gl = np.zeros((ch, cw), np.float32)
        cv2.ellipse(gl, (int(rng.uniform(0, cw)), int(rng.uniform(0, ch))), (int(rng.uniform(20, 150)), int(rng.uniform(10, 80))), rng.uniform(0, 180), 0, 360, 1, -1)
        gl = cv2.GaussianBlur(gl, (0, 0), rng.uniform(8, 30)) * rng.uniform(0.3, 0.9)
        img = np.clip(img + gl[..., None] * 255, 0, 255).astype(np.uint8)
    if rng.random() < 0.4:
        hue = cv2.resize(rng.uniform(0, 1, (6, 6)).astype(np.float32), (cw, ch))
        rb = cv2.cvtColor(np.dstack([(hue * 179).astype(np.uint8), np.full((ch, cw), 200, np.uint8), np.full((ch, cw), 255, np.uint8)]), cv2.COLOR_HSV2BGR)
        a = rng.uniform(0.05, 0.25); img = cv2.addWeighted(img, 1 - a, rb, a, 0)
    img = img.astype(np.float32) * rng.uniform(0.5, 1.3) + rng.uniform(-30, 30)
    img *= np.array([rng.uniform(0.8, 1.2), 1, rng.uniform(0.8, 1.2)])
    img = np.clip(255 * (np.clip(img, 0, 255) / 255) ** rng.uniform(0.7, 1.4), 0, 255).astype(np.uint8)
    if rng.random() < 0.5:
        img = cv2.GaussianBlur(img, (0, 0), rng.uniform(0.5, 2.0))
    img = np.clip(img + rng.normal(0, rng.uniform(0, 8), img.shape), 0, 255).astype(np.uint8)
    _, j = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, int(rng.uniform(40, 90))]); img = cv2.imdecode(j, 1)
    c = dst.mean(0); diag = np.linalg.norm(dst[2] - dst[0])
    a = np.deg2rad(rng.uniform(-6, 6)); s = rng.uniform(0.9, 1.1); t = rng.uniform(-0.07, 0.07, 2) * diag
    R = np.array([[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]])
    qq = ((dst - c) @ R.T) * s + c + t
    return cv2.warpPerspective(img, cv2.getPerspectiveTransform(qq.astype(np.float32), src), (W, H))


def prep(bgr):
    x = cv2.resize(bgr, (IW, IH), interpolation=cv2.INTER_AREA)[:, :, ::-1] / 255.0
    return ((x - MEAN) / STD).transpose(2, 0, 1).astype(np.float32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cards", default=os.path.join(ROOT, "docs", "data", "cards.json"))
    ap.add_argument("--max", type=int, default=600, help="najviac nových záznamov za jeden beh")
    ap.add_argument("--no-official", action="store_true", help="bez oficiálnych obrázkov Bandai")
    a = ap.parse_args()

    meta = json.load(open(os.path.join(SCAN, "op-index.json")))
    ids, dim = meta["ids"], meta["dim"]
    src = meta.get("src") or ["optcg"] * len(ids)          # odkiaľ je záznam (optcg / jp)
    idx = np.fromfile(os.path.join(SCAN, "op-index.bin"), np.int8).reshape(-1, dim)
    assert len(ids) == len(idx) == len(src)
    have = set(zip(ids, src))
    cards = json.load(open(a.cards))["cards"]

    todo = []
    for c in cards:
        if c.get("img") and (c["id"], "optcg") not in have:
            todo.append((c["id"], "optcg", c["img"]))
        if not a.no_official and not c["id"].startswith("DON") and (c["id"], "jp") not in have:
            todo.append((c["id"], "jp", f"https://www.onepiece-cardgame.com/images/cardlist/card/{c['id']}.png"))
    print(f"index: {len(ids)} záznamov, chýba {len(todo)} (spracujem najviac {a.max})", flush=True)
    todo = todo[: a.max]
    if not todo:
        return 0

    sess = ort.InferenceSession(os.path.join(SCAN, "op-model.onnx"), providers=["CPUExecutionProvider"])
    run = lambda b: np.concatenate([sess.run(None, {"x": x[None]})[0] for x in b])
    bgs = []
    new_ids, new_src, new_vec = [], [], []
    for n, (cid, kind, url) in enumerate(todo):
        card = decode(fetch(url))
        if card is None:
            continue
        if len(bgs) < 40:
            bgs.append(card)
        z = run([prep(card)] + [prep(aug(card, bgs)) for _ in range(NAUG)])
        v = z[0] + z[1:].mean(0); v /= np.linalg.norm(v)
        new_ids.append(cid); new_src.append(kind); new_vec.append(np.clip(np.round(v * 127), -127, 127).astype(np.int8))
        if kind == "jp":
            time.sleep(0.3)  # šetrne k stránke Bandai
        if n % 50 == 0:
            print(f"  {n}/{len(todo)}", flush=True)
    if not new_ids:
        print("nič nové sa nepodarilo stiahnuť")
        return 0
    idx = np.concatenate([idx, np.stack(new_vec)])
    meta.update(ids=ids + new_ids, src=src + new_src, built=time.strftime("%Y-%m-%d"))
    idx.tofile(os.path.join(SCAN, "op-index.bin"))
    json.dump(meta, open(os.path.join(SCAN, "op-index.json"), "w"), separators=(",", ":"))
    print(f"doplnených {len(new_ids)} záznamov → spolu {len(meta['ids'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
