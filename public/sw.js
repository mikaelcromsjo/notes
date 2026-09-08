// Minimal pass-through worker: present so the app is installable, but it does
// NOT cache or intercept anything — every request goes straight to the network,
// so code changes are always live. It also clears any cache left by older
// versions of this worker.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// An (empty) fetch handler is enough to satisfy the install criteria; returning
// nothing lets the browser perform its normal fetch.
self.addEventListener('fetch', () => {});

// --- Alarm delivery: the server pushes when an alarm is due and the app is
// not in the foreground. iOS/Android require the notification to be shown. ---
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = `⏰ ${data.title || 'Alarm'}`;
  const options = {
    body: data.at ? new Date(data.at).toLocaleString() : 'Alarm',
    tag: data.noteId ? `alarm-${data.noteId}` : 'alarm',
    renotify: true,
    requireInteraction: true,
    data: { url: data.noteId ? `/#${data.noteId}` : '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if ('focus' in client) {
          client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })()
  );
});
