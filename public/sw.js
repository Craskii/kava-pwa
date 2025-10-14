// public/sw.js

// Activate the new SW immediately and take control of open pages
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Allow the page to tell the SW to activate right away
self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/**
 * Web Push handler (optional).
 * We ONLY show a notification if the server supplies text.
 * This prevents any old hard-coded "You're up!" from appearing.
 * Example payload:
 *   { "title": "Queue update", "body": "your up next get ready!!" }
 */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch (err) {
    // If it wasn't JSON, ignore silently
  }

  const title = data.title || null;
  const body  = data.body  || null;
  const options = data.options || {};

  if (title || body) {
    event.waitUntil(
      self.registration.showNotification(title || 'Kava', {
        body: body || '',
        tag: 'kava-alert',
        renotify: true,
        // You can pass icon/badge via data.options if needed
        ...options,
      })
    );
  }
});

// (Optional) Click behavior: focus an open client or open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification?.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const hadWindow = clientsArr.some((client) => {
        if (client.url.includes(self.origin) && 'focus' in client) {
          client.focus();
          return true;
        }
        return false;
      });
      if (!hadWindow && self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
