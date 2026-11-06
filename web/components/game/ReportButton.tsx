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
import { useLang } from "@/lib/lang";

export type ActionLog = { a: Action; turn: number; at: string; prompt?: string }[];

export default function ReportButton({
  s, mode, gameId, actions, byCode, peek,
}: {
  s: GameState; mode: "bot" | "local" | "online"; gameId?: string; actions: ActionLog; byCode: Map<string, Card>; peek?: string | null;
}) {
  const { user } = useAuth();
  const { t: L } = useLang();
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
      <button className="btn ghost sm" onClick={() => setOpen(true)} title={L("Nahlásiť zlý ťah alebo efekt", "Report a wrong move or effect")} aria-label={L("Nahlásiť problém", "Report a problem")}>
        <Icon name="report" size={14} />
        <span className="lbl-wide">{L("Nahlásiť", "Report")}</span>
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
                <h2>{L("Ďakujem, uložené ✓", "Thanks, saved ✓")}</h2>
                <p className="muted">
                  {L("Hlásenie má aj presný stav hry a posledné ťahy, takže sa to dá zopakovať a opraviť. Text uvidia všetci medzi úlohami v sekcii Report, stav hry vidí len správca. Pokojne hraj ďalej.", "The report includes the exact game state and recent moves, so it can be reproduced and fixed. Everyone sees the text among tasks in the Report section; only the admin sees the game state. Feel free to keep playing.")}
                </p>
                <button className="btn" onClick={reset}>
                  {L("Späť do hry", "Back to the game")}
                </button>
              </div>
            ) : !user ? (
              <div className="report-done">
                <h2>{L("Nahlásiť problém", "Report a problem")}</h2>
                <p className="muted">
                  {L("Na nahlásenie sa treba", "To report you need to")} <Link href="/login">{L("prihlásiť", "sign in")}</Link>.
                </p>
              </div>
            ) : (
              <>
                <h2>{L("Nahlásiť zlý ťah / efekt", "Report a wrong move / effect")}</h2>
                <p className="muted small" style={{ margin: "0 0 10px" }}>
                  {L(`Napíš, čo sa stalo a čo malo byť správne. K hláseniu sa automaticky pripojí aktuálny stav hry (ťah ${s.turn}) a posledné ťahy.`, `Describe what happened and what should have happened. The current game state (turn ${s.turn}) and recent moves are attached automatically.`)}
                </p>
                <textarea
                  autoFocus
                  rows={5}
                  maxLength={4000}
                  value={msg}
                  onChange={(e) => setMsg(e.target.value)}
                  placeholder={L("Napr.: Zahral som Nami OP17-023, súper K.O.-oval moju postavu a Nami ju nezachránila, hoci mala…", "E.g.: I played Nami OP17-023, the opponent K.O.'d my character and Nami didn't save it, though she should have…")}
                />
                {recent.length > 0 && (
                  <>
                    <p className="small muted" style={{ margin: "12px 0 6px" }}>
                      {L("Ktorej karty sa to týka? (klikni, môžeš viac)", "Which cards is it about? (click, you can pick several)")}
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
                {state === "error" && <p className="gerr">{L("Nepodarilo sa uložiť", "Couldn't save")}: {err}</p>}
                <div className="row gap" style={{ justifyContent: "flex-end", marginTop: 12 }}>
                  <button className="btn ghost sm" onClick={reset}>
                    {L("Zrušiť", "Cancel")}
                  </button>
                  <button className="btn sm" disabled={msg.trim().length < 3 || state === "sending"} onClick={send}>
                    {state === "sending" ? L("Ukladám…", "Saving…") : L("Odoslať hlásenie", "Send report")}
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
