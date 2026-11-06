"use client";
import { FormEvent, useEffect, useState } from "react";
import type { Card } from "@/lib/data";
import { eur } from "@/lib/data";
import { useLang } from "@/lib/lang";
import { addCopy, certUrl, CONDS, Copy, copyLabel, copyValue, GRADERS, loadCopies, parseCert, parseMoney, removeCopy, soldSearchUrl } from "@/lib/copies";

const today = () => new Date().toISOString().slice(0, 10);

/** Moje kusy v detaile karty. Kým tabuľka nie je v databáze, sekcia sa vôbec neukáže. */
export default function CopiesPanel({ card, market, qty, onSet, onChange, gradedOf }: { card: Card; market: number | null; qty: number; onSet: (n: number) => void; onChange?: () => void; gradedOf?: (c: Copy) => number | null }) {
  const [copies, setCopies] = useState<Copy[] | null>(null);
  const [form, setForm] = useState(false);
  const [kind, setKind] = useState("");
  const [cond, setCond] = useState<string>("NM");
  const [grade, setGrade] = useState("10");
  const [paid, setPaid] = useState("");
  const [own, setOwn] = useState("");
  const [cert, setCert] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const { t, locale } = useLang();

  useEffect(() => {
    let live = true;
    loadCopies(card.id).then((c) => live && setCopies(c));
    return () => {
      live = false;
    };
  }, [card.id]);

  if (!copies) return null;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const p = parseMoney(paid), o = parseMoney(own), g = Number(grade.replace(",", "."));
    if (p === undefined || o === undefined) return setErr(t("Cena musí byť číslo, napríklad 12,50.", "Price must be a number, e.g. 12.50."));
    if (kind && !(g >= 1 && g <= 10)) return setErr(t("Známka musí byť od 1 do 10.", "Grade must be from 1 to 10."));
    const ce = parseCert(cert);
    if (kind && ce === undefined) return setErr(t("Číslo certifikátu môže mať len písmená, číslice a pomlčku.", "The certificate number may only contain letters, digits and a hyphen."));
    setBusy(true);
    const res = await addCopy({
      card_id: card.id,
      paid: p,
      own_value: kind ? o : null,
      bought_on: date || null,
      cond: kind ? null : (cond as Copy["cond"]),
      grader: (kind || null) as Copy["grader"],
      grade: kind ? g : null,
      cert: kind ? ce ?? null : null,
      note: note.trim() || null,
    });
    setBusy(false);
    if (typeof res === "string") return setErr(res);
    const next = [...copies, res];
    setCopies(next);
    if (qty < next.length) onSet(next.length);
    setErr("");
    setPaid("");
    setOwn("");
    setCert("");
    setDate("");
    setNote("");
    setForm(false);
    onChange?.();
  };
  const remove = async (id: string) => {
    if (!(await removeCopy(id))) return setErr(t("Kus sa nepodarilo zmazať.", "The copy could not be deleted."));
    setCopies(copies.filter((c) => c.id !== id));
    setErr("");
    onChange?.();
  };

  return (
    <section className="copies">
      <div className="copies-head">
        <h3>{t("Moje kusy", "My copies")}{copies.length > 0 && ` (${copies.length})`}</h3>
        <button className="btn ghost sm" aria-expanded={form} onClick={() => setForm(!form)}>
          {form ? t("Zavrieť", "Close") : t("Zapísať kus", "Add a copy")}
        </button>
      </div>
      <p className="copies-private">{t("Nákupnú cenu, stav a certifikát vidíš len ty. Cena pri karte platí pre negradovanú kartu. Pri gradovanej si pozri skutočné predaje a zapíš hodnotu podľa nich.", "Only you can see the purchase price, condition and certificate. The card price is for an ungraded card. For a graded one, check actual sales and enter a value based on them.")}</p>
      {copies.map((c) => {
        const v = copyValue(c, market, gradedOf?.(c) ?? null);
        const diff = c.paid != null && v != null ? v - c.paid : null;
        return (
          <div key={c.id} className="copy-row">
            <span>
              <b>{copyLabel(c) === "Bez stavu" ? t("Bez stavu", "No condition") : copyLabel(c)}</b>
              {c.paid != null && <> · {t("kúpené za", "bought for")} {eur(c.paid)}</>}
              {diff != null && <span className={diff > 0 ? "cmove up" : diff < 0 ? "cmove down" : "cmove"}> {diff > 0 ? "+" : diff < 0 ? "−" : ""}{eur(Math.abs(diff))}</span>}
            </span>
            <button className="btn ghost sm" aria-label={`${t("Zmazať kus", "Delete copy")} ${copyLabel(c)}`} onClick={() => remove(c.id)}>
              {t("Zmazať", "Delete")}
            </button>
            <small>
              {[c.bought_on && new Date(c.bought_on + "T00:00:00Z").toLocaleDateString(locale, { timeZone: "UTC" }), c.own_value != null && `${t("hodnota podľa predajov", "value based on sales")} ${eur(c.own_value)}`, c.grader && c.own_value == null && t("bez zapísanej hodnoty", "no value entered"), c.note].filter(Boolean).join(" · ")}
              {certUrl(c) ? (
                <>
                  {" · "}
                  <a href={certUrl(c)!} target="_blank" rel="noreferrer">
                    {t("certifikát", "certificate")} {c.cert} ↗
                  </a>
                </>
              ) : (
                c.cert && ` · ${t("certifikát", "certificate")} ${c.cert}`
              )}
            </small>
          </div>
        );
      })}
      {form && (
        <form className="copy-form" onSubmit={save}>
          <label className="field">
            <span>{t("Karta", "Card")}</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">{t("Negradovaná", "Ungraded")}</option>
              {GRADERS.map((g) => (
                <option key={g} value={g}>
                  {g === "Iný" ? t("Iný grading", "Other grader") : g}
                </option>
              ))}
            </select>
          </label>
          {kind ? (
            <label className="field">
              <span>{t("Známka", "Grade")}</span>
              <input type="text" inputMode="decimal" value={grade} onChange={(e) => setGrade(e.target.value)} />
            </label>
          ) : (
            <label className="field">
              <span>{t("Stav", "Condition")}</span>
              <select value={cond} onChange={(e) => setCond(e.target.value)}>
                {CONDS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span>{t("Kúpené za €", "Bought for €")}</span>
            <input type="text" inputMode="decimal" placeholder="12,50" value={paid} onChange={(e) => setPaid(e.target.value)} />
          </label>
          {kind && (
            <>
              <label className="field">
                <span>{t("Hodnota podľa predajov €", "Value based on sales €")}</span>
                <input type="text" inputMode="decimal" value={own} onChange={(e) => setOwn(e.target.value)} />
              </label>
              <p className="tiny wide">
                <a href={soldSearchUrl(card.code, kind === "Iný" ? "graded" : kind, kind === "Iný" ? "" : grade)} target="_blank" rel="noreferrer">
                  {t("Pozrieť predaje na eBay", "See sales on eBay")} ↗
                </a>
              </p>
              <label className="field">
                <span>{t("Číslo certifikátu", "Certificate number")}</span>
                <input type="text" maxLength={40} autoCapitalize="characters" value={cert} onChange={(e) => setCert(e.target.value)} />
              </label>
            </>
          )}
          <label className="field">
            <span>{t("Dátum nákupu", "Purchase date")}</span>
            <input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field wide">
            <span>{t("Poznámka", "Note")}</span>
            <input type="text" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="wide">
            <button className="btn sm" disabled={busy}>
              {busy ? t("Ukladám…", "Saving…") : t("Uložiť kus", "Save copy")}
            </button>
          </div>
        </form>
      )}
      {err && <p className="badc small">{err}</p>}
    </section>
  );
}
