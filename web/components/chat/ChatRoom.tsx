"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useChat } from "@/lib/chat";
import { UserBadge, useBadges } from "@/lib/gamify";
import Reactions from "@/components/reactions/Reactions";

const MAX = 500;

function fmtTime(ts: string) {
  const d = new Date(ts);
  const time = d.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString("sk-SK", { day: "numeric", month: "numeric" })} ${time}`;
}

/** Miestnosť bez hlavičky – používa ju panel na PC aj stránka /chat. */
export default function ChatRoom() {
  const { user, isAdmin } = useAuth();
  const { msgs, error, notice, bans, reactions, names, toggleReaction, send, remove, setBan, report, markSeen } = useChat();
  const badges = useBadges(!!user);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [fresh, setFresh] = useState(false); // prišla správa, kým človek číta staršie
  const list = useRef<HTMLDivElement>(null);
  const lastId = useRef(0);
  const bottom = useRef(true);

  const toBottom = () => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
    bottom.current = true;
    setAtBottom(true);
    setFresh(false);
  };

  useEffect(() => {
    const id = msgs?.length ? msgs[msgs.length - 1].id : 0;
    const added = id > lastId.current;
    lastId.current = id;
    if (bottom.current) {
      if (list.current) list.current.scrollTop = list.current.scrollHeight;
      if (!document.hidden) markSeen();
    } else if (added) {
      setFresh(true);
    }
  }, [msgs, markSeen]);

  if (!user) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    const ok = await send(body);
    setBusy(false);
    if (ok) {
      setText("");
      toBottom();
    }
  };

  const banned = new Set(bans.map((b) => b.user_id));

  return (
    <div className="chatx-room">
      <div
        className="chatx-list"
        ref={list}
        aria-live="polite"
        onScroll={(e) => {
          const el = e.currentTarget;
          const low = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
          bottom.current = low;
          setAtBottom(low);
          if (low) {
            setFresh(false);
            markSeen();
          }
        }}
      >
        {!msgs ? (
          <p className="muted small">Načítavam správy…</p>
        ) : msgs.length === 0 ? (
          <p className="muted small">Zatiaľ tu nikto nič nenapísal. Začni ty.</p>
        ) : (
          msgs.map((m) => (
            <div key={m.id} className={`chatx-msg ${m.user_id === user.id ? "me" : ""}`}>
              <div className="chatx-head">
                <b>{m.username}</b>
                <UserBadge badge={badges.get(m.user_id)} compact />
                <span className="tiny muted">{fmtTime(m.created_at)}</span>
                {(isAdmin || m.user_id !== user.id) && (
                  <span className="chatx-tools">
                    {!isAdmin && (
                      <button className="link tiny" onClick={() => report(m.id)}>
                        Nahlásiť
                      </button>
                    )}
                    {isAdmin && (
                      <button className="link tiny" onClick={() => remove(m.id)}>
                        Zmazať
                      </button>
                    )}
                    {isAdmin && m.user_id !== user.id && (
                      <button className="link tiny" onClick={() => setBan(m.user_id, !banned.has(m.user_id))}>
                        {banned.has(m.user_id) ? "Odblokovať" : "Zablokovať"}
                      </button>
                    )}
                  </span>
                )}
              </div>
              <p>{m.body}</p>
              {reactions && (
                <Reactions
                  rows={reactions.get(m.id)}
                  me={user.id}
                  nameOf={(u) => names.get(u) ?? "Hráč"}
                  canReact={!banned.has(user.id)}
                  onToggle={(emote, on) => toggleReaction(m.id, emote, on)}
                />
              )}
            </div>
          ))
        )}
      </div>
      {fresh && !atBottom && (
        <button className="chatx-fresh" onClick={toBottom}>
          Nové správy ↓
        </button>
      )}
      <form className="chatx-form" onSubmit={submit}>
        <input aria-label="Správa" value={text} maxLength={MAX} onChange={(e) => setText(e.target.value)} placeholder="Napíš správu…" autoComplete="off" />
        <button className="btn" disabled={busy || !text.trim()}>
          Poslať
        </button>
      </form>
      {error && <p className="badc small">{error}</p>}
      {notice && !error && <p className="okc small">{notice}</p>}
      <p className="tiny muted chatx-rules">
        Buď slušný a nepíš osobné údaje. Správy sa po 30 dňoch mažú. Problém s webom patrí do <Link href="/report">Reportu</Link>.
      </p>
      {isAdmin && bans.length > 0 && (
        <details className="chatx-bans">
          <summary className="small">Zablokovaní v chate ({bans.length})</summary>
          {bans.map((b) => (
            <div key={b.user_id} className="ucet-row">
              <span className="small">{b.username ?? "Neznámy hráč"}</span>
              <button className="btn ghost sm" onClick={() => setBan(b.user_id, false)}>
                Odblokovať
              </button>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
