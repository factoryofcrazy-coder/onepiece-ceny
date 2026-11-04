"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { plural } from "@/lib/sk";
import { sb } from "@/lib/supabase";

type Status = "new" | "doing" | "done" | "rejected";
type Task = {
  id: number;
  created_at: string;
  kind: string;
  message: string;
  page: string | null;
  status: Status;
  admin_reply: string | null;
  source: string;
  // len pre admina
  contact?: string | null;
  user_agent?: string | null;
  hidden?: boolean;
  username?: string | null;
};

const KINDS = [
  { id: "bug", label: "Niečo nefunguje", short: "Chyba", hint: "Čo si robil, čo sa stalo a čo si čakal?" },
  { id: "idea", label: "Mám nápad", short: "Nápad", hint: "Čo by sa ti tu hodilo alebo čo by si zmenil?" },
  { id: "other", label: "Niečo iné", short: "Iné", hint: "Napíš, čo máš na srdci." },
];
const STATUS: Record<Status, string> = { new: "Nové", doing: "Robí sa", done: "Hotové", rejected: "Zamietnuté" };
const FILTERS: { id: string; label: string; test: (s: Status) => boolean }[] = [
  { id: "open", label: "Otvorené", test: (s) => s === "new" || s === "doing" },
  { id: "done", label: "Hotové", test: (s) => s === "done" },
  { id: "rejected", label: "Zamietnuté", test: (s) => s === "rejected" },
  { id: "all", label: "Všetky", test: () => true },
];
const COLUMNS = "id, created_at, kind, message, page, status, admin_reply, source";
const fmtDate = (ts: string) => new Date(ts).toLocaleDateString("sk-SK", { day: "numeric", month: "numeric", year: "numeric" });

