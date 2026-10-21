"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CardImg, DataError, Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { Card, useCards } from "@/lib/data";
import { botAction } from "@/lib/engine/bot";
import { buildDef } from "@/lib/engine/cards";
import {
  applyAction, blockersFor, counterOptions, def, donOnField, fieldOf, handCost, hasKw, IllegalAction, mainActions, newGame, power,
} from "@/lib/engine/engine";
import { DECK_ST01, DECK_ST26 } from "@/lib/engine/fixtures";
import type { Action, AnswerChoice, CardDef, GameEvent, GameState, P } from "@/lib/engine/types";
import { sb } from "@/lib/supabase";

type DeckOpt = { id: string; name: string; leader: string; cards: string[] };
const PRESETS: DeckOpt[] = [
  { id: "st26", ...DECK_ST26, name: "Starter: Fialový Luffy (ST-26)" },
  { id: "st01", ...DECK_ST01, name: "Starter: Červený Luffy (ST-01)" },
];

export default function GamePage() {
  const { data: cards, error } = useCards();
  const { user } = useAuth();
  const [myDecks, setMyDecks] = useState<DeckOpt[]>([]);
  const [game, setGame] = useState<{ s: GameState; mode: "bot" | "local" } | null>(null);

  useEffect(() => {
    if (!user) return;
    sb()
      .from("decks")
      .select("id,name,leader_id,cards,user_id")
      .eq("user_id", user.id)
      .then(({ data }) =>
        setMyDecks(
          (data ?? [])
            .filter((d: any) => d.leader_id && Object.values(d.cards as Record<string, number>).reduce((a, b) => a + b, 0) >= 40) // len hrateľné decky
            .map((d: any) => ({ id: d.id, name: d.name, leader: d.leader_id, cards: Object.entries(d.cards as Record<string, number>).flatMap(([c, n]) => Array(n).fill(c)) })),
        ),
      );
  }, [user]);

  const byCode = useMemo(() => {
    const m = new Map<string, Card>();
    cards?.cards.forEach((c) => {
      const cur = m.get(c.code);
      if (!cur || (cur.v && !c.v)) m.set(c.code, c);
    });
    return m;
  }, [cards]);

  if (error) return <DataError error={error} file="cards" />;
  if (!cards) return <Loading what="Pripravujem hru" shape="tiles" />;

  if (!game) return <Lobby decks={[...myDecks, ...PRESETS]} byCode={byCode} onStart={(s, mode) => setGame({ s, mode })} />;
  return <Board initial={game.s} mode={game.mode} byCode={byCode} onExit={() => setGame(null)} />;
}

