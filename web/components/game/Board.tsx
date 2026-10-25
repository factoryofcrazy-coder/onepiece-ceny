"use client";
// Hracia plocha – spoločná pre hru proti botovi, dvoch na jednom zariadení aj online.
// Board dostane stav (pri online len pohľad hráča) a posiela akcie cez onAction; pravidlá stráži engine.
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { CardImg } from "@/components/ui";
import type { Card } from "@/lib/data";
import { basePower, blockersFor, counterOf, counterOptions, def, donOnField, fieldOf, handCost, hasKw, mainActions, power } from "@/lib/engine/engine";
import type { Action, AnswerChoice, GameEvent, GameState, P } from "@/lib/engine/types";
import "./game.css";
import { fmtClock, useGameClock } from "./clock";
import ReportButton, { type ActionLog } from "./ReportButton";

export type BoardProps = {
  s: GameState;
  me: P;
  byCode: Map<string, Card>;
  mode: "bot" | "local" | "online";
  onAction: (a: Action) => void;
  busy?: boolean;
  error?: string | null;
  elo?: [number | null, number | null]; // podľa miesta (0/1)
  onExit: () => void;
  onResign?: () => void;
  onTimeout?: () => void; // online: súperovi (alebo mne) vypršal čas – nech to server overí
  result?: ReactNode; // doplnok do obrazovky konca hry (napr. zmena ELO)
  gameId?: string; // online hra – pre hlásenie problémov
};

const HEART = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 5.3 3 1.7-1.9 3.2-3 5.3-3 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21Z" />
  </svg>
);

