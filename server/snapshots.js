// Account snapshots for undoing a backup restore (routes/account.js's
// POST /import). The importer's own format is lossy (it predates themes,
// link kinds, refs, done-cascade fields, ...), so undo can't just re-import
// an export — instead a restore first copies the whole database with
// VACUUM INTO, and undo swaps this account's rows back from that copy, ids
// and all. Snapshots live next to the database (so a DB_PATH test copy
// never writes into the real data/), newest SNAPSHOTS_KEPT per account.
const fs = require('fs');
const path = require('path');
const db = require('./db');

// Per account and per kind: 'manual' (Settings -> "Create backup") and the
// automatic ones a restore takes (pre-/post-restore) are pruned separately,
// so restoring a few times can never push out a backup the user made.
const SNAPSHOTS_KEPT = 10;
const FILE_RE = /^(\d+)-(\d+)-(manual|pre-restore|post-restore)\.db$/;
const dir = path.join(path.dirname(db.name), 'snapshots');

function parseName(file) {
  const m = FILE_RE.exec(path.basename(String(file)));
  return m ? { userId: Number(m[1]), at: Number(m[2]), label: m[3] } : null;
}

function snapshotPath(file) {
  return path.join(dir, path.basename(String(file)));
}

function snapshotExists(file) {
  return Boolean(file) && fs.existsSync(snapshotPath(file));
}

// Whole-database copy; returns the file's basename (what history stores).
// Must run outside a transaction (VACUUM can't run inside one).
function takeSnapshot(userId, label) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = `${userId}-${Date.now()}-${label}.db`;
  db.prepare('VACUUM INTO ?').run(snapshotPath(file));
  fs.chmodSync(snapshotPath(file), 0o600);
  prune(userId);
  return file;
}

function prune(userId) {
  const mine = fs
    .readdirSync(dir)
    .map((f) => ({ f, info: parseName(f) }))
    .filter((x) => x.info && x.info.userId === userId)
    .sort((a, b) => b.info.at - a.info.at);
  for (const manual of [true, false]) {
    const group = mine.filter((x) => (x.info.label === 'manual') === manual);
    for (const { f } of group.slice(SNAPSHOTS_KEPT)) fs.unlink(path.join(dir, f), () => {});
  }
}

// This account's snapshots, newest first: { id (the file name), kind, createdAt, bytes }.
function listSnapshots(userId) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((f) => ({ f, info: parseName(f) }))
    .filter((x) => x.info && x.info.userId === userId)
    .sort((a, b) => b.info.at - a.info.at)
    .map(({ f, info }) => ({
      id: f,
      kind: info.label,
      createdAt: new Date(info.at).toISOString(),
      bytes: fs.statSync(path.join(dir, f)).size,
    }));
}

// A snapshot id from a client is only usable if it's one of this user's.
function ownsSnapshot(userId, file) {
  const info = parseName(file);
  return Boolean(info && info.userId === userId && path.basename(String(file)) === String(file) && snapshotExists(file));
}

function deleteSnapshot(userId, file) {
  if (!ownsSnapshot(userId, file)) return false;
  fs.unlinkSync(snapshotPath(file));
  return true;
}

function commonCols(table) {
  const snap = new Set(db.prepare(`PRAGMA snap.table_info(${table})`).all().map((c) => c.name));
  return db
    .prepare(`PRAGMA main.table_info(${table})`)
    .all()
    .map((c) => c.name)
    .filter((c) => snap.has(c));
}

// Copy rows of `table` from the snapshot, `where` filtering snap rows (alias s).
function copyRows(table, where, params, { orIgnore = false, override = {} } = {}) {
  const cols = commonCols(table);
  const sel = cols.map((c) => override[c] || `s.${c}`).join(', ');
  db.prepare(
    `INSERT ${orIgnore ? 'OR IGNORE ' : ''}INTO main.${table} (${cols.join(', ')})
     SELECT ${sel} FROM snap.${table} s WHERE ${where}`
  ).run(...params);
}

