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
  const title = `⏰ ${data.title || 'Alarm'}`;
  const base = data.at ? new Date(data.at).toLocaleString() : 'Alarm';
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
