"use client";
import { FormEvent, useEffect, useState } from "react";
import type { Card } from "@/lib/data";
import { eur } from "@/lib/data";
import { addCopy, certUrl, CONDS, Copy, copyLabel, copyValue, GRADERS, loadCopies, parseCert, parseMoney, removeCopy, soldSearchUrl } from "@/lib/copies";

const today = () => new Date().toISOString().slice(0, 10);

/** Moje kusy v detaile karty. Kým tabuľka nie je v databáze, sekcia sa vôbec neukáže. */
export default function CopiesPanel({ card, market, qty, onSet, onChange }: { card: Card; market: number | null; qty: number; onSet: (n: number) => void; onChange?: () => void }) {
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
    if (p === undefined || o === undefined) return setErr("Cena musí byť číslo, napríklad 12,50.");
    if (kind && !(g >= 1 && g <= 10)) return setErr("Známka musí byť od 1 do 10.");
    const ce = parseCert(cert);
    if (kind && ce === undefined) return setErr("Číslo certifikátu môže mať len písmená, číslice a pomlčku.");
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
    if (!(await removeCopy(id))) return setErr("Kus sa nepodarilo zmazať.");
    setCopies(copies.filter((c) => c.id !== id));
    setErr("");
    onChange?.();
  };

  return (
    <section className="copies">
      <div className="copies-head">
        <h3>Moje kusy{copies.length > 0 && ` (${copies.length})`}</h3>
        <button className="btn ghost sm" aria-expanded={form} onClick={() => setForm(!form)}>
          {form ? "Zavrieť" : "Zapísať kus"}
        </button>
      </div>
      <p className="copies-private">Nákupnú cenu, stav a certifikát vidíš len ty. Cena pri karte platí pre negradovanú kartu. Pri gradovanej si pozri skutočné predaje a zapíš hodnotu podľa nich.</p>
      {copies.map((c) => {
        const v = copyValue(c, market);
        const diff = c.paid != null && v != null ? v - c.paid : null;
        return (
          <div key={c.id} className="copy-row">
            <span>
              <b>{copyLabel(c)}</b>
              {c.paid != null && <> · kúpené za {eur(c.paid)}</>}
              {diff != null && <span className={diff > 0 ? "cmove up" : diff < 0 ? "cmove down" : "cmove"}> {diff > 0 ? "+" : diff < 0 ? "−" : ""}{eur(Math.abs(diff))}</span>}
            </span>
            <button className="btn ghost sm" aria-label={`Zmazať kus ${copyLabel(c)}`} onClick={() => remove(c.id)}>
              Zmazať
            </button>
            <small>
              {[c.bought_on && new Date(c.bought_on + "T00:00:00Z").toLocaleDateString("sk-SK", { timeZone: "UTC" }), c.own_value != null && `hodnota podľa predajov ${eur(c.own_value)}`, c.grader && c.own_value == null && "bez zapísanej hodnoty", c.note].filter(Boolean).join(" · ")}
              {certUrl(c) ? (
                <>
                  {" · "}
                  <a href={certUrl(c)!} target="_blank" rel="noreferrer">
                    certifikát {c.cert} ↗
                  </a>
                </>
              ) : (
                c.cert && ` · certifikát ${c.cert}`
              )}
            </small>
          </div>
        );
      })}
      {form && (
        <form className="copy-form" onSubmit={save}>
          <label className="field">
            <span>Karta</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">Negradovaná</option>
              {GRADERS.map((g) => (
                <option key={g} value={g}>
                  {g === "Iný" ? "Iný grading" : g}
                </option>
              ))}
            </select>
          </label>
          {kind ? (
            <label className="field">
              <span>Známka</span>
              <input type="text" inputMode="decimal" value={grade} onChange={(e) => setGrade(e.target.value)} />
            </label>
          ) : (
            <label className="field">
              <span>Stav</span>
              <select value={cond} onChange={(e) => setCond(e.target.value)}>
                {CONDS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span>Kúpené za €</span>
            <input type="text" inputMode="decimal" placeholder="12,50" value={paid} onChange={(e) => setPaid(e.target.value)} />
          </label>
          {kind && (
            <>
              <label className="field">
                <span>Hodnota podľa predajov €</span>
                <input type="text" inputMode="decimal" value={own} onChange={(e) => setOwn(e.target.value)} />
              </label>
              <p className="tiny wide">
                <a href={soldSearchUrl(card.code, kind === "Iný" ? "graded" : kind, kind === "Iný" ? "" : grade)} target="_blank" rel="noreferrer">
                  Pozrieť predaje na eBay ↗
                </a>
              </p>
              <label className="field">
                <span>Číslo certifikátu</span>
                <input type="text" maxLength={40} autoCapitalize="characters" value={cert} onChange={(e) => setCert(e.target.value)} />
              </label>
            </>
          )}
          <label className="field">
            <span>Dátum nákupu</span>
            <input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field wide">
            <span>Poznámka</span>
            <input type="text" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="wide">
            <button className="btn sm" disabled={busy}>
              {busy ? "Ukladám…" : "Uložiť kus"}
            </button>
          </div>
        </form>
      )}
      {err && <p className="badc small">{err}</p>}
    </section>
  );
}
