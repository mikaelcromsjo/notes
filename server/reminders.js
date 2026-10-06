// Pure reminder-domain logic, extracted out of server/routes/alarms.js — see
// docs/plan/08-offline-privacy.md §3.1. No behavior change from the
// pre-extraction handlers.
const { HttpError } = require('./http-error');
const { resolveNoteAccess } = require('./note-access');
const history = require('./history');

const now = () => new Date().toISOString();
const validTs = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const tsOrNull = (v) => (validTs(v) ? v : null);

// The server never computes fire times: "11:00" means 11:00 in the *viewer's*
// timezone and the box runs in UTC. The client computes ack_at (last "OK"),
// next_at (absolute UTC of the next ring) and snooze_until, and this module
// just persists them.
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
    geo: r.geo,
    windowStart: r.window_start,
    windowEnd: r.window_end,
    tz: r.tz,
    ackAt: r.ack_at,
    nextAt: r.next_at,
    snoozeUntil: r.snooze_until,
    // The client's note cache only holds the current scope, so a reminder on
    // a space note carries what the alarm bar/agenda need about it directly.
    noteStatus: r.note_status,
    ...(r.share_id != null ? { shareId: r.share_id, shareTitle: r.share_title } : {}),
  };
}

const COLS = `r.id, r.note_id, r.kind, r.time, r.days, r.date, r.lat, r.lon, r.radius_m, r.geo,
              r.window_start, r.window_end, r.tz, r.ack_at, r.next_at, r.snooze_until, n.title,
              n.status AS note_status, n.share_id, (SELECT title FROM shares WHERE id = n.share_id) AS share_title`;

function selectOne(db, id, userId) {
  return db
    .prepare(`SELECT ${COLS} FROM reminders r JOIN notes n ON n.id = r.note_id WHERE r.id = ? AND r.user_id = ?`)
    .get(id, userId);
}

// The day-pattern half shared by kind='time' and kind='anytime': either repeat
// days (CSV of JS getDay() numbers) or a one-time date, never neither. Returns
// { days, date } or { error }.
function parseDayPattern(body) {
  const { days, date } = body || {};
  const daysStr = Array.isArray(days)
    ? [...new Set(days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))]
        .sort((a, b) => a - b)
        .join(',')
    : '';
  const dateStr =
    !daysStr && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  if (!daysStr && !dateStr) return { error: 'pick repeat days or a one-time date' };
  return { days: daysStr, date: dateStr };
}

// Validate the shared reminder body. Returns { time, days, date } or { error }.
function parseSchedule(body) {
  const { time } = body || {};
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return { error: 'time must be HH:MM' };
  const pattern = parseDayPattern(body);
  if (pattern.error) return pattern;
  return { time, days: pattern.days, date: pattern.date };
}

// kind='anytime': a day pattern plus the HH:MM-HH:MM window the client is
// allowed to pick a fire minute from — no committed clock time.
function parseNudge(body) {
  const { windowStart, windowEnd } = body || {};
  if (!windowStart || !/^\d{2}:\d{2}$/.test(windowStart)) return { error: 'windowStart must be HH:MM' };
  if (!windowEnd || !/^\d{2}:\d{2}$/.test(windowEnd)) return { error: 'windowEnd must be HH:MM' };
  if (windowEnd <= windowStart) return { error: 'windowEnd must be after windowStart' };
  const pattern = parseDayPattern(body);
  if (pattern.error) return pattern;
  return { days: pattern.days, date: pattern.date, windowStart, windowEnd };
}

// A geofence reminder (kind='location'): a circle, no clock. Once the account
// has encryption on, the client sends an opaque `geo` blob (already
// encrypted {lat, lon, radiusM}) instead of plain fields — the server can't
// validate a blob's contents, so that path skips the range checks below (see
// server/notes.js's parseGeo for the same pattern).
function parseLocation(body) {
  if (typeof (body && body.geo) === 'string' && body.geo) {
    return { lat: null, lon: null, radiusM: null, geo: body.geo };
  }
  const lat = Number(body && body.lat);
  const lon = Number(body && body.lon);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return { error: 'lat out of range' };
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return { error: 'lon out of range' };
  let radiusM = Math.round(Number(body && body.radiusM));
  if (!Number.isFinite(radiusM)) radiusM = 250;
  radiusM = Math.min(10000, Math.max(50, radiusM));
  return { lat, lon, radiusM, geo: null };
}

const tzOf = (body, fallback = null) =>
  body && typeof body.tz === 'string' && body.tz ? body.tz.slice(0, 64) : fallback;

function list(db, userId) {
  const rows = db
    .prepare(
      `SELECT ${COLS} FROM reminders r JOIN notes n ON n.id = r.note_id
       WHERE r.user_id = ? AND n.status != 'deleted'
       ORDER BY r.time ASC, n.title ASC`
    )
    .all(userId);
  return rows.map(serialize);
}

