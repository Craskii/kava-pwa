// public/sw.js
// Simple app-shell + network-first for HTML and APIs, cache-first for static assets.
const CACHE_VERSION = 'v8'; // ← bump this number when cache strategy changes
const VERSION = self.__BUILD__ || String(Date.now());
const STATIC_CACHE = `static-${VERSION}`;
const DYNAMIC_CACHE = `dynamic-${VERSION}`;
const APP_SHELL = ["/"]; // add more shell routes if you like

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(APP_SHELL);
    })()
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map((k) => caches.delete(k))
      );
    })()
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const isHTML =
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");

  const isStaticAsset =
    url.pathname.includes("/_next/") ||
    /\.(?:js|css|png|jpg|jpeg|gif|webp|svg|ico|woff2?)$/i.test(url.pathname);

  // Network-first for HTML (pages) so deploys show up immediately
  if (isHTML) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req, { cache: "no-store" });
          const cache = await caches.open(DYNAMIC_CACHE);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(req);
          return cached || new Response("Offline", { status: 503 });
        }
      })()
    );
    return;
  }

  // Cache-first for static assets
  if (isStaticAsset) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        const cache = await caches.open(STATIC_CACHE);
        cache.put(req, res.clone());
        return res;
      })()
    );
    return;
  }

  // APIs & everything else: network-first with offline fallback
  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(req, { cache: "no-store" });
        const cache = await caches.open(DYNAMIC_CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || new Response("Offline", { status: 503 });
      }
    })()
  );
});

/**
 * BACKGROUND NOTIFICATIONS (push + postMessage bridge)
 * Allows the app to display system notifications even when the page is hidden.
 */
const DEFAULT_ICON = "/icons/icon-192x192.png";

async function showSwNotification(payload) {
  const { title, body, data, tag, requireInteraction, icon, badge } = payload || {};
  if (!title || !body) return;

  try {
    await self.registration.showNotification(title, {
      body,
      tag: tag || "queue-alert",
      requireInteraction: Boolean(requireInteraction),
      renotify: true,
      icon: icon || DEFAULT_ICON,
      badge: badge || DEFAULT_ICON,
      data: data || {},
    });
  } catch (err) {
    // swallow to avoid breaking fetch handler
  }
}

self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg?.type === "SHOW_NOTIFICATION") {
    event.waitUntil(showSwNotification(msg.payload));
  }
});

self.addEventListener("push", (event) => {
  try {
    const data = event.data?.json?.() ?? {};
    event.waitUntil(showSwNotification(data));
  } catch (err) {
    // ignore malformed push payloads
  }
});

self.addEventListener("notificationclick", (event) => {
  const url = event.notification?.data?.url;
  event.notification.close();

  if (!url) return;

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = allClients.find((c) => c.url.startsWith(url));
      if (existing) {
        await existing.focus();
      } else {
        await self.clients.openWindow(url);
      }
    })()
  );
});
