"use client";
import type { DeckOpt } from "@/lib/game";
import { useLang } from "@/lib/lang";

/** Výber decku: moje decky, turnajové top decky, startery. */
export default function DeckSelect({ decks, value, onChange }: { decks: DeckOpt[]; value?: string; onChange: (id: string) => void }) {
  const { t } = useLang();
  const groups: [DeckOpt["group"], string][] = [
    ["mine", t("Moje decky", "My decks")],
    ["meta", t("Turnajové top decky (Limitless)", "Top tournament decks (Limitless)")],
    ["preset", t("Starter decky", "Starter decks")],
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
