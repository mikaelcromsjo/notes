// Pure location-log logic — extracted the same way milestone 1 did notes/
// links/tabs/reminders (docs/plan/08-offline-privacy.md §3.1), plus the
// location-encryption sweep (see server/db.js's `notes.geo` comment for the
// overall design: unlike content, there's no one-time ceremony here — a
// background pass just catches up whatever is still plaintext).
const { HttpError } = require('./http-error');

const DEFAULT_DAYS = 14;
const MAX_DAYS = 90; // matches the location_log retention window in db.js
const MAX_POINTS = 3000; // sanity cap — 30-min samples over 90 days is ~4300 max

// Feeds the web app's map-overlay trail toggle. A row is either still
// plaintext (`geo` null, real `lat`/`lon`/`accuracy`) or encrypted (`geo`
// set, `lat`/`lon` are the (0, 0) placeholder — see db.js — `accuracy` null).
// Always returns both so the client can tell which is which; it decrypts
// `geo` when present and otherwise uses lat/lon as-is (also how it finds
// what's still pending for encryptGeo below).
function list(db, userId, days) {
  let d = Number(days);
  if (!Number.isFinite(d) || d <= 0) d = DEFAULT_DAYS;
  d = Math.min(d, MAX_DAYS);

  return db
    .prepare(
      `SELECT id, lat, lon, accuracy_m AS accuracy, recorded_at AS recordedAt, geo
       FROM location_log
       WHERE user_id = ? AND recorded_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)
       ORDER BY recorded_at ASC
       LIMIT ?`
    )
    .all(userId, `-${d} days`, MAX_POINTS);
}

// One periodic GPS sample (server/routes/widget.js's POST /location, or the
// web app's own opportunistic sampling through the same route — see
// public/app.js's maybeLogTrailPoint). `geo`, when given, is already
// encrypted client-side {lat, lon, accuracy} — the widget itself can never
// produce this (no crypto of its own), only the web app can.
function insert(db, userId, { lat, lon, accuracy, recordedAt, geo }) {
  if (geo) {
    db.prepare(
      'INSERT INTO location_log (user_id, lat, lon, accuracy_m, recorded_at, geo) VALUES (?, 0, 0, NULL, ?, ?)'
    ).run(userId, recordedAt, geo);
    return;
  }
  db.prepare(
    'INSERT INTO location_log (user_id, lat, lon, accuracy_m, recorded_at) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, lat, lon, accuracy, recordedAt);
}

// The background catch-up sweep — see server/notes.js's encryptGeo (same
// shape). Writes the (0, 0) placeholder into lat/lon (db.js's `notes.geo`
// comment explains why: location_log.lat/lon are NOT NULL from the original
// CREATE TABLE) and clears accuracy_m.
function encryptGeo(db, userId, items) {
  if (!Array.isArray(items)) throw new HttpError(400, 'items must be an array');
  const ownedIds = new Set(
    db.prepare('SELECT id FROM location_log WHERE user_id = ?').all(userId).map((r) => r.id)
  );
  for (const item of items) {
    if (!item || !ownedIds.has(Number(item.id)) || typeof item.geo !== 'string' || !item.geo) {
      throw new HttpError(400, 'every item must be { id, geo } for a location_log row you own');
    }
  }
  const update = db.prepare(
    'UPDATE location_log SET geo = ?, lat = 0, lon = 0, accuracy_m = NULL WHERE id = ?'
  );
  db.transaction(() => {
    for (const item of items) update.run(item.geo, Number(item.id));
  })();
  return { ok: true, count: items.length };
}

module.exports = { list, insert, encryptGeo };