function AdminBox({ task, onSaved }: { task: Task; onSaved: () => void }) {
  const [status, setStatus] = useState<Status>(task.status);
  const [reply, setReply] = useState(task.admin_reply ?? "");
  const [hidden, setHidden] = useState(!!task.hidden);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const dirty = status !== task.status || reply.trim() !== (task.admin_reply ?? "") || hidden !== !!task.hidden;

  const save = async () => {
    setBusy(true);
    setErr("");
    const { error } = await sb().rpc("feedback_admin_update", { p_id: task.id, p_status: status, p_reply: reply, p_hidden: hidden });
    setBusy(false);
    if (error) return setErr(error.message);
    onSaved();
  };

  return (
    <div className="rep-admin">
      <p className="tiny muted">
        Od: {task.username ?? "neprihlásený"}
        {task.contact ? ` · kontakt: ${task.contact}` : ""}
        {task.user_agent ? ` · ${task.user_agent}` : ""}
      </p>
      <div className="rep-admin-row">
        <label className="field">
          <span>Stav</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            {(Object.keys(STATUS) as Status[]).map((s) => (
              <option key={s} value={s}>
                {STATUS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="rep-hide">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          Skryť z nástenky
        </label>
      </div>
      <label className="field">
        <span>Verejná odpoveď (nepovinné)</span>
        <textarea rows={2} maxLength={1000} value={reply} onChange={(e) => setReply(e.target.value)} />
      </label>
      <div>
        <button className="btn sm" disabled={!dirty || busy} onClick={save}>
          {busy ? "Ukladám…" : "Uložiť"}
        </button>
      </div>
      {err && <p className="badc small">{err}</p>}
    </div>
  );
}

export default function Report() {
  const { user, isAdmin, loading } = useAuth();
  const userId = user?.id;
  const [kind, setKind] = useState("bug");
  const [message, setMessage] = useState("");
  const [page, setPage] = useState("");
  const [contact, setContact] = useState("");
  const [trap, setTrap] = useState(""); // pole pre roboty, človek ho nevidí
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [filter, setFilter] = useState("open");
  const [myIds, setMyIds] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    const { data, error } = isAdmin
      ? await sb().rpc("feedback_admin_list")
      : await sb().from("feedback").select(COLUMNS).order("created_at", { ascending: false }).limit(300);
    setLoadErr(!!error);
    if (!error) setTasks((data as Task[]) ?? []);
    if (userId) {
      const mine = await sb().rpc("feedback_my_ids");
      setMyIds(new Set(((mine.data as number[]) ?? []).map(Number)));
    } else {
      setMyIds(new Set());
    }
  }, [isAdmin, userId]);

  useEffect(() => {
    if (!loading) load();
  }, [load, loading]);

  useEffect(() => {
    try {
      const r = new URL(document.referrer);
      if (r.origin === window.location.origin && r.pathname !== "/report") setPage(r.pathname);
    } catch {}
  }, []);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setSent(false);
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
    setShowForm(false);
    setMessage("");
    setFilter("open");
    load();
  };

  const counts = useMemo(
    () => ({
      ...Object.fromEntries(FILTERS.map((f) => [f.id, (tasks ?? []).filter((t) => f.test(t.status)).length])),
      mine: (tasks ?? []).filter((t) => myIds.has(Number(t.id))).length,
    }),
    [tasks, myIds],
  ) as Record<string, number>;
  const shown = useMemo(() => {
    if (filter === "mine") return (tasks ?? []).filter((t) => myIds.has(Number(t.id)));
    const f = FILTERS.find((x) => x.id === filter)!;
    return (tasks ?? []).filter((t) => f.test(t.status));
  }, [tasks, filter, myIds]);
  const active = KINDS.find((k) => k.id === kind)!;

  return (
    <div className="ucet rep">
      <div className="rep-top">
        <div>
          <h1>Report</h1>
          <p className="muted">Čo nefunguje alebo čo by si chcel inak? Z každého hlásenia vznikne úloha a tu uvidíš, ako je na tom.</p>
        </div>
        {user ? (
          <button className="btn" aria-expanded={showForm} onClick={() => setShowForm(!showForm)}>
            {showForm ? "Zavrieť formulár" : "Nové hlásenie"}
          </button>
        ) : (
          !loading && (
            <Link className="btn" href="/login">
              Prihlásiť sa a nahlásiť
            </Link>
          )
        )}
      </div>
      {sent && <p className="okc small">Ďakujeme, hlásenie máme a pridali sme ho medzi úlohy.</p>}

      {showForm && user && (
      <form className="ucet-card" onSubmit={send}>
        <div className="rep-kinds" role="radiogroup" aria-label="O čo ide">
          {KINDS.map((k) => (
            <button type="button" key={k.id} role="radio" aria-checked={kind === k.id} className={kind === k.id ? "on" : ""} onClick={() => setKind(k.id)}>
              {k.label}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Správa (uvidia ju všetci)</span>
          <textarea required rows={4} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={active.hint} />
        </label>
        <label className="field">
          <span>Kde sa to stalo? (nepovinné, uvidia to všetci)</span>
          <input maxLength={200} value={page} onChange={(e) => setPage(e.target.value)} placeholder="napr. skener, zbierka, online hra" />
        </label>
        <label className="field">
          <span>Kontakt, ak chceš odpoveď (nepovinné, vidí len správca)</span>
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
          Do správy nepíš osobné údaje. Hlásenie sa spojí s tvojím účtom, ostatní to neuvidia. 
          Uložíme aj typ prehliadača, aby sme chybu vedeli zopakovať. Viac v <Link href="/sukromie">zásadách súkromia</Link>.
        </p>
      </form>
      )}

      <h2 className="rep-h">Úlohy</h2>
      <div className="rep-kinds" role="tablist" aria-label="Filter úloh">
        {FILTERS.map((f) => (
          <button key={f.id} role="tab" aria-selected={filter === f.id} className={filter === f.id ? "on" : ""} onClick={() => setFilter(f.id)}>
            {f.label} ({counts[f.id] ?? 0})
          </button>
        ))}
        {user && (
          <button role="tab" aria-selected={filter === "mine"} className={filter === "mine" ? "on" : ""} onClick={() => setFilter("mine")}>
            Moje ({counts.mine ?? 0})
          </button>
        )}
      </div>

      {loadErr ? (
        <p className="badc">
          Úlohy sa nepodarilo načítať.{" "}
          <button className="link" onClick={load}>
            Skúsiť znova
          </button>
        </p>
      ) : !tasks ? (
        <Loading what="Načítavam úlohy" shape="rows" />
      ) : shown.length === 0 ? (
        <p className="muted">Tu zatiaľ nič nie je.</p>
      ) : (
        <>
          <p className="tiny muted">
            {shown.length} {plural(shown.length, "úloha", "úlohy", "úloh")}
          </p>
          {shown.map((t) => (
            <article key={t.id} className={`ucet-card rep-task ${t.hidden ? "is-hidden" : ""}`}>
              <div className="rep-meta">
                <span className={`rep-status s-${t.status}`}>{STATUS[t.status]}</span>
                <span className="tag dim">{KINDS.find((k) => k.id === t.kind)?.short ?? "Iné"}</span>
                {t.source === "game" && <span className="tag dim">Z hry</span>}
                {t.source === "chat" && <span className="tag dim">Z chatu</span>}
                {myIds.has(Number(t.id)) && <span className="tag dim">Moje</span>}
                {t.hidden && <span className="tag dim">Skryté</span>}
                <span className="tiny muted">{fmtDate(t.created_at)}</span>
              </div>
              <p className="rep-msg">{t.message}</p>
              {t.page && <p className="tiny muted">Kde: {t.page}</p>}
              {t.admin_reply && (
                <p className="rep-reply">
                  <b>Odpoveď:</b> {t.admin_reply}
                </p>
              )}
              {isAdmin && <AdminBox key={`${t.id}-${t.status}-${t.hidden}-${t.admin_reply}`} task={t} onSaved={load} />}
            </article>
          ))}
        </>
      )}
    </div>
  );
}
