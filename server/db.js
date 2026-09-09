const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'notes.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_a INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    note_b INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(note_a, note_b),
    CHECK (note_a < note_b)
  );

  CREATE TABLE IF NOT EXISTS tabs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`);

const noteColumns = db.prepare('PRAGMA table_info(notes)').all();
if (!noteColumns.some((c) => c.name === 'pinned')) {
  db.exec('ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0');
}
// type: 'text' (default) | 'image' | 'audio' | 'contact' | 'app' — notes created
// as an attachment to another note via POST /api/notes/:id/attachments.
if (!noteColumns.some((c) => c.name === 'type')) {
  db.exec("ALTER TABLE notes ADD COLUMN type TEXT NOT NULL DEFAULT 'text'");
}
if (!noteColumns.some((c) => c.name === 'lat')) {
  db.exec('ALTER TABLE notes ADD COLUMN lat REAL');
}
if (!noteColumns.some((c) => c.name === 'lon')) {
  db.exec('ALTER TABLE notes ADD COLUMN lon REAL');
}
// The note this one was created/linked from, if any — answers "where did this come from".
if (!noteColumns.some((c) => c.name === 'created_from_note_id')) {
  db.exec('ALTER TABLE notes ADD COLUMN created_from_note_id INTEGER');
}
// Per type: image/audio -> "/uploads/<file>"; contact -> JSON {name,phone,email};
// app -> the launch URI (e.g. an intent:// or custom-scheme link).
if (!noteColumns.some((c) => c.name === 'attachment_path')) {
  db.exec('ALTER TABLE notes ADD COLUMN attachment_path TEXT');
}
// status: 'active' (default) | 'done' | 'deleted'. Set from the center-cell
// footer buttons: 'deleted' hides the note everywhere, 'done' dims it in place.
if (!noteColumns.some((c) => c.name === 'status')) {
  db.exec("ALTER TABLE notes ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
}

// --- Alarms: a note can carry a wake-up. alarm_time is HH:MM in the viewer's
// timezone. Recurring when alarm_days is a CSV of JS getDay() numbers (0=Sun);
// one-shot when alarm_days is '' and alarm_date is YYYY-MM-DD. Fire times are
// computed client-side (the server may run in another TZ); alarm_ack_at holds
// the last "OK" and the alarm is "triggered" while it predates the current
// occurrence. alarm_last_fired is retained unused (was a server-side memo).
// alarm_next_at: absolute UTC instant of the next ring, computed by the client
// in the viewer's timezone and rolled forward whenever the app is open.
// alarm_pushed_at: set by the server scheduler once it has pushed for the
// current alarm_next_at, so a ring is pushed at most once.
for (const [col, ddl] of [
  ['alarm_time', 'ALTER TABLE notes ADD COLUMN alarm_time TEXT'],
  ['alarm_days', "ALTER TABLE notes ADD COLUMN alarm_days TEXT NOT NULL DEFAULT ''"],
  ['alarm_date', 'ALTER TABLE notes ADD COLUMN alarm_date TEXT'],
  ['alarm_last_fired', 'ALTER TABLE notes ADD COLUMN alarm_last_fired TEXT'],
  ['alarm_ack_at', 'ALTER TABLE notes ADD COLUMN alarm_ack_at TEXT'],
  ['alarm_next_at', 'ALTER TABLE notes ADD COLUMN alarm_next_at TEXT'],
  ['alarm_pushed_at', 'ALTER TABLE notes ADD COLUMN alarm_pushed_at TEXT'],
]) {
  if (!noteColumns.some((c) => c.name === col)) db.exec(ddl);
}

// --- Multi-user (email identity only; no password/auth yet) ---
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  -- One row per graph navigation (centering a note). Raw material for the
  -- "probable next step" ranking, the "probable parent" back-slot, and the
  -- stats/colour features. from_note_id is null for jumps (search/pin/hash).
  CREATE TABLE IF NOT EXISTS nav_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    from_note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL,
    to_note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    via TEXT NOT NULL DEFAULT 'unknown',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX IF NOT EXISTS idx_nav_fwd ON nav_events (user_id, from_note_id, to_note_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_nav_back ON nav_events (user_id, to_note_id, from_note_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_nav_to ON nav_events (user_id, to_note_id, created_at);
`);

