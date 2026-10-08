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
    track: r.track || 0,
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
              r.window_start, r.window_end, r.track, r.tz, r.ack_at, r.next_at, r.snooze_until, n.title,
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
  const track = [0, 1, 2].includes(Number(body.track)) ? Number(body.track) : 0;
  return { days: pattern.days, date: pattern.date, windowStart, windowEnd, track };
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
        `INSERT INTO reminders (note_id, user_id, kind, time, days, date, window_start, window_end, track, tz, ack_at, next_at)
         VALUES (?, ?, 'anytime', '', ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        note.id, userId, nudge.days, nudge.date, nudge.windowStart, nudge.windowEnd, nudge.track,
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
           window_start = ?, window_end = ?, track = ?, tz = ?, ack_at = ?, next_at = ?,
           pushed_at = NULL, snooze_until = NULL
       WHERE id = ? AND user_id = ?`
    ).run(
      nudge.days, nudge.date, nudge.windowStart, nudge.windowEnd, nudge.track, tzOf(body, existing.tz),
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

// --- Outcome log (reminder_events, see db.js) ---------------------------------
const OUTCOMES = new Set(['done', 'skip']);

// 'YYYY-MM-DD' of instant `at` on the wall calendar of `tz` (UTC if unknown).
function localDay(at, tz) {
  const fmt = (zone) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
      new Date(at)
    );
  try {
    return fmt(tz || 'UTC');
  } catch {
    return fmt('UTC');
  }
}

