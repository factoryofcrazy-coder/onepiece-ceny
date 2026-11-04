"use client";
// Spoločný chat: jedno spojenie naživo pre celý web (panel na PC, stránka /chat na mobile), počítadlo nových správ.
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth";
import { sb } from "./supabase";

export type ChatMsg = { id: number; created_at: string; user_id: string; username: string; body: string; deleted_at: string | null };
export type ChatBan = { user_id: string; username: string | null };

const COLUMNS = "id, created_at, user_id, username, body, deleted_at";
const LOAD = 50;
const KEEP = 200;

type ChatState = {
  msgs: ChatMsg[] | null; // viditeľné správy, null = ešte sa načítavajú
  unread: number;
  error: string;
  bans: ChatBan[];
  send: (body: string) => Promise<boolean>;
  remove: (id: number) => Promise<void>;
  setBan: (uid: string, banned: boolean) => Promise<void>;
  markSeen: () => void;
};

const Ctx = createContext<ChatState>({
  msgs: null,
  unread: 0,
  error: "",
  bans: [],
  send: async () => false,
  remove: async () => {},
  setBan: async () => {},
  markSeen: () => {},
});

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user, isAdmin } = useAuth();
  const userId = user?.id;
  const [all, setAll] = useState<ChatMsg[] | null>(null);
  const [seen, setSeen] = useState(0);
  const [error, setError] = useState("");
  const [bans, setBans] = useState<ChatBan[]>([]);

  const merge = useCallback((incoming: ChatMsg[]) => {
    setAll((cur) => {
      const m = new Map((cur ?? []).map((x) => [x.id, x]));
      for (const x of incoming) m.set(x.id, x);
      return [...m.values()].sort((a, b) => a.id - b.id).slice(-KEEP);
    });
  }, []);

  const load = useCallback(async () => {
    const { data, error: e } = await sb().from("chat_messages").select(COLUMNS).order("id", { ascending: false }).limit(LOAD);
    if (e) return setError("Správy sa nepodarilo načítať.");
    setError("");
    merge((data as ChatMsg[]) ?? []);
  }, [merge]);

  const loadBans = useCallback(async () => {
    const { data } = await sb().rpc("chat_ban_list");
    setBans((data as ChatBan[]) ?? []);
  }, []);

  useEffect(() => {
    setAll(null);
    if (!userId) return;
    // správy sa dotiahnu po pripojení (aj po výpadku) a po návrate do okna, inak chodia naživo
    const ch = sb()
      .channel("chat-room")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (p) => merge([p.new as ChatMsg]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_messages" }, (p) => merge([p.new as ChatMsg]))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") load();
      });
    const onVisible = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    load();
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      sb().removeChannel(ch);
    };
  }, [userId, load, merge]);

  useEffect(() => {
    if (isAdmin) loadBans();
  }, [isAdmin, loadBans]);

  const seenKey = userId ? `chat-seen-${userId}` : "";
  const latestId = all?.length ? all[all.length - 1].id : 0;

  // prvé otvorenie: staré správy sa nerátajú ako nové
  useEffect(() => {
    if (!seenKey || !all) return;
    const stored = Number(localStorage.getItem(seenKey) ?? -1);
    if (stored < 0) {
      localStorage.setItem(seenKey, String(latestId));
      setSeen(latestId);
    } else {
      setSeen(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seenKey, all === null]);

  const markSeen = useCallback(() => {
    if (!seenKey || !latestId) return;
    localStorage.setItem(seenKey, String(latestId));
    setSeen(latestId);
  }, [seenKey, latestId]);

  const msgs = useMemo(() => all?.filter((m) => !m.deleted_at) ?? null, [all]);
  const unread = useMemo(() => (msgs ?? []).filter((m) => m.id > seen && m.user_id !== userId).length, [msgs, seen, userId]);

  const send = useCallback(
    async (body: string) => {
      setError("");
      const { error: e } = await sb().from("chat_messages").insert({ body });
      if (e) {
        setError(e.code === "P0001" ? e.message : "Správu sa nepodarilo odoslať. Skús to znova.");
        return false;
      }
      await load();
      return true;
    },
    [load],
  );

  const remove = useCallback(
    async (id: number) => {
      const { error: e } = await sb().rpc("chat_delete_message", { p_id: id });
      if (e) return setError(e.message);
      await load();
    },
    [load],
  );

  const setBan = useCallback(
    async (uid: string, banned: boolean) => {
      const { error: e } = await sb().rpc("chat_set_ban", { p_user: uid, p_banned: banned });
      if (e) return setError(e.message);
      await loadBans();
    },
    [loadBans],
  );

  const value = useMemo(() => ({ msgs, unread, error, bans, send, remove, setBan, markSeen }), [msgs, unread, error, bans, send, remove, setBan, markSeen]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useChat = () => useContext(Ctx);
