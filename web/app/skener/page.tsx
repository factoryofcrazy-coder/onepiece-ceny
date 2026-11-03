"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DataError, Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useCollection } from "@/lib/collection";
import { Card, cardEur, eur, useCards, usePrices } from "@/lib/data";
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
type Scanned = { key: number; id: string; score: number; alts: string[] };

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

export default function ScannerPage() {
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

  const [state, setState] = useState<"off" | "loading" | "on" | "error">("off");
  const [msg, setMsg] = useState("");
  const [live, setLive] = useState<{ top: Hit[]; ms: number } | null>(null);
  const [list, setList] = useState<Scanned[]>([]);
  const [debug, setDebug] = useState(false);
  const [added, setAdded] = useState(false);
  const [engine, setEngine] = useState("");

  // varianty podľa herného kódu (na rýchlu opravu: základná ↔ parallel ↔ alt art)
  const byCode = useMemo(() => {
    const m = new Map<string, Card[]>();
    cards?.cards.forEach((c) => m.set(c.code, [...(m.get(c.code) ?? []), c]));
    return m;
  }, [cards]);

  const accept = useCallback(
    (top: Hit[]) => {
      const id = top[0].id;
      const c = cards?.byId.get(id);
      // alternatívy: iné varianty toho istého kódu + ďalší kandidáti modelu
      const alts = [
        ...(c ? (byCode.get(c.code) ?? []).map((x) => x.id) : []),
        ...top.slice(1, 4).map((h) => h.id),
      ].filter((x, i, a) => x !== id && a.indexOf(x) === i);
      setList((l) => [{ key: Date.now(), id, score: top[0].score, alts }, ...l]);
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
      accept(top);
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
    const sx = (fr.left - vr.left - ox) / s, sy = (fr.top - vr.top - oy) / s;
    const sw = fr.width / s, sh = fr.height / s;
    const cv = new OffscreenCanvas(IW, IH);
    const ctx = cv.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(v, sx, sy, sw, sh, 0, 0, IW, IH);
    const px = ctx.getImageData(0, 0, IW, IH).data;
    lastThumb.current = makeThumb(px);
    busy.current = true;
    w.postMessage({ type: "scan", seq: ++seq.current, pixels: px }, [px.buffer]);
  }, []);

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
          : `Kamera nejde spustiť: ${e?.message || e}`,
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

  const price = (id: string) => cardEur(cards.byId.get(id), usd);
  const total = list.reduce((s, x) => s + (price(x.id) ?? 0), 0);
  const cur = live?.top[0];
  const curCard = cur && cur.score >= T_SHOW ? cards.byId.get(cur.id) : undefined;
  const sure = !!lock.current && !!cur && cur.id === lock.current.id;

  const change = (key: number, id: string) =>
    setList((l) =>
      l.map((x) => (x.key === key ? { ...x, id, alts: [x.id, ...x.alts.filter((a) => a !== id)] } : x)),
    );
  const addAll = () => {
    const add: Record<string, number> = {};
    list.forEach((x) => (add[x.id] = (add[x.id] ?? 0) + 1));
    Object.entries(add).forEach(([id, n]) => setQty(id, (qty[id] ?? 0) + n));
    setAdded(true);
    setTimeout(() => setAdded(false), 2500);
  };

  const last = list[0];
  const lastCard = last ? cards.byId.get(last.id) : undefined;
  const fresh = !!last && Date.now() - last.key < 1800;

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
              <span className="scan-pill">
                {list.length} {list.length === 1 ? "karta" : list.length >= 2 && list.length <= 4 ? "karty" : "kariet"} · <b>{eur(total)}</b>
              </span>
              <button className="scan-round" onClick={stop} aria-label="Vypnúť kameru">
                ×
              </button>
            </div>
            <div className="scan-bottom">
              {fresh && lastCard ? (
                <div className="scan-toast ok" key={last.key}>
                  {lastCard.img && <img src={lastCard.img} alt="" />}
                  <div>
                    <b>{lastCard.name}</b>
                    <span>
                      {lastCard.code}
                      {lastCard.v ? ` · ${lastCard.v}` : ""}
                    </span>
                  </div>
                  <b className="scan-toast-price">{eur(price(lastCard.id))}</b>
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
                  Zapnúť kameru
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

      <div className="scan-sum row between wrapr gap">
        <div>
          <b>{list.length}</b> {list.length === 1 ? "karta" : list.length >= 2 && list.length <= 4 ? "karty" : "kariet"} ·{" "}
          spolu <b className="scan-total">{eur(total)}</b>
        </div>
        <div className="row gap">
          {list.length > 0 && (
            <button className="btn ghost sm" onClick={() => setList([])}>
              Vymazať
            </button>
          )}
          {list.length > 0 &&
            (user ? (
              <button className="btn sm" onClick={addAll}>
                {added ? "Pridané ✓" : "Pridať do zbierky"}
              </button>
            ) : (
              <Link className="btn ghost sm" href="/login">
                Prihlás sa a pridaj do zbierky
              </Link>
            ))}
        </div>
      </div>

      <ul className="scan-list">
        {list.map((x) => {
          const c = cards.byId.get(x.id);
          return (
            <li key={x.key}>
              {c?.img && <img src={c.img} alt="" loading="lazy" />}
              <div className="grow">
                <div className="row between gap">
                  <b>{c?.name ?? x.id}</b>
                  <b>{eur(price(x.id))}</b>
                </div>
                <div className="small muted">
                  {c?.code} {c?.v ? `· ${c.v}` : ""} · {c?.rarity}
                  {debug ? ` · ${x.score.toFixed(2)}` : ""}
                </div>
                {x.alts.length > 0 && (
                  <div className="scan-alts">
                    <span className="tiny muted">Iná verzia?</span>
                    {x.alts.slice(0, 5).map((a) => {
                      const ac = cards.byId.get(a);
                      return (
                        <button key={a} onClick={() => change(x.key, a)} title={ac?.name}>
                          {ac?.code === c?.code ? ac?.v || "Základná" : `${ac?.name} ${ac?.code}`} · {eur(price(a), 0)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <button className="scan-x" aria-label="Odstrániť" onClick={() => setList((l) => l.filter((y) => y.key !== x.key))}>
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
