"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DataError, Loading, NeedLogin } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useCollection } from "@/lib/collection";
import { Card, cardEur, eur, priceSource, thumb, useCards, usePrices } from "@/lib/data";
import { useTcg } from "@/lib/tcg";

// verzia súborov v /public/scan (zvýš pri novom modeli/indexe → obíde cache)
const SCAN_V = "1";
const IW = 224, IH = 313; // vstup modelu (pomer karty 63 : 88)
const CARD_RATIO = 63 / 88;
// prahy rozhodovania (kosínusová podobnosť) – doladiť podľa ladiaceho režimu
// prázdny rámik dáva 0,30–0,42 → rozhoduje hlavne zhoda viacerých snímok za sebou
const T_SHOW = 0.4; // od tohto skóre sa ukáže tip na kartu
const T_ACCEPT = 0.42; // priemerné skóre víťaza za posledné okno
const T_EMPTY = 0.36; // pod tým = v rámiku asi nie je karta
const FRAME_MS = 140; // max ~7 snímok/s (WebGPU by inak bežal príliš rýchlo)
const HOLD_MS = 700; // karta musí byť v rámiku stabilne aspoň toľko
const WINDOW_MS = 1000; // hlasuje sa za poslednú sekundu (≥ 70 % snímok tá istá karta)
const GONE_MS = 600; // po pridaní: karta musí zmiznúť aspoň na toľko, než sa pridá ďalšia
const REPEAT_MS = 3000; // tá istá karta sa nepridá znova skôr
const CHANGE = 0.12; // zmena obrazu (0–1), od ktorej je v rámiku „niečo iné“
const TW = 12, TH = 16; // malý sivý náhľad na detekciu zmeny

function makeThumb(px: Uint8ClampedArray) {
  const t = new Float32Array(TW * TH);
  for (let y = 0; y < TH; y++)
    for (let x = 0; x < TW; x++) {
      let s = 0;
      for (let dy = 0; dy < 4; dy++)
        for (let dx = 0; dx < 4; dx++) {
          const sx = Math.floor(((x + dx / 4) * IW) / TW), sy = Math.floor(((y + dy / 4) * IH) / TH);
          const i = (sy * IW + sx) * 4;
          s += px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
        }
      t[y * TW + x] = s / 16 / 255;
    }
  // normalizácia jasu (autoexpozícia kamery nemá spúšťať „zmenu“)
  let m = 0;
  t.forEach((v) => (m += v));
  m /= t.length;
  for (let i = 0; i < t.length; i++) t[i] -= m;
  return t;
}
const thumbDiff = (a: Float32Array, b: Float32Array) => {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d / a.length;
};

