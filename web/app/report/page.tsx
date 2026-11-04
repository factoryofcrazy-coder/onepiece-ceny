"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { sb } from "@/lib/supabase";

const KINDS = [
  { id: "bug", label: "Niečo nefunguje", hint: "Čo si robil, čo sa stalo a čo si čakal?" },
  { id: "idea", label: "Mám nápad", hint: "Čo by sa ti tu hodilo alebo čo by si zmenil?" },
  { id: "other", label: "Niečo iné", hint: "Napíš, čo máš na srdci." },
];

export default function Report() {
  const { user } = useAuth();
  const [kind, setKind] = useState("bug");
  const [message, setMessage] = useState("");
  const [page, setPage] = useState("");
  const [contact, setContact] = useState("");
  const [trap, setTrap] = useState(""); // pole pre roboty, človek ho nevidí
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    try {
      const r = new URL(document.referrer);
      if (r.origin === window.location.origin && r.pathname !== "/report") setPage(r.pathname);
    } catch {}
  }, []);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim().length < 5) return setErr("Napíš aspoň pár slov.");
    if (trap) return setSent(true);
    setBusy(true);
    setErr("");
    const { error } = await sb()
      .from("feedback")
      .insert({
        kind,
        message: message.trim(),
        page: page.trim().slice(0, 200) || null,
        contact: contact.trim().slice(0, 120) || null,
        user_agent: navigator.userAgent.slice(0, 300),
      });
    setBusy(false);
    if (error) return setErr(error.code === "P0001" ? error.message : "Nepodarilo sa odoslať. Skús to znova o chvíľu.");
    setSent(true);
  };

  if (sent)
    return (
      <div className="ucet">
        <h1>Ďakujeme!</h1>
        <p>Hlásenie máme. Každé si prečítame, aj keď nestihneme odpovedať na všetky.</p>
        <div className="ucet-row">
          <button
            className="btn ghost"
            onClick={() => {
              setSent(false);
              setMessage("");
            }}
          >
            Napísať ďalšie
          </button>
          <Link className="btn" href="/">
            Späť na web
          </Link>
        </div>
      </div>
    );

  const active = KINDS.find((k) => k.id === kind)!;
  return (
    <div className="ucet">
      <h1>Report</h1>
      <p className="muted">Web je nový a stále ho dolaďujeme. Napíš nám, čo nefunguje alebo čo by si chcel inak.</p>
      <form className="ucet-card" onSubmit={send}>
        <div className="rep-kinds" role="radiogroup" aria-label="O čo ide">
          {KINDS.map((k) => (
            <button type="button" key={k.id} role="radio" aria-checked={kind === k.id} className={kind === k.id ? "on" : ""} onClick={() => setKind(k.id)}>
              {k.label}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Správa</span>
          <textarea required rows={6} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={active.hint} />
        </label>
        <label className="field">
          <span>Kde sa to stalo? (nepovinné)</span>
          <input maxLength={200} value={page} onChange={(e) => setPage(e.target.value)} placeholder="napr. skener, zbierka, online hra" />
        </label>
        <label className="field">
          <span>Kontakt, ak chceš odpoveď (nepovinné)</span>
          <input maxLength={120} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="napr. Discord: Anon" />
        </label>
        <label className="rep-trap" aria-hidden>
          Web
          <input tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
        </label>
        <button className="btn" disabled={busy}>
          {busy ? "Odosielam…" : "Odoslať"}
        </button>
        {err && <p className="badc small">{err}</p>}
        <p className="tiny muted">
          {user ? "Hlásenie sa spojí s tvojím účtom. " : "Môžeš písať aj bez prihlásenia. "}
          Uložíme aj typ prehliadača, aby sme chybu vedeli zopakovať. Viac v <Link href="/sukromie">zásadách súkromia</Link>.
        </p>
      </form>
    </div>
  );
}
