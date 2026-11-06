"use client";
// Úvod hry: kameň-papier-nožnice o to, kto začína. Kompaktný modál nad stolom, ktorý len číta skutočný
// stav enginu (s.rps, výzvy „rps“ a „firstChoice“) a posiela odpovede – žiadna vlastná logika ani vymyslené voľby.
//
// Fázy: výber → zamknutá voľba („Čaká sa na súpera…“) → odhalenie oboch volieb naraz → remíza (nové kolo)
// alebo výsledok (víťaz volí, kto začína) → krátke „Začínaš ty / Začína X“ a modál sa zavrie.
import { useEffect, useRef, useState } from "react";
import type { GameState, P, RpsPick } from "@/lib/engine/types";
import { Icon } from "./icons";
import { useLang } from "@/lib/lang";

const OPTS: { id: RpsPick; label: string; en: string }[] = [
  { id: "rock", label: "Kameň", en: "Rock" },
  { id: "paper", label: "Papier", en: "Paper" },
  { id: "scissors", label: "Nožnice", en: "Scissors" },
];
const label = (k: RpsPick, en = false) => { const o = OPTS.find((x) => x.id === k)!; return en ? o.en : o.label; };
/** „Papier porazil kameň.“ / „Nožnice porazili papier.“ */
const beatText = (win: RpsPick, lose: RpsPick, en = false) =>
  en ? `${label(win, true)} beats ${label(lose, true).toLowerCase()}.` : `${label(win)} ${win === "scissors" ? "porazili" : "porazil"} ${label(lose).toLowerCase()}.`;

const REVEAL_MS = 1600; // ako dlho ostane odhalená remíza, kým sa ukáže nové kolo
const CLOSE_MS = 1300; // ako dlho ostane „Začínaš ty“ po rozhodnutí

type Props = {
  s: GameState;
  me: P;
  busy?: boolean;
  onPick: (k: RpsPick) => void; // odpoveď na výzvu „rps“
  onFirst: (goFirst: boolean) => void; // odpoveď na výzvu „firstChoice“
};