function logEvent(db, r, userId, outcome, at) {
  db.prepare(
    `INSERT INTO reminder_events (reminder_id, note_id, user_id, outcome, day, at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(r.id, r.note_id, userId, outcome, localDay(at, r.tz), at);
}

const ownRow = (db, id, userId) =>
  db.prepare('SELECT id, note_id, tz FROM reminders WHERE id = ? AND user_id = ?').get(id, userId);

// Done / Skip — quiet until the reminder next goes off. `outcome` defaults to
// 'done' (what the old one-button "OK" meant).
function ack(db, userId, id, body) {
  const at = validTs(body && body.at) ? body.at : now();
  const next = tsOrNull(body && body.nextAt);
  const outcome = OUTCOMES.has(body && body.outcome) ? body.outcome : 'done';
  const r = ownRow(db, id, userId);
  if (!r) throw new HttpError(404, 'not found');
  db.transaction(() => {
    db.prepare(
      `UPDATE reminders SET ack_at = ?, next_at = ?, pushed_at = NULL, snooze_until = NULL
       WHERE id = ? AND user_id = ?`
    ).run(at, next, id, userId);
    logEvent(db, r, userId, outcome, at);
  })();
}

// Push the reminder out to an absolute instant (weeks/months).
function snooze(db, userId, id, body) {
  const until = tsOrNull(body && body.until);
  if (!until || Date.parse(until) <= Date.now()) {
    throw new HttpError(400, 'until must be a future timestamp');
  }
  const r = ownRow(db, id, userId);
  if (!r) throw new HttpError(404, 'not found');
  const at = validTs(body && body.at) ? body.at : now();
  db.transaction(() => {
    db.prepare(`UPDATE reminders SET snooze_until = ?, ack_at = ?, pushed_at = NULL WHERE id = ? AND user_id = ?`).run(
      until,
      now(),
      id,
      userId
    );
    logEvent(db, r, userId, 'snooze', at);
  })();
}

// "How did it go?" 1-5 on a 'done' event, found by the ack's own `at`.
function rate(db, userId, id, body) {
  const rating = Number(body && body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, 'rating must be 1-5');
  if (!validTs(body && body.at)) throw new HttpError(400, 'at required');
  const info = db
    .prepare(
      `UPDATE reminder_events SET rating = ?
       WHERE reminder_id = ? AND user_id = ? AND at = ? AND outcome = 'done'`
    )
    .run(rating, id, userId, body.at);
  if (info.changes === 0) throw new HttpError(404, 'not found');
}

// --- Practice stats -----------------------------------------------------------
// Per-day series for one reminder over [from, to] (local 'YYYY-MM-DD', its own
// tz), counted from its first logged answer — days before the log existed
// aren't "missed". Each day: { day, state, rating, snoozes } where state is
// 'done' | 'skip' | 'missed' (scheduled, no answer) | 'open' (today, not
// answered yet) | null (not scheduled that day). Done wins over skip on a
// day with both; `rating` = that day's latest rating.
function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function firstLoggedDay(db, r) {
  return db.prepare('SELECT MIN(day) AS d FROM reminder_events WHERE reminder_id = ?').get(r.id).d;
}

function daySeries(db, r, from, to, nowDate = new Date()) {
  const first = firstLoggedDay(db, r);
  if (!first) return [];
  const today = localDay(nowDate.toISOString(), r.tz);
  if (from < first) from = first;
  if (to > today) to = today;
  const pattern = r.days ? String(r.days).split(',').map(Number) : [];
  const byDay = new Map();
  for (const e of db
    .prepare('SELECT day, outcome, rating FROM reminder_events WHERE reminder_id = ? AND day >= ? AND day <= ? ORDER BY at')
    .all(r.id, from, to)) {
    const d = byDay.get(e.day) || { done: false, skip: false, rating: null, snoozes: 0 };
    if (e.outcome === 'done') d.done = true;
    else if (e.outcome === 'skip') d.skip = true;
    else if (e.outcome === 'snooze') d.snoozes++;
    if (e.rating != null) d.rating = e.rating;
    byDay.set(e.day, d);
  }
  const out = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const [y, m, d] = day.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const ev = byDay.get(day);
    const scheduled = pattern.length ? pattern.includes(dow) : r.date === day;
    let state = null;
    if (ev && ev.done) state = 'done';
    else if (ev && ev.skip) state = 'skip';
    else if (scheduled) state = day === today ? 'open' : 'missed';
    out.push({ day, state, rating: ev ? ev.rating : null, snoozes: ev ? ev.snoozes : 0 });
  }
  return out;
}

// Totals over a series: `scheduled` = answered + missed days (an unanswered
// today doesn't count yet), `streak` = consecutive done days back from the
// latest answered one (an open today doesn't break it), `bestStreak`.
function summarize(series) {
  let done = 0, skip = 0, missed = 0, snoozes = 0, streak = 0, best = 0, run = 0;
  const ratings = [];
  for (const d of series) {
    snoozes += d.snoozes;
    if (d.rating != null) ratings.push(d.rating);
    if (d.state === 'done') {
      done++;
      run++;
      best = Math.max(best, run);
    } else if (d.state === 'skip' || d.state === 'missed') {
      if (d.state === 'skip') skip++;
      else missed++;
      run = 0;
    }
  }
  for (let i = series.length - 1; i >= 0; i--) {
    const st = series[i].state;
    if (st === 'open' || st === null) continue;
    if (st !== 'done') break;
    streak++;
  }
  const avgRating = ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;
  return { done, skip, missed, scheduled: done + skip + missed, snoozes, streak, bestStreak: best, avgRating };
}

// Last 7 days (today included) — the widget tile and the digest's Practice
// line. null when nothing was ever logged.
function weekStats(db, r, nowDate = new Date()) {
  const today = localDay(nowDate.toISOString(), r.tz);
  const series = daySeries(db, r, addDays(today, -6), today, nowDate);
  if (!series.length) return null;
  return { ...summarize(series), strip: series.map((d) => d.state) };
}

// GET /api/alarms/:id/stats?range=month|year|all — the in-app statistics view.
const RANGE_DAYS = { month: 30, year: 365 };
function stats(db, userId, id, query, nowDate = new Date()) {
  const r = db.prepare('SELECT id, days, date, tz FROM reminders WHERE id = ? AND user_id = ?').get(id, userId);
  if (!r) throw new HttpError(404, 'not found');
  const range = RANGE_DAYS[query && query.range] ? query.range : query && query.range === 'all' ? 'all' : 'month';
  const today = localDay(nowDate.toISOString(), r.tz);
  const from = range === 'all' ? firstLoggedDay(db, r) || today : addDays(today, -(RANGE_DAYS[range] - 1));
  const series = daySeries(db, r, from, today, nowDate);
  return { range, today, days: series, summary: summarize(series) };
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
    track: r.track || 0,
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
  rate,
  weekStats,
  stats,
  schedule,
  arrive,
  encryptGeo,
  settingsOf,
};
