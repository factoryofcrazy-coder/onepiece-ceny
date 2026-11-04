"use client";
// Počet nových hlásení pre admina (odznak v menu), vrátane skrytých, napríklad nahlásených správ z chatu.
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
      .rpc("feedback_new_count")
      .then(({ data }) => setCount(Number(data) || 0));
  }, [isAdmin, path]);
  return count;
}
