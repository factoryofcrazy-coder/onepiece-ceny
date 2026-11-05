"use client";
// Reakcie pod správou: spoločné pre verejný chat aj súkromné správy.
import { useState } from "react";
import { EMOTES, EmoteId, groupReactions, Reaction } from "@/lib/reactions";
import Emote from "./Emote";

type Props = {
  rows: readonly Reaction[] | undefined;
  me: string;
  /** meno pre zobrazenie „kto reagoval“ */
  nameOf: (userId: string) => string;
  /** false = reakcie sa dajú len pozerať */
  canReact: boolean;
  onToggle: (emote: EmoteId, on: boolean) => void;
};

export default function Reactions({ rows, me, nameOf, canReact, onToggle }: Props) {
  const [open, setOpen] = useState(false);
  const groups = groupReactions(rows, me);
  const who = (users: string[]) => users.map((u) => (u === me ? "Ty" : nameOf(u))).join(", ");
  const label = (id: string) => EMOTES.find((e) => e.id === id)!.label;
  if (!canReact && !groups.length) return null;

  return (
    <div className="rx">
      <div className="rx-row">
        {groups.map((g) => (
          <button
            key={g.emote}
            type="button"
            className={`rx-pill ${g.mine ? "on" : ""}`}
            disabled={!canReact}
            aria-pressed={g.mine}
            aria-label={`${label(g.emote)}, ${g.count}: ${who(g.users)}`}
            title={`${label(g.emote)}: ${who(g.users)}`}
            onClick={() => onToggle(g.emote, !g.mine)}
          >
            <Emote id={g.emote} size={18} />
            <b>{g.count}</b>
          </button>
        ))}
        {(canReact || groups.length > 0) && (
          <button type="button" className={`rx-add ${open ? "on" : ""}`} aria-expanded={open} aria-label="Reakcie na správu" title="Reagovať" onClick={() => setOpen(!open)}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="13" r="8" />
              <path d="M8 15c1.600 1.500 4.400 1.500 6 0M8.500 10.500h.01M13.500 10.500h.01M19 2v5M16.500 4.500h5" />
            </svg>
          </button>
        )}
      </div>
      {open && (
        <div className="rx-panel">
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
                      setOpen(false);
                    }}
                  >
                    <Emote id={e.id} size={28} />
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
                  <Emote id={g.emote} size={16} /> <span>{who(g.users)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
