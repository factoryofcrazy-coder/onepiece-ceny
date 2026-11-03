"use client";
// Trhovisko – ponuky na výmenu (offer) a hľadané karty (want). Tabuľka trade_listings (migrácia 20261103).
import { useCallback, useEffect, useState } from "react";
import { sb } from "./supabase";

export type TradeKind = "offer" | "want";
export type Listing = {
  id: string;
  user_id: string;
  card_id: string;
  kind: TradeKind;
  qty: number;
  price: number | null;
  cond: "NM" | "LP" | "MP" | "HP" | "DMG";
  lang: "EN" | "JP";
  note: string | null;
  created_at: string;
};
export type Trader = { id: string; username: string | null; contact: string | null };

/** chyba „tabuľka/stĺpec neexistuje“ = migrácia ešte nie je spustená */
const notReady = (m?: string) => !!m && /trade_listings|contact|does not exist|schema cache/i.test(m);

export function useTrades(enabled: boolean) {
  const [list, setList] = useState<Listing[]>([]);
  const [traders, setTraders] = useState<Map<string, Trader>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    const { data, error } = await sb().from("trade_listings").select("*").order("created_at", { ascending: false }).limit(3000);
    if (error) {
      setMissing(notReady(error.message));
      setError(error.message);
      setLoading(false);
      return;
    }
    setList(data as Listing[]);
    const ids = [...new Set((data as Listing[]).map((l) => l.user_id))];
    if (ids.length) {
      const pr = await sb().from("profiles").select("id, username, contact").in("id", ids);
      const fallback = pr.error ? await sb().from("profiles").select("id, username").in("id", ids) : null; // pred migráciou bez contact
      const rows = ((pr.error ? fallback?.data : pr.data) ?? []) as Trader[];
      setTraders(new Map(rows.map((t) => [t.id, { contact: null, ...t }])));
    }
    setError(null);
    setMissing(false);
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { list, traders, error, missing, loading, reload };
}

export async function addListing(x: Partial<Listing> & { card_id: string; kind: TradeKind }) {
  const row = { qty: 1, cond: "NM", lang: "EN", ...x, updated_at: new Date().toISOString() };
  const { error } = await sb().from("trade_listings").upsert(row, { onConflict: "user_id,card_id,kind,cond,lang" });
  return error ? (notReady(error.message) ? "Trhovisko sa ešte pripravuje (chýba databázová tabuľka)." : error.message) : null;
}
export async function updateListing(id: string, patch: Partial<Listing>) {
  const { error } = await sb().from("trade_listings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  return error?.message ?? null;
}
export async function removeListing(id: string) {
  const { error } = await sb().from("trade_listings").delete().eq("id", id);
  return error?.message ?? null;
}

/** môj kontakt (Discord, Instagram…) v profile */
export function useMyContact(userId: string | null | undefined) {
  const [contact, setContact] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!userId) return;
    sb()
      .from("profiles")
      .select("contact")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        setReady(!error);
        setContact((data as any)?.contact ?? "");
      });
  }, [userId]);
  const save = async (v: string) => {
    if (!userId) return "Nie si prihlásený.";
    const { error } = await sb().from("profiles").update({ contact: v.trim().slice(0, 120) || null }).eq("id", userId);
    if (!error) setContact(v.trim());
    return error ? (notReady(error.message) ? "Kontakt sa dá uložiť až po aktualizácii databázy." : error.message) : null;
  };
  return { contact, setContact, save, ready };
}
