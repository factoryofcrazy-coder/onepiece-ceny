"use client";
import ChatRoom from "@/components/chat/ChatRoom";
import { Loading, NeedLogin } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useChat } from "@/lib/chat";
import { useLang } from "@/lib/lang";

export default function Chat() {
  const { user, loading } = useAuth();
  const { t } = useLang();
  const { online } = useChat();
  if (loading) return <Loading what={t("Načítavam chat", "Loading chat")} shape="rows" />;
  if (!user) return <NeedLogin what="Chat" />;
  return (
    <div className="chatx-page">
      <h1>
        Chat {online > 0 && <span className="tiny muted chatx-online">online: {online}</span>}
      </h1>
      <ChatRoom />
    </div>
  );
}
