// Šachové hodiny online hry na klientovi: odpočet medzi zápismi servera.
// Server ukladá s.clock.at podľa svojich hodín; rozdiel voči hodinám prehliadača sa dorovná pri každom živom ťahu.
import { useEffect, useRef, useState } from "react";
import type { GameState, P } from "@/lib/engine/types";

export type ClockView = { ms: [number, number]; actor: P | null };

export function useGameClock(s: GameState, onTimeout?: () => void): ClockView | null {
  const [now, setNow] = useState(() => Date.now());
  const skew = useRef<number | null>(null); // klient − server (ms)
  const seenAt = useRef<number | null>(null);
  const asked = useRef(0);
  const c = s.clock;
  const running = !!c && s.winner == null;

  // nový zápis servera počas hry → dorovnaj rozdiel hodín (latencia ~200 ms)
  useEffect(() => {
    if (!c) return;
    if (seenAt.current != null && seenAt.current !== c.at) {
      const d = Date.now() - c.at - 200;
      skew.current = Math.abs(d) < 5 * 60_000 ? d : 0;
    }
    seenAt.current = c.at;
  }, [c?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [running]);

  if (!c) return null;
  const actor: P | null = s.winner != null ? null : s.prompt ? s.prompt.p : s.active;
  const ms: [number, number] = [c.ms[0], c.ms[1]];
  if (actor != null) ms[actor] = Math.max(0, ms[actor] - Math.max(0, now - (skew.current ?? 0) - c.at));

  // čas vypršal → požiadaj server o koniec (on rozhodne podľa svojich hodín), najviac raz za 4 s
  if (actor != null && ms[actor] <= 0 && onTimeout && now - asked.current > 4000) {
    asked.current = now;
    setTimeout(onTimeout, 0);
  }
  return { ms, actor };
}

export const fmtClock = (ms: number) => {
  const t = Math.ceil(ms / 1000);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};
