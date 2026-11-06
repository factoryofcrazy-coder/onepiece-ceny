"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useChat } from "@/lib/chat";
import { UserBadge, useBadges } from "@/lib/gamify";
import { ReactionAdd, ReactionPanel, ReactionPills, tapToReact } from "@/components/reactions/Reactions";
import { useLang } from "@/lib/lang";

const MAX = 500;

function fmtTime(ts: string, locale = "sk-SK") {
  const d = new Date(ts);
  const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString(locale, { day: "numeric", month: "numeric" })} ${time}`;
}

/** Miestnosť bez hlavičky – používa ju panel na PC aj stránka /chat. */
export default function ChatRoom() {
  const { user, isAdmin } = useAuth();
  const { msgs, error, notice, bans, reactions, names, toggleReaction, send, remove, setBan, report, markSeen } = useChat();
  const badges = useBadges(!!user);
  const { t, locale } = useLang();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [fresh, setFresh] = useState(false); // prišla správa, kým človek číta staršie
  const list = useRef<HTMLDivElement>(null);
  const lastId = useRef(0);
  const bottom = useRef(true);
  const [rxOpen, setRxOpen] = useState<number | null>(null);

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
          <p className="muted small">{t("Načítavam správy…", "Loading messages…")}</p>
        ) : msgs.length === 0 ? (
          <p className="muted small">{t("Zatiaľ tu nikto nič nenapísal. Začni ty.", "Nobody has written anything yet. Go first.")}</p>
        ) : (
          msgs.map((m) => (
            <div key={m.id} className={`chatx-msg ${m.user_id === user.id ? "me" : ""}`} onClick={(e) => reactions && tapToReact(e, () => setRxOpen(rxOpen === m.id ? null : m.id))}>
              <div className="chatx-head">
                <b>{m.username}</b>
                <UserBadge badge={badges.get(m.user_id)} compact />
                <span className="tiny muted">{fmtTime(m.created_at, locale)}</span>
                {reactions && <ReactionAdd open={rxOpen === m.id} onClick={() => setRxOpen(rxOpen === m.id ? null : m.id)} />}
                {(isAdmin || m.user_id !== user.id) && (
                  <span className="chatx-tools">
                    {!isAdmin && (
                      <button className="link tiny" onClick={() => report(m.id)}>
                        {t("Nahlásiť", "Report")}
                      </button>
                    )}
                    {isAdmin && (
                      <button className="link tiny" onClick={() => remove(m.id)}>
                        {t("Zmazať", "Delete")}
                      </button>
                    )}
                    {isAdmin && m.user_id !== user.id && (
                      <button className="link tiny" onClick={() => setBan(m.user_id, !banned.has(m.user_id))}>
                        {banned.has(m.user_id) ? t("Odblokovať", "Unblock") : t("Zablokovať", "Block")}
                      </button>
                    )}
                  </span>
                )}
              </div>
              <p>{m.body}</p>
              {reactions && (
                <ReactionPills rows={reactions.get(m.id)} me={user.id} nameOf={(u) => names.get(u) ?? t("Hráč", "Player")} canReact={!banned.has(user.id)} onToggle={(emote, on) => toggleReaction(m.id, emote, on)} />
              )}
              {reactions && rxOpen === m.id && (
                <ReactionPanel rows={reactions.get(m.id)} me={user.id} nameOf={(u) => names.get(u) ?? t("Hráč", "Player")} canReact={!banned.has(user.id)} onToggle={(emote, on) => toggleReaction(m.id, emote, on)} onClose={() => setRxOpen(null)} />
              )}
            </div>
          ))
        )}
      </div>
      {fresh && !atBottom && (
        <button className="chatx-fresh" onClick={toBottom}>
          {t("Nové správy", "New messages")} ↓
        </button>
      )}
      <form className="chatx-form" onSubmit={submit}>
        <input aria-label={t("Správa", "Message")} value={text} maxLength={MAX} onChange={(e) => setText(e.target.value)} placeholder={t("Napíš správu…", "Write a message…")} autoComplete="off" />
        <button className="btn" disabled={busy || !text.trim()}>
          {t("Poslať", "Send")}
        </button>
      </form>
      {error && <p className="badc small">{error}</p>}
      {notice && !error && <p className="okc small">{notice}</p>}
      <p className="tiny muted chatx-rules">
        {t("Buď slušný a nepíš osobné údaje. Správy sa po 30 dňoch mažú. Problém s webom patrí do", "Be kind and don't share personal details. Messages are deleted after 30 days. Website problems belong in the")} <Link href="/report">{t("Reportu", "Report")}</Link>.
      </p>
      {isAdmin && bans.length > 0 && (
        <details className="chatx-bans">
          <summary className="small">{t("Zablokovaní v chate", "Blocked in chat")} ({bans.length})</summary>
          {bans.map((b) => (
            <div key={b.user_id} className="ucet-row">
              <span className="small">{b.username ?? t("Neznámy hráč", "Unknown player")}</span>
              <button className="btn ghost sm" onClick={() => setBan(b.user_id, false)}>
                {t("Odblokovať", "Unblock")}
              </button>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
