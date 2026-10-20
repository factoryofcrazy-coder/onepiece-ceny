"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { sb } from "./supabase";

/** Kolekcia používateľa: { card_id: počet }. Vlastnú kolekciu sa dá upravovať, kamošovu len pozerať. */
export function useCollection(userId: string | null | undefined, editable: boolean) {
  const [qty, setQtyState] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<Record<string, any>>({});

  useEffect(() => {
    setQtyState({});
    if (!userId) return;
    setLoading(true);
    (async () => {
      const out: Record<string, number> = {};
      // Supabase vracia max 1000 riadkov na dopyt → stránkovanie
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb()
          .from("collection")
          .select("card_id, qty")
          .eq("user_id", userId)
          .range(from, from + 999);
        if (error) {
          setError(error.message);
          break;
        }
        data.forEach((r) => (out[r.card_id] = r.qty));
        if (data.length < 1000) break;
      }
      setQtyState(out);
      setLoading(false);
    })();
  }, [userId]);

  const setQty = useCallback(
    (cardId: string, n: number) => {
      if (!editable || !userId) return;
      n = Math.max(0, Math.min(999, Math.round(n)));
      setQtyState((q) => {
        const next = { ...q };
        if (n === 0) delete next[cardId];
        else next[cardId] = n;
        return next;
      });
      clearTimeout(timers.current[cardId]);
      timers.current[cardId] = setTimeout(async () => {
        const res =
          n === 0
            ? await sb().from("collection").delete().eq("user_id", userId).eq("card_id", cardId)
            : await sb()
                .from("collection")
                .upsert({ user_id: userId, card_id: cardId, qty: n, updated_at: new Date().toISOString() });
        setError(res.error ? res.error.message : null);
      }, 400);
    },
    [editable, userId],
  );

  return { qty, setQty, loading, error };
}

/** Súčet kusov podľa herného kódu (všetky varianty OP01-001, OP01-001_p1… sa rátajú do decku spolu). */
export function ownedByCode(qty: Record<string, number>) {
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(qty)) {
    const code = id.split("_")[0];
    out[code] = (out[code] || 0) + n;
  }
  return out;
}
