"use client";
import { useLang } from "@/lib/lang";

export default function LangToggle() {
  const { lang, setLang, t } = useLang();
  return (
    <div className="th-toggle lang-toggle" role="radiogroup" aria-label={t("Jazyk", "Language")}>
      {(["sk", "en"] as const).map((l) => (
        <button key={l} type="button" role="radio" aria-checked={lang === l} title={l === "sk" ? "Slovenčina" : "English"} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