// ------------------------------------------------------------------ výber deckov
function Lobby({ decks, byCode, onStart }: { decks: DeckOpt[]; byCode: Map<string, Card>; onStart: (s: GameState, mode: "bot" | "local") => void }) {
  const [a, setA] = useState(decks[0]?.id ?? "st26");
  const [b, setB] = useState("st01");
  const [mode, setMode] = useState<"bot" | "local">("bot");
  const [err, setErr] = useState<string | null>(null);

  const start = () => {
    const da = decks.find((d) => d.id === a)!;
    const db = decks.find((d) => d.id === b)!;
    const defs: Record<string, CardDef> = {};
    const missing: string[] = [];
    for (const code of new Set([da.leader, db.leader, ...da.cards, ...db.cards])) {
      const c = byCode.get(code);
      if (!c) {
        missing.push(code);
        continue;
      }
      defs[code] = buildDef({ ...c, traits: c.traits });
    }
    if (missing.length) return setErr(`V databáze chýbajú karty: ${missing.join(", ")}`);
    const s = newGame(
      [
        { name: mode === "bot" ? "Ty" : "Hráč 1", leader: da.leader, cards: da.cards },
        { name: mode === "bot" ? "Bot" : "Hráč 2", leader: db.leader, cards: db.cards },
      ],
      defs,
      Math.floor(Math.random() * 2147483647),
      Math.random() < 0.5 ? 0 : 1,
    );
    onStart(s, mode);
  };

  const stat = (d: DeckOpt) => {
    const codes = [...new Set(d.cards)];
    const ok = codes.filter((c) => {
      const card = byCode.get(c);
      return card && buildDef(card).scripted;
    }).length;
    return `${d.cards.length} kariet, efekty naprogramované pre ${ok}/${codes.length}`;
  };

  return (
    <div className="lobby">
      <h1>Hra</h1>
      <p className="muted">
        Pravidlá a efekty kariet stráži engine. Plne naprogramované sú zatiaľ starter decky ST-01 a ST-26. Karty bez naprogramovaného
        efektu sa hrajú bez efektu a sú označené výkričníkom.
      </p>
      <div className="lobby-grid">
        <label className="field">
          <span>Tvoj deck</span>
          <select value={a} onChange={(e) => setA(e.target.value)}>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <span className="small muted">{stat(decks.find((d) => d.id === a)!)}</span>
        </label>
        <label className="field">
          <span>Súper</span>
          <select value={b} onChange={(e) => setB(e.target.value)}>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <span className="small muted">{stat(decks.find((d) => d.id === b)!)}</span>
        </label>
      </div>
      <div className="seg">
        <button className={mode === "bot" ? "on" : ""} onClick={() => setMode("bot")}>
          Proti botovi
        </button>
        <button className={mode === "local" ? "on" : ""} onClick={() => setMode("local")}>
          Dvaja na jednom zariadení
        </button>
      </div>
      {err && <p className="badc">{err}</p>}
      <button className="btn" onClick={start}>
        Začať hru
      </button>
      <p className="small muted">
        Svoje decky si postavíš v <Link href="/decky">Deckoch</Link>. Online hra s kamošmi príde v ďalšej verzii.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ hracia plocha
function Board({ initial, mode, byCode, onExit }: { initial: GameState; mode: "bot" | "local"; byCode: Map<string, Card>; onExit: () => void }) {
  const [s, setS] = useState(initial);
  const [toast, setToast] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null); // vybraná vlastná karta
  const [attacking, setAttacking] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [cover, setCover] = useState<P | null>(null);

  const actor: P = s.prompt ? s.prompt.p : s.active;
  const me: P = mode === "bot" ? 0 : actor;
  const opp: P = me === 0 ? 1 : 0;

  // dvaja na jednom zariadení: pri striedaní hráča prekry obrazovku
  const [lastViewer, setLastViewer] = useState<P>(me);
  useEffect(() => {
    if (mode === "local" && me !== lastViewer && s.winner == null) {
      setCover(me);
      setLastViewer(me);
    }
  }, [me, mode, lastViewer, s.winner]);

  const act = (a: Action) => {
    try {
      setS((cur) => applyAction(cur, a));
      setToast(null);
    } catch (e) {
      setToast(e instanceof IllegalAction ? e.message : String(e));
    }
    setSel(null);
    setAttacking(null);
  };

  // bot
  useEffect(() => {
    if (mode !== "bot" || s.winner != null) return;
    const a = botAction(s, 1);
    if (!a) return;
    const t = setTimeout(() => {
      try {
        setS((cur) => applyAction(cur, a));
      } catch (e) {
        // bot narazil na nelegálnu akciu – ukonči ťah
        setS((cur) => (cur.active === 1 && !cur.prompt ? applyAction(cur, { type: "endTurn", p: 1 }) : cur));
      }
    }, 650);
    return () => clearTimeout(t);
  }, [s, mode]);

  const card = (iid: string): Card | undefined => byCode.get(s.cards[iid]?.code);
  const myTurn = s.active === me && !s.prompt && s.phase === "main" && !s.stack.length;
  const acts = myTurn ? mainActions(s) : [];
  const canPlay = (iid: string) => acts.some((a) => a.type === "play" && a.iid === iid);
  const canAttack = (iid: string) => acts.some((a) => a.type === "attack" && a.attacker === iid);
  const attackTargets = attacking ? acts.filter((a) => a.type === "attack" && a.attacker === attacking).map((a) => (a as any).target as string) : [];
  const choose = s.prompt?.kind === "choose" && s.prompt.p === me ? s.prompt : null;
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => setPicked([]), [s.prompt]);

  const clickCard = (iid: string) => {
    if (choose) {
      if (!choose.options.includes(iid)) return;
      setPicked((p) => (p.includes(iid) ? p.filter((x) => x !== iid) : p.length < choose.max ? [...p, iid] : choose.max === 1 ? [iid] : p));
      return;
    }
    if (attacking) {
      if (attackTargets.includes(iid)) act({ type: "attack", p: me, attacker: attacking, target: iid });
      else setAttacking(null);
      return;
    }
    const c = s.cards[iid];
    if (c.owner === me && myTurn) {
      if (s.players[me].hand.includes(iid)) {
        if (canPlay(iid)) act({ type: "play", p: me, iid });
        else setZoom(iid);
        return;
      }
      setSel(sel === iid ? null : iid);
      return;
    }
    setZoom(iid);
  };

  const P0 = s.players[me];
  const P1 = s.players[opp];
  const winnerName = s.winner != null ? s.players[s.winner].name : null;

  return (
    <div className="board">
      {cover != null && mode === "local" && (
        <div className="cover">
          <h2>Na rade je {s.players[cover].name}</h2>
          <p className="muted">Odovzdaj zariadenie – druhý hráč nech sa nepozerá.</p>
          <button className="btn" onClick={() => setCover(null)}>
            Som pripravený
          </button>
        </div>
      )}

      <div className="gbar">
        <button className="btn ghost sm" onClick={onExit}>
          Ukončiť hru
        </button>
        <span className="small">
          Ťah {s.turn} – {s.players[s.active].name} {s.battle ? "útočí" : ""}
        </span>
        {myTurn && (
          <button className="btn sm" onClick={() => act({ type: "endTurn", p: me })}>
            Ukončiť ťah
          </button>
        )}
      </div>

      {winnerName && (
        <div className="winner">
          <h2>{s.winner === me || mode === "local" ? `Vyhral ${winnerName}!` : "Prehral si."}</h2>
          <button className="btn" onClick={onExit}>
            Nová hra
          </button>
        </div>
      )}

      <Side s={s} p={opp} top byCode={byCode} onCard={clickCard} highlight={[...attackTargets, ...(choose?.options ?? [])]} picked={picked} />

      <div className="midline">
        <PromptPanel s={s} me={me} picked={picked} setPicked={setPicked} byCode={byCode} answer={(c) => act({ type: "answer", p: me, choice: c })} />
        {toast && <p className="badc small">{toast}</p>}
      </div>

      <Side s={s} p={me} byCode={byCode} onCard={clickCard} highlight={choose?.options ?? []} picked={picked} selected={sel} />

      {sel && myTurn && (
        <div className="actmenu">
          <b>{card(sel)?.name}</b>
          {canAttack(sel) && (
            <button className="btn sm" onClick={() => (setAttacking(sel), setSel(null))}>
              Útočiť
            </button>
          )}
          {P0.donActive > 0 && sel !== P0.stage && (
            <button className="btn ghost sm" onClick={() => act({ type: "attachDon", p: me, target: sel })}>
              +1 DON!!
            </button>
          )}
          {acts
            .filter((a): a is Extract<Action, { type: "activate" }> => a.type === "activate" && a.iid === sel)
            .map((a) => (
              <button key={a.ability} className="btn ghost sm" onClick={() => act(a)}>
                Aktivovať efekt
              </button>
            ))}
          <button className="btn ghost sm" onClick={() => (setZoom(sel), setSel(null))}>
            Detail
          </button>
        </div>
      )}
      {attacking && <p className="hint">Vyber cieľ útoku – súperovho leadera alebo postavu v rest.</p>}

      <div className="hand">
        {P0.hand.map((iid) => {
          const c = card(iid);
          const playable = canPlay(iid) || (s.prompt?.kind === "counter" && s.prompt.p === me && counterOptions(s, me).includes(iid));
          return (
            <button key={iid} className={`hcard ${playable ? "ok" : ""}`} onClick={() => clickCard(iid)} title={c?.name}>
              {c && <CardImg card={c} eager />}
              <span className="hcost">{handCost(s, iid)}</span>
              {!def(s, iid).scripted && <span className="unscripted" title="Efekt zatiaľ nie je naprogramovaný">!</span>}
            </button>
          );
        })}
      </div>

      <Log s={s} byCode={byCode} />
      {zoom && <Zoom s={s} iid={zoom} card={card(zoom)} onClose={() => setZoom(null)} />}
      <p className="small muted center">
        DON!!: {P0.donActive} aktívnych, {P0.donRested} v rest, balíček {P0.donDeck} · súper na poli {donOnField(s, opp)} · karty v balíčku: {P0.deck.length} / súper {P1.deck.length}
      </p>
    </div>
  );
}