// Opaque per-user secret for the read-only home-screen widget feed
// (GET /api/widget?token=…). Provisioned lazily by GET /api/session.
const userCols = db.prepare('PRAGMA table_info(users)').all();
if (!userCols.some((c) => c.name === 'widget_token')) {
  db.exec('ALTER TABLE users ADD COLUMN widget_token TEXT');
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_widget_token ON users(widget_token)');

// Digest prefs: an opt-in scheduled push/email of the user's agenda (today +
// this week). server/digest-scheduler.js reads these hourly; the client owns
// the schedule TZ the same way reminders do. cadence 'off' | 'daily' | 'weekly';
// channel 'push' | 'email' | 'both'; hour is a local wall-clock hour 0-23.
const digestCols = [
  ["digest_cadence", "TEXT NOT NULL DEFAULT 'off'"],
  ['digest_hour', 'INTEGER NOT NULL DEFAULT 8'],
  ['digest_tz', 'TEXT'],
  ["digest_channel", "TEXT NOT NULL DEFAULT 'push'"],
  ['digest_last_sent_at', 'TEXT'],
];
for (const [name, decl] of digestCols) {
  if (!userCols.some((c) => c.name === name)) {
    db.exec(`ALTER TABLE users ADD COLUMN ${name} ${decl}`);
  }
}

// Web Push subscriptions — how the alarm scheduler reaches a user when their
// PWA is backgrounded/closed. One row per browser push endpoint.
db.exec(`
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`);

// Undo log: one row per reversible operation (link/unlink/rehome/create/update/
// status/pin). payload is JSON carrying whatever the undo needs (note ids, the
// pre-change title/content, the previous status…). undone_at is stamped once the
// entry has been reversed, after which its button is spent.
db.exec(`
  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    summary TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    undone_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_history_user ON history (user_id, id DESC);
`);

// Server-side sessions. The cookie (nico_sess) holds an opaque 256-bit id; this
// row is the only thing that authenticates a request. Replaces the old scheme
// where the cookie was the raw users.id and could be forged.
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    ua TEXT,
    ip_hash TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id, last_seen_at DESC);
`);

// Single-use magic-link login tokens. The URL carries the raw 32-byte secret;
// only its sha256 is stored here. Short-lived; consumed_at is stamped on use.
db.exec(`
  CREATE TABLE IF NOT EXISTS login_tokens (
    token_hash TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_login_tokens_email ON login_tokens (email);
`);

// notes/links/tabs predate multi-user — add the owner column idempotently.
for (const table of ['notes', 'links', 'tabs']) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === 'user_id')) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN user_id INTEGER REFERENCES users(id)`);
  }
}

