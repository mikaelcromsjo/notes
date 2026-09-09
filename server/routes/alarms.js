const express = require('express');
const db = require('../db');

const router = express.Router();

const now = () => new Date().toISOString();
const validTs = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const tsOrNull = (v) => (validTs(v) ? v : null);

// The server never computes fire times: "11:00" means 11:00 in the *viewer's*
// timezone and the box runs in UTC. The client (public/app.js) computes ack_at
// (last "OK"), next_at (absolute UTC of the next ring) and snooze_until, and
// this route just persists them. next_at / snooze_until + pushed_at drive the
// server-side Web Push scheduler (server/alarm-scheduler.js).
function serialize(r) {
  return {
    id: r.id,
    noteId: r.note_id,
    title: r.title,
    kind: r.kind || 'time',
    time: r.time,
    days: r.days ? r.days.split(',').map(Number) : [],
    date: r.date,
    lat: r.lat,
    lon: r.lon,
    radiusM: r.radius_m,
    tz: r.tz,
    ackAt: r.ack_at,
    nextAt: r.next_at,
    snoozeUntil: r.snooze_until,
  };
}

const COLS = `r.id, r.note_id, r.kind, r.time, r.days, r.date, r.lat, r.lon, r.radius_m,
              r.tz, r.ack_at, r.next_at, r.snooze_until, n.title`;

const selectOne = db.prepare(
  `SELECT ${COLS} FROM reminders r JOIN notes n ON n.id = r.note_id
   WHERE r.id = ? AND r.user_id = ?`
);

// Validate the shared reminder body. Returns { time, days, date } or { error }.
function parseSchedule(body) {
  const { time, days, date } = body || {};
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return { error: 'time must be HH:MM' };
  const daysStr = Array.isArray(days)
    ? [...new Set(days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))]
        .sort((a, b) => a - b)
        .join(',')
    : '';
  const dateStr =
    !daysStr && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  if (!daysStr && !dateStr) return { error: 'pick repeat days or a one-time date' };
  return { time, days: daysStr, date: dateStr };
}

// A geofence reminder (kind='location'): a circle, no clock. Returns
// { lat, lon, radiusM } or { error }.
function parseLocation(body) {
  const lat = Number(body && body.lat);
  const lon = Number(body && body.lon);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return { error: 'lat out of range' };
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return { error: 'lon out of range' };
  let radiusM = Math.round(Number(body && body.radiusM));
  if (!Number.isFinite(radiusM)) radiusM = 250;
  radiusM = Math.min(10000, Math.max(50, radiusM));
  return { lat, lon, radiusM };
}

const tzOf = (body, fallback = null) =>
  body && typeof body.tz === 'string' && body.tz ? body.tz.slice(0, 64) : fallback;

router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT ${COLS} FROM reminders r JOIN notes n ON n.id = r.note_id
       WHERE r.user_id = ? AND n.status != 'deleted'
       ORDER BY r.time ASC, n.title ASC`
    )
    .all(req.userId);
  res.json(rows.map(serialize));
});

// Create a reminder for a note.
router.post('/', (req, res) => {
  const note = db
    .prepare("SELECT id FROM notes WHERE id = ? AND user_id = ? AND status != 'deleted'")
    .get(req.body && req.body.noteId, req.userId);
  if (!note) return res.status(404).json({ error: 'note not found' });

  if (req.body && req.body.kind === 'location') {
    const loc = parseLocation(req.body);
    if (loc.error) return res.status(400).json({ error: loc.error });
    const info = db
      .prepare(
        `INSERT INTO reminders (note_id, user_id, kind, time, days, date, lat, lon, radius_m, tz, ack_at)
         VALUES (?, ?, 'location', '', '', NULL, ?, ?, ?, ?, ?)`
      )
      .run(note.id, req.userId, loc.lat, loc.lon, loc.radiusM, tzOf(req.body), now());
    return res.status(201).json(serialize(selectOne.get(info.lastInsertRowid, req.userId)));
  }

  const s = parseSchedule(req.body);
  if (s.error) return res.status(400).json({ error: s.error });

  const ack = validTs(req.body.ackAt) ? req.body.ackAt : now();
  const info = db
    .prepare(
      `INSERT INTO reminders (note_id, user_id, time, days, date, tz, ack_at, next_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(note.id, req.userId, s.time, s.days, s.date, tzOf(req.body), ack, tsOrNull(req.body.nextAt));
  res.status(201).json(serialize(selectOne.get(info.lastInsertRowid, req.userId)));
});

