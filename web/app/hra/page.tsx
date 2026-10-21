"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Board from "@/components/game/Board";
import DeckSelect from "@/components/game/DeckSelect";
import "@/components/game/game.css";
import { CardImg, DataError, Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { Card, useCards } from "@/lib/data";
import { botAction } from "@/lib/engine/bot";
import { buildDef } from "@/lib/engine/cards";
import { applyAction, IllegalAction, newGame } from "@/lib/engine/engine";
import type { Action, CardDef, GameState, P } from "@/lib/engine/types";
import { ago, byCodeOf, deckRef, DeckOpt, gameCall, GameRow, loadRatings, Rating, useMyDecks } from "@/lib/game";
import { sb } from "@/lib/supabase";

type Tab = "online" | "training";

export default function GamePage() {
  const { data: cards, error } = useCards();
  const { user, loading } = useAuth();
  const byCode = useMemo(() => byCodeOf(cards?.cards), [cards]);
  const decks = useMyDecks(user?.id, cards ? byCode : undefined);
  const [tab, setTab] = useState<Tab>("online");
  const [local, setLocal] = useState<{ s: GameState; mode: "bot" | "local" } | null>(null);

  if (error) return <DataError error={error} file="cards" />;
  if (!cards || loading) return <Loading what="Pripravujem hru" shape="tiles" />;
  if (local) return <LocalGame initial={local.s} mode={local.mode} byCode={byCode} onExit={() => setLocal(null)} />;

  return (
    <div className="glob">
      <div className="glob-hero">
        <div>
          <h1>Hra</h1>
          <p className="muted">
            One Piece TCG s automatickými pravidlami a efektmi. Online hry stráži server – súper nevidí tvoju ruku ani balíček a výsledky idú do{" "}
            <Link href="/rebricek">rebríčka</Link>.
          </p>
        </div>
        <div className="seg">
          <button className={tab === "online" ? "on" : ""} onClick={() => setTab("online")}>
            Online s kamošmi
          </button>
          <button className={tab === "training" ? "on" : ""} onClick={() => setTab("training")}>
            Tréning
          </button>
        </div>
      </div>
      {tab === "online" ? (
        user ? (
          <OnlineLobby userId={user.id} decks={decks} byCode={byCode} />
        ) : (
          <div className="empty">
            Na online hru sa treba <Link href="/login">prihlásiť</Link>. Tréning proti botovi ide aj bez prihlásenia.
          </div>
        )
      ) : (
        <Training decks={decks} byCode={byCode} onStart={(s, mode) => setLocal({ s, mode })} />
      )}
      <p className="small muted" style={{ marginTop: 18 }}>
        Efekty sú naprogramované pre všetky karty z turnajových top deckov (Limitless, posledných 30 dní) a starter decky ST-01/ST-26. Ostatné karty sa hrajú bez efektu a sú označené výkričníkom. Decky si
        postavíš v <Link href="/decky">Deckoch</Link> (leader + 40–50 kariet).
      </p>
    </div>
  );
}

// ================================================================== online lobby
function OnlineLobby({ userId, decks, byCode }: { userId: string; decks: DeckOpt[]; byCode: Map<string, Card> }) {
  const router = useRouter();
  const [deckId, setDeckId] = useState(decks[0]?.id ?? "st26");
  const [rated, setRated] = useState(true);
  const [games, setGames] = useState<GameRow[]>([]);
  const [ratings, setRatings] = useState<Map<string, Rating>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (!decks.some((d) => d.id === deckId)) setDeckId(decks[0]?.id ?? "st26");
  }, [decks, deckId]);
  const deck = decks.find((d) => d.id === deckId) ?? decks[0];

  const load = useCallback(async () => {
    const [open, mine] = await Promise.all([
      sb().from("games").select("*").eq("status", "open").order("created_at", { ascending: false }).limit(40),
      sb().from("games").select("*").in("status", ["playing", "done"]).or(`host.eq.${userId},guest.eq.${userId}`).order("updated_at", { ascending: false }).limit(30),
    ]);
    const all = [...((open.data as GameRow[]) ?? []), ...((mine.data as GameRow[]) ?? [])];
    setGames(all);
    const ids = [...new Set(all.flatMap((g) => [g.host, g.guest]).filter(Boolean) as string[])];
    if (ids.length) setRatings(await loadRatings(ids));
  }, [userId]);

  useEffect(() => {
    load();
    let t: ReturnType<typeof setTimeout>;
    const ch = sb()
      .channel("lobby")
      .on("postgres_changes", { event: "*", schema: "public", table: "games" }, () => {
        clearTimeout(t);
        t = setTimeout(load, 250);
      })
      .subscribe();
    const iv = setInterval(load, 15000);
    return () => {
      clearInterval(iv);
      clearTimeout(t);
      sb().removeChannel(ch);
    };
  }, [load]);

  // keď sa niekto pripojí do mojej výzvy, presuň ma do hry
  const watch = useRef<Set<string>>(new Set());
  useEffect(() => {
    const started = [...watch.current].find((id) => games.some((g) => g.id === id && g.status === "playing"));
    watch.current = new Set(games.filter((g) => g.host === userId && g.status === "open").map((g) => g.id));
    if (started) router.push(`/hra/${started}`);
  }, [games, userId, router]);

  const run = async (key: string, f: () => Promise<void>) => {
    setBusy(key);
    setErr(null);
    try {
      await f();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };
  const create = () =>
    run("create", async () => {
      await gameCall({ op: "create", deck: deckRef(deck), rated });
      await load();
    });
  const join = (id: string) =>
    run(id, async () => {
      await gameCall({ op: "join", id, deck: deckRef(deck) });
      router.push(`/hra/${id}`);
    });
  const cancel = (id: string) =>
    run(id, async () => {
      await gameCall({ op: "cancel", id });
      await load();
    });
  const copy = async (id: string) => {
    const url = `${location.origin}/hra/${id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* nič */
    }
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const myOpen = games.filter((g) => g.status === "open" && g.host === userId);
  const othersOpen = games.filter((g) => g.status === "open" && g.host !== userId);
  const playing = games.filter((g) => g.status === "playing");
  const done = games.filter((g) => g.status === "done").slice(0, 8);
  const elo = (id: string | null) => (id ? ratings.get(id)?.elo ?? 1000 : 1000);
  const thumb = (code: string | null) => {
    const c = code ? byCode.get(code) : undefined;
    return <span className="lth">{c ? <CardImg card={c} /> : <i className="back" style={{ display: "block", height: "100%" }} />}</span>;
  };

  return (
    <>
      {err && <p className="gerr" style={{ marginBottom: 12 }}>{err}</p>}
      <div className="gcards">
        <div className="gcard feat">
          <span className="kicker">Nová výzva</span>
          <h3>Vyzvi kamoša</h3>
          <label className="field">
            <span>Tvoj deck</span>
            <DeckSelect decks={decks} value={deck?.id} onChange={(id) => setDeckId(id)} />
            <span className="small muted">{deckStat(deck, byCode)}</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={rated} onChange={(e) => setRated(e.target.checked)} /> Hodnotená hra (ELO do rebríčka)
          </label>
          <button className="btn" onClick={create} disabled={!!busy}>
            {busy === "create" ? "Vytváram…" : "Vytvoriť výzvu"}
          </button>
          {myOpen.map((g) => (
            <div key={g.id} className="glist">
              <div className="waiting">
                <span className="spin" /> Čakáš na súpera s deckom <b style={{ color: "var(--text)" }}>{g.host_deck_name}</b>
              </div>
              <div className="linkbox">
                <code>{typeof location !== "undefined" ? `${location.host}/hra/${g.id.slice(0, 8)}…` : ""}</code>
                <button className="btn sm" onClick={() => copy(g.id)}>
                  {copied === g.id ? "Skopírované ✓" : "Kopírovať odkaz"}
                </button>
                <button className="btn ghost sm" onClick={() => cancel(g.id)} disabled={busy === g.id}>
                  Zrušiť
                </button>
              </div>
            </div>
          ))}
          <p className="small muted" style={{ margin: 0 }}>
            Pošli odkaz kamošovi (alebo nech si výzvu nájde medzi otvorenými výzvami). Keď sa pripojí, hra sa ti otvorí sama.
          </p>
        </div>

        <div className="gcard">
          <span className="kicker">Otvorené výzvy</span>
          <h3>Prijmi hru</h3>
          <div className="glist">
            {othersOpen.map((g) => (
              <div key={g.id} className="grow-item">
                {thumb(g.host_leader)}
                <span style={{ minWidth: 0 }}>
                  <div className="t">
                    {g.host_name} <span className="muted small">· ELO {elo(g.host)}</span>
                  </div>
                  <div className="s">
                    {g.host_deck_name} · {g.rated ? "hodnotená" : "priateľská"} · {ago(g.created_at)}
                  </div>
                </span>
                <button className="btn sm" onClick={() => join(g.id)} disabled={!!busy}>
                  {busy === g.id ? "…" : "Prijať"}
                </button>
              </div>
            ))}
            {!othersOpen.length && <p className="small muted">Zatiaľ nikto nečaká. Vytvor výzvu a pošli kamošovi odkaz.</p>}
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Prijmeš s deckom: <b style={{ color: "var(--text)" }}>{deck?.name}</b>
          </p>
        </div>

        <div className="gcard">
          <span className="kicker">Rozohrané</span>
          <h3>Tvoje hry</h3>
          <div className="glist">
            {playing.map((g) => {
              const meHost = g.host === userId;
              const oppName = meHost ? g.guest_name : g.host_name;
              const mine = g.to_move === userId;
              return (
                <Link key={g.id} href={`/hra/${g.id}`} className={`grow-item ${mine ? "hot" : ""}`} style={{ color: "inherit", textDecoration: "none" }}>
                  {thumb(meHost ? g.guest_leader : g.host_leader)}
                  <span style={{ minWidth: 0 }}>
                    <div className="t">vs {oppName}</div>
                    <div className="s">
                      Ťah {g.turn} · {mine ? <b style={{ color: "var(--foam)" }}>si na ťahu</b> : "čaká sa na súpera"} · {ago(g.updated_at)}
                    </div>
                  </span>
                  <span className="btn sm">{mine ? "Hrať" : "Pozrieť"}</span>
                </Link>
              );
            })}
            {!playing.length && <p className="small muted">Žiadna rozohraná hra.</p>}
          </div>
        </div>

        <div className="gcard">
          <span className="kicker">Výsledky</span>
          <h3>Posledné zápasy</h3>
          <div className="glist">
            {done.map((g) => {
              const won = g.winner === userId;
              const meHost = g.host === userId;
              return (
                <Link key={g.id} href={`/hra/${g.id}`} className="grow-item" style={{ color: "inherit", textDecoration: "none" }}>
                  {thumb(meHost ? g.guest_leader : g.host_leader)}
                  <span style={{ minWidth: 0 }}>
                    <div className="t">
                      <span style={{ color: won ? "#7ff0b8" : "var(--bad)" }}>{won ? "Výhra" : "Prehra"}</span> vs {meHost ? g.guest_name : g.host_name}
                    </div>
                    <div className="s">
                      {g.end_reason === "resign" ? "vzdanie" : `${g.turn} ťahov`} · {ago(g.updated_at)}
                    </div>
                  </span>
                  {g.rated && g.elo_delta != null && (
                    <span className={`streak ${won ? "" : "neg"}`}>
                      {won ? "+" : "−"}
                      {g.elo_delta}
                    </span>
                  )}
                </Link>
              );
            })}
            {!done.length && <p className="small muted">Ešte žiadny odohraný zápas.</p>}
          </div>
          <Link href="/rebricek" className="small">
            Celý rebríček →
          </Link>
        </div>
      </div>
    </>
  );
}

function deckStat(d: DeckOpt | undefined, byCode: Map<string, Card>) {
  if (!d) return "";
  const codes = [...new Set(d.cards)];
  const ok = codes.filter((c) => {
    const card = byCode.get(c);
    return card && buildDef(card).scripted;
  }).length;
  return `${d.cards.length} kariet · efekty naprogramované pre ${ok}/${codes.length}`;
}

// ================================================================== tréning (bot / jedno zariadenie)
function Training({ decks, byCode, onStart }: { decks: DeckOpt[]; byCode: Map<string, Card>; onStart: (s: GameState, mode: "bot" | "local") => void }) {
  const [a, setA] = useState(decks[0]?.id ?? "st26");
  const [b, setB] = useState("st01");
  const [mode, setMode] = useState<"bot" | "local">("bot");
  const [err, setErr] = useState<string | null>(null);
  const da = decks.find((d) => d.id === a) ?? decks[0];
  const db = decks.find((d) => d.id === b) ?? decks[decks.length - 1];

  const start = () => {
    const defs: Record<string, CardDef> = {};
    const missing: string[] = [];
    for (const code of new Set([da.leader, db.leader, ...da.cards, ...db.cards])) {
      const c = byCode.get(code);
      if (!c) missing.push(code);
      else defs[code] = buildDef(c);
    }
    if (missing.length) return setErr(`V databáze chýbajú karty: ${missing.join(", ")}`);
    onStart(
      newGame(
        [
          { name: mode === "bot" ? "Ty" : "Hráč 1", leader: da.leader, cards: da.cards },
          { name: mode === "bot" ? "Bot" : "Hráč 2", leader: db.leader, cards: db.cards },
        ],
        defs,
        Math.floor(Math.random() * 2147483646) + 1,
        Math.random() < 0.5 ? 0 : 1,
      ),
      mode,
    );
  };
  const leader = (d: DeckOpt) => byCode.get(d.leader);

  return (
    <div className="gcard" style={{ maxWidth: 760 }}>
      <span className="kicker">Tréning</span>
      <div className="vsline">
        <div className="pl">
          {leader(da) && <CardImg card={leader(da)!} />}
          <b className="small">{da.name}</b>
        </div>
        <span className="vs">VS</span>
        <div className="pl">
          {leader(db) && <CardImg card={leader(db)!} />}
          <b className="small">{db.name}</b>
        </div>
      </div>
      <div className="lobby-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <label className="field">
          <span>{mode === "bot" ? "Tvoj deck" : "Hráč 1"}</span>
          <DeckSelect decks={decks} value={da.id} onChange={(id) => setA(id)} />
          <span className="small muted">{deckStat(da, byCode)}</span>
        </label>
        <label className="field">
          <span>{mode === "bot" ? "Deck bota" : "Hráč 2"}</span>
          <DeckSelect decks={decks} value={db.id} onChange={(id) => setB(id)} />
          <span className="small muted">{deckStat(db, byCode)}</span>
        </label>
      </div>
      <div className="row gap wrapr">
        <div className="seg">
          <button className={mode === "bot" ? "on" : ""} onClick={() => setMode("bot")}>
            Proti botovi
          </button>
          <button className={mode === "local" ? "on" : ""} onClick={() => setMode("local")}>
            Dvaja na jednom zariadení
          </button>
        </div>
        <span className="grow" />
        <button className="btn" onClick={start}>
          Začať hru
        </button>
      </div>
      {err && <p className="gerr">{err}</p>}
    </div>
  );
}

function LocalGame({ initial, mode, byCode, onExit }: { initial: GameState; mode: "bot" | "local"; byCode: Map<string, Card>; onExit: () => void }) {
  const [s, setS] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const actor: P = s.prompt ? s.prompt.p : s.active;
  const me: P = mode === "bot" ? 0 : actor;
  const [cover, setCover] = useState<P | null>(mode === "local" ? me : null);
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
      setErr(null);
    } catch (e) {
      setErr(e instanceof IllegalAction ? e.message : String(e));
    }
  };

  useEffect(() => {
    if (mode !== "bot" || s.winner != null) return;
    const a = botAction(s, 1);
    if (!a) return;
    const t = setTimeout(() => {
      setS((cur) => {
        try {
          return applyAction(cur, a);
        } catch {
          return cur.active === 1 && !cur.prompt ? applyAction(cur, { type: "endTurn", p: 1 }) : cur;
        }
      });
    }, 750);
    return () => clearTimeout(t);
  }, [s, mode]);

  return (
    <div style={{ position: "relative" }}>
      <Board s={s} me={me} byCode={byCode} mode={mode} onAction={act} error={err} onExit={onExit} />
      {cover != null && mode === "local" && s.winner == null && (
        <div className="gcover">
          <h2>Na rade je {s.players[cover].name}</h2>
          <p className="muted">Odovzdaj zariadenie – druhý hráč nech sa nepozerá.</p>
          <button className="btn" onClick={() => setCover(null)}>
            Som pripravený
          </button>
        </div>
      )}
    </div>
  );
}
