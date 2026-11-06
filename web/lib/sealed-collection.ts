"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { sb } from "./supabase";

/** Zapečatené produkty v zbierke používateľa: { product_id: počet }. */
export function useSealedCollection(userId: string | null | undefined, editable: boolean) {
  const [qty, setQtyState] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    setQtyState({});
    if (!userId) return;
    (async () => {
      const { data, error } = await sb().from("collection_sealed").select("product_id, qty").eq("user_id", userId);
      if (error) return setError(error.message);
      const out: Record<number, number> = {};
      data.forEach((r) => (out[r.product_id] = r.qty));
      setQtyState(out);
    })();
  }, [userId]);

  const setQty = useCallback(
    (productId: number, n: number) => {
      if (!editable || !userId) return;
      n = Math.max(0, Math.min(999, Math.round(n)));
      setQtyState((q) => {
        const next = { ...q };
        if (n === 0) delete next[productId];
        else next[productId] = n;
        return next;
      });
      clearTimeout(timers.current[productId]);
      timers.current[productId] = setTimeout(async () => {
        const res =
          n === 0
            ? await sb().from("collection_sealed").delete().eq("user_id", userId).eq("product_id", productId)
            : await sb().from("collection_sealed").upsert({ user_id: userId, product_id: productId, qty: n, updated_at: new Date().toISOString() });
        setError(res.error ? res.error.message : null);
      }, 400);
    },
    [editable, userId],
  );

  return { qty, setQty, error };
}
