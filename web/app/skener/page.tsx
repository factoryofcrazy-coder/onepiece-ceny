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
const T_ACCEPT = 0.45; // priemer pri 3 zhodách z 5 snímok
const T_ACCEPT5 = 0.4; // priemer pri 5 zhodách z 5
const T_EMPTY = 0.36; // pod tým = v rámiku asi nie je karta

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
  const hist = useRef<Hit[]>([]);
  const lastAccepted = useRef<string | null>(null);
  const emptyRun = useRef(0);

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
      const best = top[0];
      if (!best || best.score < T_EMPTY) {
        // prázdny rámik → po chvíli sa smie znova pridať tá istá karta
        if (++emptyRun.current >= 4) lastAccepted.current = null;
        hist.current = [];
        return;
      }
      emptyRun.current = 0;
      hist.current = [...hist.current.slice(-4), best];
      const votes = hist.current.filter((h) => h.id === best.id);
      const avg = votes.reduce((s, h) => s + h.score, 0) / votes.length;
      const ok = (votes.length >= 3 && avg >= T_ACCEPT) || (votes.length >= 5 && avg >= T_ACCEPT5);
      if (ok && lastAccepted.current !== best.id) {
        lastAccepted.current = best.id;
        accept(top);
      }
    },
    [accept],
  );

  // jedna snímka: výrez rámika z videa → 224×313 → worker
  const tick = useCallback(() => {
    const v = videoRef.current, f = frameRef.current, w = workerRef.current;
    if (!v || !f || !w || busy.current || v.readyState < 2) return;
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
    busy.current = true;
    w.postMessage({ type: "scan", seq: ++seq.current, pixels: px }, [px.buffer]);
  }, []);

  const stop = useCallback(() => {
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
  const sure = !!cur && cur.id === lastAccepted.current;

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

  return (
    <div className="scan-page">
      <div className="row between wrapr gap">
        <h1>Skener</h1>
        <label className="small muted row gap">
          <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} /> ladenie
        </label>
      </div>

      <div className={`scan-cam ${state}`}>
        <video ref={videoRef} playsInline muted />
        <div className="scan-shade" />
        <div ref={frameRef} className={`scan-frame ${sure ? "sure" : curCard ? "maybe" : ""}`} style={{ aspectRatio: CARD_RATIO }}>
          {state === "on" && curCard && (
            <div className="scan-tag">
              <b>{curCard.name}</b>
              <span>
                {curCard.code}
                {curCard.v ? ` · ${curCard.v}` : ""} · {eur(price(curCard.id))}
              </span>
            </div>
          )}
        </div>
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
        {state === "on" && (
          <button className="btn ghost sm scan-stop" onClick={stop}>
            Vypnúť
          </button>
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
