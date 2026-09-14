// Service worker: offline app-shell caching + Web Push delivery.
//
// Caching model (phase 1 of offline support):
//  - The app shell (HTML/JS/CSS/vendor/icons) is precached on install and served
//    stale-while-revalidate: a cached hit returns immediately, a fresh copy is
//    fetched in the background and stored for next load. So a `public/` change is
//    live on the *second* load, not instantly — the price of working offline.
//  - Navigations fall back to the cached shell when the network is down, so the
//    app boots offline; app.js then reads note data from IndexedDB.
//  - `/api/*`, `/uploads/*`, `/share`, `/digest` are never touched here — they go
//    straight to the network and app.js handles their offline behaviour itself
//    (one source of truth: IndexedDB, not a synthetic response in the worker).
//
// Bump CACHE_VERSION when the shell list changes or an old cache must be purged;
// a byte change to this file is itself what makes the browser re-run install.
const CACHE_VERSION = 'v9';
const SHELL_CACHE = `nico-shell-${CACHE_VERSION}`;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/store.js',
  '/style.css',
  '/manifest.webmanifest',
  '/vendor/leaflet.min.js',
  '/vendor/leaflet.min.css',
  '/vendor/marked.min.js',
  '/vendor/purify.min.js',
  '/vendor/images/layers.png',
  '/vendor/images/layers-2x.png',
  '/vendor/images/marker-icon.png',
  '/vendor/images/marker-icon-2x.png',
  '/vendor/images/marker-shadow.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individually so one 404 (e.g. a missing icon) doesn't fail the whole
      // precache and leave the worker without a shell.
      await Promise.all(
        SHELL_ASSETS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
      // Tell already-open pages a new worker is in charge — they still hold the
      // previous app.js in memory, so app.js decides whether to prompt a reload.
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const c of clients) c.postMessage({ type: 'sw-activated', version: CACHE_VERSION });
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'skipWaiting') self.skipWaiting();
});

const BYPASS = [/^\/api\//, /^\/uploads\//, /^\/share\b/, /^\/digest\b/];

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (BYPASS.some((re) => re.test(url.pathname))) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          return (await cache.match('/index.html')) || (await cache.match('/')) || Response.error();
        }
      })()
    );
    return;
  }

  // Stale-while-revalidate for shell assets.
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') cache.put(request, res.clone());
          return res;
        })
        .catch(() => null);
      return cached || (await network) || Response.error();
    })()
  );
});

// --- Alarm delivery: the server pushes when an alarm is due and the app is
// not in the foreground. iOS/Android require the notification to be shown. ---
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  if (data.type === 'digest') {
    event.waitUntil(
      self.registration.showNotification(data.title || '🗓️ Digest', {
        body: data.body || '',
        tag: 'digest',
        renotify: true,
        data: { url: data.url || '/' },
      })
    );
    return;
  }
  event.waitUntil(showAlarm(data));
});

// Fixed short snooze offsets for the notification action buttons. These are
// pure "now + N", so — unlike the weeks/months snoozes in the app — they need
// no timezone knowledge and are safe to compute here in the worker.
const SNOOZE_ACTIONS = [
  { action: 'snooze-10m', title: 'Snooze 10m', ms: 10 * 60 * 1000 },
  { action: 'snooze-1h', title: 'Snooze 1h', ms: 60 * 60 * 1000 },
];

function showAlarm(data, extraBody) {
  const place = data.kind === 'location';
  const title = `${place ? '📍' : '⏰'} ${data.title || 'Alarm'}`;
  const base = place
    ? "You're near here"
    : data.at
      ? new Date(data.at).toLocaleString()
      : 'Alarm';
  return self.registration.showNotification(title, {
    body: extraBody ? `${base}\n${extraBody}` : base,
    tag: data.noteId ? `alarm-${data.noteId}` : 'alarm',
    renotify: true,
    requireInteraction: true,
    actions: data.reminderId
      ? SNOOZE_ACTIONS.map((s) => ({ action: s.action, title: s.title }))
      : [],
    data: {
      url: data.noteId ? `/#${data.noteId}` : '/',
      reminderId: data.reminderId || null,
      title: data.title || null,
      at: data.at || null,
      noteId: data.noteId || null,
    },
  });
}

// POST a snooze for `reminderId`, `ms` from now. On failure the server has
// already stamped pushed_at (it won't ring again), so re-show the notification
// with a hint rather than dropping the reminder silently.
async function snoozeReminder(data, ms) {
  const until = new Date(Date.now() + ms).toISOString();
  try {
    const res = await fetch(`/api/alarms/${data.reminderId}/snooze`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ until }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    await showAlarm(data, 'Snooze failed — tap to open');
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  const snooze = SNOOZE_ACTIONS.find((s) => s.action === event.action);
  if (snooze && data.reminderId) {
    event.waitUntil(snoozeReminder(data, snooze.ms));
    return;
  }

  const url = data.url || '/';
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
