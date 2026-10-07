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
// Byte size of the uploaded file for image/audio/file attachments — lets the
// client plan its offline attachment cache budget from a lightweight manifest
// instead of downloading every file just to learn its size. NULL for rows
// uploaded before this column existed; GET /api/notes/attachments-manifest
// backfills it lazily (stat the file once, then the value sticks).
if (!noteColumns.some((c) => c.name === 'attachment_size')) {
  db.exec('ALTER TABLE notes ADD COLUMN attachment_size INTEGER');
}
// status: 'active' (default) | 'waiting' | 'todo' | 'done' | 'deleted'. Set
// from the center-cell footer button, which cycles
// active -> waiting -> todo -> done -> active: 'deleted' hides the note
// everywhere, 'done' dims it in place, 'todo' flags it as an open thing to
// do (surfaced in the agenda + digest), 'waiting' flags it as blocked on
// something else (a GTD "waiting for" — link it to whoever/whatever it's
// waiting on like any other note; surfaced in the in-app agenda only, not
// pushed/emailed by the digest, since it isn't something to act on yet).
// Free TEXT, no CHECK constraint, so new values need no migration.
if (!noteColumns.some((c) => c.name === 'status')) {
  db.exec("ALTER TABLE notes ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
}
// Done-cascade bookkeeping (server/notes.js's setStatus): a note marked done
// *along with* an ancestor (the "also mark these done?" dialog) records that
// ancestor in done_with_note_id and its own pre-cascade status in
// done_prev_status, so reopening the ancestor can offer to reopen exactly
// those notes — back to what each was — and nothing that was already done
// on its own. Both cleared whenever the note's status is set directly.
// The settings of the last reminder removed from this note (JSON, same shape
// as server/reminders.js's serialize minus the schedule state), so the
// alarm editor can start from them when a reminder is added again.
if (!noteColumns.some((c) => c.name === 'last_reminder')) {
  db.exec('ALTER TABLE notes ADD COLUMN last_reminder TEXT');
}
if (!noteColumns.some((c) => c.name === 'done_with_note_id')) {
  db.exec('ALTER TABLE notes ADD COLUMN done_with_note_id INTEGER');
  db.exec('ALTER TABLE notes ADD COLUMN done_prev_status TEXT');
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

// Calendar subscription feed (GET /calendar.ics?token=…, server/calendar-feed.js).
// A token of its own, not widget_token: this URL gets stored on Google's/
// Apple's servers, and widget_token also authorises a write
// (/api/widget/location). calendar_fetched_at = last time anything polled the
// feed — the client hides per-reminder "Add to calendar" while it's recent.
for (const [name, decl] of [['calendar_token', 'TEXT'], ['calendar_fetched_at', 'TEXT']]) {
  if (!userCols.some((c) => c.name === name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${decl}`);
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_calendar_token ON users(calendar_token)');

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

// Zero-knowledge location encryption (docs/plan/08-offline-privacy.md,
// server/location.js) — a *separate* mechanism from content's migrate()/
// revert() ceremony, deliberately: unlike content, nothing writes location
// server-side that can't eventually encrypt it itself, so instead of a
// one-time batch, each of these three `geo` columns holds either NULL
// (still-plaintext lat/lon/etc — "pending") or a ciphertext blob (lat/lon
// cleared to NULL). A background sweep (public/app.js's
// sweepGeoEncryption()) catches up any pending row on every app open, for
// as long as the account has encryption on — this also naturally catches up
// an account that enabled encryption *before* this feature existed, with no
// separate migration step. See the risk note in the plan doc: the Android
// widget's own background GPS sampling (server/routes/widget.js's POST
// /location) has no crypto of its own, so a widget-authored point always
// starts pending; the web app's own opportunistic sampling encrypts inline
// and is never plaintext at rest at all.
if (!noteColumns.some((c) => c.name === 'geo')) {
  db.exec('ALTER TABLE notes ADD COLUMN geo TEXT');
}

// Zero-knowledge note-content encryption (docs/plan/08-offline-privacy.md,
// server/encryption.js). enc_salt/enc_iterations are the PBKDF2 parameters a
// device recorded at the "Set up encryption" ceremony — not secret, just the
// public half of key derivation. enc_enabled_at is set only once the
// one-time re-encryption migration has actually run; from that instant on
// `notes.content` is ciphertext for this user, account-wide, forever after
// (opt-in, and there is deliberately no server-side decrypt path — see the
// plan doc's recovery-key risk note).
const encCols = [
  ['enc_salt', 'TEXT'],
  ['enc_iterations', 'INTEGER'],
  ['enc_enabled_at', 'TEXT'],
];
for (const [name, decl] of encCols) {
  if (!userCols.some((c) => c.name === name)) {
    db.exec(`ALTER TABLE users ADD COLUMN ${name} ${decl}`);
  }
}

// Stamped once POST /api/onboarding/begin has wiped a fresh account's seeded
// sample graph — doubles as a one-time-use guard (see server/onboarding.js)
// so a repeat call can't be replayed against real notes created since.
if (!userCols.some((c) => c.name === 'onboarding_cleared_at')) {
  db.exec('ALTER TABLE users ADD COLUMN onboarding_cleared_at TEXT');
}

// Themes (see public/themes.js). users.theme_prefs = JSON { active, custom[] }
// for the account-wide app theme; notes.theme = JSON style for one note, and
// theme_children = 1 lets it cascade to that note's inferred sub notes.
// theme_images tracks the account's uploaded background images so they can be
// ownership-checked when a theme references one and swept once nothing does.
if (!userCols.some((c) => c.name === 'theme_prefs')) {
  db.exec('ALTER TABLE users ADD COLUMN theme_prefs TEXT');
}
const themeNoteCols = db.prepare('PRAGMA table_info(notes)').all();
if (!themeNoteCols.some((c) => c.name === 'theme')) {
  db.exec('ALTER TABLE notes ADD COLUMN theme TEXT');
}
if (!themeNoteCols.some((c) => c.name === 'theme_children')) {
  db.exec('ALTER TABLE notes ADD COLUMN theme_children INTEGER NOT NULL DEFAULT 0');
}
db.exec(`
  CREATE TABLE IF NOT EXISTS theme_images (
    path TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`);

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

// Server-side sessions. The cookie (nico_sess) holds an opaque 256-bit secret;
// this row is the only thing that authenticates a request. Replaces the old
// scheme where the cookie was the raw users.id and could be forged.
// `id` is sha256(secret) (see sessions.js's idFor), never the secret itself —
// same reasoning as login_tokens.token_hash: a leaked/backed-up copy of this
// table can't be replayed as a live cookie.
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

// purpose: 'login' (default) | 'delete-account'. A 'delete-account' token is
// minted by POST /api/account/delete-request and, when its emailed link is
// opened, triggers the irreversible account wipe instead of signing in.
const loginTokenCols = db.prepare('PRAGMA table_info(login_tokens)').all();
if (!loginTokenCols.some((c) => c.name === 'purpose')) {
  db.exec("ALTER TABLE login_tokens ADD COLUMN purpose TEXT NOT NULL DEFAULT 'login'");
}

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

// kind='location': a geofence reminder rather than a clock one. time/days/date
// are unused (time stored as ''); lat/lon/radius_m describe a circle. It sits
// armed with next_at NULL; the client's foreground watchPosition POSTs
// /api/alarms/:id/arrive on an outside->inside crossing, which stamps next_at =
// now so the normal "triggered / push" path fires. ack clears next_at again.
const reminderColumns = db.prepare('PRAGMA table_info(reminders)').all();
if (!reminderColumns.some((c) => c.name === 'kind')) {
  db.exec("ALTER TABLE reminders ADD COLUMN kind TEXT NOT NULL DEFAULT 'time'");
}
if (!reminderColumns.some((c) => c.name === 'lat')) {
  db.exec('ALTER TABLE reminders ADD COLUMN lat REAL');
}
if (!reminderColumns.some((c) => c.name === 'lon')) {
  db.exec('ALTER TABLE reminders ADD COLUMN lon REAL');
}
if (!reminderColumns.some((c) => c.name === 'radius_m')) {
  db.exec('ALTER TABLE reminders ADD COLUMN radius_m INTEGER');
}

// kind='anytime': a soft, untimed "nudge" — a day pattern (days/date, same as
// kind='time') but no clock minute the user committed to; time is stored as ''
// like kind='location'. window_start/window_end (HH:MM) bound the day-part the
// client is allowed to pick a fire minute from — the actual minute is chosen
// client-side per occurrence (server/db.js has no notion of it, same "server
// never computes fire times" split as everything else here) so it lands
// somewhere different each day rather than calcifying into a fixed time.
// Surfaced only in-app (toast/agenda/tint) — server/alarm-scheduler.js
// deliberately never pushes for this kind, so it never rings as a hard alarm.
if (!reminderColumns.some((c) => c.name === 'window_start')) {
  db.exec('ALTER TABLE reminders ADD COLUMN window_start TEXT');
}
if (!reminderColumns.some((c) => c.name === 'window_end')) {
  db.exec('ALTER TABLE reminders ADD COLUMN window_end TEXT');
}
// Zero-knowledge location encryption — see the `notes.geo` comment above.
// Only meaningful for kind='location'; NULL (plaintext lat/lon/radius_m,
// possibly "pending" — see above) or a ciphertext blob (lat/lon/radius_m
// cleared to NULL).
if (!reminderColumns.some((c) => c.name === 'geo')) {
  db.exec('ALTER TABLE reminders ADD COLUMN geo TEXT');
}

// One-time backfill of every armed notes.alarm_* row into reminders. Shares the
// user_version counter with the FTS rebuild above (1 = FTS built) and the
// file→image/audio fix-up at the bottom (3); to force one again bump past the
// highest and adjust the matching guard.
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

// --- Import & Capture: bulk import of notes from other tools (Markdown folder /
// Obsidian vault for now). import_jobs tracks one background run; the runner in
// server/importer.js processes the uploaded archive in-process (like the
// schedulers) and writes progress into `totals`. import_source maps a stable
// per-format key (the file's relative path) to the note it created, so a
// re-import UPDATES the note instead of duplicating it — it never deletes.
db.exec(`
  CREATE TABLE IF NOT EXISTS import_jobs (
    id          TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    format      TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    totals      TEXT NOT NULL DEFAULT '{}',
    error       TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    finished_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_import_jobs_user ON import_jobs (user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS import_source (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    format     TEXT NOT NULL,
    source_key TEXT NOT NULL,
    note_id    INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (user_id, format, source_key)
  );
`);

// --- Location trail: periodic (not continuous) GPS samples appended by the
// Android widget app's own ~30-min background refresh tick — notes-android
// has no foreground-service GPS session, so this is deliberately coarse,
// spaced points, not a live track. POST /api/widget/location (token-authed,
// server/routes/widget.js) inserts one row per tick; GET /api/location-log
// (cookie-authed, server/routes/location.js) feeds the web app's map-overlay
// trail toggle. Unrelated to notes.lat/lon (a point on a specific note) or
// reminders.kind='location' (a geofence) — this is the device's own position
// over time, not tied to any note.
db.exec(`
  CREATE TABLE IF NOT EXISTS location_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lat         REAL NOT NULL,
    lon         REAL NOT NULL,
    accuracy_m  REAL,
    recorded_at TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX IF NOT EXISTS idx_location_log_user ON location_log (user_id, recorded_at);
`);

// Zero-knowledge location encryption — see the `notes.geo` comment above.
// `lat`/`lon` are NOT NULL from the CREATE TABLE above (never edit that
// block — see this file's standing convention), so unlike notes/reminders
// this can't null them out once encrypted: server/location.js's
// encryptGeo() instead writes the placeholder (0, 0) into lat/lon (clearing
// accuracy_m to NULL) once `geo` is set. **Every reader must check `geo`
// first** — (0, 0) here never means "Gulf of Guinea", it means "look at geo
// instead". A row is "pending" (still real plaintext lat/lon) while geo IS NULL.
const locationLogColumns = db.prepare('PRAGMA table_info(location_log)').all();
if (!locationLogColumns.some((c) => c.name === 'geo')) {
  db.exec('ALTER TABLE location_log ADD COLUMN geo TEXT');
}

// Retention: navigation history is behavioural data — keep 90 days.
db.prepare(
  "DELETE FROM nav_events WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-90 days')"
).run();

// Retention: the undo log is only useful for recent moves — keep 30 days.
db.prepare(
  "DELETE FROM history WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')"
).run();

// Retention: the GPS trail is behavioural data too — keep 90 days (same window
// as nav_events).
db.prepare(
  "DELETE FROM location_log WHERE recorded_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-90 days')"
).run();

// --- Shared note spaces (server/shares.js) ---------------------------------
// A share is an isolated space of notes+links, separate from any owner's
// personal graph. Membership is an explicit, static fact (notes.share_id +
// share_members below) — deliberately NEVER derived by walking the link
// graph from a root note, because that boundary would be unstable: a private
// note already links into most subtrees in a small graph (a day-one leak),
// and any later link edit would silently grow what a viewer can reach (an
// ongoing leak) with no action that looked like "sharing". See
// docs/plan (shared-note-space plan) for the full reasoning.
db.exec(`
  CREATE TABLE IF NOT EXISTS shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  -- role: 'owner' (the creator; can invite/remove members, manage the viewer
  -- token) | 'editor' (can read/write notes+links in the share). A viewer has
  -- no row here at all — see share_viewer_tokens below; viewer access is pure
  -- token possession, never "membership".
  CREATE TABLE IF NOT EXISTS share_members (
    share_id INTEGER NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role     TEXT NOT NULL DEFAULT 'editor',
    added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (share_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_share_members_user ON share_members(user_id);

  -- One raw (unhashed) opaque token per share — same trust model as
  -- users.widget_token (server/widget-token.js): a read-only feed link, not
  -- an auth secret guarding writes. One live viewer link per share; rotate to
  -- invalidate.
  CREATE TABLE IF NOT EXISTS share_viewer_tokens (
    share_id   INTEGER PRIMARY KEY REFERENCES shares(id) ON DELETE CASCADE,
    token      TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_share_viewer_tokens_token ON share_viewer_tokens(token);

  -- Editor invite links: a parallel table to login_tokens (not a new
  -- login_tokens "purpose", unlike account.js's 'delete-account') because an
  -- invite needs share_id + role, which don't belong on every other purpose.
  -- Same hash+consume-once idiom as login_tokens/routes/auth.js.
  CREATE TABLE IF NOT EXISTS share_invites (
    token_hash  TEXT PRIMARY KEY,
    share_id    INTEGER NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'editor',
    invited_by  INTEGER NOT NULL REFERENCES users(id),
    created_at  TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    consumed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_share_invites_share ON share_invites(share_id);

  -- Cross-scope reference: a personal note pointing at a shared note (or vice
  -- versa) is NEVER a links row — see server/links.js's same-scope check.
  -- Every reader of this table filters on user_id = the requesting user,
  -- always (server/shares.js's listRefsForNote); that IS the leak guard, not
  -- a permission check layered on top of a shared query.
  CREATE TABLE IF NOT EXISTS personal_refs (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    personal_note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    share_id         INTEGER NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
    shared_note_id   INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(user_id, personal_note_id, shared_note_id)
  );
  CREATE INDEX IF NOT EXISTS idx_personal_refs_personal ON personal_refs(user_id, personal_note_id);
  CREATE INDEX IF NOT EXISTS idx_personal_refs_shared ON personal_refs(user_id, shared_note_id);
`);

// notes.share_id: NULL = personal (unchanged behaviour, the default for every
// existing row). Once set, that row's user_id becomes creator provenance
// only — access is resolved via share_members, never user_id (see
// server/shares.js's resolveNoteAccess).
const shareNoteColumns = db.prepare('PRAGMA table_info(notes)').all();
if (!shareNoteColumns.some((c) => c.name === 'share_id')) {
  db.exec('ALTER TABLE notes ADD COLUMN share_id INTEGER REFERENCES shares(id)');
}
db.exec('CREATE INDEX IF NOT EXISTS idx_notes_share ON notes(share_id)');

// The user's explicitly marked "graph root" — a stable anchor for
// server/hierarchy.js's rootedDescendants (used by server/shares.js's
// candidateLineage to decide what "share this note" actually pulls in).
// NULL = fall back to the same inferred "most globally significant note" as
// probableRoot (server/notes.js's getRootNote).
if (!userCols.some((c) => c.name === 'root_note_id')) {
  db.exec('ALTER TABLE users ADD COLUMN root_note_id INTEGER REFERENCES notes(id)');
}

// Per-link classification: 'child' (a real parent-child edge — treat it as
// hierarchy) | 'cross' (a lateral reference between two already-connected
// areas — never treat it as hierarchy, no matter how the graph reshapes
// around it) | NULL (unmarked — let server/hierarchy.js's buildRootedTree
// guess dynamically, the original behavior). Guessed once at link-creation
// time (server/links.js's create/guessLinkKind, server/notes.js's
// create/createAttachmentNote) and user-correctable afterward
// (PUT /api/links/kind) — a stored, stable verdict instead of an
// always-recomputed one, so it can't silently flip as the graph reshapes
// around it, and a wrong guess only needs fixing once.
const linksCols = db.prepare('PRAGMA table_info(links)').all();
if (!linksCols.some((c) => c.name === 'kind')) {
  db.exec('ALTER TABLE links ADD COLUMN kind TEXT');
}

// Mail-in (server/mail-ingest.js): one row per inbound message seen at the
// ingest address, keyed by Gmail's stable X-GM-MSGID so a restart/re-poll
// never imports the same mail twice. status: 'created' (note_id set) |
// 'pending' (sender couldn't be authenticated — a confirm link was mailed to
// the account's own address; token_hash = sha256 of that link's secret, same
// idiom as login_tokens) | 'ignored' (unknown sender / rate limited, reason
// says which) | 'failed'. The message itself is never stored here: a
// confirmed pending row re-fetches it from IMAP. The '__cursor__' row's
// received_at is the instant ingest was first enabled — older mail is never
// imported.
db.exec(`
  CREATE TABLE IF NOT EXISTS mail_ingest (
    message_key TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    from_addr TEXT,
    subject TEXT,
    status TEXT NOT NULL,
    reason TEXT,
    note_id INTEGER,
    token_hash TEXT,
    received_at TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT,
    consumed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_mail_ingest_token ON mail_ingest (token_hash);
  CREATE INDEX IF NOT EXISTS idx_mail_ingest_user ON mail_ingest (user_id, created_at);
`);

// One-time: "file" attachment notes that are really a photo/recording become
// image/audio notes — the same rule every upload now applies
// (attachment-kind.js's uploadedFileType, judged by the stored extension).
// No updated_at bump: clients take the server row's type on the next list.
if (db.pragma('user_version', { simple: true }) < 3) {
  const { uploadedFileType } = require('./attachment-kind');
  const rows = db
    .prepare("SELECT id, attachment_path FROM notes WHERE type = 'file' AND attachment_path LIKE '/uploads/%'")
    .all();
  const setType = db.prepare('UPDATE notes SET type = ? WHERE id = ?');
  db.transaction(() => {
    for (const r of rows) {
      const type = uploadedFileType({ filename: path.basename(r.attachment_path), mimetype: '' });
      if (type !== 'file') setType.run(type, r.id);
    }
  })();
  db.pragma('user_version = 3');
}

module.exports = db;
