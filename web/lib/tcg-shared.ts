// Spoločné pre server (layout číta cookie) aj klienta – preto nie je v "use client" súbore.
export type Tcg = "onepiece" | "pokemon";
export const TCG_COOKIE = "tcg";
export function parseTcg(v: string | undefined | null): Tcg {
  return v === "pokemon" ? "pokemon" : "onepiece";
}