function Side({
  s, p, top, byCode, onCard, highlight, picked, selected,
}: {
  s: GameState; p: P; top?: boolean; byCode: Map<string, Card>; onCard: (iid: string) => void; highlight: string[]; picked: string[]; selected?: string | null;
}) {
  const x = s.players[p];
  const C = (iid: string, big?: boolean) => {
    const c = s.cards[iid];
    const card = byCode.get(c.code);
    const d = def(s, iid);
    return (
      <button
        key={iid}
        className={`bcard ${big ? "lead" : ""} ${c.rested ? "rested" : ""} ${highlight.includes(iid) ? "hl" : ""} ${picked.includes(iid) ? "picked" : ""} ${selected === iid ? "sel" : ""} ${s.battle?.attacker === iid ? "atk" : ""} ${s.battle?.target === iid ? "tgt" : ""}`}
        onClick={() => onCard(iid)}
        title={d.name}
      >
        {card && <CardImg card={card} eager />}
        {d.type !== "Stage" && <span className="bpow">{power(s, iid)}</span>}
        {c.don > 0 && <span className="bdon">+{c.don}</span>}
        {hasKw(s, iid, "blocker") && <span className="bkw">B</span>}
        {!d.scripted && <span className="unscripted">!</span>}
      </button>
    );
  };
  return (
    <div className={`side ${top ? "top" : ""}`}>
      <div className="zone pinfo">
        <b>{x.name}</b>
        <span>Life {x.life.length}</span>
        <span>Ruka {x.hand.length}</span>
        <span>Trash {x.trash.length}</span>
        <span className="don">
          DON!! <b>{x.donActive}</b>
          <span className="muted">+{x.donRested} rest</span>
        </span>
      </div>
      <div className="zone lead">
        {C(x.leader, true)}
        {x.stage && C(x.stage)}
        <div className="lifestack" title={`Life: ${x.life.length}`}>
          {x.life.map((_, i) => (
            <i key={i} style={{ ["--i" as any]: i }} />
          ))}
        </div>
      </div>
      <div className="zone chars">{x.characters.map((i) => C(i))}</div>
    </div>
  );
}

