"use client";
import ChatRoom from "@/components/chat/ChatRoom";
import { Loading, NeedLogin } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function Chat() {
  const { user, loading } = useAuth();
  if (loading) return <Loading what="Načítavam chat" shape="rows" />;
  if (!user) return <NeedLogin what="Chat" />;
  return (
    <div className="chatx-page">
      <h1>Chat</h1>
      <ChatRoom />
    </div>
  );
}
