// Service worker len pre notifikácie súkromných správ. Nič neukladá do cache, stránky sa načítavajú bežne.
self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = {};
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // kto má práve otvorenú túto konverzáciu, nepotrebuje notifikáciu
      const looking = windows.some((c) => c.focused && d.conversationId && c.url.includes(`/spravy?c=${d.conversationId}`));
      if (typeof d.unread === "number" && self.navigator && self.navigator.setAppBadge) {
        await self.navigator.setAppBadge(d.unread).catch(() => null);
      }
      if (looking) return;
      await self.registration.showNotification(d.title || "Grand Line", {
        body: d.body || "Nová správa",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: d.tag || "dm",
        renotify: true,
        data: { url: typeof d.url === "string" && d.url.startsWith("/spravy") ? d.url : "/spravy" },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const path = typeof data.url === "string" && data.url.startsWith("/spravy") ? data.url : "/spravy";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of windows) {
        if (new URL(c.url).origin === self.location.origin && "focus" in c) {
          await c.focus();
          if ("navigate" in c) await c.navigate(path);
          return;
        }
      }
      await self.clients.openWindow(path);
    })(),
  );
});