// Replace this account's graph (its notes and everything hanging off them:
// links, refs, tabs, reminders, nav history, import bookkeeping, undo log,
// digest prefs + home note) with the snapshot's. Other accounts' rows are
// never touched, except refs/links that point at this account's notes.
function restoreUserFromSnapshot(userId, file) {
  if (!snapshotExists(file)) throw new Error('that snapshot is no longer available');
  db.prepare('ATTACH DATABASE ? AS snap').run(snapshotPath(file));
  try {
    db.transaction(() => {
      db.pragma('defer_foreign_keys = ON');
      const mine = 'SELECT id FROM main.notes WHERE user_id = ?';
      const u = userId;

      // --- clear the current graph ---
      db.prepare(`UPDATE main.users SET root_note_id = NULL WHERE root_note_id IN (${mine})`).run(u);
      db.prepare(
        `DELETE FROM main.personal_refs WHERE user_id = ? OR personal_note_id IN (${mine}) OR shared_note_id IN (${mine})`
      ).run(u, u, u);
      db.prepare(`DELETE FROM main.links WHERE note_a IN (${mine}) OR note_b IN (${mine})`).run(u, u);
      db.prepare(`DELETE FROM main.tabs WHERE user_id = ? OR note_id IN (${mine})`).run(u, u);
      db.prepare(`DELETE FROM main.reminders WHERE user_id = ? OR note_id IN (${mine})`).run(u, u);
      db.prepare(`DELETE FROM main.nav_events WHERE user_id = ? OR to_note_id IN (${mine})`).run(u, u);
      db.prepare(`UPDATE main.nav_events SET from_note_id = NULL WHERE from_note_id IN (${mine})`).run(u);
      db.prepare(`DELETE FROM main.import_source WHERE user_id = ? OR note_id IN (${mine})`).run(u, u);
      db.prepare('DELETE FROM main.history WHERE user_id = ?').run(u);
      db.prepare('DELETE FROM main.notes WHERE user_id = ?').run(u);

      // --- copy the snapshot's back, original ids included ---
      const noteOk = (col) => `${col} IN (SELECT id FROM main.notes)`;
      copyRows('notes', 's.user_id = ?', [u], {
        // A space dissolved since the snapshot: the note comes back personal.
        override: { share_id: 'CASE WHEN s.share_id IN (SELECT id FROM main.shares) THEN s.share_id END' },
      });
      copyRows('links', `${noteOk('s.note_a')} AND ${noteOk('s.note_b')} AND (s.note_a IN (${mine}) OR s.note_b IN (${mine}))`, [u, u], {
        orIgnore: true,
      });
      copyRows(
        'personal_refs',
        `${noteOk('s.personal_note_id')} AND ${noteOk('s.shared_note_id')}
         AND s.share_id IN (SELECT id FROM main.shares) AND s.user_id IN (SELECT id FROM main.users)
         AND (s.user_id = ? OR s.personal_note_id IN (${mine}) OR s.shared_note_id IN (${mine}))`,
        [u, u, u],
        { orIgnore: true }
      );
      copyRows('tabs', `s.user_id = ? AND ${noteOk('s.note_id')}`, [u], { orIgnore: true });
      copyRows('reminders', `s.user_id = ? AND ${noteOk('s.note_id')}`, [u], { orIgnore: true });
      copyRows('nav_events', `s.user_id = ? AND ${noteOk('s.to_note_id')}`, [u], {
        orIgnore: true,
        override: { from_note_id: `CASE WHEN ${noteOk('s.from_note_id')} THEN s.from_note_id END` },
      });
      copyRows('import_source', `s.user_id = ? AND ${noteOk('s.note_id')}`, [u], { orIgnore: true });
      copyRows('history', 's.user_id = ?', [u], { orIgnore: true });

      const prefs = db
        .prepare(
          `SELECT digest_cadence, digest_hour, digest_tz, digest_channel, root_note_id FROM snap.users WHERE id = ?`
        )
        .get(u);
      if (prefs) {
        const rootOk = prefs.root_note_id != null && db.prepare('SELECT 1 FROM main.notes WHERE id = ?').get(prefs.root_note_id);
        db.prepare(
          `UPDATE main.users SET digest_cadence = ?, digest_hour = ?, digest_tz = ?, digest_channel = ?, root_note_id = ?
           WHERE id = ?`
        ).run(prefs.digest_cadence, prefs.digest_hour, prefs.digest_tz, prefs.digest_channel, rootOk ? prefs.root_note_id : null, u);
      }
    })();
  } finally {
    db.prepare('DETACH DATABASE snap').run();
  }
}

module.exports = {
  takeSnapshot,
  restoreUserFromSnapshot,
  snapshotExists,
  listSnapshots,
  ownsSnapshot,
  deleteSnapshot,
};
