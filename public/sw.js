// public/sw.js
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// Block generic "You're up!" so only our custom texts appear
function isBanned(text) {
  if (!text) return false;
  const t = String(text).trim().toLowerCase();
  return t === "you're up!" || t === "you're up" || t === "you’re up!" || t === "you’re up";
}

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch {}
  const title = data.title || null;
  const body  = data.body  || null;
  const options = data.options || {};

  if (isBanned(title) || isBanned(body)) return; // ignore generic pushes

  if (title || body) {
    event.waitUntil(
      self.registration.showNotification(title || 'Kava', {
        body: body || '',
        tag: 'kava-alert',
        renotify: true,
        ...options,
      })
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification?.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if ('focus' in client) { client.focus(); return; }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