function PromptPanel({
  s, me, picked, setPicked, byCode, answer,
}: {
  s: GameState; me: P; picked: string[]; setPicked: (p: string[]) => void; byCode: Map<string, Card>; answer: (c: AnswerChoice) => void;
}) {
  const pr = s.prompt;
  const [don, setDon] = useState<{ active: number; rested: number; attached: Record<string, number> }>({ active: 0, rested: 0, attached: {} });
  useEffect(() => setDon({ active: 0, rested: 0, attached: {} }), [pr]);
  if (!pr) {
    if (s.battle) return <p className="small muted">Súboj: {power(s, s.battle.attacker)} vs {power(s, s.battle.target)}</p>;
    return null;
  }
  if (pr.p !== me) return <p className="small muted">Čaká sa na súpera…</p>;
  const name = (iid: string) => (iid === "don" ? "DON!! súpera" : byCode.get(s.cards[iid].code)?.name ?? iid);
  const x = s.players[me];
  switch (pr.kind) {
    case "mulligan":
      return (
        <div className="prompt">
          <b>Ponecháš si túto ruku?</b>
          <button className="btn sm" onClick={() => answer({ yes: false })}>Ponechať</button>
          <button className="btn ghost sm" onClick={() => answer({ yes: true })}>Vymeniť (mulligan)</button>
        </div>
      );
    case "choose":
      return (
        <div className="prompt">
          <b>{pr.label}</b>
          <span className="small muted">Vyber {pr.min === pr.max ? pr.max : `${pr.min}–${pr.max}`} (klikni na zvýraznené karty)</span>
          {pr.options.includes("don") && (
            <button className={`btn ghost sm ${picked.includes("don") ? "on" : ""}`} onClick={() => setPicked(picked.includes("don") ? [] : ["don"])}>
              DON!! súpera
            </button>
          )}
          <span className="small">{picked.map(name).join(", ")}</span>
          <button className="btn sm" disabled={picked.length < pr.min} onClick={() => answer({ pick: picked })}>
            Potvrdiť
          </button>
        </div>
      );
    case "payCost":
      return (
        <div className="prompt">
          <b>{pr.label}</b>
          <button className="btn sm" onClick={() => answer({ yes: true })}>Áno</button>
          <button className="btn ghost sm" onClick={() => answer({ yes: false })}>Nie</button>
        </div>
      );
    case "donSource": {
      const total = don.active + don.rested + Object.values(don.attached).reduce((a, b) => a + b, 0);
      const step = (k: "active" | "rested", d: number, max: number) => setDon({ ...don, [k]: Math.max(0, Math.min(max, don[k] + d)) });
      const stepA = (iid: string, d: number) =>
        setDon({ ...don, attached: { ...don.attached, [iid]: Math.max(0, Math.min(s.cards[iid].don, (don.attached[iid] ?? 0) + d)) } });
      const ok = pr.atLeast ? total >= pr.n : total === pr.n;
      return (
        <div className="prompt">
          <b>{pr.label}</b>
          <span className="small muted">Vráť {pr.atLeast ? `aspoň ${pr.n}` : pr.n} DON!! do DON!! balíčka ({total} vybraté)</span>
          <span className="donpick">
            Aktívne <button onClick={() => step("active", -1, x.donActive)}>−</button>
            <b>{don.active}</b>
            <button onClick={() => step("active", 1, x.donActive)}>+</button>
          </span>
          <span className="donpick">
            Rest <button onClick={() => step("rested", -1, x.donRested)}>−</button>
            <b>{don.rested}</b>
            <button onClick={() => step("rested", 1, x.donRested)}>+</button>
          </span>
          {fieldOf(s, me)
            .filter((i) => s.cards[i].don > 0)
            .map((i) => (
              <span key={i} className="donpick">
                na {name(i)} <button onClick={() => stepA(i, -1)}>−</button>
                <b>{don.attached[i] ?? 0}</b>
                <button onClick={() => stepA(i, 1)}>+</button>
              </span>
            ))}
          <button className="btn sm" disabled={!ok} onClick={() => answer({ don: don })}>
            Vrátiť
          </button>
        </div>
      );
    }
    case "orderTriggers":
      return (
        <div className="prompt">
          <b>Ktorý efekt sa vykoná ako prvý?</b>
          {pr.options.map((k) => (
            <button key={k} className="btn ghost sm" onClick={() => answer({ order: k })}>
              {s.pending[k]?.label}
            </button>
          ))}
        </div>
      );
    case "blocker":
      return (
        <div className="prompt">
          <b>Súper útočí ({power(s, s.battle!.attacker)}). Zablokuješ?</b>
          {blockersFor(s).map((i) => (
            <button key={i} className="btn ghost sm" onClick={() => answer({ pick: [i] })}>
              {name(i)} ({power(s, i)})
            </button>
          ))}
          <button className="btn sm" onClick={() => answer({ pick: [] })}>Neblokovať</button>
        </div>
      );
    case "counter": {
      const opts = counterOptions(s, me);
      return (
        <div className="prompt">
          <b>
            Counter: útok {power(s, s.battle!.attacker)} na {name(s.battle!.target)} ({power(s, s.battle!.target)})
          </b>
          {opts.map((i) => {
            const d = def(s, i);
            return (
              <button key={i} className="btn ghost sm" onClick={() => answer({ counter: [i] })}>
                {name(i)} {d.type === "Character" ? `+${d.counter}` : `(event, ${d.cost} DON!!)`}
              </button>
            );
          })}
          <button className="btn sm" onClick={() => answer({ counter: [] })}>Bez counteru</button>
        </div>
      );
    }
    case "trigger":
      return (
        <div className="prompt">
          <b>Life karta {name(pr.iid)} má [Trigger]. Aktivovať?</b>
          <button className="btn sm" onClick={() => answer({ yes: true })}>Aktivovať</button>
          <button className="btn ghost sm" onClick={() => answer({ yes: false })}>Vziať do ruky</button>
        </div>
      );
    case "trashCharacter":
      return (
        <div className="prompt">
          <b>Máš 6 postáv – vyber jednu na odhodenie</b>
          {pr.options.map((i) => (
            <button key={i} className="btn ghost sm" onClick={() => answer({ pick: [i] })}>
              {name(i)}
            </button>
          ))}
        </div>
      );
  }
}

