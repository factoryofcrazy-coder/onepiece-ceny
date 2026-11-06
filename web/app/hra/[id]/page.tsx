"use client";
import { UserBadge, useBadges } from "@/lib/gamify";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Board from "@/components/game/Board";
import DeckSelect from "@/components/game/DeckSelect";
import "@/components/game/game.css";
import GameTeaser from "@/components/game/Teaser";
import { GAME_PUBLIC } from "@/lib/config";
import { CardImg, DataError, Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useCards } from "@/lib/data";
import type { Action, GameState, P } from "@/lib/engine/types";
import { byCodeOf, deckRef, gameCall, GameRow, loadRatings, Rating, useMyDecks } from "@/lib/game";
import { sb } from "@/lib/supabase";
import { useLang } from "@/lib/lang";

type ViewRow = { seat: P; version: number; view: GameState };

function OnlineGamePage() {
  const badges = useBadges();
  const { t: L } = useLang();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const { data: cards, error: cardsErr } = useCards();
  const byCode = useMemo(() => byCodeOf(cards?.cards), [cards]);
  const decks = useMyDecks(user?.id, cards ? byCode : undefined);
  const [g, setG] = useState<GameRow | null | undefined>(undefined);
  const [v, setV] = useState<ViewRow | null>(null);
  const [ratings, setRatings] = useState<Map<string, Rating>>(new Map());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [deckId, setDeckId] = useState<string>("st26");
  const verRef = useRef(-1);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: game }, { data: view }] = await Promise.all([
      sb().from("games").select("*").eq("id", id).maybeSingle(),
      sb().from("game_views").select("seat,version,view").eq("game_id", id).eq("player", user.id).maybeSingle(),
    ]);
    setG((game as GameRow) ?? null);
    if (view && (view as ViewRow).version >= verRef.current) {
      verRef.current = (view as ViewRow).version;
      setV(view as ViewRow);
    }
    if (game) setRatings(await loadRatings([game.host, game.guest].filter(Boolean)));
  }, [id, user]);

  useEffect(() => {
    if (!user) return;
    load();
    let t: ReturnType<typeof setTimeout>;
    const again = () => {
      clearTimeout(t);
      t = setTimeout(load, 120);
    };
    const ch = sb()
      .channel(`game-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_views", filter: `game_id=eq.${id}` }, again)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${id}` }, again)
      .subscribe();
    // poistka, keby realtime vypadol (mobil v pozadí, zlá sieť)
    const iv = setInterval(load, 6000);
    const vis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearTimeout(t);
      clearInterval(iv);
      document.removeEventListener("visibilitychange", vis);
      sb().removeChannel(ch);
    };
  }, [id, user, load]);

  useEffect(() => {
    if (!decks.some((d) => d.id === deckId)) setDeckId(decks[0]?.id ?? "st26");
  }, [decks, deckId]);

  // titulok karty prehliadača – vidno ho aj keď je okno v pozadí
  const myMove = !!(g && user && g.status === "playing" && g.to_move === user.id);
  useEffect(() => {
    const base = "Grand Line Tracker";
    document.title = myMove ? L("● Si na ťahu – Hra", "● Your turn – Play") : g?.status === "playing" ? L("Hra – hrá súper", "Play – opponent's turn") : base;
    return () => {
      document.title = base;
    };
  }, [myMove, g?.status, L]);

  const act = async (a: Action) => {
    if (!v) return;
    setBusy(true);
    setErr(null);
    try {
      await gameCall({ op: "act", id, action: a, version: g?.version });
      await load();
    } catch (e: any) {
      if (e.status === 409) await load();
      else setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const simple = async (op: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    setErr(null);
    try {
      await gameCall({ op, id, ...extra });
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (cardsErr) return <DataError error={cardsErr} file="cards" />;
  if (loading || !cards || (user && g === undefined)) return <Loading what={L("Načítavam hru", "Loading the game")} shape="tiles" />;
  if (!user)
    return (
      <div className="glob">
        <div className="empty">
          {L("Na online hru sa treba", "To play online you need to")} <Link href={`/login`}>{L("prihlásiť", "sign in")}</Link>. {L("Potom otvor tento odkaz znova.", "Then open this link again.")}
        </div>
      </div>
    );
  if (!g)
    return (
      <div className="glob">
        <div className="empty">
          {L("Táto hra neexistuje.", "This game doesn't exist.")} <Link href="/hra">{L("Späť do lobby", "Back to the lobby")}</Link>
        </div>
      </div>
    );

  const leader = (code: string | null) => (code ? byCode.get(code) : undefined);
  const deck = decks.find((d) => d.id === deckId) ?? decks[0];

  // ------------------------------------------------ výzva ešte nezačala
  if (g.status === "open" || g.status === "cancelled") {
    const mine = g.host === user.id;
    return (
      <div className="glob">
        <div className="gcard feat" style={{ maxWidth: 620, margin: "0 auto" }}>
          <span className="kicker">{g.rated ? L("Hodnotená výzva", "Ranked challenge") : L("Priateľská výzva", "Friendly challenge")}</span>
          <h3>{mine ? L("Tvoja výzva", "Your challenge") : L(`${g.host_name} ťa vyzýva!`, `${g.host_name} challenges you!`)}</h3>
          <div className="vsline">
            <div className="pl">
              {leader(g.host_leader) && <CardImg card={leader(g.host_leader)!} />}
              <b className="small">{g.host_name}</b>
              <span className="tiny muted">
                {g.host_deck_name} · ELO {ratings.get(g.host)?.elo ?? 1000}
              </span>
            </div>
            <span className="vs">VS</span>
            <div className="pl">
              {!mine && leader(deck?.leader) ? <CardImg card={leader(deck.leader)!} /> : <i className="back" style={{ display: "block", width: 110, aspectRatio: "600/838", borderRadius: 8 }} />}
              <b className="small">{mine ? "?" : L("Ty", "You")}</b>
            </div>
          </div>
          {g.status === "cancelled" ? (
            <p className="muted">{L("Výzva bola zrušená.", "The challenge was cancelled.")}</p>
          ) : mine ? (
            <>
              <div className="waiting">
                <span className="spin" /> {L("Čakáš, kým sa kamoš pripojí. Pošli mu tento odkaz:", "Waiting for your friend to join. Send them this link:")}
              </div>
              <div className="linkbox">
                <code>{location.href}</code>
                <button className="btn sm" onClick={() => navigator.clipboard?.writeText(location.href)}>
                  {L("Kopírovať", "Copy")}
                </button>
              </div>
              <div className="row gap">
                <button className="btn ghost sm" onClick={() => simple("cancel").then(() => router.push("/hra"))} disabled={busy}>
                  {L("Zrušiť výzvu", "Cancel challenge")}
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="field">
                <span>{L("Tvoj deck", "Your deck")}</span>
                <DeckSelect decks={decks} value={deck?.id} onChange={(id) => setDeckId(id)} />
              </label>
              <button className="btn" disabled={busy} onClick={() => simple("join", { deck: deckRef(deck) })}>
                {busy ? L("Pripájam…", "Joining…") : L("Prijať výzvu a hrať", "Accept and play")}
              </button>
            </>
          )}
          {err && <p className="gerr">{err}</p>}
          <Link href="/hra" className="small">
            ← {L("Späť do lobby", "Back to the lobby")}
          </Link>
        </div>
      </div>
    );
  }

  // ------------------------------------------------ hrá sa / dohrané
  if (!v)
    return (
      <div className="glob">
        <div className="empty">
          {L(`Túto hru hrajú ${g.host_name} a ${g.guest_name}. Diváci zatiaľ nie sú podporovaní.`, `This game is between ${g.host_name} and ${g.guest_name}. Spectating isn't supported yet.`)} <Link href="/hra">{L("Späť do lobby", "Back to the lobby")}</Link>
        </div>
      </div>
    );

  const seatIds = [g.host, g.guest];
  const eloOf = (p: P) => ratings.get(seatIds[p] ?? "")?.elo ?? 1000;
  const won = g.winner === user.id;
  const result =
    g.status === "done" && g.rated && g.elo_delta != null ? (
      <p className={`delta ${won ? "up" : "down"}`}>
        ELO {won ? "+" : "−"}
        {g.elo_delta} → {ratings.get(user.id)?.elo ?? "…"}
      </p>
    ) : g.status === "done" && !g.rated ? (
      <p>{L("Priateľská hra – bez zmeny ELO.", "Friendly game – no ELO change.")}</p>
    ) : null;

  return (
    <Board
        playerBadge={(p: P) => <UserBadge badge={badges.get(seatIds[p] ?? "")} compact />}
      s={v.view}
      me={v.seat}
      byCode={byCode}
      mode="online"
      gameId={id}
      onAction={act}
      busy={busy}
      error={err}
      elo={g.rated ? [eloOf(0), eloOf(1)] : undefined}
      onExit={() => router.push("/hra")}
      onResign={g.status === "playing" ? () => simple("resign") : undefined}
      onTimeout={g.status === "playing" ? () => gameCall({ op: "timeout", id }).then(load, () => {}) : undefined}
      result={
        <>
          {result}
          <Link href="/rebricek" className="small" style={{ position: "relative" }}>
            {L("Rebríček", "Leaderboard")} →
          </Link>
        </>
      }
    />
  );
}

export default function Page() {
  return GAME_PUBLIC ? <OnlineGamePage /> : <GameTeaser />;
}
