"use client";
// PC: panel vpravo (od 1500 px otvorený a odsunie obsah, inak zbalený do tlačidla). Mobil: bublina nad dolnou lištou, otvára /chat.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useChat } from "@/lib/chat";
import ChatRoom from "./ChatRoom";
import { useLang } from "@/lib/lang";

const OPEN_KEY = "chat-panel";
const HIDE_ON = ["/skener", "/login", "/chat", "/nove-heslo", "/spravy"];
const WIDE = "(min-width: 1500px)";
const badge = (n: number) => (n > 99 ? "99+" : String(n));

const Icon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 12a8 8 0 0 1-8 8H4l2.2-3.3A8 8 0 1 1 21 12Z" />
  </svg>
);

export default function ChatDock() {
  const path = usePathname();
  const { user, loading } = useAuth();
  const { unread, online } = useChat();
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const hidden = HIDE_ON.some((p) => path === p || path.startsWith(p + "/"));

  // voľba človeka má prednosť, inak otvorené len prihláseným na širokej obrazovke
  useEffect(() => {
    if (loading) return;
    const stored = localStorage.getItem(OPEN_KEY);
    setOpen(stored ? stored === "1" : !!user && window.matchMedia(WIDE).matches);
  }, [user, loading]);

  const toggle = (v: boolean) => {
    setOpen(v);
    localStorage.setItem(OPEN_KEY, v ? "1" : "0");
  };

  useEffect(() => {
    document.body.classList.toggle("chat-open", open && !hidden);
    return () => document.body.classList.remove("chat-open");
  }, [open, hidden]);

  if (hidden) return null;
  const label = unread ? t(`Chat, nové správy: ${unread}`, `Chat, new messages: ${unread}`) : "Chat";

  return (
    <div className="chatd">
      <Link href="/chat" className="chatd-bubble" aria-label={label}>
        <Icon />
        {unread > 0 && <span className="chatd-badge">{badge(unread)}</span>}
      </Link>
      {open ? (
        <aside className="chatd-panel" aria-label="Chat">
          <header className="chatd-head">
            <span>
              <b>Chat</b>
              {online > 0 && <span className="tiny muted chatx-online">online: {online}</span>}
            </span>
            <button className="x-plain" onClick={() => toggle(false)} aria-label={t("Zbaliť chat", "Collapse chat")}>
              ×
            </button>
          </header>
          {user ? (
            <ChatRoom />
          ) : (
            <div className="chatd-login">
              <p className="small muted">{t("Do chatu môžu prihlásení hráči.", "The chat is for signed-in players.")}</p>
              <Link className="btn sm" href="/login">
                {t("Prihlásiť sa", "Sign in")}
              </Link>
            </div>
          )}
        </aside>
      ) : (
        <button className="chatd-tab" onClick={() => toggle(true)} aria-label={label}>
          <Icon />
          <span>Chat</span>
          {unread > 0 && <span className="chatd-badge">{badge(unread)}</span>}
        </button>
      )}
    </div>
  );
}
