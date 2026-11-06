"use client";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Lang, LANG_COOKIE, localeOf } from "./lang-shared";
export type { Lang } from "./lang-shared";

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** t("slovenský text", "English text") – vráti text v aktuálnom jazyku. */
  t: (sk: string, en: string) => string;
  /** sk-SK alebo en-GB, na toLocaleDateString a pod. */
  locale: string;
};

const LangCtx = createContext<Ctx>({ lang: "sk", setLang: () => {}, t: (sk) => sk, locale: "sk-SK" });

export function LangProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, setState] = useState<Lang>(initial);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setState(l);
    // cookie číta server pri ďalšom načítaní, prvé vykreslenie je hneď v správnom jazyku
    document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax`;
  }, []);
  const value = useMemo<Ctx>(() => ({ lang, setLang, t: (sk, en) => (lang === "en" ? en : sk), locale: localeOf(lang) }), [lang, setLang]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export const useLang = () => useContext(LangCtx);
