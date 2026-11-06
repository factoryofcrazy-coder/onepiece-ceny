"use client";
import { karty, plural } from "@/lib/sk";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Board from "@/components/game/Board";
import DeckSelect from "@/components/game/DeckSelect";
import "@/components/game/game.css";
import GameTeaser from "@/components/game/Teaser";
import DonSkins from "@/components/game/DonSkins";
import { GAME_PUBLIC } from "@/lib/config";
import { CardImg, DataError, Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { Card, useCards } from "@/lib/data";
import { botAction, BotLevel, BOT_LEVELS } from "@/lib/engine/bot";
import { buildDef } from "@/lib/engine/cards";
import { applyAction, IllegalAction, newGame } from "@/lib/engine/engine";
import type { Action, CardDef, GameState, P } from "@/lib/engine/types";
import { ago, byCodeOf, deckRef, DeckOpt, gameCall, GameRow, loadRatings, Rating, useMyDecks } from "@/lib/game";
import { sb } from "@/lib/supabase";
import { useLang } from "@/lib/lang";

type Mode = "online" | "bot" | "local";

const MODES_EN: Record<Mode, { title: string; text: string; tag: string }> = {
  online: { title: "Online match", text: "Play a live opponent. They can't see your cards and ranked matches change your ELO.", tag: "Leaderboard and rank" },
  bot: { title: "Bot training", text: "Try your deck against an Easy, Medium or Hard bot. You can play without an account.", tag: "3 difficulties" },
  local: { title: "Two on one device", text: "Pass the device around and play together at one table, e.g. at a meetup.", tag: "Play together" },
};
const MODES: { id: Mode; title: string; text: string; tag: string; icon: string }[] = [
  { id: "online", title: "Online zápas", text: "Zahraj si so živým súperom. Súper nevidí tvoje karty a hodnotené zápasy menia tvoje ELO.", tag: "Rebríček a rank", icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c2.500 2.500 3.500 5.500 3.500 9s-1 6.500-3.500 9c-2.500-2.500-3.500-5.500-3.500-9s1-6.500 3.500-9Z" },
  { id: "bot", title: "Tréning s botom", text: "Vyskúšaj si deck proti Ľahkému, Strednému alebo Ťažkému botovi. Hrať môžeš aj bez účtu.", tag: "3 obtiažnosti", icon: "M12 2v3M5 8h14a2 2 0 0 1 2 2v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-8a2 2 0 0 1 2-2Zm4 5h.01M15 13h.01M9 17h6" },
  { id: "local", title: "Dvaja na jednom", text: "Podávajte si zariadenie a hrajte spolu pri jednom stole, napríklad na stretnutí.", tag: "Spoločná hra", icon: "M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm9-1a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 21a6 6 0 0 1 12 0M15 15a5 5 0 0 1 7 4.500V21" },
];

function GamePage() {
  const { t, lang } = useLang();
  const en = lang === "en";
  const { data: cards, error } = useCards();
  const { user, loading } = useAuth();
  const byCode = useMemo(() => byCodeOf(cards?.cards), [cards]);
  const decks = useMyDecks(user?.id, cards ? byCode : undefined);
  const [picked, setPicked] = useState<Mode | null>(null);
  const [local, setLocal] = useState<{ s: GameState; mode: "bot" | "local"; level: BotLevel } | null>(null);

  if (error) return <DataError error={error} file="cards" />;
  if (!cards || loading) return <Loading what={t("Pripravujem hru", "Preparing the game")} shape="tiles" />;
  if (local) return <LocalGame initial={local.s} mode={local.mode} level={local.level} byCode={byCode} onExit={() => setLocal(null)} />;

  // neprihlásený môže hneď trénovať, online potrebuje účet
  const mode: Mode = picked ?? (user ? "online" : "bot");
  return (
    <div className="glob">
      <div className="gm-hero">
        <h1>{t("Hra", "Play")}</h1>
        <p className="muted">{t("Pravidlá aj efekty kariet rieši hra za teba. Vyber si, ako chceš hrať.", "The game handles the rules and card effects for you. Choose how you want to play.")}</p>
      </div>
      <div className="gm-modes" role="radiogroup" aria-label={t("Spôsob hry", "Game mode")}>
        {MODES.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className={`gm-mode ${mode === m.id ? "on" : ""}`} onClick={() => setPicked(m.id)}>
            <span className="gm-ic">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.800" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={m.icon} />
              </svg>
            </span>
            <b>{en ? MODES_EN[m.id].title : m.title}</b>
            <span className="gm-text">{en ? MODES_EN[m.id].text : m.text}</span>
            <span className="gm-tag">{m.id === "online" && !user ? t("Treba sa prihlásiť", "Sign-in required") : en ? MODES_EN[m.id].tag : m.tag}</span>
          </button>
        ))}
      </div>
      <div className="gm-panel">
        {mode === "online" ? (
          user ? (
            <OnlineLobby userId={user.id} decks={decks} byCode={byCode} />
          ) : (
            <div className="empty">
              {t("Na online zápas sa musíš", "To play online you need to")} <Link href="/login">{t("prihlásiť", "sign in")}</Link>. {t("Tréning s botom si zahráš aj bez účtu.", "Bot training works without an account.")}
            </div>
          )
        ) : (
          <Training key={mode} mode={mode} decks={decks} byCode={byCode} onStart={(s, m, level) => setLocal({ s, mode: m, level })} />
        )}
      </div>
      <DonSkins />
      <p className="small muted" style={{ marginTop: 18 }}>
        {t("Efekty poznáme pri všetkých kartách z turnajových top deckov a pri veľkej časti ostatných. Karty bez hotového efektu sa hrajú bez neho a majú pri sebe výkričník. Vlastný deck si poskladáš v", "We support effects for every card in top tournament decks and many others. Cards without a finished effect are played without it and show an exclamation mark. Build your own deck in")}{" "}
        <Link href="/decky">{t("Deckoch", "Decks")}</Link> {t("(leader a 40 až 50 kariet).", "(a leader and 40 to 50 cards).")}
      </p>
    </div>
  );
}

