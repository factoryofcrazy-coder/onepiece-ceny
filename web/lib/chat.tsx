"use client";
// Spoločný chat: jedno spojenie naživo pre celý web (panel na PC, stránka /chat na mobile), počítadlo nových správ.
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./auth";
import { applyReaction, EmoteId, Reaction } from "./reactions";
import { sb } from "./supabase";
import { useLang } from "@/lib/lang";

export type ChatMsg = { id: number; created_at: string; user_id: string; username: string; body: string; deleted_at: string | null };
export type ChatBan = { user_id: string; username: string | null };

const COLUMNS = "id, created_at, user_id, username, body, deleted_at";
const LOAD = 50;
const KEEP = 200;

type ChatState = {
  msgs: ChatMsg[] | null; // viditeľné správy, null = ešte sa načítavajú
  unread: number;
  error: string;
  notice: string;
  online: number; // koľko prihlásených má web práve otvorený
  bans: ChatBan[];
  /** reakcie podľa id správy; null = tabuľka ešte nie je k dispozícii, reakcie sa neukazujú */
  reactions: Map<number, Reaction[]> | null;
  names: Map<string, string>;
  toggleReaction: (id: number, emote: EmoteId, on: boolean) => Promise<void>;
  send: (body: string) => Promise<boolean>;
  remove: (id: number) => Promise<void>;
  setBan: (uid: string, banned: boolean) => Promise<void>;
  report: (id: number) => Promise<void>;
  markSeen: () => void;
};

const Ctx = createContext<ChatState>({
  msgs: null,
  unread: 0,
  error: "",
  notice: "",
  online: 0,
  bans: [],
  reactions: null,
  names: new Map(),
  toggleReaction: async () => {},
  send: async () => false,
  remove: async () => {},
  setBan: async () => {},
  report: async () => {},
  markSeen: () => {},
});

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user, isAdmin } = useAuth();
  const { t: tl } = useLang();
  const Lref = useRef(tl);
  Lref.current = tl;
  const L = (sk: string, en: string) => Lref.current(sk, en);
  const userId = user?.id;
  const [all, setAll] = useState<ChatMsg[] | null>(null);
  const [seen, setSeen] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [online, setOnline] = useState(0);
  const [bans, setBans] = useState<ChatBan[]>([]);
  const [reactions, setReactions] = useState<Map<number, Reaction[]> | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const knownNames = useRef<Map<string, string>>(new Map());
  const reactionsReq = useRef(0);

  const loadReactions = useCallback(async () => {
    const n = ++reactionsReq.current;
    const { data: last } = await sb().from("chat_messages").select("id").order("id", { ascending: false }).range(KEEP - 1, KEEP - 1);
    const from = (last as { id: number }[] | null)?.[0]?.id ?? 0;
    const { data, error: e } = await sb().from("chat_reactions").select("message_id, user_id, emote").gte("message_id", from).limit(3000);
    if (n !== reactionsReq.current) return; // medzitým prišiel novší dopyt
    if (e) return setReactions(null);
    const m = new Map<number, Reaction[]>();
    for (const r of (data as (Reaction & { message_id: number })[]) ?? []) m.set(r.message_id, [...(m.get(r.message_id) ?? []), { emote: r.emote, user_id: r.user_id }]);
    setReactions(m);
    const missing = [...new Set(((data as Reaction[]) ?? []).map((r) => r.user_id))].filter((u) => !knownNames.current.has(u));
    if (missing.length) {
      const { data: p } = await sb().from("profiles").select("id, username").in("id", missing);
      for (const x of (p as { id: string; username: string | null }[]) ?? []) knownNames.current.set(x.id, x.username ?? "Hráč");
      setNames(new Map(knownNames.current));
    }
  }, []);

  const merge = useCallback((incoming: ChatMsg[]) => {
    setAll((cur) => {
      const m = new Map((cur ?? []).map((x) => [x.id, x]));
      for (const x of incoming) m.set(x.id, x);
      return [...m.values()].sort((a, b) => a.id - b.id).slice(-KEEP);
    });
  }, []);

  const load = useCallback(async () => {
    const { data, error: e } = await sb().from("chat_messages").select(COLUMNS).order("id", { ascending: false }).limit(LOAD);
    if (e) return setError(L("Správy sa nepodarilo načítať.", "Couldn't load messages."));
    setError("");
    merge((data as ChatMsg[]) ?? []);
    loadReactions();
  }, [merge, loadReactions]);

  const loadBans = useCallback(async () => {
    const { data } = await sb().rpc("chat_ban_list");
    setBans((data as ChatBan[]) ?? []);
  }, []);

  useEffect(() => {
    setAll(null);
    setOnline(0);
    if (!userId) return;
    // správy sa dotiahnu po pripojení (aj po výpadku) a po návrate do okna, inak chodia naživo
    const ch = sb()
      .channel("chat-room", { config: { presence: { key: userId } } })
      .on("presence", { event: "sync" }, () => setOnline(Object.keys(ch.presenceState()).length))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (p) => merge([p.new as ChatMsg]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_messages" }, (p) => merge([p.new as ChatMsg]))
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        load();
        ch.track({});
      });
    const onVisible = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    load();
    // samostatné spojenie: problém s reakciami nesmie zastaviť správy
    let timer: ReturnType<typeof setTimeout> | undefined;
    const rx = sb()
      .channel("chat-reactions")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_reactions" }, () => {
        clearTimeout(timer);
        timer = setTimeout(loadReactions, 300); // viac reakcií naraz = jedno načítanie
      })
      .subscribe();
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearTimeout(timer);
      sb().removeChannel(ch);
      sb().removeChannel(rx);
    };
  }, [userId, load, merge, loadReactions]);

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
        setError(e.code === "P0001" ? e.message : L("Správu sa nepodarilo odoslať. Skús to znova.", "Couldn't send the message. Try again."));
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

  const report = useCallback(async (id: number) => {
    setError("");
    setNotice("");
    const { error: e } = await sb().rpc("chat_report_message", { p_id: id });
    if (e) return setError(e.code === "P0001" ? e.message : L("Správu sa nepodarilo nahlásiť. Skús to znova.", "Couldn't report the message. Try again."));
    setNotice(L("Ďakujeme, správu si pozrie správca.", "Thanks, an admin will review the message."));
  }, []);

  const toggleReaction = useCallback(
    async (id: number, emote: EmoteId, on: boolean) => {
      if (!userId) return;
      setError("");
      const patch = (yes: boolean) =>
        setReactions((cur) => {
          const m = new Map(cur ?? []);
          m.set(id, applyReaction(m.get(id), emote, userId, yes));
          return m;
        });
      patch(on); // hneď na obrazovke, pri chybe sa vráti
      const q = sb().from("chat_reactions");
      const { error: e } = on ? await q.insert({ message_id: id, emote }) : await q.delete().match({ message_id: id, user_id: userId, emote });
      if (e && e.code !== "23505") {
        patch(!on);
        setError(e.code === "P0001" ? e.message : L("Reakciu sa nepodarilo uložiť. Skús to znova.", "Couldn't save the reaction. Try again."));
      }
    },
    [userId],
  );

  const value = useMemo(
    () => ({ msgs, unread, error, notice, online, bans, reactions, names, toggleReaction, send, remove, setBan, report, markSeen }),
    [msgs, unread, error, notice, online, bans, reactions, names, toggleReaction, send, remove, setBan, report, markSeen],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useChat = () => useContext(Ctx);
