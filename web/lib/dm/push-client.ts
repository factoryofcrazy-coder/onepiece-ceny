"use client";
// Notifikácie v prehliadači. Service worker sa registruje až vtedy, keď si ich človek zapne.
import { sb } from "../supabase";
import { dmPushCall } from "./push-call";

export type PushStatus = "on" | "off" | "denied" | "unsupported" | "ios-install" | "off-server";

const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function existing() {
  if (!supported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

const saved = (s: PushSubscription) => {
  const j = s.toJSON();
  return { endpoint: s.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth };
};

export async function pushStatus(): Promise<PushStatus> {
  if (!supported()) return isIos() && !isInstalled() ? "ios-install" : "unsupported";
  if (isIos() && !isInstalled()) return "ios-install";
  if (Notification.permission === "denied") return "denied";
  if (await existing()) return "on";
  const cfg = await dmPushCall<{ publicKey: string | null }>("push_config").catch(() => null);
  return cfg?.publicKey ? "off" : "off-server";
}

export async function enablePush() {
  const { publicKey } = await dmPushCall<{ publicKey: string | null }>("push_config");
  if (!publicKey) throw new Error("Notifikácie zatiaľ nie sú na serveri zapnuté.");
  if ((await Notification.requestPermission()) !== "granted") throw new Error("Prehliadač notifikácie nepovolil.");
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(publicKey) as BufferSource });
  await dmPushCall("push_subscribe", saved(sub));
}

/** odhlási zariadenie na serveri aj v prehliadači; volá sa aj pred odhlásením z účtu */
export async function disablePush() {
  const sub = await existing();
  if (!sub) return;
  const { data } = await sb().auth.getSession();
  if (data.session) await dmPushCall("push_unsubscribe", { endpoint: sub.endpoint }).catch(() => null);
  await sub.unsubscribe();
}

/** bez prihlásenia zariadenie nemá dostávať notifikácie, server ich zruší pri ďalšom pokuse o doručenie */
export async function stopPushLocally() {
  const sub = await existing().catch(() => null);
  if (sub) await sub.unsubscribe().catch(() => null);
}

/** priradí zariadenie aktuálnemu účtu, napríklad po zmene účtu na tom istom zariadení */
export async function resavePush() {
  const sub = await existing().catch(() => null);
  if (sub) await dmPushCall("push_subscribe", saved(sub)).catch(() => null);
}

export function showBadge(n: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  (n > 0 ? nav.setAppBadge?.(n) : nav.clearAppBadge?.())?.catch(() => null);
}
