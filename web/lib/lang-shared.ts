// Spoločné pre server (layout číta cookie) aj klienta – preto nie je v "use client" súbore.
export type Lang = "sk" | "en";
export const LANG_COOKIE = "lang";
export function parseLang(v: string | undefined | null): Lang {
  return v === "en" ? "en" : "sk";
}
/** Text v danom jazyku pre miesta mimo komponentov (pomocné funkcie, ktoré dostanú jazyk ako parameter). */
export const tr = (lang: Lang, sk: string, en: string) => (lang === "en" ? en : sk);
/** Locale pre dátumy s názvami mesiacov a dní. Ceny ostávajú v tvare „1 234,56 €“ v oboch jazykoch. */
export const localeOf = (lang: Lang) => (lang === "en" ? "en-GB" : "sk-SK");
