// Spoločné pre server (layout číta cookie) aj klienta – preto nie je v "use client" súbore.
export type Tcg = "onepiece" | "pokemon";
export const TCG_COOKIE = "tcg";
/** Pokémon časť je dočasne vypnutá (ešte nie je hotová na zdieľanie) – true ju znova zapne. */
export const POKEMON_ENABLED = false;
export function parseTcg(v: string | undefined | null): Tcg {
  return POKEMON_ENABLED && v === "pokemon" ? "pokemon" : "onepiece";
}
