"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
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
      <input aria-label="Hľadať kartu" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hľadať kartu, napríklad Luffy alebo OP01-001" />
    </form>
  );
}
