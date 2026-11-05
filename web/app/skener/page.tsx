"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DataError, Loading, NeedLogin } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useCollection } from "@/lib/collection";
import { Card, cardEur, eur, priceSource, thumb, useCards, usePrices } from "@/lib/data";
import { Accepted, Decider, Hit } from "@/lib/scan/decide";
import { loadShots, pruneShots, saveShot } from "@/lib/scan/shots";
import { sb } from "@/lib/supabase";
import { useTcg } from "@/lib/tcg";

// verzia súborov v /public/scan (zvýš pri novom modeli/indexe → obíde cache)
const SCAN_V = "2";
const CARD_RATIO = 63 / 88;
const IW = 224, IH = 313; // narovnaná karta z workera
const T_SHOW = 0.42; // od tohto skóre sa ukáže tip na kartu
const FRAME_MS = 140; // max ~7 snímok/s (WebGPU by inak bežal príliš rýchlo)
const VIEW_RATIO = 3 / 4; // detektor rohov vidí záber š:v = 3:4 okolo rámika
const VIEW_MAX_H = 960; // viac pixelov na narovnanie netreba

/** Výrez 3:4 okolo rámika s celou viditeľnou výškou (pixely videa). Môže presahovať video – bočné pruhy ostanú čierne,
    karta sa tak zmestí aj keď vyplní celý rámik. */
function viewAround(cx: number, cy: number, visibleH: number, videoH: number) {
  const h = Math.min(visibleH, videoH), w = h * VIEW_RATIO;
  return { x: cx - w / 2, y: Math.min(Math.max(0, cy - h / 2), videoH - h), w, h };
}

// shot = narovnaná karta z kamery (na kontrolu), ok = potvrdené používateľom, unsure = skener si nebol istý
type Scanned = {
  key: number; id: string; score: number; alts: string[]; shot?: string; ok: boolean; unsure: boolean; checkVersion?: boolean;
  qty?: number; lang?: "EN" | "JP"; cond?: Cond;
};
type Cond = "NM" | "LP" | "MP" | "HP" | "DMG";
const CONDS: Cond[] = ["NM", "LP", "MP", "HP", "DMG"];
const COND_SK: Record<Cond, string> = { NM: "Near Mint", LP: "Light Played", MP: "Moderately Played", HP: "Heavily Played", DMG: "Poškodená" };
const STORE = "op-scan-list"; // zoznam prežije zatvorenie stránky (zábery sú v IndexedDB, viď lib/scan/shots.ts)
const RUNNING = "op-scan-running"; // skener beží; ak to tu po štarte stránky ostalo, stránka spadla (zápis do scan_crashes)

function beep() {
  try {
    const a = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = a.createOscillator(), g = a.createGain();
    o.frequency.value = 1320;
    g.gain.setValueAtTime(0.12, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.12);
    o.connect(g).connect(a.destination);
    o.start();
    o.stop(a.currentTime + 0.13);
    setTimeout(() => a.close(), 300);
  } catch {}
  navigator.vibrate?.(40);
}

