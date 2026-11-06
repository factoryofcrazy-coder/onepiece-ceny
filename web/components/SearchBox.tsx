"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLang } from "@/lib/lang";

export default function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const { t } = useLang();
  return (
    <form
      className="tb-search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/karty?q=${encodeURIComponent(q.trim())}`);
        window.dispatchEvent(new CustomEvent("op-card-search", { detail: q.trim() }));
      }}
    >
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.500-3.500" />
      </svg>
      <input aria-label={t("Hľadať kartu", "Search cards")} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Hľadať kartu, napríklad Luffy alebo OP01-001", "Search cards, e.g. Luffy or OP01-001")} />
    </form>
  );
}