export default function Board({ s, me, byCode, mode, onAction, busy, error, elo, onExit, onResign, onTimeout, result, gameId }: BoardProps) {
  const clock = useGameClock(s, onTimeout);
  const actionLog = useRef<ActionLog>([]);
  const opp: P = me === 0 ? 1 : 0;
  const [sel, setSel] = useState<string | null>(null);
  const [attacking, setAttacking] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [peek, setPeek] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [trashOf, setTrashOf] = useState<P | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [donPick, setDonPick] = useState<{ active: number; rested: number; attached: Record<string, number> }>({ active: 0, rested: 0, attached: {} });

  const card = (iid: string): Card | undefined => (s.cards[iid] ? byCode.get(s.cards[iid].code) : undefined);
  const name = (iid: string) => (iid === "don" ? "DON!! súpera" : card(iid)?.name ?? s.defs[s.cards[iid]?.code]?.name ?? "karta");

  const myTurn = s.active === me && !s.prompt && s.phase === "main" && !s.stack.length && s.winner == null;
  const acts = useMemo(() => (myTurn ? mainActions(s) : []), [s, myTurn]);
  const canPlay = (iid: string) => acts.some((a) => a.type === "play" && a.iid === iid);
  const canAttack = (iid: string) => acts.some((a) => a.type === "attack" && a.attacker === iid);
  const attackTargets = attacking ? acts.filter((a): a is Extract<Action, { type: "attack" }> => a.type === "attack" && a.attacker === attacking).map((a) => a.target) : [];
  const pr = s.prompt && s.prompt.p === me ? s.prompt : null;
  const chooseOpts = pr?.kind === "choose" || pr?.kind === "trashCharacter" || pr?.kind === "blocker" ? pr.options : [];
  const counterOpts = pr?.kind === "counter" ? counterOptions(s, me) : [];

  // reset výberov pri každej zmene stavu
  useEffect(() => {
    setPicked([]);
    setDonPick({ active: 0, rested: 0, attached: {} });
    setConfirmEnd(false);
    setLocalErr(null);
    setAttacking((a) => (a && myTurn && s.cards[a] && !s.cards[a].rested ? a : null));
    setSel((x) => (x && s.cards[x] && (fieldOf(s, me).includes(x) || s.players[me].hand.includes(x)) && myTurn ? x : null));
  }, [s]); // eslint-disable-line react-hooks/exhaustive-deps

  // pri otvorení hry posuň stôl pod navigáciu, nech je vidno celý
  const tableRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tableRef.current?.scrollIntoView({ block: "start" });
  }, []);

  // keď od hráča niečo treba (blocker, counter, DON!! …), posuň stred stola do zorného poľa
  const midRef = useRef<HTMLDivElement>(null);
  const promptKey = pr ? `${pr.kind}:${s.log.length}` : "";
  useEffect(() => {
    const el = midRef.current;
    if (!promptKey || !el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 70 || r.bottom > window.innerHeight) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [promptKey]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") (setSel(null), setAttacking(null), setZoom(null), setTrashOf(null));
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const send = (a: Action) => {
    if (busy) return;
    setLocalErr(null);
    actionLog.current = [...actionLog.current.slice(-29), { a, turn: s.turn, at: new Date().toISOString(), prompt: s.prompt?.kind }];
    onAction(a);
  };
  const answer = (choice: AnswerChoice) => pr && send({ type: "answer", p: me, choice });

  const isWide = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1101px)").matches;

  // ------------------------------------------------------------ lupa: po chvíľke nad kartou veľký náhľad s efektom priamo pri karte
  const [hz, setHz] = useState<{ iid: string; x: number; y: number; side: "l" | "r" } | null>(null);
  const hzT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hover = (iid: string) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      setPeek(iid);
      clearTimeout(hzT.current);
      if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
      const r = e.currentTarget.getBoundingClientRect();
      hzT.current = setTimeout(() => {
        const side = r.right + 440 < window.innerWidth ? "r" : "l";
        setHz({ iid, x: side === "r" ? r.right + 12 : r.left - 12, y: r.top + r.height / 2, side });
      }, 380);
    },
    onMouseLeave: () => {
      clearTimeout(hzT.current);
      setHz(null);
    },
  });
  useEffect(() => () => clearTimeout(hzT.current), []);
  useEffect(() => setHz(null), [s]);

  // ------------------------------------------------------------ veľkosť kariet (A− / A+), pamätá si ju prehliadač
  const [zoomLvl, setZoomLvl] = useState(1);
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem("op-card-zoom"));
      if (v >= 0.8 && v <= 1.4) setZoomLvl(v);
    } catch {
      /* bez úložiska */
    }
  }, []);
  const bump = (d: number) =>
    setZoomLvl((z) => {
      const n = Math.round(Math.min(1.4, Math.max(0.8, z + d)) * 10) / 10;
      try {
        localStorage.setItem("op-card-zoom", String(n));
      } catch {
        /* bez úložiska */
      }
      return n;
    });
  const showDetail = (iid: string) => (isWide() ? setPeek(iid) : setZoom(iid));

  const clickField = (iid: string) => {
    if (pr && (pr.kind === "choose" || pr.kind === "trashCharacter")) {
      if (!pr.options.includes(iid)) return showDetail(iid);
      if (pr.kind === "trashCharacter") return answer({ pick: [iid] });
      const max = pr.max;
      setPicked((p) => (p.includes(iid) ? p.filter((x) => x !== iid) : max === 1 ? [iid] : p.length < max ? [...p, iid] : p));
      return;
    }
    if (pr?.kind === "blocker") {
      if (pr.options.includes(iid)) return answer({ pick: [iid] });
      return showDetail(iid);
    }
    if (attacking) {
      if (attackTargets.includes(iid)) {
        send({ type: "attack", p: me, attacker: attacking, target: iid });
        setAttacking(null);
      } else if (iid === attacking) setAttacking(null);
      else showDetail(iid);
      return;
    }
    if (myTurn && s.cards[iid]?.owner === me) {
      setSel(sel === iid ? null : iid);
      setPeek(iid);
      return;
    }
    showDetail(iid);
  };
  const togglePick = (iid: string) => {
    if (!pr || pr.kind !== "choose") return;
    const max = pr.max;
    setPicked((p) => (p.includes(iid) ? p.filter((x) => x !== iid) : max === 1 ? [iid] : p.length < max ? [...p, iid] : p));
  };
  const clickHand = (iid: string) => {
    if (pr?.kind === "choose") {
      if (pr.options.includes(iid)) return togglePick(iid);
      return showDetail(iid);
    }
    if (pr?.kind === "counter") {
      if (!counterOpts.includes(iid)) return showDetail(iid);
      setPicked((p) => (p.includes(iid) ? p.filter((x) => x !== iid) : [...p, iid]));
      return;
    }
    setPeek(iid);
    if (myTurn) setSel(sel === iid ? null : iid);
    else showDetail(iid);
  };

  // ------------------------------------------------------------ efekty (toasty, banner, zásah do Life)
  const [fx, setFx] = useState<{ id: number; text: string; kind: string }[]>([]);
  const [banner, setBanner] = useState<{ id: number; mine: boolean } | null>(null);
  const [hit, setHit] = useState<[number, number]>([0, 0]);
  const seen = useRef<{ log: number; turn: number; active: P; life: [number, number] } | null>(null);
  useEffect(() => {
    const life: [number, number] = [s.players[0].life.length, s.players[1].life.length];
    const prev = seen.current;
    seen.current = { log: s.log.length, turn: s.turn, active: s.active, life };
    if (!prev) return;
    const fresh = s.log.slice(prev.log);
    const items = fresh
      .map((e) => fxOf(e, s, name, me))
      .filter((x): x is { text: string; kind: string } => !!x)
      .slice(-3)
      .map((x, i) => ({ ...x, id: Date.now() + i }));
    if (items.length) {
      setFx((f) => [...f, ...items].slice(-4));
      setTimeout(() => setFx((f) => f.filter((x) => !items.includes(x))), 2500);
    }
    if (s.turn !== prev.turn && s.turn > 0 && s.winner == null) {
      const b = { id: Date.now(), mine: s.active === me || mode === "local" };
      setBanner(b);
      setTimeout(() => setBanner((x) => (x === b ? null : x)), 1500);
    }
    const h: [number, number] = [life[0] < prev.life[0] ? Date.now() : 0, life[1] < prev.life[1] ? Date.now() : 0];
    if (h[0] || h[1]) {
      setHit((o) => [h[0] || o[0], h[1] || o[1]]);
      setTimeout(() => setHit([0, 0]), 900);
    }
  }, [s]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------ útoky: šľah od útočníka k cieľu, súboj síl, výbuch pri K.O.
  type Strike =
    | { id: number; t: "atk"; x1: number; y1: number; x2: number; y2: number; a: number; d: number; delay: number }
    | { id: number; t: "boom" | "slash"; x: number; y: number; delay: number };
  const [strikes, setStrikes] = useState<Strike[]>([]);
  const posRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const strikeLog = useRef<number | null>(null);
  useEffect(() => {
    const tb = tableRef.current;
    if (!tb) return;
    const base = tb.getBoundingClientRect();
    const center = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - base.left + r.width / 2, y: r.top - base.top + r.height / 2 };
    };
    const cur = new Map<string, { x: number; y: number }>();
    tb.querySelectorAll<HTMLElement>("[data-iid]").forEach((el) => cur.set(el.dataset.iid!, center(el)));
    const prev = posRef.current;
    posRef.current = cur;
    const from = strikeLog.current;
    strikeLog.current = s.log.length;
    if (from == null || from >= s.log.length) return;
    const at = (iid: string) => cur.get(iid) ?? prev.get(iid);
    const out: Strike[] = [];
    let k = 0;
    for (const e of s.log.slice(from).slice(-6)) {
      const id = Date.now() + Math.random();
      const delay = k * 320;
      if (e.t === "Attack") {
        const A = at(e.attacker);
        const B = at(e.target);
        if (!A || !B) continue;
        const a = s.cards[e.attacker] ? power(s, e.attacker) : 0;
        const d = s.cards[e.target] ? power(s, e.target) : 0;
        out.push({ id, t: "atk", x1: A.x, y1: A.y, x2: B.x, y2: B.y, a, d, delay });
        k++;
      } else if (e.t === "KO") {
        const P_ = prev.get(e.iid) ?? cur.get(e.iid);
        if (P_) (out.push({ id, t: "boom", ...P_, delay }), k++);
      } else if (e.t === "LifeDamage") {
        const el = tb.querySelector(`[data-life="${e.p}"]`);
        if (el) (out.push({ id, t: "slash", ...center(el), delay }), k++);
      }
    }
    if (!out.length) return;
    setStrikes((x) => [...x, ...out].slice(-8));
    const ids = out.map((o) => o.id);
    setTimeout(() => setStrikes((x) => x.filter((o) => !ids.includes(o.id))), 1700 + k * 320);
  }, [s]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------ vykresľovanie
  const flags = (iid: string) => {
    const c = s.cards[iid];
    const cls: string[] = [];
    if (c?.rested) cls.push("rested");
    if (chooseOpts.includes(iid) || attackTargets.includes(iid)) cls.push("hl");
    if (picked.includes(iid)) cls.push("picked");
    if (sel === iid || attacking === iid) cls.push("sel");
    if (s.battle?.attacker === iid) cls.push("atk");
    if (s.battle?.target === iid) cls.push("tgt");
    if ((pr?.kind === "choose" || attacking) && chooseOpts.length + attackTargets.length && !chooseOpts.includes(iid) && !attackTargets.includes(iid) && attacking !== iid) cls.push("dim");
    return cls.join(" ");
  };

  const FieldCard = (iid: string, lead?: boolean) => {
    const c = s.cards[iid];
    const d = def(s, iid);
    const cd = card(iid);
    const pw = d.type === "Stage" ? null : power(s, iid);
    const base = d.type === "Stage" ? 0 : basePower(s, iid) === d.power ? d.power : basePower(s, iid);
    return (
      <button
        key={iid}
        className={`fc ${lead ? "lead" : ""} ${flags(iid)}`}
        data-iid={iid}
        onClick={() => clickField(iid)}
        {...hover(iid)}
      >
        <span className="img">{cd ? <CardImg card={cd} eager /> : <span className="cimg ph">{d.name}</span>}</span>
        {pw != null && <span className={`pow ${pw > d.power || base > d.power ? "up" : pw < d.power ? "down" : ""}`}>{pw}</span>}
        <span className="kw">
          {hasKw(s, iid, "blocker") && <i title="Blocker">B</i>}
          {d.type === "Character" && hasKw(s, iid, "rush") && <i className="rush" title="Rush">R</i>}
          {hasKw(s, iid, "doubleAttack") && <i className="da" title="Double Attack">2×</i>}
        </span>
        {!d.scripted && <span className="warn" title="Efekt zatiaľ nie je naprogramovaný – hrá sa bez efektu">!</span>}
        {c.don > 0 && (
          <span className="dons" title={`${c.don} DON!! pripojené`}>
            {Array.from({ length: Math.min(c.don, 6) }, (_, i) => (
              <i key={i} className="tok" />
            ))}
          </span>
        )}
      </button>
    );
  };

  const Plate = (p: P) => {
    const x = s.players[p];
    return (
      <div className={`plate ${p === me ? "pme" : "popp"}`}>
        <span className="av">{(x.name || "?").slice(0, 1).toUpperCase()}</span>
        <span style={{ minWidth: 0 }}>
          <div className="nm">{x.name}</div>
          <div className="st">
            {elo?.[p] != null && <span className="elo">ELO {elo[p]}</span>}
            {clock && (
              <span
                className={`clk ${clock.actor === p ? "run" : ""} ${clock.ms[p] < 120_000 ? "low" : ""} ${clock.ms[p] <= 0 ? "out" : ""}`}
                title="Zostávajúci čas na celú hru"
              >
                ⏱ {fmtClock(clock.ms[p])}
              </span>
            )}
            <span>
              ruka <b>{x.hand.length}</b>
            </span>
            <span>
              DON!! <b>{donOnField(s, p)}</b>/10
            </span>
          </div>
        </span>
      </div>
    );
  };

  const Half = (p: P) => {
    const x = s.players[p];
    const top = p !== me;
    const lifeN = x.life.length;
    const dons = x.donActive + x.donRested;
    const trashTop = x.trash[x.trash.length - 1];
    const turn = s.active === p && s.winner == null;
    return (
      <div className={`half ${top ? "opp" : "me"} ${turn ? "turn" : ""}`}>
        <div className="mat">
          <div className="a-chars chars">
            <span className="zlabel">Postavy {x.characters.length}/5</span>
            {Array.from({ length: 5 }, (_, i) => {
              const iid = x.characters[i];
              return iid ? FieldCard(iid) : <span key={`e${i}`} className="slot empty" />;
            })}
          </div>

          <div data-life={p} className={`a-life life ${hit[p] ? "hit" : ""} ${s.turn > 0 && lifeN <= 1 ? "low" : ""} ${lifeN === 0 ? "empty" : ""}`} title={`Life: ${lifeN}`}>
            <div className="life-stack" style={{ ["--n" as any]: Math.max(0, lifeN - 1) }}>
              {/* x.life[0] = vrch Life; lícom hore otočené karty sú vidieť obom hráčom */}
              {x.life.map((iid, i) => {
                const up = iid !== "hidden" && s.cards[iid]?.faceUp ? card(iid) : undefined;
                return up ? (
                  <span key={iid} className="lup" style={{ ["--i" as any]: i }} {...hover(iid)} onClick={() => showDetail(iid)} title={`${up.name} – Life lícom hore`}>
                    <CardImg card={up} />
                  </span>
                ) : (
                  <i key={i} className="back" style={{ ["--i" as any]: i }} />
                );
              })}
            </div>
            <span className="life-num" style={s.turn === 0 ? { opacity: 0.4 } : undefined}>
              {HEART}
              {lifeN}
            </span>
          </div>

          <div className="a-core core">
            {FieldCard(x.leader, true)}
            {x.stage ? FieldCard(x.stage) : <span className="stage-slot">Stage</span>}
          </div>

          <div className="a-deck">
            <div className={`pile ${x.deck.length ? "" : "empty"}`} title={`Balíček: ${x.deck.length}`}>
              {x.deck.length ? (
                <>
                  <i className="back" />
                  {x.deck.length > 10 && <i className="back" />}
                  {x.deck.length > 25 && <i className="back" />}
                </>
              ) : (
                <i className="back" />
              )}
              <span className="cnt">{x.deck.length}</span>
            </div>
          </div>

          <div className="a-trash">
            <button className={`pile trash ${x.trash.length ? "" : "empty"}`} onClick={() => x.trash.length && setTrashOf(p)} title="Trash – zobraziť">
              {trashTop && card(trashTop) ? <CardImg card={card(trashTop)!} eager /> : <i className="back" />}
              {!x.trash.length && <span className="lbl">Trash</span>}
              <span className="cnt">{x.trash.length}</span>
            </button>
          </div>

          <div className="a-dond">
            <div className={`pile dondeck ${x.donDeck ? "" : "empty"}`} title={`DON!! balíček: ${x.donDeck}`}>
              <i className="back" />
              <span className="cnt">{x.donDeck}</span>
            </div>
          </div>

          <div className={`a-cost cost-area ${dons > 6 ? "many" : ""}`}>
            {Array.from({ length: x.donActive }, (_, i) => (
              <i key={`a${i}`} className="tok" />
            ))}
            {Array.from({ length: x.donRested }, (_, i) => (
              <i key={`r${i}`} className="tok r" />
            ))}
            {!dons && <span className="zlabel" style={{ position: "static", background: "none" }}>Cost area</span>}
            <span className="cost-sum">
              {x.donActive} aktívne · {x.donRested} rest
            </span>
          </div>
        </div>
      </div>
    );
  };

  // ------------------------------------------------------------ stred: súboj / akcie / prompt
  const selCard = sel ? s.cards[sel] : null;
  const selInHand = sel ? s.players[me].hand.includes(sel) : false;
  const P0 = s.players[me];
  const anyAttackLeft = acts.some((a) => a.type === "attack");

  const middle = () => {
    if (s.winner != null) return null;
    if (s.prompt && s.prompt.p !== me)
      return (
        <div className="gprompt wait">
          <span className="spin" /> {mode === "bot" ? "Bot premýšľa…" : `Čaká sa na hráča ${s.players[s.prompt.p].name}…`}
        </div>
      );
    if (pr) return PromptView();
    if (busy)
      return (
        <div className="gprompt wait">
          <span className="spin" /> Odosielam ťah…
        </div>
      );
    if (attacking)
      return (
        <div className="actbar">
          <span className="hint">
            Vyber cieľ útoku pre <b>{name(attacking)}</b> ({power(s, attacking)}) – súperov leader alebo postava v rest
          </span>
          <button className="btn ghost sm" onClick={() => setAttacking(null)}>
            Zrušiť
          </button>
        </div>
      );
    if (myTurn && sel && selCard) {
      const activ = acts.filter((a): a is Extract<Action, { type: "activate" }> => a.type === "activate" && a.iid === sel);
      return (
        <div className="actbar">
          <span className="who">{name(sel)}</span>
          {selInHand ? (
            <button className="btn sm" disabled={!canPlay(sel)} onClick={() => (send({ type: "play", p: me, iid: sel }), setSel(null))}>
              {canPlay(sel) ? `Zahrať (${handCost(s, sel)} DON!!)` : `Treba ${handCost(s, sel)} aktívnych DON!!`}
            </button>
          ) : (
            <>
              {canAttack(sel) && (
                <button className="btn sm" onClick={() => (setAttacking(sel), setSel(null))}>
                  ⚔ Útočiť
                </button>
              )}
              {P0.donActive > 0 && sel !== P0.stage && (
                <button className="btn ghost sm" onClick={() => send({ type: "attachDon", p: me, target: sel })}>
                  +1 DON!! <span className="muted">({P0.donActive})</span>
                </button>
              )}
              {activ.map((a) => (
                <button key={a.ability} className="btn ghost sm" onClick={() => send(a)}>
                  ✦ Aktivovať efekt
                </button>
              ))}
            </>
          )}
          <button className="btn ghost sm" onClick={() => (setZoom(sel), setSel(null))}>
            Detail
          </button>
        </div>
      );
    }
    if (s.battle) return BattleView();
    if (myTurn)
      return (
        <p className="hint">
          <b>Tvoj ťah.</b> Klikni na kartu v ruke a zahraj ju, na leadera/postavu pre DON!! alebo útok. Dvojklik v ruke = zahrať hneď.
        </p>
      );
    return (
      <p className="hint">
        Na ťahu je <b>{s.players[s.active].name}</b>…
      </p>
    );
  };

  const BattleView = () => {
    const b = s.battle!;
    const a = power(s, b.attacker);
    const t = power(s, b.target);
    return (
      <div className="battle">
        <span className="side">
          <span className={a >= t ? "win" : "lose"}>{a}</span>
          <small>{name(b.attacker)}</small>
        </span>
        <span className="vs">VS</span>
        <span className="side">
          <span className={t > a ? "win" : "lose"}>{t}</span>
          <small>{name(b.target)}</small>
        </span>
      </div>
    );
  };

  const PromptView = () => {
    const p = pr!;
    // karty, ktoré nie sú na stole ani v mojej ruke (trash, pozreté karty, Life…) – ukážu sa priamo vo výzve
    const visible = new Set([...fieldOf(s, 0), ...fieldOf(s, 1), ...s.players[me].hand]);
    const offBoard = p.kind === "choose" ? p.options.filter((i) => i !== "don" && !visible.has(i) && s.cards[i]) : [];
    switch (p.kind) {
      case "oneOf":
        return (
          <div className="gprompt">
            <h4>
              <span className="ic">?</span> {p.label}
            </h4>
            <div className="opts">
              {p.options.map((o, k) => (
                <button key={k} className="btn ghost sm" onClick={() => answer({ option: k })}>
                  {o}
                </button>
              ))}
            </div>
          </div>
        );
      case "mulligan":
        return (
          <div className="gprompt">
            <h4>
              <span className="ic">↻</span> Ponecháš si túto ruku?
            </h4>
            <p>Môžeš raz vymeniť všetkých 5 kariet za nové (mulligan). {s.first === me ? "Začínaš ty." : "Začína súper."}</p>
            <div className="acts">
              <button className="btn ghost sm" onClick={() => answer({ yes: true })}>
                Vymeniť ruku
              </button>
              <button className="btn sm" onClick={() => answer({ yes: false })}>
                Ponechať
              </button>
            </div>
          </div>
        );
      case "choose":
        return (
          <div className="gprompt">
            <h4>
              <span className="ic">✦</span> {p.label}
            </h4>
            <p>
              {offBoard.length ? "Klikni na karty nižšie" : "Klikni na zvýraznené karty"} – vyber {p.min === p.max ? p.max : `${p.min}–${p.max}`}
              {p.maxTotalCost != null ? ` (spolu cost ≤ ${p.maxTotalCost})` : ""}
              {p.distinctNames ? " (rôzne mená)" : ""}.{" "}
              {picked.length > 0 && <b style={{ color: "var(--text)" }}>Vybraté: {picked.map(name).join(", ")}</b>}
            </p>
            {offBoard.length > 0 && (
              <div className="pcards">
                {offBoard.map((i) => {
                  const c = card(i);
                  return (
                    <button key={i} className={`pcard ${picked.includes(i) ? "on" : ""}`} onClick={() => togglePick(i)} {...hover(i)}>
                      {c ? <CardImg card={c} eager /> : <span className="cimg ph">{name(i)}</span>}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="acts">
              {p.options.includes("don") && (
                <button className={`btn ghost sm ${picked.includes("don") ? "on" : ""}`} onClick={() => setPicked(picked.includes("don") ? [] : ["don"])}>
                  DON!! súpera
                </button>
              )}
              {p.min === 0 && (
                <button className="btn ghost sm" onClick={() => answer({ pick: [] })}>
                  Nič nevyberať
                </button>
              )}
              <button className="btn sm" disabled={picked.length < p.min || (p.min === 0 && !picked.length)} onClick={() => answer({ pick: picked })}>
                Potvrdiť
              </button>
            </div>
          </div>
        );
      case "payCost":
        return (
          <div className="gprompt">
            <h4>
              <span className="ic">?</span> {p.label}
            </h4>
            <div className="acts">
              <button className="btn ghost sm" onClick={() => answer({ yes: false })}>
                Nie
              </button>
              <button className="btn sm" onClick={() => answer({ yes: true })}>
                Áno, zaplatiť
              </button>
            </div>
          </div>
        );
      case "donSource":
        return DonSource();
      case "orderTriggers":
        return (
          <div className="gprompt">
            <h4>
              <span className="ic">⇅</span> Viac efektov naraz – ktorý ide prvý?
            </h4>
            <div className="opts">
              {p.options.map((k) => (
                <button key={k} className="btn ghost sm" onClick={() => answer({ order: k })}>
                  {s.pending[k]?.label}
                </button>
              ))}
            </div>
          </div>
        );
      case "blocker":
        return (
          <div className="gprompt">
            <h4>
              <span className="ic">⛨</span> {name(s.battle!.attacker)} ({power(s, s.battle!.attacker)}) útočí na {name(s.battle!.target)}
            </h4>
            <p>Môžeš zablokovať – klikni na zvýrazneného [Blocker]-a alebo vyber nižšie.</p>
            <div className="acts">
              {p.options.map((i) => (
                <button key={i} className="btn ghost sm" onClick={() => answer({ pick: [i] })}>
                  {name(i)} ({power(s, i)})
                </button>
              ))}
              <button className="btn sm" onClick={() => answer({ pick: [] })}>
                Neblokovať
              </button>
            </div>
          </div>
        );
      case "counter": {
        const b = s.battle!;
        const atk = power(s, b.attacker);
        const tgt = power(s, b.target);
        const bonus = picked.reduce((a, i) => a + (def(s, i).type === "Character" ? counterOf(s, i) : 0), 0);
        const events = picked.filter((i) => def(s, i).type === "Event");
        const evCost = events.reduce((a, i) => a + def(s, i).cost, 0);
        const ok = tgt + bonus > atk;
        return (
          <div className="gprompt">
            <h4>
              <span className="ic">⛨</span> Counter: {name(b.attacker)} {atk} → {name(b.target)} {tgt}
            </h4>
            <p>
              Klikni na karty v ruke s counterom (svietia). Postava pridá svoj counter, [Counter] event stojí DON!!.{" "}
              <span className={`progress ${ok ? "ok" : ""}`}>
                {tgt + bonus}
                {events.length ? " + event" : ""} vs {atk}
              </span>
              {evCost > P0.donActive && <span className="badc"> – na eventy nemáš dosť DON!!</span>}
            </p>
            <div className="acts">
              <button className="btn ghost sm" onClick={() => answer({ counter: [] })}>
                Bez counteru
              </button>
              <button className="btn sm" disabled={!picked.length || evCost > P0.donActive} onClick={() => answer({ counter: picked })}>
                Použiť ({picked.length})
              </button>
            </div>
          </div>
        );
      }
      case "trigger": {
        const c = card(p.iid);
        return (
          <div className="gprompt">
            <h4>
              <span className="ic">!</span> Life karta má [Trigger]: {name(p.iid)}
            </h4>
            <div className="row gap" style={{ alignItems: "flex-start" }}>
              {c && <CardImg card={c} className="trigcard" eager />}
              <p style={{ flex: 1 }}>{def(s, p.iid).text}</p>
            </div>
            <div className="acts">
              <button className="btn ghost sm" onClick={() => answer({ yes: false })}>
                Vziať do ruky
              </button>
              <button className="btn sm" onClick={() => answer({ yes: true })}>
                Aktivovať [Trigger]
              </button>
            </div>
          </div>
        );
      }
      case "trashCharacter":
        return (
          <div className="gprompt">
            <h4>
              <span className="ic">!</span> Máš 6 postáv – klikni na jednu, ktorá pôjde do trashu
            </h4>
          </div>
        );
    }
  };

  const DonSource = () => {
    const p = pr as Extract<GameState["prompt"], { kind: "donSource" }>;
    const d = donPick;
    const setD = setDonPick;
    const total = d.active + d.rested + Object.values(d.attached).reduce((a, b) => a + b, 0);
    const ok = p.atLeast ? total >= p.n : total === p.n;
    const full = !p.atLeast && total >= p.n;
    const row = (label: string, have: number, val: number, set: (v: number) => void, rested?: boolean) =>
      have > 0 && (
        <div className="donrow" key={label}>
          <span className="tokrow">
            {Array.from({ length: Math.min(have, 8) }, (_, i) => (
              <i key={i} className={`tok ${rested ? "r" : ""} ${i < val ? "pick" : ""}`} onClick={() => set(i + 1 === val ? i : i + 1)} />
            ))}
          </span>
          <span className="lab">{label}</span>
          <span className="stepper">
            <button disabled={!val} onClick={() => set(val - 1)}>
              −
            </button>
            <b>{val}</b>
            <button disabled={val >= have || full} onClick={() => set(val + 1)}>
              +
            </button>
          </span>
        </div>
      );
    return (
      <div className="gprompt">
        <h4>
          <span className="ic">↩</span> {p.label}
        </h4>
        <p>
          Vráť {p.atLeast ? `aspoň ${p.n}` : p.n} DON!! do DON!! balíčka. Vybraté: <span className={`progress ${ok ? "ok" : ""}`}>{total}</span>
        </p>
        {row("Aktívne v cost area", P0.donActive, d.active, (v) => setD({ ...d, active: Math.max(0, Math.min(P0.donActive, v)) }))}
        {row("V rest v cost area", P0.donRested, d.rested, (v) => setD({ ...d, rested: Math.max(0, Math.min(P0.donRested, v)) }), true)}
        {fieldOf(s, me)
          .filter((i) => s.cards[i].don > 0)
          .map((i) =>
            row(`Pripojené na ${name(i)}`, s.cards[i].don, d.attached[i] ?? 0, (v) =>
              setD({ ...d, attached: { ...d.attached, [i]: Math.max(0, Math.min(s.cards[i].don, v)) } }),
            ),
          )}
        <div className="acts">
          <button className="btn sm" disabled={!ok} onClick={() => answer({ don: d })}>
            Vrátiť {total} DON!!
          </button>
        </div>
      </div>
    );
  };

  // ------------------------------------------------------------ ruka
  const hand = P0.hand;
  const mid = (hand.length - 1) / 2;
  const ov = hand.length > 7 ? -0.42 : hand.length > 5 ? -0.28 : -0.12;
  const oppHand = s.players[opp].hand.length;

  const endTurn = () => {
    if (anyAttackLeft && !confirmEnd) {
      setConfirmEnd(true);
      setTimeout(() => setConfirmEnd(false), 3500);
      return;
    }
    send({ type: "endTurn", p: me });
  };

  const winnerMe = s.winner === me;
  const peekIid = zoom ?? peek;

  return (
    <div className="gwrap" style={{ ["--zoom" as any]: zoomLvl }}>
      <div className="gtable" ref={tableRef}>
        <div className="gtop">
          <span className={`turnpill ${s.active === me ? "mine" : ""}`}>
            <span className="tn">Ťah {Math.max(1, s.turn)}</span>
            <span className="dot" />
            {s.turn === 0 ? "Príprava" : s.active === me ? (mode === "local" ? s.players[me].name : "Tvoj ťah") : s.players[s.active].name}
          </span>
          <span className="phase">{s.battle ? "Súboj" : s.phase === "main" ? "Main fáza" : s.phase === "setup" ? "Mulligan" : ""}</span>
          <span className="sp" />
          <span className="zoomctl" title="Veľkosť kariet">
            <button onClick={() => bump(-0.1)} disabled={zoomLvl <= 0.8} aria-label="Menšie karty">
              A−
            </button>
            <button onClick={() => bump(0.1)} disabled={zoomLvl >= 1.4} aria-label="Väčšie karty">
              A+
            </button>
          </span>
          <ReportButton s={s} mode={mode} gameId={gameId} actions={actionLog.current} byCode={byCode} peek={peek} />
          {onResign && s.winner == null && (
            <button
              className={`btn sm ${confirmResign ? "" : "ghost danger"}`}
              onClick={() => {
                if (confirmResign) return onResign();
                setConfirmResign(true);
                setTimeout(() => setConfirmResign(false), 4000);
              }}
            >
              {confirmResign ? "Naozaj sa vzdať?" : "Vzdať sa"}
            </button>
          )}
          <button className="btn ghost sm" onClick={onExit}>
            {mode === "online" ? "Späť" : "Ukončiť"}
          </button>
          {myTurn ? (
            <button className={`btn endbtn ${confirmEnd ? "confirm" : ""}`} onClick={endTurn} disabled={busy}>
              {confirmEnd ? "Máš ešte útoky – ukončiť?" : "Ukončiť ťah"}
            </button>
          ) : null}
        </div>

        <div className="hands-opp" aria-label={`Súper má v ruke ${oppHand} kariet`}>
          {Plate(opp)}
          {Array.from({ length: Math.min(oppHand, 12) }, (_, i) => (
            <i key={i} className="bk back" style={{ ["--i" as any]: i, ["--mid" as any]: (Math.min(oppHand, 12) - 1) / 2 }} />
          ))}
        </div>

        {Half(opp)}
        <div className="gmid" ref={midRef}>
          {middle()}
          {(error || localErr) && <p className="gerr">{error || localErr}</p>}
        </div>
        {Half(me)}

        {Plate(me)}
        <div className="hand">
          {hand.map((iid, i) => {
            const d = s.cards[iid] ? def(s, iid) : null;
            const c = card(iid);
            const playable = canPlay(iid);
            const isCounter = counterOpts.includes(iid) || (pr?.kind === "choose" && pr.options.includes(iid));
            const hc = d ? handCost(s, iid) : 0;
            const rot = hand.length > 1 ? (i - mid) * Math.min(4, 26 / hand.length) : 0;
            const arc = ((i - mid) * (i - mid) - mid * mid) * (hand.length > 6 ? 1.3 : 2.2);
            return (
              <button
                key={iid}
                className={`hc ${playable || isCounter ? "ok" : ""} ${sel === iid ? "sel" : ""} ${picked.includes(iid) ? "picked" : ""} ${pr?.kind === "counter" && !isCounter ? "no" : ""}`}
                style={{ ["--rot" as any]: rot, ["--arc" as any]: arc, ["--ov" as any]: ov, animationDelay: `${Math.min(i, 8) * 40}ms` }}
                onClick={() => clickHand(iid)}
                onDoubleClick={() => playable && (send({ type: "play", p: me, iid }), setSel(null))}
                {...hover(iid)}
              >
                {c ? <CardImg card={c} eager /> : <i className="back" style={{ display: "block", aspectRatio: "600/838", borderRadius: 8 }} />}
                {d && d.type !== "Leader" && <span className={`hcost ${hc < d.cost ? "cheap" : ""}`}>{hc}</span>}
                {pr?.kind === "counter" && isCounter && d && (
                  <span className="hctr">{d.type === "Character" ? `+${counterOf(s, iid)}` : `event ${handCost(s, iid)} DON!!`}</span>
                )}
                {d && !d.scripted && <span className="warn">!</span>}
              </button>
            );
          })}
        </div>

        {fx.length > 0 && (
          <div className="fxs">
            {fx.map((f) => (
              <span key={f.id} className={`fx ${f.kind}`}>
                {f.text}
              </span>
            ))}
          </div>
        )}
        {strikes.length > 0 && (
          <div className="strikes" aria-hidden>
            <svg>
              {strikes.map((k) =>
                k.t === "atk" ? (
                  <line key={k.id} className="streak" x1={k.x1} y1={k.y1} x2={k.x2} y2={k.y2} style={{ animationDelay: `${k.delay}ms` }} />
                ) : null,
              )}
            </svg>
            {strikes.map((k) =>
              k.t === "atk" ? (
                <span key={k.id} className="clash" style={{ left: k.x2, top: k.y2, animationDelay: `${k.delay + 180}ms` }}>
                  <i className="x" />
                  <b className={k.a >= k.d ? "win" : ""}>{k.a}</b>
                  <em>⚔</em>
                  <b className={k.a < k.d ? "win" : ""}>{k.d}</b>
                </span>
              ) : (
                <span key={k.id} className={k.t} style={{ left: k.x, top: k.y, animationDelay: `${k.delay}ms` }}>
                  {k.t === "boom" && Array.from({ length: 8 }, (_, i) => <i key={i} style={{ ["--a" as any]: `${i * 45}deg` }} />)}
                </span>
              ),
            )}
          </div>
        )}
        {banner && (
          <div key={banner.id} className={`turnbanner ${banner.mine ? "" : "opp"}`}>
            <span>{mode === "local" ? `Na ťahu: ${s.players[s.active].name}` : banner.mine ? "Tvoj ťah" : "Ťah súpera"}</span>
          </div>
        )}
        {s.winner != null && (
          <div className={`gover ${winnerMe || mode === "local" ? "" : "lost"}`}>
            <span className="rays" />
            <h2>{mode === "local" ? `Vyhral ${s.players[s.winner].name}` : winnerMe ? "Víťazstvo!" : "Prehra"}</h2>
            <p>{lastInfo(s)}</p>
            {result}
            <div className="row">
              <button className="btn" onClick={onExit}>
                {mode === "online" ? "Späť do lobby" : "Nová hra"}
              </button>
            </div>
          </div>
        )}
      </div>

      <aside className="gside">
        {peekIid && s.cards[peekIid] ? (
          <Peek s={s} iid={peekIid} card={card(peekIid)} />
        ) : (
          <div className="peek empty">
            <i className="back" style={{ display: "block" }} />
            Prejdi myšou na kartu – uvidíš ju tu zväčšenú aj s efektom.
          </div>
        )}
        <Log s={s} name={name} me={me} />
      </aside>

      {hz && s.cards[hz.iid] && (
        <div className={`hzoom ${hz.side}`} style={{ left: hz.x, top: hz.y }} aria-hidden>
          {card(hz.iid) && <CardImg card={card(hz.iid)!} eager />}
          <div className="hztext">
            <PeekText s={s} iid={hz.iid} />
          </div>
        </div>
      )}
      {zoom && s.cards[zoom] && (
        <div className="modal" onClick={() => setZoom(null)}>
          <div className="mbox" onClick={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => setZoom(null)}>
              ×
            </button>
            {card(zoom) && <CardImg card={card(zoom)!} className="big" />}
            <div className="mtext">
              <PeekText s={s} iid={zoom} />
            </div>
          </div>
        </div>
      )}
      {trashOf != null && (
        <div className="modal" onClick={() => setTrashOf(null)}>
          <div className="mbox" style={{ display: "block", maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => setTrashOf(null)}>
              ×
            </button>
            <h2>Trash – {s.players[trashOf].name}</h2>
            <div className="trashgrid">
              {[...s.players[trashOf].trash].reverse().map((iid) => {
                const c = card(iid);
                return c ? <CardImg key={iid} card={c} /> : null;
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PeekText({ s, iid }: { s: GameState; iid: string }) {
  const d = def(s, iid);
  const onField = fieldOf(s, s.cards[iid].owner).includes(iid);
  return (
    <>
      <h3>{d.name}</h3>
      <div className="meta">
        <span>{d.code}</span>
        <span>{d.type}</span>
        {d.type !== "Leader" && (
          <span>
            cost <b>{d.cost}</b>
          </span>
        )}
        {d.type !== "Event" && d.type !== "Stage" && (
          <span>
            power <b>{onField ? power(s, iid) : d.power}</b>
          </span>
        )}
        {d.counter > 0 && (
          <span>
            counter <b>+{d.counter}</b>
          </span>
        )}
        {d.type === "Leader" && (
          <span>
            life <b>{d.life}</b>
          </span>
        )}
      </div>
      {!d.scripted && <p className="warnline small" style={{ margin: 0 }}>Efekt tejto karty zatiaľ nie je naprogramovaný – hrá sa bez efektu.</p>}
      {d.text && <div className="txt">{richText(d.text)}</div>}
    </>
  );
}

/** zvýrazní [On Play], [When Attacking], [DON!! x1]… ako farebné štítky */
function richText(t: string): ReactNode[] {
  return t.split(/(\[[^\]]{1,40}\])/g).map((part, i) => {
    const m = part.match(/^\[(.+)\]$/);
    if (!m) return part;
    const k = m[1].toLowerCase();
    const cls = /don/.test(k) ? "don" : /counter/.test(k) ? "ctr" : /trigger/.test(k) ? "trg" : /blocker|rush|double attack|banish/.test(k) ? "kw" : /once per turn/.test(k) ? "opt" : "tm";
    return (
      <b key={i} className={`kwt ${cls}`}>
        {m[1]}
      </b>
    );
  });
}

function Peek({ s, iid, card }: { s: GameState; iid: string; card?: Card }) {
  return (
    <div className="peek">
      {card && <CardImg card={card} eager />}
      <PeekText s={s} iid={iid} />
    </div>
  );
}

function lastInfo(s: GameState) {
  for (let i = s.log.length - 1; i >= 0; i--) {
    const e = s.log[i];
    if (e.t === "Info") return e.msg;
  }
  return "";
}

/** riadok priebehu hry */
function describe(e: GameEvent, s: GameState, name: (iid: string) => string): { text: string; who: P | null; big?: boolean } | null {
  const who = (p: P) => s.players[p].name;
  const owner = (iid: string) => (s.cards[iid] ? s.cards[iid].owner : null);
  switch (e.t) {
    case "CardPlayed":
      return { text: `${who(e.p)} zahral ${name(e.iid)}`, who: e.p, big: true };
    case "DonReturned":
      return { text: `${who(e.p)} vrátil ${e.n} DON!!`, who: e.p };
    case "DonAdded":
      return { text: `${who(e.p)} +${e.n} DON!! ${e.state === "active" ? "aktívne" : "v rest"}`, who: e.p };
    case "KO":
      return { text: `${name(e.iid)} je K.O.`, who: owner(e.iid), big: true };
    case "LifeDamage":
      return { text: `${who(e.p)} stratil Life`, who: e.p, big: true };
    case "LifeFlipped":
      return { text: `${who(e.p)} otočil ${e.n} Life ${e.up ? "lícom hore" : "lícom dole"}`, who: e.p };
    case "Attack":
      return { text: `${name(e.attacker)} útočí na ${name(e.target)}`, who: owner(e.attacker) };
    case "CardDrawn":
      return null;
    case "Info":
      return { text: e.msg, who: null };
  }
}

function fxOf(e: GameEvent, s: GameState, name: (iid: string) => string, me: P): { text: string; kind: string } | null {
  switch (e.t) {
    case "KO":
      return { text: `💥 ${name(e.iid)} je K.O.`, kind: "ko" };
    case "LifeDamage":
      return { text: `${e.p === me ? "Stratil si" : `${s.players[e.p].name} stratil`} Life`, kind: "life" };
    case "DonReturned":
      return { text: `↩ ${s.players[e.p].name}: DON!! −${e.n}`, kind: "don" };
    case "LifeFlipped":
      return { text: `${e.p === me ? "Otočil si" : `${s.players[e.p].name} otočil`} ${e.n} Life ${e.up ? "lícom hore" : "lícom dole"}`, kind: "life" };
    case "CardPlayed":
      return e.p === me ? null : { text: `${s.players[e.p].name} zahral ${name(e.iid)}`, kind: "" };
    case "Info":
      return /blokuje|bez účinku|nedá použiť/.test(e.msg) ? { text: e.msg, kind: "" } : null;
    default:
      return null;
  }
}

function Log({ s, name, me }: { s: GameState; name: (iid: string) => string; me: P }) {
  // najnovšie hore
  const rows: { key: number; text: string; cls: string }[] = [];
  s.log.forEach((e, i) => {
    const d = describe(e, s, name);
    if (d) rows.push({ key: i, text: d.text, cls: `${d.who != null ? `p${d.who === me ? 0 : 1}` : ""} ${d.big ? "big" : ""}` });
  });
  const shown = rows.slice(-60).reverse();
  return (
    <ul className="glog">
      <h5>Priebeh hry</h5>
      {shown.map((r) => (
        <li key={r.key} className={r.cls}>
          {r.text}
        </li>
      ))}
      {!shown.length && <li>Hra sa začína…</li>}
    </ul>
  );
}