function describe(e: GameEvent, s: GameState, byCode: Map<string, Card>): string | null {
  const n = (iid: string) => byCode.get(s.cards[iid]?.code)?.name ?? iid;
  const who = (p: P) => s.players[p].name;
  switch (e.t) {
    case "CardPlayed": return `${who(e.p)} zahral ${n(e.iid)}`;
    case "DonReturned": return `${who(e.p)} vrátil ${e.n} DON!!`;
    case "DonAdded": return `${who(e.p)} +${e.n} DON!! (${e.state === "active" ? "aktívny" : "rest"})`;
    case "KO": return `${n(e.iid)} je K.O.`;
    case "LifeDamage": return `${who(e.p)} stratil Life`;
    case "Attack": return `${n(e.attacker)} útočí na ${n(e.target)}`;
    case "Info": return e.msg;
    default: return null;
  }
}

function Log({ s, byCode }: { s: GameState; byCode: Map<string, Card> }) {
  const lines = s.log.map((e) => describe(e, s, byCode)).filter(Boolean).slice(-8).reverse();
  return (
    <ul className="glog">
      {lines.map((l, i) => (
        <li key={s.log.length - i}>{l}</li>
      ))}
    </ul>
  );
}

function Zoom({ s, iid, card, onClose }: { s: GameState; iid: string; card?: Card; onClose: () => void }) {
  const d = def(s, iid);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal" onClick={onClose}>
      <div className="mbox" onClick={(e) => e.stopPropagation()}>
        <button className="x" onClick={onClose}>×</button>
        {card && <CardImg card={card} className="big" />}
        <div className="mtext">
          <h2>{d.name}</h2>
          <p className="muted">
            {d.code} · {d.type} · cost {d.cost} · power {power(s, iid)}
          </p>
          {!d.scripted && <p className="warnline small">Efekt tejto karty zatiaľ nie je naprogramovaný – hrá sa bez efektu.</p>}
          {d.text && <p className="ctext">{d.text}</p>}
        </div>
      </div>
    </div>
  );
}
