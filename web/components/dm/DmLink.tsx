"use client";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { DM_ENABLED } from "@/lib/config";
import { dmHref, useDm } from "@/lib/dm/client";

/** ikona správ v hornej lište s počtom neprečítaných */
export function DmNavIcon() {
  const { user } = useAuth();
  const { unread } = useDm();
  if (!DM_ENABLED || !user) return null;
  const n = unread > 99 ? "99+" : String(unread);
  return (
    <Link href="/spravy" className="dm-nav" aria-label={unread ? `Súkromné správy, neprečítané: ${unread}` : "Súkromné správy"} title="Súkromné správy">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="m4 7 8 6 8-6" />
      </svg>
      {unread > 0 && <span className="dm-nav-badge">{n}</span>}
    </Link>
  );
}

/** tlačidlo Napísať; pre seba a neprihlásených sa nezobrazí */
export function WriteLink({ userId, listing, card, className = "btn ghost sm" }: { userId: string; listing?: string; card?: string; className?: string }) {
  const { user } = useAuth();
  if (!DM_ENABLED || !user || user.id === userId) return null;
  return (
    <Link className={className} href={dmHref(userId, { listing, card })}>
      Napísať
    </Link>
  );
}
