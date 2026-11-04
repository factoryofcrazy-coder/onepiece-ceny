"use client";
// Počet nových hlásení pre admina (odznak v menu). Skryté hlásenia sa nerátajú.
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "./auth";
import { sb } from "./supabase";

export function useNewReports() {
  const { isAdmin } = useAuth();
  const path = usePathname();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!isAdmin) return setCount(0);
    sb()
      .from("feedback")
      .select("id", { count: "exact", head: true })
      .eq("status", "new")
      .then(({ count: n }) => setCount(n ?? 0));
  }, [isAdmin, path]);
  return count;
}
