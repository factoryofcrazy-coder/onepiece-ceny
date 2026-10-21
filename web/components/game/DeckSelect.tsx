"use client";
import type { DeckOpt } from "@/lib/game";

/** Výber decku: moje decky, turnajové top decky, startery. */
export default function DeckSelect({ decks, value, onChange }: { decks: DeckOpt[]; value?: string; onChange: (id: string) => void }) {
  const groups: [DeckOpt["group"], string][] = [
    ["mine", "Moje decky"],
    ["meta", "Turnajové top decky (Limitless)"],
    ["preset", "Starter decky"],
  ];
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {groups.map(([g, label]) => {
        const list = decks.filter((d) => d.group === g);
        return list.length ? (
          <optgroup key={g} label={label}>
            {list.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </optgroup>
        ) : null;
      })}
    </select>
  );
}
