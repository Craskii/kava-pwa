self.addEventListener('install', e => {
  e.waitUntil(caches.open('kava-v1').then(c => c.addAll(['/', '/manifest.json'])));
  self.skipWaiting();
});
self.addEventListener('activate', e => self.clients.claim());
self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
