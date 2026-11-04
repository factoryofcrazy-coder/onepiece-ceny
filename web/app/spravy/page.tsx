"use client";
import { Suspense } from "react";
import Messages from "@/components/dm/Messages";
import { Loading } from "@/components/ui";
import { DM_ENABLED } from "@/lib/config";

export default function Page() {
  if (!DM_ENABLED) return <div className="empty">Súkromné správy pripravujeme.</div>;
  return (
    <Suspense fallback={<Loading what="Načítavam správy" shape="rows" />}>
      <Messages />
    </Suspense>
  );
}
