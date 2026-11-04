"use client";
// Vzhľad webu: tmavý alebo svetlejší. Volba sa pamätá v prehliadači, atribút nastavuje skript v layoute ešte pred vykreslením.
import { useCallback, useEffect, useState } from "react";
import { THEME_KEY as KEY } from "./theme-init";

export type Theme = "dark" | "soft";


export function useTheme() {
  const [theme, setState] = useState<Theme>("dark");
  useEffect(() => {
    setState(document.documentElement.dataset.theme === "soft" ? "soft" : "dark");
  }, []);
  const setTheme = useCallback((t: Theme) => {
    setState(t);
    if (t === "soft") document.documentElement.dataset.theme = "soft";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* bez úložiska platí len do obnovenia */
    }
  }, []);
  return { theme, setTheme };
}
