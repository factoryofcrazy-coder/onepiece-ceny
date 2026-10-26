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
import RpsOverlay from "./RpsOverlay";
import { Icon, type IconName } from "./icons";
import { recordBotGame, useDonSkin, type DonSkin } from "@/lib/donSkins";

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

const HEART = <Icon name="heart" size={13} />;

export default function Board({ s, me, byCode, mode, onAction, busy, error, elo, onExit, onResign, onTimeout, result, gameId }: BoardProps) {
  const clock = useGameClock(s, onTimeout);
  const { skin: donSkin, choose: chooseSkin } = useDonSkin();
  // koniec hry proti botovi sa zapíše do štatistík DON!! skinov (raz za hru)
  const [newSkins, setNewSkins] = useState<DonSkin[]>([]);
  const recorded = useRef(false);
  useEffect(() => {
    if (mode !== "bot" || s.winner == null || recorded.current) return;
    recorded.current = true;
    setNewSkins(recordBotGame(s.winner === me));
  }, [s.winner, mode, me]);
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

  // počas zápasu: výška navigácie pre rozloženie na celú obrazovku, pätička sa skryje
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>("header.nav");
    const root = document.documentElement;
    const set = () => root.style.setProperty("--navh", `${Math.round(nav?.getBoundingClientRect().height ?? 64)}px`);
    set();
    const ro = nav && typeof ResizeObserver !== "undefined" ? new ResizeObserver(set) : null;
    if (nav && ro) ro.observe(nav);
    document.body.classList.add("in-match");
    return () => {
      ro?.disconnect();
      document.body.classList.remove("in-match");
    };
  }, []);

  // keď od hráča niečo treba (blocker, counter, DON!! …), posuň stred stola do zorného poľa
  const midRef = useRef<HTMLDivElement>(null);
  const promptKey = pr ? `${pr.kind}:${s.log.length}` : "";
  const [sheetMin, setSheetMin] = useState(false);
  useEffect(() => setSheetMin(false), [promptKey]);
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
        aria-label={`${d.name}${lead ? " (leader)" : ""}${pw != null ? `, sila ${pw}` : ""}${c.rested ? ", v rest" : ""}${c.don ? `, ${c.don} DON!!` : ""}`}
        aria-pressed={sel === iid || attacking === iid || picked.includes(iid)}
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
        {!d.scripted && <span className="warn" title="Efekt tejto karty zatiaľ nepoznáme, hrá sa bez neho">!</span>}
        {c.don > 0 && (
          <span className="dons" title={`${c.don} DON!! pripojené`}>
            {Array.from({ length: Math.min(c.don, 4) }, (_, i) => (
              <i key={i} className="tok" />
            ))}
            {c.don > 1 && <b className="dn">{c.don}</b>}
          </span>
        )}
      </button>
    );
  };

  const Plate = (p: P) => {
    const x = s.players[p];
    const on = s.active === p && s.winner == null && s.turn > 0;
    return (
      <div className={`plate ${p === me ? "pme" : "popp"} ${on ? "on" : ""}`}>
        <span className="av" aria-hidden>
          {(x.name || "?").slice(0, 1).toUpperCase()}
        </span>
        <span className="pinfo">
          <span className="nm">
            {x.name}
            {elo?.[p] != null && <span className="elo">ELO {elo[p]}</span>}
          </span>
          <span className="st">
            <span title="Karty v ruke">
              <Icon name="hand" size={13} /> <b>{x.hand.length}</b>
            </span>
            <span title="DON!! na poli">
              DON!! <b>{donOnField(s, p)}</b>/10
            </span>
          </span>
        </span>
        {clock && (
          <span
            className={`clk ${clock.actor === p ? "run" : ""} ${clock.ms[p] < 120_000 ? "low" : ""} ${clock.ms[p] <= 0 ? "out" : ""}`}
            title="Zostávajúci čas na celú hru"
            role="timer"
            aria-label={`Čas: ${fmtClock(clock.ms[p])}`}
          >
            <Icon name="clock" size={13} />
            {fmtClock(clock.ms[p])}
          </span>
        )}
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
              return iid ? FieldCard(iid) : <span key={`e${i}`} className="slot vac" />;
            })}
          </div>

          <div data-life={p} className={`a-life life ${hit[p] ? "hit" : ""} ${s.turn > 0 && lifeN <= 1 ? "low" : ""} ${lifeN === 0 ? "vac" : ""}`} title={`Life: ${lifeN}`}>
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
            <div className={`pile ${x.deck.length ? "" : "vac"}`} title={`Balíček: ${x.deck.length}`}>
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
            <button className={`pile trash ${x.trash.length ? "" : "vac"}`} onClick={() => x.trash.length && setTrashOf(p)} title="Pozrieť trash">
              {trashTop && card(trashTop) ? <CardImg card={card(trashTop)!} eager /> : <i className="back" />}
              {!x.trash.length && <span className="lbl">Trash</span>}
              <span className="cnt">{x.trash.length}</span>
            </button>
          </div>

          <div className="a-dond">
            <div className={`pile dondeck ${x.donDeck ? "" : "vac"}`} title={`DON!! balíček: ${x.donDeck}`}>
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
              {x.donActive} aktívne, {x.donRested} v rest
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
    // kameň-papier-nožnice má vlastný modál nad stolom – v strednom páse len krátka poznámka
    if (s.prompt && (s.prompt.kind === "rps" || s.prompt.kind === "firstChoice")) return <p className="hint">Rozhoduje sa, kto začne.</p>;
    if (s.prompt && s.prompt.p !== me) {
      const who = s.players[s.prompt.p].name;
      return (
        <div className="gprompt wait">
          <span className="spin" /> {mode === "bot" ? "Bot rozmýšľa…" : `Rozhoduje ${who}…`}
        </div>
      );
    }
    if (pr) return PromptView();
    if (busy)
      return (
        <div className="gprompt wait">
          <span className="spin" /> Posielam ťah…
        </div>
      );
    if (attacking)
      return (
        <div className="actbar">
          <span className="hint">
            <Icon name="swords" size={15} /> Na koho zaútočí <b>{name(attacking)}</b> ({power(s, attacking)})? Na súperovho leadera alebo postavu v rest.
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
              {canPlay(sel) ? (
                <>
                  <Icon name="play" size={13} /> Zahrať za {handCost(s, sel)} DON!!
                </>
              ) : (
                `Chýbajú ti DON!! (treba ${handCost(s, sel)})`
              )}
            </button>
          ) : (
            <>
              {canAttack(sel) && (
                <button className="btn sm" onClick={() => (setAttacking(sel), setSel(null))}>
                  <Icon name="swords" size={14} /> Útočiť
                </button>
              )}
              {P0.donActive > 0 && sel !== P0.stage && (
                <button className="btn ghost sm" onClick={() => send({ type: "attachDon", p: me, target: sel })} title={`Pripojiť 1 DON!! (aktívnych ${P0.donActive})`}>
                  <Icon name="plus" size={13} /> DON!! <span className="muted">{P0.donActive}</span>
                </button>
              )}
              {activ.map((a) => (
                <button key={a.ability} className="btn ghost sm" onClick={() => send(a)}>
                  <Icon name="spark" size={13} /> Aktivovať efekt
                </button>
              ))}
            </>
          )}
          <button className="btn ghost sm" onClick={() => (setZoom(sel), setSel(null))}>
            <Icon name="eye" size={14} /> Detail
          </button>
        </div>
      );
    }
    if (s.battle) return BattleView();
    if (myTurn)
      return (
        <p className="hint" title="Dvojklik na kartu v ruke ju zahrá hneď">
          Zahraj kartu z ruky, alebo klikni na leadera či postavu, ak chceš pridať DON!! alebo útočiť.
        </p>
      );
    return (
      <p className="hint">
        <span className="spin" aria-hidden /> Na ťahu je <b>{s.players[s.active].name}</b>
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
        <span className="vs" aria-label="proti">
          <Icon name="swords" size={16} />
        </span>
        <span className="side">
          <span className={t > a ? "win" : "lose"}>{t}</span>
          <small>{name(b.target)}</small>
        </span>
      </div>
    );
  };

  // Výzvy: jednoduché rozhodnutia sú kompaktný riadok v strednom páse (s kartou, ktorá ich spúšťa),
  // výzvy s ďalšími kartami alebo riadkami (hľadanie v balíčku, trigger, vrátenie DON!!) sa otvoria ako panel nad stolom.
  const PromptView = () => {
    const p = pr!;
    // karty, ktoré nie sú na stole ani v mojej ruke (trash, pozreté karty, Life…) – ukážu sa priamo vo výzve
    const visible = new Set([...fieldOf(s, 0), ...fieldOf(s, 1), ...s.players[me].hand]);
    const offBoard = p.kind === "choose" ? p.options.filter((i) => i !== "don" && !visible.has(i) && s.cards[i]) : [];
    const top = s.stack[s.stack.length - 1];
    const effectSrc = top && s.cards[top.source] ? top.source : null;
    const battleSrc = s.battle && s.cards[s.battle.attacker] ? s.battle.attacker : null;

    let icon: IconName = "question";
    let title = "";
    let desc: ReactNode = null;
    let body: ReactNode = null;
    let acts: ReactNode = null;
    let src: string | null = null;
    let sheet = false;

    switch (p.kind) {
      case "oneOf":
        title = p.label;
        src = effectSrc;
        sheet = p.options.length > 3 || p.options.some((o) => o.length > 28);
        acts = p.options.map((o, k) => (
          <button key={k} className="btn ghost sm" onClick={() => answer({ option: k })}>
            {o}
          </button>
        ));
        break;
      case "mulligan":
        icon = "swap";
        title = "Necháš si túto ruku?";
        desc = `Ak sa ti nepáči, raz si môžeš zobrať 5 nových kariet. ${s.first === me ? "Začínaš ty." : "Začína súper."}`;
        acts = (
          <>
            <button className="btn ghost sm" onClick={() => answer({ yes: true })}>
              Chcem nové karty
            </button>
            <button className="btn sm" onClick={() => answer({ yes: false })}>
              Nechám si ich
            </button>
          </>
        );
        break;
      case "choose":
        icon = "spark";
        title = p.label;
        src = effectSrc;
        sheet = offBoard.length > 0;
        desc = (
          <>
            {offBoard.length ? "Vyber nižšie" : "Klikni na zvýraznené karty"}: {howMany(p.min, p.max)}
            {p.maxTotalCost != null ? `, spolu cost najviac ${p.maxTotalCost}` : ""}
            {p.distinctNames ? ", každá s iným menom" : ""}.
            {picked.length > 0 && <b> Vybral si: {picked.map(name).join(", ")}</b>}
          </>
        );
        if (offBoard.length)
          body = (
            <div className="gpicks">
              {offBoard.map((i) => {
                const c = card(i);
                return (
                  <button
                    key={i}
                    className={`gpick ${picked.includes(i) ? "on" : ""}`}
                    aria-pressed={picked.includes(i)}
                    aria-label={name(i)}
                    onClick={() => togglePick(i)}
                    {...hover(i)}
                  >
                    {c ? <CardImg card={c} eager /> : <span className="cimg ph">{name(i)}</span>}
                    {picked.includes(i) && (
                      <span className="hpick" aria-hidden>
                        <Icon name="check" size={13} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        acts = (
          <>
            {p.options.includes("don") && (
              <button className={`btn ghost sm ${picked.includes("don") ? "on" : ""}`} onClick={() => setPicked(picked.includes("don") ? [] : ["don"])}>
                DON!! súpera
              </button>
            )}
            {p.min === 0 && (
              <button className="btn ghost sm" onClick={() => answer({ pick: [] })}>
                Nič
              </button>
            )}
            <button className="btn sm" disabled={picked.length < p.min || (p.min === 0 && !picked.length)} onClick={() => answer({ pick: picked })}>
              Potvrdiť{p.max > 1 ? ` (${picked.length})` : ""}
            </button>
          </>
        );
        break;
      case "payCost":
        icon = "question";
        title = p.label;
        src = effectSrc;
        desc = "Efekt je nepovinný. Ak nezaplatíš, jednoducho sa nepoužije.";
        acts = (
          <>
            <button className="btn ghost sm" onClick={() => answer({ yes: false })}>
              Nie
            </button>
            <button className="btn sm" onClick={() => answer({ yes: true })}>
              Zaplatiť
            </button>
          </>
        );
        break;
      case "donSource": {
        icon = "return";
        title = p.label;
        src = effectSrc;
        sheet = true;
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
                <button disabled={!val} onClick={() => set(val - 1)} aria-label={`Menej – ${label}`}>
                  −
                </button>
                <b>{val}</b>
                <button disabled={val >= have || full} onClick={() => set(val + 1)} aria-label={`Viac – ${label}`}>
                  +
                </button>
              </span>
            </div>
          );
        desc = (
          <>
            Vráť {p.atLeast ? `aspoň ${p.n}` : p.n} DON!! do DON!! balíčka. Máš vybrané: <span className={`progress ${ok ? "ok" : ""}`}>{total}</span>
          </>
        );
        body = (
          <div className="donrows">
            {row("Aktívne DON!!", P0.donActive, d.active, (v) => setD({ ...d, active: Math.max(0, Math.min(P0.donActive, v)) }))}
            {row("DON!! v rest", P0.donRested, d.rested, (v) => setD({ ...d, rested: Math.max(0, Math.min(P0.donRested, v)) }), true)}
            {fieldOf(s, me)
              .filter((i) => s.cards[i].don > 0)
              .map((i) =>
                row(`Na karte ${name(i)}`, s.cards[i].don, d.attached[i] ?? 0, (v) =>
                  setD({ ...d, attached: { ...d.attached, [i]: Math.max(0, Math.min(s.cards[i].don, v)) } }),
                ),
              )}
          </div>
        );
        acts = (
          <button className="btn sm" disabled={!ok} onClick={() => answer({ don: d })}>
            Vrátiť {total} DON!!
          </button>
        );
        break;
      }
      case "orderTriggers":
        icon = "order";
        title = "Spúšťa sa viac efektov naraz. Ktorý pôjde prvý?";
        sheet = true;
        body = (
          <div className="opts col">
            {p.options.map((k) => (
              <button key={k} className="btn ghost sm" onClick={() => answer({ order: k })}>
                {s.pending[k]?.label}
              </button>
            ))}
          </div>
        );
        break;
      case "blocker":
        icon = "shield";
        src = battleSrc;
        title = `Zablokuješ útok so silou ${power(s, s.battle!.attacker)}?`;
        desc = `${name(s.battle!.attacker)} útočí na ${name(s.battle!.target)}. Klikni na postavu s [Blocker] alebo ju vyber vpravo.`;
        acts = (
          <>
            {p.options.map((i) => (
              <button key={i} className="btn ghost sm" onClick={() => answer({ pick: [i] })}>
                <Icon name="shield" size={13} /> {name(i)} ({power(s, i)})
              </button>
            ))}
            <button className="btn sm" onClick={() => answer({ pick: [] })}>
              Neblokovať
            </button>
          </>
        );
        break;
      case "counter": {
        const b = s.battle!;
        const atk = power(s, b.attacker);
        const tgt = power(s, b.target);
        const bonus = picked.reduce((a, i) => a + (def(s, i).type === "Character" ? counterOf(s, i) : 0), 0);
        const events = picked.filter((i) => def(s, i).type === "Event");
        const evCost = events.reduce((a, i) => a + def(s, i).cost, 0);
        const ok = tgt + bonus > atk;
        icon = "shield";
        src = battleSrc;
        title = `Ubrániš sa? Útok ${atk} proti ${tgt}`;
        desc = (
          <>
            <span className={`progress ${ok ? "ok" : ""}`}>
              Tvoja obrana {tgt + bonus}
              {events.length ? " + event" : ""} vs {atk}
            </span>{" "}
            · {name(b.attacker)} útočí na {name(b.target)}. Klikni na karty s counterom v ruke.
            {evCost > P0.donActive && <span className="badc"> Na eventy nemáš dosť DON!!</span>}
          </>
        );
        acts = (
          <>
            <button className="btn ghost sm" onClick={() => answer({ counter: [] })}>
              Bez counteru
            </button>
            <button className="btn sm" disabled={!picked.length || evCost > P0.donActive} onClick={() => answer({ counter: picked })}>
              Použiť ({picked.length})
            </button>
          </>
        );
        break;
      }
      case "trigger": {
        const c = card(p.iid);
        icon = "alert";
        title = `Life karta s [Trigger]: ${name(p.iid)}`;
        sheet = true;
        body = (
          <div className="trig">
            {c && <CardImg card={c} className="trigcard" eager />}
            <div className="txt">{richText(def(s, p.iid).text)}</div>
          </div>
        );
        acts = (
          <>
            <button className="btn ghost sm" onClick={() => answer({ yes: false })}>
              Zobrať do ruky
            </button>
            <button className="btn sm" onClick={() => answer({ yes: true })}>
              Spustiť [Trigger]
            </button>
          </>
        );
        break;
      }
      case "trashCharacter":
        icon = "trash";
        title = "Máš 6 postáv. Klikni na tú, ktorá pôjde do trashu.";
        break;
    }

    title = title.replace(/\{([^}]+)\}/g, "$1"); // {Straw Hat Crew} zo skriptov kariet → Straw Hat Crew
    const srcCard = src ? card(src) : undefined;
    const head = (
      <div className="gp-head">
        {src && srcCard ? (
          <button className="gp-src" onClick={() => showDetail(src!)} {...hover(src)} aria-label={`Detail: ${name(src)}`} title={name(src)}>
            <CardImg card={srcCard} eager />
          </button>
        ) : (
          <span className="ic" aria-hidden>
            <Icon name={icon} size={15} />
          </span>
        )}
        <div className="gp-text">
          <h4 title={title}>{title}</h4>
          {desc && <p>{desc}</p>}
        </div>
      </div>
    );

    if (!sheet)
      return (
        <div className="gprompt" role="group" aria-label={title}>
          {head}
          {acts && <div className="acts">{acts}</div>}
        </div>
      );
    return (
      <>
        <div className="gprompt gbar" role="group" aria-label={title}>
          {head}
          <div className="acts">
            <button className="btn ghost sm" onClick={() => setSheetMin((m) => !m)} aria-expanded={!sheetMin}>
              <Icon name="eye" size={14} /> {sheetMin ? "Späť k výberu" : "Pozrieť stôl"}
            </button>
          </div>
        </div>
        {!sheetMin && (
          <div className="gsheet" role="dialog" aria-label={title}>
            {head}
            {body}
            {acts && <div className="acts">{acts}</div>}
          </div>
        )}
      </>
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

  const modeLabel = mode === "bot" ? "Tréning s botom" : mode === "local" ? "Dvaja na jednom zariadení" : "Online zápas";
  const phaseLabel = s.winner != null ? "Koniec hry" : s.turn === 0 ? (s.prompt?.kind === "rps" || s.prompt?.kind === "firstChoice" ? "Kto začne" : "Mulligan") : s.battle ? "Súboj" : s.phase === "main" ? "Main fáza" : "";
  const turnName = s.turn === 0 ? "Začiatok hry" : s.active === me ? (mode === "local" ? s.players[me].name : "Tvoj ťah") : s.players[s.active].name;
  const handDim = myTurn && !pr && !attacking;

  return (
    <div
      className={`gwrap ${zoomLvl > 1 ? "zoomed" : ""} ${donSkin.img ? "has-skin" : ""}`}
      style={{ ["--zoom" as any]: zoomLvl, ...(donSkin.img ? { ["--my-don" as any]: `url(${donSkin.img})` } : {}) }}
    >
      <div className="gtable" ref={tableRef}>
        <div className="gtopbar">
          {Plate(opp)}
          <span className="bks" aria-label={`Súper má v ruke ${oppHand} kariet`} role="img">
            {Array.from({ length: Math.min(oppHand, 12) }, (_, i) => (
              <i key={i} className="bk back" style={{ ["--i" as any]: i, ["--mid" as any]: (Math.min(oppHand, 12) - 1) / 2 }} />
            ))}
          </span>
          <div className="gctl">
            <span className="gmode">{modeLabel}</span>
            <span className="zoomctl" role="group" aria-label="Veľkosť kariet">
              <button onClick={() => bump(-0.1)} disabled={zoomLvl <= 0.8} aria-label="Menšie karty" title="Menšie karty">
                A−
              </button>
              <button onClick={() => bump(0.1)} disabled={zoomLvl >= 1.4} aria-label="Väčšie karty" title="Väčšie karty">
                A+
              </button>
            </span>
            <ReportButton s={s} mode={mode} gameId={gameId} actions={actionLog.current} byCode={byCode} peek={peek} />
            {onResign && s.winner == null && (
              <button
                className={`btn sm ${confirmResign ? "resign" : "ghost danger"}`}
                onClick={() => {
                  if (confirmResign) return onResign();
                  setConfirmResign(true);
                  setTimeout(() => setConfirmResign(false), 4000);
                }}
                title="Vzdať sa"
                aria-label={confirmResign ? "Naozaj sa vzdať?" : "Vzdať sa"}
              >
                <Icon name="flag" size={14} />
                {confirmResign && <span>Naozaj?</span>}
              </button>
            )}
            <button className="btn ghost sm" onClick={onExit} title={mode === "online" ? "Späť do lobby" : "Ukončiť hru"} aria-label={mode === "online" ? "Späť do lobby" : "Ukončiť hru"}>
              <Icon name="exit" size={14} />
            </button>
          </div>
        </div>

        {Half(opp)}
        <div className={`gmid ${s.active === me ? "mine" : "theirs"}`} ref={midRef}>
          <div className="gturn" aria-live="polite">
            <span className="tn">{s.turn === 0 ? "Štart" : `Ťah ${s.turn}`}</span>
            <span className="tw">
              <i className="dot" aria-hidden />
              {turnName}
            </span>
            <span className="ph">{phaseLabel}</span>
          </div>
          <div className="gcenter">
            {middle()}
            {(error || localErr) && (
              <p className="gerr" role="alert">
                {error || localErr}
              </p>
            )}
          </div>
          <div className="gend">
            {myTurn ? (
              <button className={`btn endbtn ${confirmEnd ? "confirm" : ""}`} onClick={endTurn} disabled={busy}>
                {confirmEnd ? "Ešte môžeš útočiť. Naozaj?" : "Ukončiť ťah"}
              </button>
            ) : s.winner == null && s.turn > 0 ? (
              <span className="endwait">{pr ? "Teraz rozhoduješ ty" : s.active === me ? "Súper rozhoduje" : "Hrá súper"}</span>
            ) : null}
          </div>
        </div>
        {Half(me)}

        <div className="tray">
          {Plate(me)}
          <div className={`hand ${handDim ? "dimmable" : ""}`} role="group" aria-label={`Tvoja ruka, ${hand.length} kariet`}>
            {hand.map((iid, i) => {
              const d = s.cards[iid] ? def(s, iid) : null;
              const c = card(iid);
              const playable = canPlay(iid);
              const isCounter = counterOpts.includes(iid) || (pr?.kind === "choose" && pr.options.includes(iid));
              const hc = d ? handCost(s, iid) : 0;
              const rot = hand.length > 1 ? (i - mid) * Math.min(4, 26 / hand.length) : 0;
              const arc = ((i - mid) * (i - mid) - mid * mid) * (hand.length > 6 ? 1.3 : 2.2);
              const off = (pr?.kind === "counter" && !isCounter) || (handDim && !playable);
              return (
                <button
                  key={iid}
                  className={`hc ${playable || isCounter ? "ok" : ""} ${sel === iid ? "sel" : ""} ${picked.includes(iid) ? "picked" : ""} ${off ? "no" : ""}`}
                  style={{ ["--rot" as any]: rot, ["--arc" as any]: arc, ["--ov" as any]: ov, animationDelay: `${Math.min(i, 8) * 40}ms` }}
                  onClick={() => clickHand(iid)}
                  onDoubleClick={() => playable && (send({ type: "play", p: me, iid }), setSel(null))}
                  aria-pressed={sel === iid || picked.includes(iid)}
                  aria-label={`${d?.name ?? "karta"}${d && d.type !== "Leader" ? `, cena ${hc}` : ""}${playable ? ", dá sa zahrať" : ""}${isCounter && pr?.kind === "counter" ? ", counter" : ""}`}
                  {...hover(iid)}
                >
                  {c ? <CardImg card={c} eager /> : <i className="back" style={{ display: "block", aspectRatio: "600/838", borderRadius: 8 }} />}
                  {d && d.type !== "Leader" && <span className={`hcost ${hc < d.cost ? "cheap" : ""}`}>{hc}</span>}
                  {pr?.kind === "counter" && isCounter && d && (
                    <span className="hctr">{d.type === "Character" ? `+${counterOf(s, iid)}` : `event ${handCost(s, iid)} DON!!`}</span>
                  )}
                  {picked.includes(iid) && (
                    <span className="hpick" aria-hidden>
                      <Icon name="check" size={13} />
                    </span>
                  )}
                  {d && !d.scripted && <span className="warn">!</span>}
                </button>
              );
            })}
            {!hand.length && <span className="hand-empty">Ruka je prázdna</span>}
          </div>
        </div>

        {fx.length > 0 && (
          <div className="fxs">
            {fx.map((f) => (
              <span key={f.id} className={`fx ${f.kind}`}>
                {f.kind === "ko" && <Icon name="burst" size={15} />}
                {f.kind === "life" && <Icon name="heart" size={14} />}
                {f.kind === "don" && <Icon name="return" size={14} />}
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
                  <line key={k.id} className="sline" x1={k.x1} y1={k.y1} x2={k.x2} y2={k.y2} style={{ animationDelay: `${k.delay}ms` }} />
                ) : null,
              )}
            </svg>
            {strikes.map((k) =>
              k.t === "atk" ? (
                <span key={k.id} className="clash" style={{ left: k.x2, top: k.y2, animationDelay: `${k.delay + 180}ms` }}>
                  <i className="x" />
                  <b className={k.a >= k.d ? "win" : ""}>{k.a}</b>
                  <em>
                    <Icon name="swords" size={14} />
                  </em>
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
        <RpsOverlay s={s} me={me} busy={busy} onPick={(k) => answer({ rps: k })} onFirst={(f) => answer({ first: f })} />
        {banner && (
          <div key={banner.id} className={`turnbanner ${banner.mine ? "" : "opp"}`}>
            <span>{mode === "local" ? `Hrá ${s.players[s.active].name}` : banner.mine ? "Tvoj ťah" : "Ťah súpera"}</span>
          </div>
        )}
        {s.winner != null && (
          <div className={`gover ${winnerMe || mode === "local" ? "" : "lost"}`}>
            <span className="rays" />
            <h2>{mode === "local" ? `Vyhral ${s.players[s.winner].name}` : winnerMe ? "Víťazstvo!" : "Prehra"}</h2>
            <p>{lastInfo(s)}</p>
            {result}
            {newSkins.length > 0 && (
              <div className="unlocks">
                <span className="ul-t">Odomkol si nový DON!! skin</span>
                <div className="ul-row">
                  {newSkins.map((k) => (
                    <button key={k.id} className={`ul-skin ${donSkin.id === k.id ? "on" : ""}`} onClick={() => chooseSkin(k.id)} title={`Použiť skin ${k.name}`}>
                      {k.img ? <img src={k.img} alt="" /> : <i className="tok" />}
                      <span>{k.name}</span>
                      <b>{donSkin.id === k.id ? "Používaš" : "Použiť"}</b>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="row">
              <button className="btn" onClick={onExit}>
                {mode === "online" ? "Späť do lobby" : "Hrať znova"}
              </button>
            </div>
          </div>
        )}
      </div>

      <aside className="gside">
        {peekIid && s.cards[peekIid] ? (
          <Peek s={s} iid={peekIid} card={card(peekIid)} />
        ) : (
          <div className="peek vac">
            <i className="back" style={{ display: "block" }} />
            Prejdi myšou nad kartu a ukáže sa tu aj s celým efektom.
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
            <h2>Trash: {s.players[trashOf].name}</h2>
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

/** „1 kartu“, „2 karty“, „najviac 3“, „1 až 2“ */
function howMany(min: number, max: number): string {
  const k = (n: number) => (n === 1 ? "kartu" : n >= 2 && n <= 4 ? "karty" : "kariet");
  if (min === max) return `${max} ${k(max)}`;
  if (min === 0) return `najviac ${max}`;
  return `${min} až ${max}`;
}

function PeekText({ s, iid }: { s: GameState; iid: string }) {
  const d = def(s, iid);
  const onField = fieldOf(s, s.cards[iid].owner).includes(iid);
  const pw = onField ? power(s, iid) : d.power;
  return (
    <>
      <div className="pk-head">
        <h3>{d.name}</h3>
        <span className="pk-sub">
          {d.code} · {d.type}
        </span>
      </div>
      <div className="pk-stats">
        {d.type !== "Leader" && (
          <span>
            <i>Cena</i>
            <b>{d.cost}</b>
          </span>
        )}
        {d.type !== "Event" && d.type !== "Stage" && (
          <span className={onField && pw !== d.power ? (pw > d.power ? "up" : "down") : ""}>
            <i>Sila</i>
            <b>{pw}</b>
          </span>
        )}
        {d.counter > 0 && (
          <span>
            <i>Counter</i>
            <b>+{d.counter}</b>
          </span>
        )}
        {d.type === "Leader" && (
          <span>
            <i>Life</i>
            <b>{d.life}</b>
          </span>
        )}
      </div>
      {!d.scripted && <p className="warnline small" style={{ margin: 0 }}>Efekt tejto karty zatiaľ nepoznáme, hrá sa bez neho.</p>}
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
      {card && (
        <div className="pk-img">
          <CardImg card={card} eager />
        </div>
      )}
      <div className="pk-body">
        <PeekText s={s} iid={iid} />
      </div>
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
type LogKind = "play" | "attack" | "ko" | "life" | "don" | "info" | "turn";
function describe(e: GameEvent, s: GameState, name: (iid: string) => string, me: P): { text: string; who: P | null; big?: boolean; k: LogKind } | null {
  const who = (p: P) => s.players[p].name;
  const owner = (iid: string) => (s.cards[iid] ? s.cards[iid].owner : null);
  /** moje udalosti v 2. osobe („Zahral si“), súperove s menom („Bot zahral“) */
  const say = (p: P, mine: string, theirs: string) => (p === me ? mine : `${who(p)} ${theirs}`);
  switch (e.t) {
    case "CardPlayed":
      return { text: say(e.p, `Zahral si ${name(e.iid)}`, `zahral ${name(e.iid)}`), who: e.p, big: true, k: "play" };
    case "EventActivated":
      return { text: say(e.p, `Použil si ${name(e.iid)}`, `použil ${name(e.iid)}`), who: e.p, big: true, k: "play" };
    case "DonReturned":
      return { text: say(e.p, `Vrátil si ${e.n} DON!!`, `vrátil ${e.n} DON!!`), who: e.p, k: "don" };
    case "DonAdded": {
      const what = `${e.n} DON!!${e.state === "rested" ? " v rest" : ""}`;
      return { text: say(e.p, `Dostal si ${what}`, `dostal ${what}`), who: e.p, k: "don" };
    }
    case "KO":
      return { text: `${name(e.iid)} je K.O.`, who: owner(e.iid), big: true, k: "ko" };
    case "LifeDamage":
      return { text: say(e.p, "Prišiel si o Life", "prišiel o Life"), who: e.p, big: true, k: "life" };
    case "LifeFlipped": {
      const what = `${e.n} Life ${e.up ? "lícom hore" : "lícom dole"}`;
      return { text: say(e.p, `Otočil si ${what}`, `otočil ${what}`), who: e.p, k: "life" };
    }
    case "Attack":
      return { text: `${name(e.attacker)} útočí na ${name(e.target)}`, who: owner(e.attacker), k: "attack" };
    case "Turn":
      return { text: e.p === me ? `Ťah ${e.turn}, hráš ty` : `Ťah ${e.turn}, hrá ${who(e.p)}`, who: e.p, k: "turn" };
    case "Info":
      return { text: e.msg, who: null, k: "info" };
    default:
      return null;
  }
}

function fxOf(e: GameEvent, s: GameState, name: (iid: string) => string, me: P): { text: string; kind: string } | null {
  const who = (p: P) => s.players[p].name;
  switch (e.t) {
    case "KO":
      return { text: `${name(e.iid)} je K.O.`, kind: "ko" };
    case "LifeDamage":
      return { text: e.p === me ? "Prišiel si o Life" : `${who(e.p)} prišiel o Life`, kind: "life" };
    case "DonReturned":
      return { text: e.p === me ? `Vrátil si ${e.n} DON!!` : `${who(e.p)} vrátil ${e.n} DON!!`, kind: "don" };
    case "LifeFlipped":
      return { text: `${e.p === me ? "Otočil si" : `${who(e.p)} otočil`} ${e.n} Life ${e.up ? "lícom hore" : "lícom dole"}`, kind: "life" };
    case "CardPlayed":
      return e.p === me ? null : { text: `${who(e.p)} zahral ${name(e.iid)}`, kind: "" };
    case "Info":
      return /blokuje|nestačil|nepoužil/.test(e.msg) ? { text: e.msg, kind: "" } : null;
    default:
      return null;
  }
}

const LOG_ICON = { play: "play", attack: "swords", ko: "burst", life: "heart", don: "return", info: "alert", turn: "clock" } as const;

function Log({ s, name, me }: { s: GameState; name: (iid: string) => string; me: P }) {
  // najnovšie hore
  const rows: { key: number; text: string; cls: string; k: LogKind }[] = [];
  s.log.forEach((e, i) => {
    const d = describe(e, s, name, me);
    if (d) rows.push({ key: i, text: d.text, k: d.k, cls: `${d.who != null ? `p${d.who === me ? 0 : 1}` : ""} ${d.big ? "big" : ""} k-${d.k}` });
  });
  const shown = rows.slice(-60).reverse();
  return (
    <section className="glog" aria-label="Priebeh hry">
      <h5>Priebeh hry</h5>
      <ul>
        {shown.map((r) =>
          r.k === "turn" ? (
            <li key={r.key} className={`turnrow ${r.cls}`}>
              <span>{r.text}</span>
            </li>
          ) : (
            <li key={r.key} className={r.cls}>
              <span className="lk" aria-hidden>
                <Icon name={LOG_ICON[r.k]} size={12} />
              </span>
              <span>{r.text}</span>
            </li>
          ),
        )}
        {!shown.length && <li className="start">Hra sa začína</li>}
      </ul>
    </section>
  );
}
