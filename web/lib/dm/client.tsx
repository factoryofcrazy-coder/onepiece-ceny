"use client";
// Klient súkromných správ: volania funkcie "dm", počet neprečítaných a Realtime signály. Riadky dm_members nikdy neobsahujú text.
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth";
import { DM_ENABLED } from "../config";
import { sb } from "../supabase";
import { resavePush, showBadge, stopPushLocally } from "./push-client";
import type { DmBody } from "./server";

export type DmMessage = { id: string; conversation_id: string; sender_id: string; created_at: string; body: DmBody | null; unreadable: boolean };
export type DmConversation = {
  id: string;
  status: "pending" | "accepted" | "declined";
  incoming_request: boolean;
  other_id: string;
  other_name: string;
  unread: number;
  other_last_read_at: string | null;
  last_message_at: string;
  blocked_by_me: boolean;
  last_message: DmMessage | null;
};
export type DmSearchHit = { id: string; conversation_id: string; sender_id: string; created_at: string; other_name: string; snippet: string };
export type DmMember = { conversation_id: string; user_id: string; unread: number; last_read_at: string | null; last_message_at: string };

export async function dmCall<T = any>(op: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await sb().functions.invoke("dm", { body: { op, ...body } });
  if (error) {
    let msg = "Správy sú dočasne nedostupné. Skús to znova.";
    try {
      const j = await ((error as any).context as Response | undefined)?.json();
      if (j?.error) msg = j.error;
    } catch {
      /* odpoveď bez JSON */
    }
    throw new Error(msg);
  }
  return data.data as T;
}

type Listener = (m: DmMember) => void;
const Ctx = createContext<{ unread: number; listen: (f: Listener) => () => void; refresh: () => void }>({ unread: 0, listen: () => () => {}, refresh: () => {} });

export function DmProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const uid = DM_ENABLED ? user?.id : undefined;
  const [unread, setUnread] = useState(0);
  const listeners = useRef(new Set<Listener>());

  const refresh = useCallback(async () => {
    if (!uid) return setUnread(0);
    const { data, error } = await sb().from("dm_members").select("unread").eq("user_id", uid);
    if (!error) setUnread(((data as { unread: number }[]) ?? []).reduce((n, r) => n + r.unread, 0));
  }, [uid]);

  // po odhlásení alebo vypršaní prihlásenia zariadenie prestane prijímať notifikácie
  useEffect(() => {
    if (!DM_ENABLED || loading) return;
    if (uid) resavePush();
    else stopPushLocally();
  }, [uid, loading]);

  useEffect(() => {
    showBadge(unread);
  }, [unread]);

  useEffect(() => {
    refresh();
    if (!uid) return;
    const ch = sb()
      .channel(`dm-members-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dm_members" }, (p) => {
        const row = p.new as DmMember;
        if (!row?.conversation_id) return;
        if (row.user_id === uid) refresh();
        listeners.current.forEach((f) => f(row));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refresh();
      });
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      sb().removeChannel(ch);
    };
  }, [uid, refresh]);

  const listen = useCallback((f: Listener) => {
    listeners.current.add(f);
    return () => void listeners.current.delete(f);
  }, []);
  const value = useMemo(() => ({ unread, listen, refresh }), [unread, listen, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useDm = () => useContext(Ctx);

/** odkaz na začatie konverzácie */
export function dmHref(userId: string, opts: { listing?: string; card?: string } = {}) {
  const q = new URLSearchParams({ to: userId });
  if (opts.listing) q.set("listing", opts.listing);
  if (opts.card) q.set("card", opts.card);
  return `/spravy?${q}`;
}