type Hit = { id: string; score: number };
// shot = záber z kamery v momente rozpoznania (na kontrolu), ok = potvrdené používateľom, unsure = skener si nebol istý
type Scanned = {
  key: number; id: string; score: number; alts: string[]; shot?: string; ok: boolean; unsure: boolean;
  qty?: number; lang?: "EN" | "JP"; cond?: Cond;
};
type Cond = "NM" | "LP" | "MP" | "HP" | "DMG";
const CONDS: Cond[] = ["NM", "LP", "MP", "HP", "DMG"];
const COND_SK: Record<Cond, string> = { NM: "Near Mint", LP: "Light Played", MP: "Moderately Played", HP: "Heavily Played", DMG: "Poškodená" };
const T_SURE = 0.5; // pod týmto priemerným skóre alebo pri tesnom druhom kandidátovi → „Skontroluj“
const STORE = "op-scan-list"; // zoznam prežije zatvorenie stránky (bez záberov)

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
  const hist = useRef<(Hit & { t: number })[]>([]);
  const lock = useRef<{ id: string; thumb: Float32Array; since: number; goneSince: number } | null>(null);
  const recent = useRef<Record<string, number>>({}); // id → čas pridania (proti dvojitému pridaniu)
  const lastThumb = useRef<Float32Array | null>(null);
  const lastTick = useRef(0);
  const lastCanvas = useRef<OffscreenCanvas | null>(null);

  const [state, setState] = useState<"off" | "loading" | "on" | "error">("off");
  const [msg, setMsg] = useState("");
  const [live, setLive] = useState<{ top: Hit[]; ms: number } | null>(null);
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

  // zoznam v localStorage – načítanie raz, ukladanie pri každej zmene
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || "[]");
      if (Array.isArray(saved) && saved.length) setList(saved);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(list.map(({ shot, ...x }) => x)));
    } catch {}
  }, [list]);

  // varianty podľa herného kódu (na rýchlu opravu: základná ↔ parallel ↔ alt art)
  const byCode = useMemo(() => {
    const m = new Map<string, Card[]>();
    cards?.cards.forEach((c) => m.set(c.code, [...(m.get(c.code) ?? []), c]));
    return m;
  }, [cards]);

  const accept = useCallback(
    (top: Hit[], avg: number) => {
      const id = top[0].id;
      const c = cards?.byId.get(id);
      // alternatívy: iné varianty toho istého kódu + ďalší kandidáti modelu
      const alts = [
        ...(c ? (byCode.get(c.code) ?? []).map((x) => x.id) : []),
        ...top.slice(1, 4).map((h) => h.id),
      ].filter((x, i, a) => x !== id && a.indexOf(x) === i);
      const key = Date.now();
      const unsure = avg < T_SURE || (top[1] && top[0].score - top[1].score < 0.04);
      setList((l) => [{ key, id, score: avg, alts, ok: false, unsure: !!unsure, lang: langRef.current }, ...l]);
      // záber z kamery (výrez rámika) na neskoršiu kontrolu
      lastCanvas.current
        ?.convertToBlob({ type: "image/jpeg", quality: 0.8 })
        .then((b) => {
          const shot = URL.createObjectURL(b);
          setList((l) => l.map((x) => (x.key === key ? { ...x, shot } : x)));
        })
        .catch(() => {});
      beep();
    },
    [cards, byCode],
  );

  const onResult = useCallback(
    (top: Hit[]) => {
      const now = performance.now();
      const best = top[0];
      const thumb = lastThumb.current;
      // 1) zámok: po pridaní čakaj, kým karta z rámika zmizne (iný obraz alebo prázdno ≥ 0,6 s)
      if (lock.current) {
        const L = lock.current;
        const empty = !best || best.score < T_EMPTY;
        // posunutie tej istej karty v rámiku sa neráta – len iný obraz s inou kartou alebo prázdno
        const changed = !!thumb && thumbDiff(thumb, L.thumb) > CHANGE && !!best && best.id !== L.id;
        if (changed || empty) {
          if (!L.goneSince) L.goneSince = now;
          if (now - L.goneSince > GONE_MS) {
            lock.current = null;
            hist.current = [];
          }
        } else L.goneSince = 0;
        if (lock.current) return;
      }
      if (!best || best.score < T_EMPTY) {
        hist.current = [];
        return;
      }
      // 2) hlasovanie za posledných HOLD_MS – karta musí byť v rámiku stabilne
      hist.current = [...hist.current.filter((h) => now - h.t < WINDOW_MS), { ...best, t: now }];
      const h = hist.current;
      if (now - h[0].t < HOLD_MS || h.length < 3) return;
      const votes = h.filter((x) => x.id === best.id);
      const avg = votes.reduce((s, x) => s + x.score, 0) / votes.length;
      const share = votes.length / h.length;
      if (share < 0.7 || avg < T_ACCEPT) return;
      if (now - (recent.current[best.id] ?? -1e9) < REPEAT_MS) return;
      recent.current[best.id] = now;
      lock.current = { id: best.id, thumb: thumb ?? new Float32Array(TW * TH), since: now, goneSince: 0 };
      accept(top, avg);
    },
    [accept],
  );

  // jedna snímka: výrez rámika z videa → 224×313 → worker
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
    let sx = (fr.left - vr.left - ox) / s, sy = (fr.top - vr.top - oy) / s;
    let sw = fr.width / s, sh = fr.height / s;
    // výrez vždy v pomere karty (63 : 88) – inak by sa karta pre model natiahla
    if (sw / sh > CARD_RATIO) {
      const w2 = sh * CARD_RATIO;
      sx += (sw - w2) / 2;
      sw = w2;
    } else {
      const h2 = sw / CARD_RATIO;
      sy += (sh - h2) / 2;
      sh = h2;
    }
    const cv = new OffscreenCanvas(IW, IH);
    const ctx = cv.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(v, sx, sy, sw, sh, 0, 0, IW, IH);
    const px = ctx.getImageData(0, 0, IW, IH).data;
    lastThumb.current = makeThumb(px);
    lastCanvas.current = cv;
    busy.current = true;
    w.postMessage({ type: "scan", seq: ++seq.current, pixels: px }, [px.buffer]);
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
    lock.current = null;
    hist.current = [];
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
        w.onmessage = (e) => {
          busy.current = false;
          if (e.data.type === "result") {
            setLive({ top: e.data.top, ms: e.data.ms });
            onResult(e.data.top);
          } else if (e.data.type === "error") setMsg(e.data.error);
        };
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
  }, [onResult]);

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

  // onResult sa mení s kartami → worker musí volať aktuálnu verziu
  useEffect(() => {
    const w = workerRef.current;
    if (!w || state !== "on") return;
    w.onmessage = (e) => {
      busy.current = false;
      if (e.data.type === "result") {
        setLive({ top: e.data.top, ms: e.data.ms });
        onResult(e.data.top);
      } else if (e.data.type === "error") setMsg(e.data.error);
    };
  }, [onResult, state]);

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
  const sure = !!lock.current && !!cur && cur.id === lock.current.id;

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
                      {!x.ok && x.unsure && <span className="rv-badge">Skontroluj</span>}
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
              <span className="scan-pill">
                {count} {plural(count)} · <b>{eur(total)}</b>
              </span>
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
                <div className="scan-hint">{sure ? "Odlož kartu a prilož ďalšiu" : "Vlož kartu do rámika"}</div>
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
                <p className="small">Vlož kartu do rámika – rozpozná sa sama, netreba fotiť.</p>
                {msg && <p className="small badc">{msg}</p>}
              </>
            )}
          </div>
        )}
      </div>

      {debug && live && (
        <div className="scan-debug small">
          {engine} · snímka {live.ms} ms ·{" "}
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