// Update a reminder by its own id.
router.put('/:id', (req, res) => {
  const existing = selectOne.get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'not found' });

  if (req.body && req.body.kind === 'location') {
    const loc = parseLocation(req.body);
    if (loc.error) return res.status(400).json({ error: loc.error });
    db.prepare(
      `UPDATE reminders
       SET kind = 'location', time = '', days = '', date = NULL,
           lat = ?, lon = ?, radius_m = ?, tz = ?, ack_at = ?,
           next_at = NULL, pushed_at = NULL, snooze_until = NULL
       WHERE id = ? AND user_id = ?`
    ).run(loc.lat, loc.lon, loc.radiusM, tzOf(req.body, existing.tz), now(),
          req.params.id, req.userId);
    return res.json(serialize(selectOne.get(req.params.id, req.userId)));
  }

  const s = parseSchedule(req.body);
  if (s.error) return res.status(400).json({ error: s.error });

  const ack = validTs(req.body.ackAt) ? req.body.ackAt : now();
  db.prepare(
    `UPDATE reminders
     SET kind = 'time', time = ?, days = ?, date = ?, lat = NULL, lon = NULL, radius_m = NULL,
         tz = ?, ack_at = ?, next_at = ?, pushed_at = NULL, snooze_until = NULL
     WHERE id = ? AND user_id = ?`
  ).run(s.time, s.days, s.date, tzOf(req.body, existing.tz), ack, tsOrNull(req.body.nextAt),
        req.params.id, req.userId);
  res.json(serialize(selectOne.get(req.params.id, req.userId)));
});

router.delete('/:id', (req, res) => {
  const info = db
    .prepare('DELETE FROM reminders WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.userId);
  if (info.changes === 0) return res.status(404).json({ error: 'not found' });
  res.status(204).end();
});

// "OK" on the popup — quiet until the reminder next goes off. The client sends
// the rolled-forward nextAt so the scheduler re-arms for that occurrence; any
// active snooze is spent.
router.post('/:id/ack', (req, res) => {
  const at = validTs(req.body && req.body.at) ? req.body.at : now();
  const next = tsOrNull(req.body && req.body.nextAt);
  const info = db
    .prepare(
      `UPDATE reminders SET ack_at = ?, next_at = ?, pushed_at = NULL, snooze_until = NULL
       WHERE id = ? AND user_id = ?`
    )
    .run(at, next, req.params.id, req.userId);
  if (info.changes === 0) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// Push the reminder out to an absolute instant (weeks/months). The client
// computes `until` in the viewer's timezone; the scheduler treats snooze_until
// as the due time while it is set.
router.post('/:id/snooze', (req, res) => {
  const until = tsOrNull(req.body && req.body.until);
  if (!until || Date.parse(until) <= Date.now()) {
    return res.status(400).json({ error: 'until must be a future timestamp' });
  }
  const info = db
    .prepare(
      `UPDATE reminders SET snooze_until = ?, ack_at = ?, pushed_at = NULL
       WHERE id = ? AND user_id = ?`
    )
    .run(until, now(), req.params.id, req.userId);
  if (info.changes === 0) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// Roll the next-ring instant forward (client does this on every poll while the
// app is open, so future occurrences stay armed for push).
router.post('/:id/schedule', (req, res) => {
  const next = tsOrNull(req.body && req.body.nextAt);
  const info = db
    .prepare(
      `UPDATE reminders SET next_at = ?, pushed_at = NULL WHERE id = ? AND user_id = ?`
    )
    .run(next, req.params.id, req.userId);
  if (info.changes === 0) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// The client's foreground geofence watch calls this when the viewer crosses into
// a location reminder's radius. Stamp next_at = now so the normal triggered /
// push path takes over — but only if it isn't already pending (still ringing, or
// snoozed into the future), so GPS jitter in and out of the fence can't spam it.
router.post('/:id/arrive', (req, res) => {
  const r = db
    .prepare("SELECT * FROM reminders WHERE id = ? AND user_id = ? AND kind = 'location'")
    .get(req.params.id, req.userId);
  if (!r) return res.status(404).json({ error: 'not found' });

  const pending =
    (r.next_at && (!r.ack_at || Date.parse(r.next_at) > Date.parse(r.ack_at))) ||
    (r.snooze_until && Date.parse(r.snooze_until) > Date.now());
  if (pending) return res.json({ ok: true, armed: false });

  db.prepare(
    'UPDATE reminders SET next_at = ?, pushed_at = NULL, snooze_until = NULL WHERE id = ? AND user_id = ?'
  ).run(now(), req.params.id, req.userId);
  res.json({ ok: true, armed: true });
});

module.exports = router;
