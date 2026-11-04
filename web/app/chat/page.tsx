"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loading, NeedLogin } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { sb } from "@/lib/supabase";

type Msg = { id: number; created_at: string; user_id: string; username: string; body: string; deleted_at: string | null };
type Ban = { user_id: string; username: string | null };

const MAX = 500;
const COLUMNS = "id, created_at, user_id, username, body, deleted_at";

function fmtTime(ts: string) {
  const d = new Date(ts);
  const time = d.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString("sk-SK", { day: "numeric", month: "numeric" })} ${time}`;
}
const byId = (a: Msg, b: Msg) => a.id - b.id;

export default function Chat() {
  const { user, isAdmin, loading } = useAuth();
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [bans, setBans] = useState<Ban[]>([]);
  const list = useRef<HTMLDivElement>(null);
  const stick = useRef(true); // pri novej správe posúvať dole, len ak je človek dole
  const userId = user?.id;

  const merge = useCallback((incoming: Msg[]) => {
    setMsgs((cur) => {
      const m = new Map((cur ?? []).map((x) => [x.id, x]));
      for (const x of incoming) m.set(x.id, x);
      return [...m.values()].sort(byId).slice(-200);
    });
  }, []);

  const load = useCallback(async () => {
    const { data, error } = await sb().from("chat_messages").select(COLUMNS).order("id", { ascending: false }).limit(100);
    if (error) return setErr("Správy sa nepodarilo načítať.");
    merge((data as Msg[]) ?? []);
  }, [merge]);

  const loadBans = useCallback(async () => {
    const { data } = await sb().rpc("chat_ban_list");
    setBans((data as Ban[]) ?? []);
  }, []);

  useEffect(() => {
    if (!userId) return;
    load();
    const ch = sb()
      .channel("chat-room")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (p) => merge([p.new as Msg]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_messages" }, (p) => merge([p.new as Msg]))
      .subscribe();
    const iv = setInterval(load, 30000); // poistka, keby spojenie naživo vypadlo
    return () => {
      clearInterval(iv);
      sb().removeChannel(ch);
    };
  }, [userId, load, merge]);

  useEffect(() => {
    if (isAdmin) loadBans();
  }, [isAdmin, loadBans]);

  useEffect(() => {
    if (stick.current && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [msgs]);

  if (loading) return <Loading what="Načítavam chat" shape="rows" />;
  if (!user) return <NeedLogin what="Chat" />;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setErr("");
    const { error } = await sb().from("chat_messages").insert({ body });
    setBusy(false);
    if (error) return setErr(error.code === "P0001" ? error.message : "Správu sa nepodarilo odoslať. Skús to znova.");
    setText("");
    stick.current = true;
    load();
  };

  const remove = async (id: number) => {
    const { error } = await sb().rpc("chat_delete_message", { p_id: id });
    if (error) return setErr(error.message);
    load();
  };

  const setBan = async (uid: string, banned: boolean) => {
    const { error } = await sb().rpc("chat_set_ban", { p_user: uid, p_banned: banned });
    if (error) return setErr(error.message);
    loadBans();
  };

  const visible = (msgs ?? []).filter((m) => !m.deleted_at);
  const banned = new Set(bans.map((b) => b.user_id));

  return (
    <div className="ucet chatx">
      <h1>Chat</h1>
      <p className="muted small">
        Spoločná miestnosť pre všetkých hráčov. Buď slušný a nepíš osobné údaje. Správy sa po 30 dňoch mažú. Problém s webom radšej napíš do <Link href="/report">Reportu</Link>.
      </p>
      <div
        className="chatx-list"
        ref={list}
        aria-live="polite"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
      >
        {!msgs ? (
          <p className="muted small">Načítavam správy…</p>
        ) : visible.length === 0 ? (
          <p className="muted small">Zatiaľ tu nikto nič nenapísal. Začni ty.</p>
        ) : (
          visible.map((m) => (
            <div key={m.id} className={`chatx-msg ${m.user_id === user.id ? "me" : ""}`}>
              <div className="chatx-head">
                <b>{m.username}</b>
                <span className="tiny muted">{fmtTime(m.created_at)}</span>
                {isAdmin && (
                  <span className="chatx-tools">
                    <button className="link tiny" onClick={() => remove(m.id)}>
                      Zmazať
                    </button>
                    {m.user_id !== user.id && (
                      <button className="link tiny" onClick={() => setBan(m.user_id, !banned.has(m.user_id))}>
                        {banned.has(m.user_id) ? "Odblokovať" : "Zablokovať"}
                      </button>
                    )}
                  </span>
                )}
              </div>
              <p>{m.body}</p>
            </div>
          ))
        )}
      </div>
      <form className="chatx-form" onSubmit={send}>
        <input aria-label="Správa" value={text} maxLength={MAX} onChange={(e) => setText(e.target.value)} placeholder="Napíš správu…" autoComplete="off" />
        <button className="btn" disabled={busy || !text.trim()}>
          Poslať
        </button>
      </form>
      {err && <p className="badc small">{err}</p>}
      {isAdmin && bans.length > 0 && (
        <section className="ucet-card">
          <h2>Zablokovaní v chate</h2>
          {bans.map((b) => (
            <div key={b.user_id} className="ucet-row">
              <span>{b.username ?? "Neznámy hráč"}</span>
              <button className="btn ghost sm" onClick={() => setBan(b.user_id, false)}>
                Odblokovať
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