// Backfill: the pre-multi-user database has one implicit owner. Seed that user
// once (override the address with SEED_USER_EMAIL) and claim every existing row.
let seededUsers = db.prepare('SELECT id FROM users ORDER BY id').all();
if (seededUsers.length === 0) {
  const { c: noteCount } = db.prepare('SELECT COUNT(*) AS c FROM notes').get();
  if (noteCount > 0) {
    const email = (process.env.SEED_USER_EMAIL || 'mikael.cromsjo@gmail.com').trim().toLowerCase();
    db.prepare('INSERT INTO users (email) VALUES (?)').run(email);
    seededUsers = db.prepare('SELECT id FROM users ORDER BY id').all();
  }
}
// Safety net for the window between this migration and the server restart that
// activates user-scoped writes: if there's exactly one user, adopt orphan rows.
if (seededUsers.length === 1) {
  const uid = seededUsers[0].id;
  for (const table of ['notes', 'links', 'tabs']) {
    db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id IS NULL`).run(uid);
  }
}

// --- Full-text search index over notes (FTS5, bundled with better-sqlite3).
// External-content table mirroring notes(title, content); kept in sync by
// triggers. All DDL is IF NOT EXISTS and the backfill is a no-op once populated,
// so this is safe to run on every boot like the rest of this file.
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    title, content,
    content='notes', content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
  );
  CREATE TRIGGER IF NOT EXISTS notes_fts_ai AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
  END;
  CREATE TRIGGER IF NOT EXISTS notes_fts_ad AFTER DELETE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, content)
      VALUES ('delete', old.id, old.title, old.content);
  END;
  CREATE TRIGGER IF NOT EXISTS notes_fts_au AFTER UPDATE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, content)
      VALUES ('delete', old.id, old.title, old.content);
    INSERT INTO notes_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
  END;
`);
// One-time index build from the existing rows (an external-content FTS table
// exposes every content rowid, so a "WHERE NOT IN" backfill is a no-op — use
// the built-in rebuild). Guarded by user_version; bump it to force a rebuild
// after any change to the notes_fts columns/tokenizer above.
if (db.pragma('user_version', { simple: true }) < 1) {
  db.exec("INSERT INTO notes_fts(notes_fts) VALUES('rebuild')");
  db.pragma('user_version = 1');
}

// --- Reminders: a note can carry one or more wake-ups. Supersedes the
// notes.alarm_* columns (those are no longer written — kept one release for
// rollback). time is HH:MM in the viewer's timezone; recurring when days is a
// CSV of JS getDay() numbers (0=Sun), one-shot when days='' and date is
// YYYY-MM-DD. Fire times are computed client-side (the box may run another TZ):
// next_at is the absolute UTC instant of the next ring, rolled forward by the
// client whenever the app is open. ack_at holds the last "OK" — the reminder is
// "triggered" while ack_at predates the current occurrence. pushed_at is stamped
// by server/alarm-scheduler.js once it has pushed for the current next_at, so a
// ring is pushed at most once. tz is the IANA zone captured at create time (for
// a future server-side digest fallback). snooze_until, when set, overrides
// next_at as the due instant and is cleared on ack.
db.exec(`
  CREATE TABLE IF NOT EXISTS reminders (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id      INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    time         TEXT NOT NULL,
    days         TEXT NOT NULL DEFAULT '',
    date         TEXT,
    tz           TEXT,
    next_at      TEXT,
    ack_at       TEXT,
    pushed_at    TEXT,
    snooze_until TEXT,
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX IF NOT EXISTS idx_reminders_note ON reminders (note_id);
  CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders (user_id, time);
  CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders (next_at) WHERE next_at IS NOT NULL;
`);

// One-time backfill of every armed notes.alarm_* row into reminders. Shares the
// user_version counter with the FTS rebuild above (1 = FTS built); to force
// either again bump past 2 and adjust the matching guard.
if (db.pragma('user_version', { simple: true }) < 2) {
  const armed = db
    .prepare(
      `SELECT id, user_id, alarm_time, alarm_days, alarm_date, alarm_ack_at, alarm_next_at, alarm_pushed_at
       FROM notes
       WHERE alarm_time IS NOT NULL AND user_id IS NOT NULL`
    )
    .all();
  const insReminder = db.prepare(
    `INSERT INTO reminders (note_id, user_id, time, days, date, ack_at, next_at, pushed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  db.transaction(() => {
    for (const n of armed) {
      insReminder.run(
        n.id,
        n.user_id,
        n.alarm_time,
        n.alarm_days || '',
        n.alarm_date,
        n.alarm_ack_at,
        n.alarm_next_at,
        n.alarm_pushed_at
      );
    }
  })();
  db.pragma('user_version = 2');
}

// Retention: navigation history is behavioural data — keep 90 days.
db.prepare(
  "DELETE FROM nav_events WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-90 days')"
).run();

// Retention: the undo log is only useful for recent moves — keep 30 days.
db.prepare(
  "DELETE FROM history WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')"
).run();

module.exports = db;
