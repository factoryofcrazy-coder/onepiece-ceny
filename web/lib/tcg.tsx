"use client";
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";

import { POKEMON_ENABLED, Tcg, TCG_COOKIE } from "./tcg-shared";
export type { Tcg } from "./tcg-shared";

/** Hra, ktorú stránka práve ukazuje. One Piece je predvolená, Pokémon sa zapína prepínačom v menu. */
export const TCGS: { id: Tcg; label: string; short: string }[] = [
  { id: "onepiece", label: "One Piece", short: "OP" },
  ...(POKEMON_ENABLED ? [{ id: "pokemon" as Tcg, label: "Pokémon", short: "PK" }] : []),
];

const Ctx = createContext<{ tcg: Tcg; setTcg: (t: Tcg) => void }>({ tcg: "onepiece", setTcg: () => {} });

export function TcgProvider({ initial, children }: { initial: Tcg; children: ReactNode }) {
  const [tcg, setState] = useState<Tcg>(initial);
  useEffect(() => {
    document.documentElement.dataset.tcg = tcg;
  }, [tcg]);
  const setTcg = useCallback((t: Tcg) => {
    if (!POKEMON_ENABLED) t = "onepiece";
    setState(t);
    // cookie číta server pri ďalšom načítaní (správna hra hneď od prvého vykreslenia)
    document.cookie = `${TCG_COOKIE}=${t}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax`;
  }, []);
  return <Ctx.Provider value={{ tcg, setTcg }}>{children}</Ctx.Provider>;
}

export const useTcg = () => useContext(Ctx);
