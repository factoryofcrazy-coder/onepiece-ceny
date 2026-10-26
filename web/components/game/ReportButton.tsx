"use client";
// „Nahlásiť problém“ – hráč opíše, čo engine urobil zle; uloží sa aj stav hry a posledné ťahy, aby sa to dalo zopakovať.
import Link from "next/link";
import { Icon } from "./icons";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CardImg } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import type { Card } from "@/lib/data";
import type { Action, GameState } from "@/lib/engine/types";
import { sb } from "@/lib/supabase";

export type ActionLog = { a: Action; turn: number; at: string; prompt?: string }[];

export default function ReportButton({
  s, mode, gameId, actions, byCode, peek,
}: {
  s: GameState; mode: "bot" | "local" | "online"; gameId?: string; actions: ActionLog; byCode: Map<string, Card>; peek?: string | null;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [cards, setCards] = useState<string[]>([]);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [err, setErr] = useState("");

  // karty, ktoré sa naposledy hrali / útočili / boli K.O. – na rýchle označenie
  const recent = useMemo(() => {
    const out: string[] = [];
    const add = (iid?: string) => {
      const code = iid && s.cards[iid]?.code;
      if (code && !out.includes(code)) out.push(code);
    };
    add(peek ?? undefined);
    for (let i = s.log.length - 1; i >= 0 && out.length < 10; i--) {
      const e = s.log[i];
      if (e.t === "CardPlayed" || e.t === "EventActivated") add(e.iid);
      else if (e.t === "KO") add(e.iid);
      else if (e.t === "Attack") (add(e.attacker), add(e.target));
    }
    return out;
  }, [s, peek]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);

  const send = async () => {
    setState("sending");
    setErr("");
    const { error } = await sb()
      .from("game_reports")
      .insert({
        game_id: gameId ?? null,
        mode,
        message: msg.trim(),
        cards,
        turn: s.turn,
        actions: actions.slice(-20),
        state: s,
      });
    if (error) {
      setState("error");
      setErr(error.message);
    } else setState("done");
  };
  const reset = () => {
    setOpen(false);
    setMsg("");
    setCards([]);
    setState("idle");
  };

  return (
    <>
      <button className="btn ghost sm" onClick={() => setOpen(true)} title="Nahlásiť zlý ťah alebo efekt" aria-label="Nahlásiť problém">
        <Icon name="flag" size={14} />
        <span className="lbl-wide">Nahlásiť</span>
      </button>
      {open &&
        createPortal(
        <div className="modal" onClick={reset}>
          <div className="mbox report" onClick={(e) => e.stopPropagation()}>
            <button className="x" onClick={reset}>
              ×
            </button>
            {state === "done" ? (
              <div className="report-done">
                <h2>Ďakujem, uložené ✓</h2>
                <p className="muted">
                  Hlásenie má aj presný stav hry a posledné ťahy, takže sa to dá zopakovať a opraviť. Pokojne hraj ďalej.
                </p>
                <button className="btn" onClick={reset}>
                  Späť do hry
                </button>
              </div>
            ) : !user ? (
              <div className="report-done">
                <h2>Nahlásiť problém</h2>
                <p className="muted">
                  Na nahlásenie sa treba <Link href="/login">prihlásiť</Link>.
                </p>
              </div>
            ) : (
              <>
                <h2>Nahlásiť zlý ťah / efekt</h2>
                <p className="muted small" style={{ margin: "0 0 10px" }}>
                  Napíš, čo sa stalo a čo malo byť správne. K hláseniu sa automaticky pripojí aktuálny stav hry (ťah {s.turn}) a posledné ťahy.
                </p>
                <textarea
                  autoFocus
                  rows={5}
                  maxLength={4000}
                  value={msg}
                  onChange={(e) => setMsg(e.target.value)}
                  placeholder="Napr.: Zahral som Nami OP17-023, súper K.O.-oval moju postavu a Nami ju nezachránila, hoci mala…"
                />
                {recent.length > 0 && (
                  <>
                    <p className="small muted" style={{ margin: "12px 0 6px" }}>
                      Ktorej karty sa to týka? (klikni, môžeš viac)
                    </p>
                    <div className="report-cards">
                      {recent.map((code) => {
                        const c = byCode.get(code);
                        const on = cards.includes(code);
                        return (
                          <button key={code} className={`gpick ${on ? "on" : ""}`} onClick={() => setCards(on ? cards.filter((x) => x !== code) : [...cards, code])} title={c?.name ?? code}>
                            {c ? <CardImg card={c} eager /> : <span className="cimg ph">{code}</span>}
                            <span className="tiny">{code}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
                {state === "error" && <p className="gerr">Nepodarilo sa uložiť: {err}</p>}
                <div className="row gap" style={{ justifyContent: "flex-end", marginTop: 12 }}>
                  <button className="btn ghost sm" onClick={reset}>
                    Zrušiť
                  </button>
                  <button className="btn sm" disabled={msg.trim().length < 3 || state === "sending"} onClick={send}>
                    {state === "sending" ? "Ukladám…" : "Odoslať hlásenie"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}
