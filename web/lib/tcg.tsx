"use client";
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";

/** Hra, ktorú stránka práve ukazuje. One Piece je predvolená, Pokémon sa zapína prepínačom v menu. */
export type Tcg = "onepiece" | "pokemon";
export const TCGS: { id: Tcg; label: string; short: string }[] = [
  { id: "onepiece", label: "One Piece", short: "OP" },
  { id: "pokemon", label: "Pokémon", short: "PK" },
];
export const TCG_COOKIE = "tcg";

const Ctx = createContext<{ tcg: Tcg; setTcg: (t: Tcg) => void }>({ tcg: "onepiece", setTcg: () => {} });

export function TcgProvider({ initial, children }: { initial: Tcg; children: ReactNode }) {
  const [tcg, setState] = useState<Tcg>(initial);
  useEffect(() => {
    document.documentElement.dataset.tcg = tcg;
  }, [tcg]);
  const setTcg = useCallback((t: Tcg) => {
    setState(t);
    // cookie číta server pri ďalšom načítaní (správna hra hneď od prvého vykreslenia)
    document.cookie = `${TCG_COOKIE}=${t}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax`;
  }, []);
  return <Ctx.Provider value={{ tcg, setTcg }}>{children}</Ctx.Provider>;
}

export const useTcg = () => useContext(Ctx);

export function parseTcg(v: string | undefined | null): Tcg {
  return v === "pokemon" ? "pokemon" : "onepiece";
}