// ================================================================== online lobby
function OnlineLobby({ userId, decks, byCode }: { userId: string; decks: DeckOpt[]; byCode: Map<string, Card> }) {
  const router = useRouter();
  const { t, lang } = useLang();
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
          <span className="kicker">{t("Nová výzva", "New challenge")}</span>
          <h3>{t("Vyzvi kamoša", "Challenge a friend")}</h3>
          <label className="field">
            <span>{t("Tvoj deck", "Your deck")}</span>
            <DeckSelect decks={decks} value={deck?.id} onChange={(id) => setDeckId(id)} />
            <span className="small muted">{deckStat(deck, byCode, lang)}</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={rated} onChange={(e) => setRated(e.target.checked)} /> {t("Hodnotený zápas (počíta sa do rebríčka)", "Ranked match (counts for the leaderboard)")}
          </label>
          <button className="btn" onClick={create} disabled={!!busy}>
            {busy === "create" ? t("Vytváram…", "Creating…") : t("Vytvoriť výzvu", "Create challenge")}
          </button>
          {myOpen.map((g) => (
            <div key={g.id} className="glist">
              <div className="waiting">
                <span className="spin" /> {t("Čakáš na súpera. Hráš s deckom", "Waiting for an opponent. Playing with deck")} <b style={{ color: "var(--text)" }}>{g.host_deck_name}</b>
              </div>
              <div className="linkbox">
                <code>{typeof location !== "undefined" ? `${location.host}/hra/${g.id.slice(0, 8)}…` : ""}</code>
                <button className="btn sm" onClick={() => copy(g.id)}>
                  {copied === g.id ? t("Skopírované", "Copied") : t("Kopírovať odkaz", "Copy link")}
                </button>
                <button className="btn ghost sm" onClick={() => cancel(g.id)} disabled={busy === g.id}>
                  {t("Zrušiť", "Cancel")}
                </button>
              </div>
            </div>
          ))}
          <p className="small muted" style={{ margin: 0 }}>
            {t("Pošli kamošovi odkaz, alebo nech si výzvu nájde v zozname. Keď sa pripojí, hra sa ti otvorí sama.", "Send a friend the link, or let them find the challenge in the list. When they join, the game opens automatically.")}
          </p>
        </div>

        <div className="gcard">
          <span className="kicker">{t("Otvorené výzvy", "Open challenges")}</span>
          <h3>{t("Pridaj sa k hre", "Join a game")}</h3>
          <div className="glist">
            {othersOpen.map((g) => (
              <div key={g.id} className="grow-item">
                {thumb(g.host_leader)}
                <span style={{ minWidth: 0 }}>
                  <div className="t">
                    {g.host_name} <span className="muted small">· ELO {elo(g.host)}</span>
                  </div>
                  <div className="s">
                    {g.host_deck_name} · {g.rated ? t("hodnotená", "ranked") : t("priateľská", "friendly")} · {ago(g.created_at, lang)}
                  </div>
                </span>
                <button className="btn sm" onClick={() => join(g.id)} disabled={!!busy}>
                  {busy === g.id ? "…" : t("Hrať", "Play")}
                </button>
              </div>
            ))}
            {!othersOpen.length && <p className="small muted">{t("Zatiaľ nikto nečaká. Vytvor výzvu a pošli kamošovi odkaz.", "No one is waiting yet. Create a challenge and send a friend the link.")}</p>}
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            {t("Pridáš sa s deckom", "You'll join with deck")} <b style={{ color: "var(--text)" }}>{deck?.name}</b>
          </p>
        </div>

        <div className="gcard">
          <span className="kicker">{t("Rozohrané", "In progress")}</span>
          <h3>{t("Tvoje hry", "Your games")}</h3>
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
                      {t("Ťah", "Turn")} {g.turn} · {mine ? <b style={{ color: "var(--foam)" }}>{t("si na rade", "your turn")}</b> : t("hrá súper", "opponent's turn")} · {ago(g.updated_at, lang)}
                    </div>
                  </span>
                  <span className="btn sm">{mine ? t("Hrať", "Play") : t("Pozrieť", "View")}</span>
                </Link>
              );
            })}
            {!playing.length && <p className="small muted">{t("Teraz nemáš žiadnu rozohranú hru.", "You have no game in progress.")}</p>}
          </div>
        </div>

        <div className="gcard">
          <span className="kicker">{t("Výsledky", "Results")}</span>
          <h3>{t("Posledné zápasy", "Recent matches")}</h3>
          <div className="glist">
            {done.map((g) => {
              const won = g.winner === userId;
              const meHost = g.host === userId;
              return (
                <Link key={g.id} href={`/hra/${g.id}`} className="grow-item" style={{ color: "inherit", textDecoration: "none" }}>
                  {thumb(meHost ? g.guest_leader : g.host_leader)}
                  <span style={{ minWidth: 0 }}>
                    <div className="t">
                      <span style={{ color: won ? "#7ff0b8" : "var(--bad)" }}>{won ? t("Výhra", "Win") : t("Prehra", "Loss")}</span> vs {meHost ? g.guest_name : g.host_name}
                    </div>
                    <div className="s">
                      {g.end_reason === "resign" ? t("vzdaním", "by resignation") : g.end_reason === "time" ? t("na čas", "on time") : t(`${g.turn} ${plural(g.turn, "ťah", "ťahy", "ťahov")}`, `${g.turn} ${g.turn === 1 ? "turn" : "turns"}`)} · {ago(g.updated_at, lang)}
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
            {!done.length && <p className="small muted">{t("Zatiaľ si neodohral žiadny zápas.", "You haven't played a match yet.")}</p>}
          </div>
          <Link href="/rebricek" className="small">
            {t("Celý rebríček", "Full leaderboard")} →
          </Link>
        </div>
      </div>
    </>
  );
}

function deckStat(d: DeckOpt | undefined, byCode: Map<string, Card>, lang: "sk" | "en" = "sk") {
  if (!d) return "";
  const codes = [...new Set(d.cards)];
  const ok = codes.filter((c) => {
    const card = byCode.get(c);
    return card && buildDef(card).scripted;
  }).length;
  return lang === "en" ? `${d.cards.length} cards, effects ready: ${ok} of ${codes.length}` : `${karty(d.cards.length)}, hotové efekty: ${ok} z ${codes.length}`;
}

// ================================================================== tréning (bot / jedno zariadenie)
function Training({ mode, decks, byCode, onStart }: { mode: "bot" | "local"; decks: DeckOpt[]; byCode: Map<string, Card>; onStart: (s: GameState, mode: "bot" | "local", level: BotLevel) => void }) {
  const [a, setA] = useState(decks[0]?.id ?? "st26");
  const [b, setB] = useState("st01");
  const [level, setLevel] = useState<BotLevel>("medium");
  useEffect(() => {
    const saved = localStorage.getItem("bot-level");
    if (saved === "easy" || saved === "medium" || saved === "hard") setLevel(saved);
  }, []);
  const pickLevel = (l: BotLevel) => {
    setLevel(l);
    localStorage.setItem("bot-level", l);
  };
  const [err, setErr] = useState<string | null>(null);
  const { profile } = useAuth();
  const { t, lang } = useLang();
  const en = lang === "en";
  // meno vystupuje v hláseniach enginu („Filip prehral…“), preto nie „Ty“
  const myName = profile?.username?.trim() || t("Hráč", "Player");
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
    if (missing.length) return setErr(`${t("Niektoré karty z decku v hre ešte nie sú", "Some cards from the deck aren't in the game yet")}: ${missing.join(", ")}`);
    onStart(
      newGame(
        [
          { name: mode === "bot" ? myName : t("Hráč 1", "Player 1"), leader: da.leader, cards: da.cards },
          { name: mode === "bot" ? `Bot (${en ? BOT_LEVELS.find((x) => x.id === level)!.en : BOT_LEVELS.find((x) => x.id === level)!.label})` : t("Hráč 2", "Player 2"), leader: db.leader, cards: db.cards },
        ],
        defs,
        Math.floor(Math.random() * 2147483646) + 1,
        "rps", // kto začína, rozhodne kameň-papier-nožnice
      ),
      mode,
      level,
    );
  };
  const leader = (d: DeckOpt) => byCode.get(d.leader);

  return (
    <div className="gcard">
      <span className="kicker">{mode === "bot" ? t("Tréning s botom", "Bot training") : t("Dvaja na jednom zariadení", "Two on one device")}</span>
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
          <span>{mode === "bot" ? t("Tvoj deck", "Your deck") : t("Hráč 1", "Player 1")}</span>
          <DeckSelect decks={decks} value={da.id} onChange={(id) => setA(id)} />
          <span className="small muted">{deckStat(da, byCode, lang)}</span>
        </label>
        <label className="field">
          <span>{mode === "bot" ? t("Deck bota", "Bot's deck") : t("Hráč 2", "Player 2")}</span>
          <DeckSelect decks={decks} value={db.id} onChange={(id) => setB(id)} />
          <span className="small muted">{deckStat(db, byCode, lang)}</span>
        </label>
      </div>
      {mode === "bot" && (
        <div className="bot-levels">
          <div className="seg" role="radiogroup" aria-label={t("Obtiažnosť bota", "Bot difficulty")}>
            {BOT_LEVELS.map((l) => (
              <button key={l.id} role="radio" aria-checked={level === l.id} className={level === l.id ? "on" : ""} onClick={() => pickLevel(l.id)}>
                {en ? l.en : l.label}
              </button>
            ))}
          </div>
          <span className="small muted">
            {en ? BOT_LEVELS.find((l) => l.id === level)!.hintEn : BOT_LEVELS.find((l) => l.id === level)!.hint}
            {level === "easy" ? t(" Výhry sa nerátajú do DON!! skinov.", " Wins don't count towards DON!! skins.") : ""}
          </span>
        </div>
      )}
      <button className="btn gm-play" onClick={start}>
        {mode === "bot" ? t("Hrať proti botovi", "Play against the bot") : t("Začať hru", "Start game")}
      </button>
      {err && <p className="gerr">{err}</p>}
    </div>
  );
}

function LocalGame({ initial, mode, level, byCode, onExit }: { initial: GameState; mode: "bot" | "local"; level: BotLevel; byCode: Map<string, Card>; onExit: () => void }) {
  const [s, setS] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const { t } = useLang();
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

  const botTurn = useRef(-1);
  const botCall = useRef(0);
  const botWorker = useRef<Worker | null>(null);
  useEffect(() => () => botWorker.current?.terminate(), []);
  useEffect(() => {
    if (mode !== "bot" || s.winner != null) return;
    // Ťažký bot rozmýšľa vo vlákne na pozadí, ostatní hneď
    let cancelled = false;
    let t: ReturnType<typeof setTimeout> | undefined;
    const go = (a: Action | null) => {
      if (!a || cancelled) return;
    // prirodzené tempo: na začiatku ťahu počká na banner, útok a zahranie karty si treba pozrieť
    const freshTurn = botTurn.current !== s.turn;
    botTurn.current = s.turn;
    const wait =
      a.type === "attack" ? 1700 : a.type === "play" ? 1500 : a.type === "endTurn" ? 1300 : a.type === "answer" ? 1100 : 1200;
    t = setTimeout(() => {
      setS((cur) => {
        try {
          return applyAction(cur, a);
        } catch {
          return cur.active === 1 && !cur.prompt ? applyAction(cur, { type: "endTurn", p: 1 }) : cur;
        }
      });
    }, wait + (freshTurn ? 900 : 0));
    };
    if (level === "hard") {
      const id = ++botCall.current;
      const w = (botWorker.current ??= new Worker(new URL("../../lib/engine/bot-worker.ts", import.meta.url)));
      const onMsg = (e: MessageEvent) => {
        if (e.data.id !== id) return;
        w.removeEventListener("message", onMsg);
        go(e.data.error ? botAction(s, 1, "medium") : e.data.action);
      };
      w.addEventListener("message", onMsg);
      w.postMessage({ id, s, me: 1, level });
    } else {
      go(botAction(s, 1, level));
    }
    return () => {
      cancelled = true;
      if (t) clearTimeout(t);
    };
  }, [s, mode, level]);

  return (
    <div style={{ position: "relative" }}>
      <Board s={s} me={me} byCode={byCode} mode={mode} botLevel={level} onAction={act} error={err} onExit={onExit} />
      {cover != null && mode === "local" && s.winner == null && (
        <div className="gcover">
          <h2>{t("Na rade je", "It's the turn of")} {s.players[cover].name}</h2>
          <p className="muted">{t("Podaj zariadenie druhému hráčovi a nepozeraj sa mu do kariet.", "Pass the device to the other player and don't look at their cards.")}</p>
          <button className="btn" onClick={() => setCover(null)}>
            {t("Môžem hrať", "I'm ready")}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return GAME_PUBLIC ? <GamePage /> : <GameTeaser />;
}
