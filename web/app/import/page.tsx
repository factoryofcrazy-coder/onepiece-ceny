"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CardImg, DataError, Loading, NeedLogin } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { Card, eur, useCards, usePrices } from "@/lib/data";
import { HdRow, matchRows, readHolodex } from "@/lib/holodex";
import { sb } from "@/lib/supabase";

type Existing = Record<string, { qty: number; hd: number }>;
type Status = "new" | "have" | "same" | "changed" | "removed";
type PlanRow = { id: string; card?: Card; before: number; after: number; oldHd: number; newHd: number; status: Status; rows: HdRow[] };

const STATUS: Record<Status, string> = {
  new: "Nová",
  have: "Už ju máš",
  same: "Bez zmeny",
  changed: "Zmenený počet",
  removed: "Už nie je v HoloDex",
};

export default function ImportPage() {
  const { user, loading } = useAuth();
  const { data, error } = useCards();
  const { data: prices } = usePrices();
  const usd = prices?.fx?.USD ?? 1.12;
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [existing, setExisting] = useState<Existing | null>(null);
  const [override, setOverride] = useState<Record<number, string>>({});
  const [manual, setManual] = useState<"max" | "add">("max");
  const [filter, setFilter] = useState<Status | "warn" | "all">("all");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const loadExisting = async () => {
    if (!user) return;
    const out: Existing = {};
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb()
        .from("collection")
        .select("card_id, qty, holodex_qty")
        .eq("user_id", user.id)
        .range(from, from + 999);
      if (error) break;
      data.forEach((r) => (out[r.card_id] = { qty: r.qty, hd: r.holodex_qty ?? 0 }));
      if (data.length < 1000) break;
    }
    setExisting(out);
  };
  useEffect(() => {
    loadExisting();
  }, [user]);

  const parsed = useMemo(() => (text ? readHolodex(text) : null), [text]);
  const matches = useMemo(() => (parsed && data ? matchRows(parsed.rows, data.cards) : []), [parsed, data]);
  const byCode = useMemo(() => {
    const m = new Map<string, Card[]>();
    data?.cards.forEach((c) => (m.get(c.code) ? m.get(c.code)!.push(c) : m.set(c.code, [c])));
    return m;
  }, [data]);

  const plan = useMemo(() => {
    if (!existing || !data) return null;
    const newHd: Record<string, { n: number; rows: HdRow[] }> = {};
    matches.forEach((m, i) => {
      const id = override[i] ?? m.card?.id;
      if (!id) return;
      const e = (newHd[id] ??= { n: 0, rows: [] });
      e.n += m.row.qty;
      e.rows.push(m.row);
    });
    const ids = new Set([...Object.keys(newHd), ...Object.keys(existing).filter((k) => existing[k].hd > 0)]);
    const rows: PlanRow[] = [];
    ids.forEach((id) => {
      const cur = existing[id]?.qty ?? 0;
      const oldHd = existing[id]?.hd ?? 0;
      const nw = newHd[id]?.n ?? 0;
      let after: number, status: Status;
      if (oldHd === 0 && cur === 0) (after = nw), (status = "new");
      else if (oldHd === 0) (after = manual === "max" ? Math.max(cur, nw) : cur + nw), (status = "have");
      else if (nw === 0) (after = Math.max(0, cur - oldHd)), (status = "removed");
      else if (oldHd === nw) (after = cur), (status = "same");
      else (after = Math.max(0, cur - oldHd + nw)), (status = "changed");
      rows.push({ id, card: data.byId.get(id), before: cur, after, oldHd, newHd: nw, status, rows: newHd[id]?.rows ?? [] });
    });
    rows.sort((a, b) => a.id.localeCompare(b.id));
    return rows;
  }, [existing, data, matches, override, manual]);

  if (loading) return <Loading shape="rows" />;
  if (!user) return <NeedLogin what="Import kolekcie" />;
  if (error) return <DataError error={error} file="cards" />;
  if (!data || !existing) return <Loading what="Načítavam" shape="rows" />;

  const unmatched = matches.filter((m, i) => !(override[i] ?? m.card));
  const guesses = matches.map((m, i) => ({ m, i })).filter(({ m, i }) => m.card && !m.sure && !override[i]);
  const count = (s: Status) => plan?.filter((p) => p.status === s).length ?? 0;
  const changes = plan?.filter((p) => p.after !== p.before || p.oldHd !== p.newHd) ?? [];
  const value = plan?.reduce((s, p) => s + p.newHd * ((p.card?.usd ?? 0) / usd), 0) ?? 0;

  const onFile = async (f?: File) => {
    if (!f) return;
    setFileName(f.name);
    setDone(null);
    setOverride({});
    setText(await f.text());
  };

  const apply = async () => {
    if (!plan) return;
    setBusy(true);
    const now = new Date().toISOString();
    const up = changes
      .filter((p) => p.after > 0 || p.newHd > 0)
      .map((p) => ({ user_id: user.id, card_id: p.id, qty: p.after, holodex_qty: p.newHd, updated_at: now }));
    const del = changes.filter((p) => p.after === 0 && p.newHd === 0).map((p) => p.id);
    let err: string | null = null;
    for (let i = 0; i < up.length && !err; i += 500) {
      const { error } = await sb().from("collection").upsert(up.slice(i, i + 500));
      if (error) err = error.message;
    }
    if (!err && del.length) {
      const { error } = await sb().from("collection").delete().eq("user_id", user.id).in("card_id", del);
      if (error) err = error.message;
    }
    setBusy(false);
    if (err) return setDone(`Import zlyhal: ${err}`);
    setDone(`Hotovo – uložených ${changes.length} zmien.`);
    setText("");
    setFileName("");
    loadExisting();
  };

  const shown = (plan ?? []).filter((p) =>
    filter === "all" ? true : filter === "warn" ? false : p.status === filter,
  );

  return (
    <>
      <div className="head">
        <div>
          <h1>Import z HoloDex</h1>
          <p className="muted">
            V appke HoloDex exportuj portfólio do CSV a nahraj ho sem. Karty, ktoré už máš, sa nezdvojnásobia. Pri ďalšom
            importe sa prenesie len to, čo sa v HoloDex zmenilo.
          </p>
        </div>
      </div>

      <label className={`drop ${fileName ? "has" : ""}`}>
        <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
        <b>{fileName || "Vyber alebo pretiahni CSV súbor"}</b>
        <span className="muted small">
          {fileName ? `${parsed?.rows.length ?? 0} riadkov One Piece` : "holodex-export-….csv"}
        </span>
      </label>
      <details className="paste">
        <summary className="small">alebo vlož obsah CSV ako text</summary>
        <textarea rows={6} value={text} onChange={(e) => (setText(e.target.value), setFileName(""), setDone(null))} />
      </details>

      {done && <p className={done.startsWith("Hotovo") ? "okc" : "badc"}>{done} {done.startsWith("Hotovo") && <Link href="/master-sety">Pozrieť master sety</Link>}</p>}
      {parsed?.error && <p className="badc">{parsed.error}</p>}

      {plan && parsed && parsed.rows.length > 0 && (
        <>
          <div className="istats">
            <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>
              <b>{parsed.rows.length}</b> riadkov v CSV
            </button>
            <button className={filter === "new" ? "on" : ""} onClick={() => setFilter("new")}>
              <b>{count("new")}</b> nových
            </button>
            <button className={filter === "have" ? "on" : ""} onClick={() => setFilter("have")}>
              <b>{count("have")}</b> už máš
            </button>
            <button className={filter === "same" ? "on" : ""} onClick={() => setFilter("same")}>
              <b>{count("same")}</b> bez zmeny
            </button>
            <button className={filter === "changed" ? "on" : ""} onClick={() => setFilter("changed")}>
              <b>{count("changed")}</b> zmenených
            </button>
            <button className={filter === "removed" ? "on" : ""} onClick={() => setFilter("removed")}>
              <b>{count("removed")}</b> odstránených
            </button>
            <button className={filter === "warn" ? "on" : ""} onClick={() => setFilter("warn")}>
              <b className={unmatched.length + guesses.length ? "badc" : ""}>{unmatched.length + guesses.length}</b> na kontrolu
            </button>
          </div>

          {count("have") > 0 && (
            <div className="panel row gap wrapr">
              <span>Karty, ktoré už máš pridané ručne:</span>
              <div className="seg">
                <button className={manual === "max" ? "on" : ""} onClick={() => setManual("max")}>
                  Sú to tie isté
                </button>
                <button className={manual === "add" ? "on" : ""} onClick={() => setManual("add")}>
                  Pripočítať
                </button>
              </div>
            </div>
          )}

          {(filter === "warn" || filter === "all") && (unmatched.length > 0 || guesses.length > 0) && (
            <div className="warnbox">
              <h2 className="sub">Na kontrolu</h2>
              {unmatched.map((m) => (
                <div key={m.row.line} className="wrow">
                  <span>
                    <b>{m.row.code}</b> {m.row.name} <span className="muted small">({m.row.set})</span>
                  </span>
                  <span className="badc small">{m.note ?? "Nenapárované"} – preskočí sa</span>
                </div>
              ))}
              {guesses.map(({ m, i }) => (
                <div key={m.row.line} className="wrow">
                  <span>
                    <b>{m.row.code}</b> {m.row.name} <span className="muted small">({m.row.set}, HoloDex ${m.row.usd ?? "?"})</span>
                  </span>
                  <select value={override[i] ?? m.card!.id} onChange={(e) => setOverride({ ...override, [i]: e.target.value })}>
                    {(byCode.get(m.row.code) ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.v || "Základná"} · {c.setName} · ${c.usd ?? "?"}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {filter !== "warn" && (
            <div className="itable">
              {shown.map((p) => (
                <div key={p.id} className={`irow s-${p.status}`}>
                  {p.card ? <CardImg card={p.card} /> : <div className="cimg ph">{p.id}</div>}
                  <div className="iname">
                    <b>{p.card?.name ?? p.id}</b>
                    <span className="small muted">
                      {p.id} {p.card?.v && <span className="tag tiny">{p.card.v}</span>}
                    </span>
                    {p.rows[0] && p.rows[0].name !== p.card?.name && (
                      <span className="tiny muted">HoloDex: {p.rows.map((r) => r.name).join(", ")}</span>
                    )}
                  </div>
                  <span className={`ist ist-${p.status}`}>{STATUS[p.status]}</span>
                  <span className="iqty">
                    {p.before} <span className="muted">→</span> <b>{p.after}</b>
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="applybar">
            <span>
              {changes.length ? (
                <>
                  <b>{changes.length}</b> zmien v kolekcii · hodnota importu {eur(value)}
                </>
              ) : (
                "Všetko už máš – nič sa nezmení."
              )}
            </span>
            <button className="btn" disabled={busy || !changes.length} onClick={apply}>
              {busy ? "Ukladám…" : `Importovať ${changes.length} zmien`}
            </button>
          </div>
        </>
      )}
    </>
  );
}