// Create a reminder for a note.
function create(db, userId, body) {
  const { role, note } = resolveNoteAccess(db, userId, body && body.noteId);
  if (!role) throw new HttpError(404, 'note not found');

  if (body && body.kind === 'location') {
    const loc = parseLocation(body);
    if (loc.error) throw new HttpError(400, loc.error);
    const info = db
      .prepare(
        `INSERT INTO reminders (note_id, user_id, kind, time, days, date, lat, lon, radius_m, geo, tz, ack_at)
         VALUES (?, ?, 'location', '', '', NULL, ?, ?, ?, ?, ?, ?)`
      )
      .run(note.id, userId, loc.lat, loc.lon, loc.radiusM, loc.geo, tzOf(body), now());
    return serialize(selectOne(db, info.lastInsertRowid, userId));
  }

  if (body && body.kind === 'anytime') {
    const nudge = parseNudge(body);
    if (nudge.error) throw new HttpError(400, nudge.error);
    const ack = validTs(body.ackAt) ? body.ackAt : now();
    const info = db
      .prepare(
        `INSERT INTO reminders (note_id, user_id, kind, time, days, date, window_start, window_end, tz, ack_at, next_at)
         VALUES (?, ?, 'anytime', '', ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        note.id, userId, nudge.days, nudge.date, nudge.windowStart, nudge.windowEnd,
        tzOf(body), ack, tsOrNull(body.nextAt)
      );
    return serialize(selectOne(db, info.lastInsertRowid, userId));
  }

  const s = parseSchedule(body);
  if (s.error) throw new HttpError(400, s.error);

  const ack = validTs(body.ackAt) ? body.ackAt : now();
  const info = db
    .prepare(
      `INSERT INTO reminders (note_id, user_id, time, days, date, tz, ack_at, next_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(note.id, userId, s.time, s.days, s.date, tzOf(body), ack, tsOrNull(body.nextAt));
  return serialize(selectOne(db, info.lastInsertRowid, userId));
}

// Update a reminder by its own id.
function update(db, userId, id, body) {
  const existing = selectOne(db, id, userId);
  if (!existing) throw new HttpError(404, 'not found');

  if (body && body.kind === 'location') {
    const loc = parseLocation(body);
    if (loc.error) throw new HttpError(400, loc.error);
    db.prepare(
      `UPDATE reminders
       SET kind = 'location', time = '', days = '', date = NULL,
           lat = ?, lon = ?, radius_m = ?, geo = ?, window_start = NULL, window_end = NULL,
           tz = ?, ack_at = ?, next_at = NULL, pushed_at = NULL, snooze_until = NULL
       WHERE id = ? AND user_id = ?`
    ).run(loc.lat, loc.lon, loc.radiusM, loc.geo, tzOf(body, existing.tz), now(), id, userId);
    return serialize(selectOne(db, id, userId));
  }

  if (body && body.kind === 'anytime') {
    const nudge = parseNudge(body);
    if (nudge.error) throw new HttpError(400, nudge.error);
    const ack = validTs(body.ackAt) ? body.ackAt : now();
    db.prepare(
      `UPDATE reminders
       SET kind = 'anytime', time = '', days = ?, date = ?, lat = NULL, lon = NULL, radius_m = NULL, geo = NULL,
           window_start = ?, window_end = ?, tz = ?, ack_at = ?, next_at = ?,
           pushed_at = NULL, snooze_until = NULL
       WHERE id = ? AND user_id = ?`
    ).run(
      nudge.days, nudge.date, nudge.windowStart, nudge.windowEnd, tzOf(body, existing.tz),
      ack, tsOrNull(body.nextAt), id, userId
    );
    return serialize(selectOne(db, id, userId));
  }

  const s = parseSchedule(body);
  if (s.error) throw new HttpError(400, s.error);

  const ack = validTs(body.ackAt) ? body.ackAt : now();
  db.prepare(
    `UPDATE reminders
     SET kind = 'time', time = ?, days = ?, date = ?, lat = NULL, lon = NULL, radius_m = NULL, geo = NULL,
         window_start = NULL, window_end = NULL,
         tz = ?, ack_at = ?, next_at = ?, pushed_at = NULL, snooze_until = NULL
     WHERE id = ? AND user_id = ?`
  ).run(s.time, s.days, s.date, tzOf(body, existing.tz), ack, tsOrNull(body.nextAt), id, userId);
  return serialize(selectOne(db, id, userId));
}

// The background catch-up sweep — see server/notes.js's encryptGeo (same
// shape, different table/kind constraint).
function encryptGeo(db, userId, items) {
  if (!Array.isArray(items)) throw new HttpError(400, 'items must be an array');
  const ownedIds = new Set(
    db
      .prepare("SELECT id FROM reminders WHERE user_id = ? AND kind = 'location'")
      .all(userId)
      .map((r) => r.id)
  );
  for (const item of items) {
    if (!item || !ownedIds.has(Number(item.id)) || typeof item.geo !== 'string' || !item.geo) {
      throw new HttpError(400, 'every item must be { id, geo } for a location reminder you own');
    }
  }
  const update2 = db.prepare(
    'UPDATE reminders SET geo = ?, lat = NULL, lon = NULL, radius_m = NULL WHERE id = ?'
  );
  db.transaction(() => {
    for (const item of items) update2.run(item.geo, Number(item.id));
  })();
  return { ok: true, count: items.length };
}

function remove(db, userId, id) {
  const info = db.prepare('DELETE FROM reminders WHERE id = ? AND user_id = ?').run(id, userId);
  if (info.changes === 0) throw new HttpError(404, 'not found');
}

// "OK" on the popup — quiet until the reminder next goes off.
function ack(db, userId, id, body) {
  const at = validTs(body && body.at) ? body.at : now();
  const next = tsOrNull(body && body.nextAt);
  const info = db
    .prepare(
      `UPDATE reminders SET ack_at = ?, next_at = ?, pushed_at = NULL, snooze_until = NULL
       WHERE id = ? AND user_id = ?`
    )
    .run(at, next, id, userId);
  if (info.changes === 0) throw new HttpError(404, 'not found');
}

// Push the reminder out to an absolute instant (weeks/months).
function snooze(db, userId, id, body) {
  const until = tsOrNull(body && body.until);
  if (!until || Date.parse(until) <= Date.now()) {
    throw new HttpError(400, 'until must be a future timestamp');
  }
  const info = db
    .prepare(`UPDATE reminders SET snooze_until = ?, ack_at = ?, pushed_at = NULL WHERE id = ? AND user_id = ?`)
    .run(until, now(), id, userId);
  if (info.changes === 0) throw new HttpError(404, 'not found');
}

// Roll the next-ring instant forward.
function schedule(db, userId, id, body) {
  const next = tsOrNull(body && body.nextAt);
  const info = db
    .prepare(`UPDATE reminders SET next_at = ?, pushed_at = NULL WHERE id = ? AND user_id = ?`)
    .run(next, id, userId);
  if (info.changes === 0) throw new HttpError(404, 'not found');
}

// The client's foreground geofence watch calls this when the viewer crosses
// into a location reminder's radius. Returns { armed }.
function arrive(db, userId, id) {
  const r = db
    .prepare("SELECT * FROM reminders WHERE id = ? AND user_id = ? AND kind = 'location'")
    .get(id, userId);
  if (!r) throw new HttpError(404, 'not found');

  const pending =
    (r.next_at && (!r.ack_at || Date.parse(r.next_at) > Date.parse(r.ack_at))) ||
    (r.snooze_until && Date.parse(r.snooze_until) > Date.now());
  if (pending) return { armed: false };

  db.prepare(
    'UPDATE reminders SET next_at = ?, pushed_at = NULL, snooze_until = NULL WHERE id = ? AND user_id = ?'
  ).run(now(), id, userId);
  return { armed: true };
}

// --- Undo history -----------------------------------------------------------
// Create/edit/remove each record one 'reminder' history entry holding the
// whole raw row before and after (null = didn't exist), which
// routes/history.js's setReminderState writes back on undo/redo. Ack /
// snooze / schedule are routine and stay out of history.
const rawRow = (db, id, userId) => db.prepare('SELECT * FROM reminders WHERE id = ? AND user_id = ?').get(id, userId);

// The user-chosen settings of a raw row — what the alarm editor fills in.
function settingsOf(r) {
  return {
    kind: r.kind || 'time',
    time: r.time,
    days: r.days ? r.days.split(',').map(Number) : [],
    date: r.date,
    lat: r.lat,
    lon: r.lon,
    radiusM: r.radius_m,
    geo: r.geo,
    windowStart: r.window_start,
    windowEnd: r.window_end,
  };
}

function recordReminder(db, userId, before, after, verb) {
  const row = after || before;
  const note = db.prepare('SELECT title FROM notes WHERE id = ?').get(row.note_id);
  return history.record(
    userId,
    'reminder',
    { id: row.id, noteId: row.note_id, before: before || null, after: after || null },
    `${verb} reminder on "${note ? note.title : 'a note'}"`
  );
}

function createRecorded(db, userId, body) {
  const out = create(db, userId, body);
  const historyId = recordReminder(db, userId, null, rawRow(db, out.id, userId), 'Set');
  return { ...out, historyId };
}

function updateRecorded(db, userId, id, body) {
  const before = rawRow(db, id, userId);
  const out = update(db, userId, id, body);
  const after = rawRow(db, id, userId);
  const changed = JSON.stringify(settingsOf(before)) !== JSON.stringify(settingsOf(after));
  const historyId = changed ? recordReminder(db, userId, before, after, 'Changed') : null;
  return { ...out, historyId };
}

// Also remembers the removed reminder's settings on its note
// (notes.last_reminder) for the next "add reminder" on it.
function removeRecorded(db, userId, id) {
  const before = rawRow(db, id, userId);
  if (!before) throw new HttpError(404, 'not found');
  remove(db, userId, id);
  db.prepare('UPDATE notes SET last_reminder = ? WHERE id = ?').run(JSON.stringify(settingsOf(before)), before.note_id);
  return { ok: true, historyId: recordReminder(db, userId, before, null, 'Removed') };
}

module.exports = {
  list,
  create: createRecorded,
  update: updateRecorded,
  remove: removeRecorded,
  ack,
  snooze,
  schedule,
  arrive,
  encryptGeo,
  settingsOf,
};
