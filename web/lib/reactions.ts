// Reakcie na správy vo verejnom chate aj v súkromných správach. Zoznam musí sedieť s kontrolou v migrácii 20261115_reactions.sql.
export const EMOTES = [
  { id: "kek", label: "KEK", hint: "smiech", hintEn: "laugh" },
  { id: "pog", label: "POG", hint: "wow", hintEn: "wow" },
  { id: "rip", label: "RIP", hint: "koniec", hintEn: "it's over" },
  { id: "cope", label: "COPE", hint: "bolí, ale držím sa", hintEn: "hurts, but holding on" },
  { id: "beli", label: "BELI", hint: "dobrá cena", hintEn: "good price" },
  { id: "pull", label: "PULL", hint: "super ťah", hintEn: "great pull" },
  { id: "salty", label: "SALTY", hint: "hnev", hintEn: "salty" },
  { id: "gg", label: "GG", hint: "dobrá hra", hintEn: "good game" },
] as const;

export type EmoteId = (typeof EMOTES)[number]["id"];
export const isEmote = (v: unknown): v is EmoteId => EMOTES.some((e) => e.id === v);
export const emoteLabel = (id: string) => EMOTES.find((e) => e.id === id)?.label ?? id;

export type Reaction = { emote: string; user_id: string };
export type ReactionGroup = { emote: EmoteId; count: number; mine: boolean; users: string[] };

/** Riadky reakcií → skupiny podľa emotu v stálom poradí. Neznáme emoty (staršia verzia webu) sa vynechajú. */
export function groupReactions(rows: readonly Reaction[] | undefined, me: string | undefined): ReactionGroup[] {
  if (!rows?.length) return [];
  return EMOTES.flatMap((e) => {
    const users = rows.filter((r) => r.emote === e.id).map((r) => r.user_id);
    return users.length ? [{ emote: e.id, count: users.length, mine: !!me && users.includes(me), users }] : [];
  });
}

/** Pridá alebo zruší reakciu v zozname; pridanie dvakrát nič nezdvojí. */
export function applyReaction(rows: readonly Reaction[] | undefined, emote: string, user: string, on: boolean): Reaction[] {
  const rest = (rows ?? []).filter((r) => !(r.emote === emote && r.user_id === user));
  return on ? [...rest, { emote, user_id: user }] : rest;
}
