"use client";
import { Suspense } from "react";
import Messages from "@/components/dm/Messages";
import { Loading } from "@/components/ui";
import { DM_ENABLED } from "@/lib/config";
import { useLang } from "@/lib/lang";

export default function Page() {
  const { t } = useLang();
  if (!DM_ENABLED) return <div className="empty">{t("Súkromné správy pripravujeme.", "Private messages are coming soon.")}</div>;
  return (
    <Suspense fallback={<Loading what={t("Načítavam správy", "Loading messages")} shape="rows" />}>
      <Messages />
    </Suspense>
  );
}