export default function RpsOverlay({ s, me, busy, onPick, onFirst }: Props) {
  const o: P = me === 0 ? 1 : 0;
  const { t: L, lang } = useLang();
  const en = lang === "en";
  const rps = s.rps;
  const kind = s.prompt?.kind;
  const active = s.turn === 0 && !!rps && (kind === "rps" || kind === "firstChoice");
  const rounds = rps?.rounds ?? [];
  const last = rounds[rounds.length - 1];
  const myTurnToPick = kind === "rps" && s.prompt!.p === me;

  // Voľba, ktorú hráč klikol skôr, než naňho prišla rada (online začína vyberať hráč 0) –
  // odošle sa sama, keď výzva príde. Súper ju nevidí, kým nevyberie svoju (engine/viewFor).
  const [queued, setQueued] = useState<RpsPick | null>(null);
  const sentFor = useRef<number>(-1);
  useEffect(() => {
    setQueued(null);
    sentFor.current = -1;
  }, [rounds.length]);
  const statePick = rps?.picks[me];
  const myPick: RpsPick | null = statePick && statePick !== "hidden" ? statePick : queued;
  useEffect(() => {
    if (!queued || !myTurnToPick || busy || sentFor.current === rounds.length) return;
    sentFor.current = rounds.length;
    onPick(queued);
  }, [queued, myTurnToPick, busy, rounds.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // odhalenie: nové kolo v s.rps.rounds → obe voľby naraz; remíza ostane chvíľu, kým sa ukáže ďalší výber
  const [revealing, setRevealing] = useState(false);
  const seenRounds = useRef(rounds.length);
  useEffect(() => {
    if (rounds.length <= seenRounds.current) return;
    seenRounds.current = rounds.length;
    setRevealing(true);
    const t = setTimeout(() => setRevealing(false), REVEAL_MS);
    return () => clearTimeout(t);
  }, [rounds.length]);

  // zatvorenie: po voľbe poradia ešte krátko ukáž, kto začína
  const [closing, setClosing] = useState<string | null>(null);
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasActive.current && !active && rps) {
      setClosing(s.first === me ? L("Začínaš ty.", "You go first.") : L(`Začína ${s.players[s.first].name}.`, `${s.players[s.first].name} goes first.`));
      const t = setTimeout(() => setClosing(null), CLOSE_MS);
      wasActive.current = active;
      return () => clearTimeout(t);
    }
    wasActive.current = active;
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  const tie = !!last && last[0] === last[1];
  const phase: "select" | "wait" | "tie" | "result" | "closing" | null = closing
    ? "closing"
    : !active
      ? null
      : kind === "firstChoice"
        ? "result"
        : revealing && tie
          ? "tie"
          : myPick
            ? "wait"
            : "select";
  if (!phase || !rps) return null;

  const oppName = s.players[o].name;
  const iWon = rps.winner === me;
  // pri odhalení a výsledku ide o posledné odohrané kolo, pri výbere o nasledujúce
  const round = phase === "tie" || phase === "result" ? rounds.length : rounds.length + 1;

  const duel = () =>
    last ? (
      <div className={`rpsm-duel ${tie ? "tie" : ""}`} key={rounds.length} aria-live="polite">
        <div className={`rpsm-side me ${!tie && iWon ? "win" : ""} ${!tie && !iWon ? "lose" : ""}`}>
          <span className="rpsm-art">
            <Icon name={last[me]} size={34} />
          </span>
          <b>{label(last[me], en)}</b>
          <small>{L("Ty", "You")}</small>
        </div>
        <span className="rpsm-vs" aria-hidden>
          {tie ? "=" : "vs"}
        </span>
        <div className={`rpsm-side opp ${!tie && !iWon ? "win" : ""} ${!tie && iWon ? "lose" : ""}`}>
          <span className="rpsm-art">
            <Icon name={last[o]} size={34} />
          </span>
          <b>{label(last[o], en)}</b>
          <small>{oppName}</small>
        </div>
      </div>
    ) : null;

  return (
    <div className={`rpsm-veil ${phase === "closing" ? "out" : ""}`}>
      <section className="rpsm" role="dialog" aria-labelledby="rpsm-h" aria-describedby="rpsm-d">
        <header className="rpsm-head">
          <h3 id="rpsm-h">{L("Kameň, papier, nožnice", "Rock, paper, scissors")}</h3>
          {round > 1 && phase !== "closing" && <span className="rpsm-round">{L("Kolo", "Round")} {round}</span>}
        </header>

        {(phase === "select" || phase === "wait") && (
          <>
            <p id="rpsm-d" className="rpsm-sub">
              {L("Vyber si ťah. Víťaz rozhodne, kto začína.", "Pick your move. The winner decides who goes first.")}
            </p>
            <div className="rpsm-picks" role="group" aria-label={L("Tvoja voľba", "Your choice")}>
              {OPTS.map((k) => {
                const chosen = myPick === k.id;
                return (
                  <button
                    key={k.id}
                    className={`rpsm-pick ${chosen ? "on" : ""}`}
                    onClick={() => (myTurnToPick ? onPick(k.id) : setQueued(k.id))}
                    disabled={phase === "wait" || busy}
                    aria-pressed={chosen}
                  >
                    <span className="rpsm-art">
                      <Icon name={k.id} size={38} />
                    </span>
                    <b>{en ? k.en : k.label}</b>
                    {chosen && (
                      <span className="rpsm-lock" aria-hidden>
                        <Icon name="lock" size={12} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="rpsm-status" aria-live="polite">
              {phase === "wait" ? (
                <>
                  <span className="spin" aria-hidden /> {L("Čaká sa na súpera…", "Waiting for the opponent…")}
                </>
              ) : (
                L("Súper tvoju voľbu neuvidí, kým nevyberie svoju.", "Your opponent won't see your choice until they pick theirs.")
              )}
            </p>
          </>
        )}

        {phase === "tie" && (
          <>
            <p id="rpsm-d" className="rpsm-sub">
              {en ? `You both picked ${label(last![0], true).toLowerCase()}.` : `Obaja ste dali ${label(last![0]).toLowerCase()}.`}
            </p>
            {duel()}
            <p className="rpsm-result tie" aria-live="polite">
              {L("Remíza, ide sa znova.", "A tie, go again.")}
            </p>
          </>
        )}

        {phase === "result" && last && (
          <>
            <p id="rpsm-d" className="rpsm-sub">
              {iWon ? beatText(last[me], last[o], en) : beatText(last[o], last[me], en)}
            </p>
            {duel()}
            {iWon ? (
              <>
                <p className="rpsm-result win" aria-live="polite">
                  {L("Vyhral si. Rozhodni, kto začína.", "You won. Decide who goes first.")}
                </p>
                <p className="rpsm-hint">{L("Kto ide prvý, v prvom ťahu neťahá kartu a má 1 DON!!. Druhý si potiahne a má 2 DON!!.", "Whoever goes first doesn't draw on their first turn and has 1 DON!!. The second player draws and has 2 DON!!.")}</p>
                <div className="rpsm-acts">
                  <button className="btn ghost" onClick={() => onFirst(false)} disabled={busy}>
                    {L("Začne súper", "Opponent first")}
                  </button>
                  <button className="btn" onClick={() => onFirst(true)} disabled={busy}>
                    {L("Začnem ja", "I'll go first")}
                  </button>
                </div>
              </>
            ) : (
              <p className="rpsm-result lose" aria-live="polite">
                <span className="spin" aria-hidden /> {oppName} {L("vyhral a rozhoduje, kto začína…", "won and is deciding who goes first…")}
              </p>
            )}
          </>
        )}

        {phase === "closing" && (
          <p id="rpsm-d" className="rpsm-result start" aria-live="polite">
            {closing}
          </p>
        )}
      </section>
    </div>
  );
}