function ScannerPage() {
  const { tcg } = useTcg();
  const { data: cards, error } = useCards();
  const { data: prices } = usePrices();
  const { user } = useAuth();
  const { qty, setQty } = useCollection(user?.id ?? null, !!user);
  const usd = prices?.fx?.USD ?? 1.12;

  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busy = useRef(false);
  const seq = useRef(0);
  const decider = useRef(new Decider());
  const frames = useRef(0);
  const listLen = useRef(0);
  const lastTick = useRef(0);
  const lastRect = useRef<Uint8ClampedArray | null>(null); // posledná narovnaná karta
  const viewRef = useRef<{ x: number; y: number; w: number; h: number; s: number; ox: number; oy: number; bw: number; bh: number } | null>(null);

  const [state, setState] = useState<"off" | "loading" | "on" | "error">("off");
  const [msg, setMsg] = useState("");
  const [live, setLive] = useState<{ top: Hit[]; ms: number; msDet: number; obj: number; quad: string | null; box: [number, number] } | null>(null);
  const [list, setList] = useState<Scanned[]>([]);
  const [debug, setDebug] = useState(false);
  const [added, setAdded] = useState(false);
  const [engine, setEngine] = useState("");
  const [mode, setMode] = useState<"scan" | "review">("scan");
  // jazyk skenovaných kariet – model EN/JP nerozlíši (rovnaká kresba), preto prepínač; pamätá sa
  const [lang, setLangState] = useState<"EN" | "JP">("EN");
  const langRef = useRef<"EN" | "JP">("EN");
  useEffect(() => {
    const l = localStorage.getItem("op-scan-lang");
    if (l === "JP" || l === "EN") (setLangState(l), (langRef.current = l));
  }, []);
  const setLang = (l: "EN" | "JP") => {
    setLangState(l);
    langRef.current = l;
    localStorage.setItem("op-scan-lang", l);
  };
  const [cam, setCam] = useState<{ torch: boolean; zoom: { min: number; max: number } | null }>({ torch: false, zoom: null });
  const [torchOn, setTorchOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [edit, setEdit] = useState<number | null>(null); // kľúč karty, pri ktorej je otvorená zmena
  const [q, setQ] = useState("");
  const [listLoaded, setListLoaded] = useState(false);

  // záznam o reštarte: kým skener beží, značka sa priebežne obnovuje; pri odchode alebo prechode do pozadia sa zruší, pri páde ostane
  useEffect(() => {
    const raw = localStorage.getItem(RUNNING);
    if (!raw) return;
    localStorage.removeItem(RUNNING);
    try {
      const r = JSON.parse(raw);
      let after = 0;
      try {
        after = JSON.parse(localStorage.getItem(STORE) || "[]").length;
      } catch {}
      sb()
        .from("scan_crashes")
        .insert({ ran_s: r.s, frames: r.f, cards_before: r.c, cards_after: after, engine: r.e, user_agent: navigator.userAgent.slice(0, 300) })
        .then(() => {}); // záznam nesmie obmedziť skener
    } catch {}
  }, []);
  useEffect(() => {
    if (state !== "on") return;
    const t0 = Date.now();
    const mark = () => {
      if (document.hidden) return localStorage.removeItem(RUNNING);
      localStorage.setItem(RUNNING, JSON.stringify({ s: Math.round((Date.now() - t0) / 1000), f: frames.current, c: listLen.current, e: engine.slice(0, 80) }));
    };
    const off = () => localStorage.removeItem(RUNNING);
    mark();
    const timer = setInterval(mark, 3000);
    document.addEventListener("visibilitychange", mark);
    window.addEventListener("pagehide", off);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", mark);
      window.removeEventListener("pagehide", off);
      off();
    };
  }, [state, engine]);

  // zoznam v localStorage – načítanie raz, ukladanie pri každej zmene
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || "[]");
      if (Array.isArray(saved) && saved.length) {
        setList(saved);
        loadShots(saved.map((x: Scanned) => x.key)).then(
          (m) => m.size && setList((l) => l.map((x) => (m.has(x.key) ? { ...x, shot: m.get(x.key) } : x))),
        );
      }
    } catch {}
    setListLoaded(true);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(list.map(({ shot, ...x }) => x)));
    } catch {}
    listLen.current = list.length;
  }, [list]);
  // zábery kariet, ktoré už v zozname nie sú, sa mažú; až po načítaní, inak by prázdny zoznam pri štarte zmazal všetky
  useEffect(() => {
    if (listLoaded) pruneShots(list.map((x) => x.key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listLoaded, list.length]);

  // varianty podľa herného kódu (na rýchlu opravu: základná ↔ parallel ↔ alt art)
  const byCode = useMemo(() => {
    const m = new Map<string, Card[]>();
    cards?.cards.forEach((c) => m.set(c.code, [...(m.get(c.code) ?? []), c]));
    return m;
  }, [cards]);

  const accept = useCallback(
    (r: Accepted) => {
      const c = cards?.byId.get(r.id);
      // alternatívy: najprv iné verzie tej istej karty, potom ďalší kandidáti modelu
      const alts = [
        ...r.sameCode,
        ...(c ? (byCode.get(c.code) ?? []).map((x) => x.id) : []),
        ...r.top.slice(1, 4).map((h) => h.id),
      ].filter((x, i, a) => x !== r.id && a.indexOf(x) === i);
      const key = Date.now();
      setList((l) => [{ key, id: r.id, score: r.score, alts, ok: false, unsure: r.unsure, checkVersion: r.checkVersion, lang: langRef.current }, ...l]);
      // narovnaná karta z kamery na neskoršiu kontrolu
      const px = lastRect.current;
      if (px) {
        const cv = new OffscreenCanvas(IW, IH);
        cv.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(px), IW, IH), 0, 0);
        cv.convertToBlob({ type: "image/jpeg", quality: 0.8 })
          .then((b) => {
            saveShot(key, b);
            const shot = URL.createObjectURL(b);
            setList((l) => l.map((x) => (x.key === key ? { ...x, shot } : x)));
          })
          .catch(() => {});
      }
      beep();
    },
    [cards, byCode],
  );

  const onWorker = useCallback(
    (e: MessageEvent) => {
      const m = e.data;
      busy.current = false;
      if (m.type === "error") return setMsg(m.error);
      if (m.type !== "result" || !streamRef.current) return; // výsledok, ktorý dobehol po vypnutí kamery
      frames.current++;
      if (m.rect) lastRect.current = m.rect;
      const V = viewRef.current;
      // rohy karty zo záberu na obrazovku
      const quad =
        m.quad && V
          ? [0, 1, 2, 3].map((i) => `${(V.ox + (V.x + m.quad[i * 2] * V.w) * V.s).toFixed(1)},${(V.oy + (V.y + m.quad[i * 2 + 1] * V.h) * V.s).toFixed(1)}`).join(" ")
          : null;
      setLive({ top: m.top, ms: m.ms, msDet: m.msDet, obj: m.obj, quad, box: [V?.bw ?? 0, V?.bh ?? 0] });
      const r = decider.current.frame(performance.now(), m.top);
      if (r) accept(r);
    },
    [accept],
  );

  // jedna snímka: záber okolo rámika → worker (nájde rohy, narovná, rozpozná)
  const tick = useCallback(() => {
    const v = videoRef.current, f = frameRef.current, w = workerRef.current;
    if (!v || !f || !w || busy.current || v.readyState < 2) return;
    const now = performance.now();
    if (now - lastTick.current < FRAME_MS) return;
    lastTick.current = now;
    const vr = v.getBoundingClientRect(), fr = f.getBoundingClientRect();
    // video je object-fit: cover → prepočet z obrazovky do pixelov videa
    const s = Math.max(vr.width / v.videoWidth, vr.height / v.videoHeight);
    const ox = (vr.width - v.videoWidth * s) / 2, oy = (vr.height - v.videoHeight * s) / 2;
    const cx = (fr.left + fr.width / 2 - vr.left - ox) / s, cy = (fr.top + fr.height / 2 - vr.top - oy) / s;
    const view = viewAround(cx, cy, vr.height / s, v.videoHeight);
    viewRef.current = { ...view, s, ox, oy, bw: vr.width, bh: vr.height };
    const H = Math.round(Math.min(VIEW_MAX_H, view.h)), W = Math.round(H * VIEW_RATIO);
    const cv = new OffscreenCanvas(W, H);
    const ctx = cv.getContext("2d", { willReadFrequently: true })!;
    ctx.imageSmoothingQuality = "high";
    // len časť výrezu, ktorá leží vo videu (zvyšok ostane čierny)
    const k = W / view.w, x0 = Math.max(0, view.x), x1 = Math.min(v.videoWidth, view.x + view.w);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(v, x0, view.y, x1 - x0, view.h, (x0 - view.x) * k, 0, (x1 - x0) * k, H);
    const px = ctx.getImageData(0, 0, W, H).data;
    busy.current = true;
    w.postMessage({ type: "scan", seq: ++seq.current, pixels: px, w: W, h: H }, [px.buffer]);
  }, []);

  const camSet = useCallback((c: Record<string, any>) => {
    const track = streamRef.current?.getVideoTracks()[0];
    track?.applyConstraints({ advanced: [c] } as any).catch(() => {});
  }, []);
  const toggleTorch = () => {
    camSet({ torch: !torchOn });
    setTorchOn(!torchOn);
  };
  const nextZoom = () => {
    if (!cam.zoom) return;
    const steps = [1, 1.5, 2].filter((z) => z >= cam.zoom!.min && z <= cam.zoom!.max);
    const z = steps[(steps.indexOf(zoom) + 1) % steps.length] ?? 1;
    camSet({ zoom: z });
    setZoom(z);
  };

  const stop = useCallback(() => {
    decider.current.reset();
    busy.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setState("off");
    setLive(null);
  }, []);

  const start = useCallback(async () => {
    setState("loading");
    setMsg("Spúšťam kameru…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      // baterka a zoom – len kde ich kamera podporuje (hlavne Android Chrome)
      const track = stream.getVideoTracks()[0];
      const caps: any = track.getCapabilities?.() ?? {};
      setCam({ torch: !!caps.torch, zoom: caps.zoom && caps.zoom.max > 1 ? { min: caps.zoom.min, max: caps.zoom.max } : null });
      setTorchOn(false);
      setZoom(1);
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      if (!workerRef.current) {
        setMsg("Načítavam rozpoznávanie kariet (prvýkrát pár MB)…");
        const w = new Worker(`/scan/worker.js?v=${SCAN_V}`);
        workerRef.current = w;
        await new Promise<void>((res, rej) => {
          w.onmessage = (e) => {
            if (e.data.type === "ready") {
              setEngine(`${e.data.backend}, ${e.data.cards} kariet, štart ${e.data.ms} ms`);
              res();
            } else if (e.data.type === "error") rej(new Error(e.data.error));
          };
          w.postMessage({ type: "init", game: "op", v: SCAN_V });
        });
      }
      setState("on");
      setMsg("");
    } catch (e: any) {
      setState("error");
      setMsg(
        e?.name === "NotAllowedError"
          ? "Prístup ku kamere je zamietnutý – povoľ ho v nastaveniach prehliadača."
          : `Kameru sa nepodarilo spustiť: ${e?.message || e}`,
      );
    }
  }, []);

  // slučka – ďalšia snímka hneď, ako worker dorobí predchádzajúcu
  useEffect(() => {
    if (state !== "on") return;
    let raf = 0;
    const loop = () => {
      tick();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state, tick]);

  // onWorker sa mení s kartami → worker musí volať aktuálnu verziu
  useEffect(() => {
    const w = workerRef.current;
    if (w && state === "on") w.onmessage = onWorker;
  }, [onWorker, state]);

  // návrat z kontroly → po vykreslení <video> znova zapni kameru
  const resume = useRef(false);
  useEffect(() => {
    if (mode === "scan" && resume.current) {
      resume.current = false;
      start();
    }
  }, [mode, start]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    workerRef.current?.terminate();
  }, []);

  if (tcg === "pokemon")
    return (
      <div className="scan-page">
        <h1>Skener</h1>
        <p className="muted">Skener zatiaľ pozná len One Piece karty – prepni hore na One Piece. Pokémon pribudne neskôr.</p>
      </div>
    );
  if (error) return <DataError error={error} file="cards" />;
  if (!cards) return <Loading what="Načítavam karty" />;

  const price = (id: string, lang: "EN" | "JP" = "EN") => cardEur(cards.byId.get(id), usd, lang);
  const xp = (x: Scanned) => price(x.id, x.lang ?? "EN"); // cena podľa jazyka naskenovanej karty
  const n = (x: Scanned) => x.qty ?? 1;
  const total = list.reduce((s, x) => s + (xp(x) ?? 0) * n(x), 0);
  const count = list.reduce((s, x) => s + n(x), 0);
  const cur = live?.top[0];
  const curCard = cur && cur.score >= T_SHOW ? cards.byId.get(cur.id) : undefined;
  const sure = decider.current.locked && !!curCard;

  const change = (key: number, id: string) => {
    setList((l) =>
      l.map((x) =>
        x.key === key ? { ...x, id, ok: true, unsure: false, alts: [x.id, ...x.alts.filter((a) => a !== id)] } : x,
      ),
    );
    setEdit(null);
    setQ("");
  };
  const setOk = (key: number, ok: boolean) => setList((l) => l.map((x) => (x.key === key ? { ...x, ok } : x)));
  const remove = (key: number) => setList((l) => l.filter((x) => x.key !== key));
  const confirmed = list.filter((x) => x.ok);
  const toCheck = list.filter((x) => !x.ok);
  const totalOk = confirmed.reduce((s, x) => s + (xp(x) ?? 0) * n(x), 0);
  const countOk = confirmed.reduce((s, x) => s + n(x), 0);
  const patch = (key: number, p: Partial<Scanned>) => setList((l) => l.map((x) => (x.key === key ? { ...x, ...p } : x)));

  // export: text na zdieľanie (Messenger, WhatsApp…) a CSV (Excel, Cardmarket)
  const rows = (xs: Scanned[]) =>
    xs.map((x) => {
      const c = cards.byId.get(x.id);
      return { qty: n(x), name: c?.name ?? x.id, code: c?.code ?? x.id, v: c?.v || "", rarity: c?.rarity ?? "", lang: x.lang ?? "EN", cond: x.cond ?? "NM", eur: xp(x), src: priceSource(c, x.lang ?? "EN") };
    });
  const share = async () => {
    const xs = confirmed.length ? confirmed : list;
    const lines = rows(xs).map(
      (r) => `${r.qty}× ${r.name} ${r.code}${r.v ? ` (${r.v})` : ""} · ${r.lang} ${r.cond} · ${eur(r.eur)}`,
    );
    const sum = rows(xs).reduce((s, r) => s + (r.eur ?? 0) * r.qty, 0);
    const text = `${lines.join("\n")}\nSpolu ${rows(xs).reduce((s, r) => s + r.qty, 0)} kariet · ${eur(sum)}\n(ceny Cardmarket trend, Grand Line Tracker)`;
    try {
      if (navigator.share) await navigator.share({ title: "Moje One Piece karty", text });
      else {
        await navigator.clipboard.writeText(text);
        alert("Zoznam je skopírovaný – vlož ho do správy.");
      }
    } catch {}
  };
  const csv = () => {
    const xs = confirmed.length ? confirmed : list;
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Počet", "Meno", "Kód", "Verzia", "Rarita", "Jazyk", "Stav", "Cena EUR", "Zdroj ceny"];
    const body = rows(xs).map((r) => [r.qty, r.name, r.code, r.v, r.rarity, r.lang, r.cond, r.eur?.toFixed(2) ?? "", r.src].map(esc).join(";"));
    const blob = new Blob(["\ufeff" + [head.map(esc).join(";"), ...body].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `one-piece-karty-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  const addConfirmed = () => {
    const add: Record<string, number> = {};
    confirmed.forEach((x) => (add[x.id] = (add[x.id] ?? 0) + n(x)));
    Object.entries(add).forEach(([id, n]) => setQty(id, (qty[id] ?? 0) + n));
    setList((l) => l.filter((x) => !x.ok)); // pridané zmiznú, nepotvrdené ostanú na kontrolu
    setAdded(true);
    setTimeout(() => setAdded(false), 3000);
  };
  const finish = () => {
    stop();
    setMode("review");
    window.scrollTo({ top: 0 });
  };
  const back = () => {
    setEdit(null);
    setMode("scan"); // kamera sa spustí až po vykreslení videa (efekt nižšie)
    resume.current = true;
  };
  const plural = (n: number) => (n === 1 ? "karta" : n >= 2 && n <= 4 ? "karty" : "kariet");

  // hľadanie inej karty (meno alebo kód)
  const found =
    q.trim().length >= 2
      ? cards.cards
          .filter((c) => {
            const t = q.trim().toLowerCase();
            return c.name.toLowerCase().includes(t) || c.id.toLowerCase().includes(t);
          })
          .slice(0, 12)
      : [];

  const last = list[0];
  const lastCard = last ? cards.byId.get(last.id) : undefined;
  const fresh = !!last && Date.now() - last.key < 1800;

  // ---------------------------------------------------------------- kontrola
  if (mode === "review") {
    // najprv nepotvrdené, z nich najprv tie, kde si skener nebol istý
    const order = [...list].sort((a, b) => Number(a.ok) - Number(b.ok) || Number(b.unsure) - Number(a.unsure));
    return (
      <div className="scan-page rv">
        <div className="row between wrapr gap">
          <h1>Kontrola kariet</h1>
          <button className="btn ghost sm" onClick={back}>
            ← Skenovať ďalej
          </button>
        </div>
        <p className="muted small">
          Porovnaj svoj záber s nájdenou kartou. Ak nesedí verzia alebo karta, ťukni na <b>Zmeniť</b>. Ceny sú Cardmarket
          trend (EN alebo JP podľa jazyka karty), kde chýba, TCGplayer. Stav karty sa zatiaľ ukladá len do exportu.
        </p>
        {added && <div className="rv-done">Pridané do zbierky ✓</div>}
        {list.length === 0 ? (
          <div className="center muted">
            Žiadne karty na kontrolu.{" "}
            <button className="btn sm" onClick={back}>
              Skenovať
            </button>
          </div>
        ) : (
          <>
            <div className="rv-bar row between wrapr gap">
              <span className="small">
                <b>{toCheck.length}</b> na kontrolu · <b>{confirmed.length}</b> potvrdených
              </span>
              <span className="row gap wrapr">
                <button className="btn ghost sm" onClick={share}>
                  Zdieľať
                </button>
                <button className="btn ghost sm" onClick={csv}>
                  CSV
                </button>
                {toCheck.length > 0 && (
                  <button className="btn ghost sm" onClick={() => setList((l) => l.map((x) => ({ ...x, ok: true })))}>
                    Potvrdiť všetky
                  </button>
                )}
              </span>
            </div>
            <ul className="rv-list">
              {order.map((x) => {
                const c = cards.byId.get(x.id);
                return (
                  <li key={x.key} className={`rv-item ${x.ok ? "ok" : x.unsure ? "warn" : ""}`}>
                    <div className="rv-imgs">
                      <figure>
                        {x.shot ? <img src={x.shot} alt="Tvoj záber" /> : <div className="rv-noshot">bez záberu</div>}
                        <figcaption>tvoj záber</figcaption>
                      </figure>
                      <figure>
                        {c?.img && <img src={thumb(c.img, 300)} alt={c.name} />}
                        <figcaption>nájdená</figcaption>
                      </figure>
                    </div>
                    <div className="rv-info">
                      {!x.ok && x.unsure && <span className="rv-badge">{x.checkVersion ? "Over verziu" : "Skontroluj"}</span>}
                      <b className="rv-name">{c?.name ?? x.id}</b>
                      <span className="small muted">
                        {c?.code}
                        {c?.v ? ` · ${c.v}` : ""} · {c?.rarity}
                        {debug ? ` · ${x.score.toFixed(2)}` : ""}
                      </span>
                      <b className="rv-price">
                        {eur(xp(x))}
                        {n(x) > 1 && <span className="small muted"> × {n(x)} = {eur((xp(x) ?? 0) * n(x))}</span>}
                      </b>
                      <span className="tiny muted">{priceSource(c, x.lang ?? "EN") || "cena nie je známa"}</span>
                      <div className="rv-opts">
                        <span className="rv-qty" role="group" aria-label="Počet kusov">
                          <button onClick={() => patch(x.key, { qty: Math.max(1, n(x) - 1) })} aria-label="Menej">
                            −
                          </button>
                          <b>{n(x)}×</b>
                          <button onClick={() => patch(x.key, { qty: Math.min(99, n(x) + 1) })} aria-label="Viac">
                            +
                          </button>
                        </span>
                        <select value={x.lang ?? "EN"} onChange={(e) => patch(x.key, { lang: e.target.value as any })} aria-label="Jazyk karty">
                          <option value="EN">EN</option>
                          <option value="JP">JP</option>
                        </select>
                        <select value={x.cond ?? "NM"} onChange={(e) => patch(x.key, { cond: e.target.value as Cond })} aria-label="Stav karty">
                          {CONDS.map((c) => (
                            <option key={c} value={c} title={COND_SK[c]}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="rv-actions">
                        <button className={`btn sm ${x.ok ? "" : "ghost"}`} onClick={() => setOk(x.key, !x.ok)}>
                          {x.ok ? "✓ Potvrdené" : "✓ Sedí"}
                        </button>
                        <button className="btn ghost sm" onClick={() => (setEdit(edit === x.key ? null : x.key), setQ(""))}>
                          Zmeniť
                        </button>
                        <button className="btn ghost sm danger" onClick={() => remove(x.key)}>
                          Odstrániť
                        </button>
                      </div>
                    </div>
                    {edit === x.key && (
                      <div className="rv-edit">
                        {x.alts.length > 0 && (
                          <>
                            <span className="tiny muted">Iná verzia alebo podobná karta</span>
                            <div className="rv-pick">
                              {x.alts.slice(0, 8).map((a) => {
                                const ac = cards.byId.get(a);
                                return (
                                  <button key={a} onClick={() => change(x.key, a)}>
                                    {ac?.img && <img src={thumb(ac.img, 200)} alt="" loading="lazy" />}
                                    <span>{ac?.code === c?.code ? ac?.v || "Základná" : ac?.name}</span>
                                    <span className="muted">{eur(price(a))}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        )}
                        <input
                          className="rv-search"
                          placeholder="Hľadať inú kartu – meno alebo kód (napr. OP05-119)"
                          value={q}
                          onChange={(e) => setQ(e.target.value)}
                          autoFocus
                        />
                        {found.length > 0 && (
                          <div className="rv-pick">
                            {found.map((fc) => (
                              <button key={fc.id} onClick={() => change(x.key, fc.id)}>
                                {fc.img && <img src={thumb(fc.img, 200)} alt="" loading="lazy" />}
                                <span>
                                  {fc.name} {fc.v ? `· ${fc.v}` : ""}
                                </span>
                                <span className="muted">
                                  {fc.code} · {eur(price(fc.id))}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {list.length > 0 && (
          <div className="rv-foot">
            <div>
              <span className="small muted">Potvrdené {countOk} {plural(countOk)}</span>
              <b className="scan-total">{eur(totalOk)}</b>
            </div>
            {user ? (
              <button className="btn" disabled={!confirmed.length} onClick={addConfirmed}>
                Pridať do zbierky
              </button>
            ) : (
              <Link className="btn ghost" href="/login">
                Prihlás sa a pridaj
              </Link>
            )}
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------- skenovanie
  return (
    <div className={`scan-page ${state === "on" ? "live" : ""}`}>
      <div className="scan-head row between wrapr gap">
        <h1>Skener</h1>
        <label className="small muted row gap">
          <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} /> ladenie
        </label>
      </div>

      <div className={`scan-cam ${state}`}>
        <video ref={videoRef} playsInline muted />
        {state === "on" && live?.quad && (
          <svg className="scan-quad" viewBox={`0 0 ${live.box[0]} ${live.box[1]}`} aria-hidden>
            <polygon className={sure ? "sure" : curCard ? "maybe" : ""} points={live.quad} />
          </svg>
        )}
        <div ref={frameRef} className={`scan-frame ${sure ? "sure" : curCard ? "maybe" : ""}`} style={{ aspectRatio: CARD_RATIO }}>
          <i className="c tl" />
          <i className="c tr" />
          <i className="c bl" />
          <i className="c br" />
        </div>

        {state === "on" && (
          <>
            <div className="scan-top">
              <div className="row gap">
                <button className="scan-round" onClick={stop} aria-label="Vypnúť kameru">
                  ×
                </button>
                {cam.torch && (
                  <button className={`scan-round ${torchOn ? "on" : ""}`} onClick={toggleTorch} aria-label="Baterka" aria-pressed={torchOn}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
                    </svg>
                  </button>
                )}
                {cam.zoom && (
                  <button className="scan-round scan-zoom" onClick={nextZoom} aria-label="Priblíženie">
                    {zoom}×
                  </button>
                )}
              </div>
              <span className="scan-lang" role="radiogroup" aria-label="Jazyk kariet">
                {(["EN", "JP"] as const).map((l) => (
                  <button key={l} role="radio" aria-checked={lang === l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>
                    {l}
                  </button>
                ))}
              </span>
              <button className="scan-done" onClick={finish} disabled={!list.length}>
                Hotovo
              </button>
            </div>
            <div className="scan-bottom">
              {fresh && lastCard ? (
                <div className="scan-toast ok" key={last.key}>
                  {lastCard.img && <img src={thumb(lastCard.img, 120)} alt="" />}
                  <div>
                    <b>{lastCard.name}</b>
                    <span>
                      {lastCard.code}
                      {lastCard.v ? ` · ${lastCard.v}` : ""}
                    </span>
                  </div>
                  <b className="scan-toast-price">{eur(price(lastCard.id, last.lang ?? "EN"))}</b>
                </div>
              ) : curCard && !sure ? (
                <div className="scan-toast">
                  <div>
                    <b>{curCard.name}</b>
                    <span>{curCard.code} · drž kartu v rámiku…</span>
                  </div>
                </div>
              ) : (
                <>
                  <span className="scan-pill">
                    {count} {plural(count)} · <b>{eur(total)}</b>
                  </span>
                  <div className="scan-hint">{sure ? "Odlož kartu" : live?.quad ? "Rozpoznávam…" : "Namier na kartu"}</div>
                </>
              )}
            </div>
          </>
        )}

        {state !== "on" && (
          <div className="scan-start">
            {state === "loading" ? (
              <p>{msg}</p>
            ) : (
              <>
                <button className="btn" onClick={start}>
                  {list.length ? "Pokračovať v skenovaní" : "Zapnúť kameru"}
                </button>
                <p className="small">Namier na kartu – nájde sa a rozpozná sama, netreba fotiť.</p>
                {msg && <p className="small badc">{msg}</p>}
              </>
            )}
          </div>
        )}
      </div>

      {debug && live && (
        <div className="scan-debug small">
          {engine} · snímka {live.ms} ms (rohy {live.msDet} ms) · karta {live.obj.toFixed(2)} ·{" "}
          {live.top.slice(0, 3).map((h) => (
            <span key={h.id}>
              {h.id} {h.score.toFixed(2)}{" "}
            </span>
          ))}
        </div>
      )}

      {list.length > 0 && (
        <>
          <div className="scan-sum row between wrapr gap">
            <div>
              <b>{count}</b> {plural(count)} · spolu <b className="scan-total">{eur(total)}</b>
            </div>
            <div className="row gap">
              <button className="btn ghost sm" onClick={() => confirm("Vymazať naskenované karty?") && setList([])}>
                Vymazať
              </button>
              <button className="btn sm" onClick={finish}>
                Skontrolovať a potvrdiť
              </button>
            </div>
          </div>
          <ul className="scan-list">
            {list.map((x) => {
              const c = cards.byId.get(x.id);
              return (
                <li key={x.key}>
                  {c?.img && <img src={thumb(c.img, 120)} alt="" loading="lazy" />}
                  <div className="grow">
                    <div className="row between gap">
                      <b>{c?.name ?? x.id}</b>
                      <b>{eur(xp(x))}</b>
                    </div>
                    <div className="small muted">
                      {c?.code} {c?.v ? `· ${c.v}` : ""} · {c?.rarity}
                      {x.lang === "JP" ? " · JP" : ""}
                      {x.unsure && !x.ok ? " · skontroluj" : ""}
                    </div>
                  </div>
                  <button className="scan-x" aria-label="Odstrániť" onClick={() => remove(x.key)}>
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

/** Skener a sťahovanie jeho modelu sa spustia až po prihlásení. */
export default function Page() {
  const { user, loading } = useAuth();
  if (loading) return <Loading what="Načítavam skener" />;
  if (!user) return <NeedLogin what="Skener" />;
  return <ScannerPage />;
}
