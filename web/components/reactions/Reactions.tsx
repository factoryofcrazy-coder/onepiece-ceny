"use client";
// Reakcie pod správou: spoločné pre verejný chat aj súkromné správy. Stav „otvorené“ drží rodič, nech je otvorený najviac jeden výber.
import type { MouseEvent } from "react";
import { EMOTES, EmoteId, groupReactions, Reaction } from "@/lib/reactions";
import Emote from "./Emote";

type Base = { rows: readonly Reaction[] | undefined; me: string; nameOf: (userId: string) => string };
const whoOf = ({ me, nameOf }: Pick<Base, "me" | "nameOf">, users: string[]) => users.map((u) => (u === me ? "Ty" : nameOf(u))).join(", ");
const label = (id: string) => EMOTES.find((e) => e.id === id)!.label;

/** Na dotykovej obrazovke otvorí výber aj ťuknutie na správu; odkazy a tlačidlá v správe fungujú ďalej. */
export function tapToReact(e: MouseEvent, open: () => void) {
  if (!window.matchMedia("(hover: none)").matches) return;
  if ((e.target as Element).closest("a, button, input, textarea, select, .rx-panel")) return;
  if (window.getSelection()?.toString()) return;
  open();
}

/** Malé tlačidlo do riadku s časom. */
export function ReactionAdd({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`rx-add ${open ? "on" : ""}`} aria-expanded={open} aria-label="Reagovať na správu" title="Reagovať" onClick={onClick}>
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <circle cx="11" cy="13" r="8" />
        <path d="M8 15c1.600 1.500 4.400 1.500 6 0M8.500 10.500h.01M13.500 10.500h.01M19 2v5M16.500 4.500h5" />
      </svg>
    </button>
  );
}

/** Reakcie, ktoré na správe už sú. Keď nie sú žiadne, nezaberá miesto. */
export function ReactionPills({ rows, me, nameOf, canReact, onToggle }: Base & { canReact: boolean; onToggle: (emote: EmoteId, on: boolean) => void }) {
  const groups = groupReactions(rows, me);
  if (!groups.length) return null;
  return (
    <div className="rx-row">
      {groups.map((g) => {
        const who = whoOf({ me, nameOf }, g.users);
        return (
          <button
            key={g.emote}
            type="button"
            className={`rx-pill ${g.mine ? "on" : ""}`}
            disabled={!canReact}
            aria-pressed={g.mine}
            aria-label={`${label(g.emote)}, ${g.count}: ${who}`}
            title={`${label(g.emote)}: ${who}`}
            onClick={() => onToggle(g.emote, !g.mine)}
          >
            <Emote id={g.emote} size={17} />
            <b>{g.count}</b>
          </button>
        );
      })}
    </div>
  );
}

/** Výber emotu a kto reagoval. */
export function ReactionPanel({ rows, me, nameOf, canReact, align, onToggle, onClose }: Base & { canReact: boolean; align?: "end"; onToggle: (emote: EmoteId, on: boolean) => void; onClose: () => void }) {
  const groups = groupReactions(rows, me);
  return (
    <div className={`rx-panel ${align === "end" ? "end" : ""}`}>
      {canReact && (
        <div className="rx-picker" role="group" aria-label="Vyber reakciu">
          {EMOTES.map((e) => {
            const mine = groups.find((g) => g.emote === e.id)?.mine ?? false;
            return (
              <button
                key={e.id}
                type="button"
                className={mine ? "on" : ""}
                aria-pressed={mine}
                title={e.hint}
                onClick={() => {
                  onToggle(e.id, !mine);
                  onClose();
                }}
              >
                <Emote id={e.id} size={26} />
                <span>{e.label}</span>
              </button>
            );
          })}
        </div>
      )}
      {groups.length > 0 && (
        <ul className="rx-who">
          {groups.map((g) => (
            <li key={g.emote}>
              <Emote id={g.emote} size={16} /> <span>{whoOf({ me, nameOf }, g.users)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
