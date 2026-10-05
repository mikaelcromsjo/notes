// Exact account backups. Two kinds of file, one restore path:
//   - server snapshots (Settings -> "Create backup", and the automatic undo
//     point every restore takes first): a VACUUM INTO copy of the whole
//     database, kept next to it in snapshots/ — trusted;
//   - account.db inside a downloaded backup .zip (routes/account.js's
//     export): only this account's rows (writeAccountDb) — untrusted once
//     it comes back as an upload, so restore re-validates it.
// restoreUserFromSnapshot reads either through its own read-only
// connection and copies the columns both sides have, so a backup made
// before a column existed still restores (that column gets its default —
// analyzeSnapshot reports which). New *columns* need nothing here; a new
// *table* that points at notes must be added below (clearCurrent +
// loadRows + writeAccountDb), or a restore silently leaves it out.
// Snapshots live next to the database (so a DB_PATH test copy never writes
// into the real data/).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const db = require('./db');
const themes = require('../public/themes');

// Per account and per kind: 'manual' and the automatic ones a restore takes
// (pre-/post-restore) are pruned separately, so restoring a few times can
// never push out a backup the user made.
const SNAPSHOTS_KEPT = 10;
const FILE_RE = /^(\d+)-(\d+)-(manual|pre-restore|post-restore)\.db$/;
const dir = path.join(path.dirname(db.name), 'snapshots');
const stagingDir = path.join(dir, 'staging');
const STAGING_TTL_MS = 60 * 60 * 1000;

// Every table a restore replaces, in insert order (notes first).
const TABLES = ['notes', 'links', 'personal_refs', 'tabs', 'reminders', 'nav_events', 'import_source', 'history'];
// The users columns that travel with an account backup.
const USER_COLS = ['digest_cadence', 'digest_hour', 'digest_tz', 'digest_channel', 'theme_prefs', 'root_note_id'];
const ATTACHMENT_TYPES = new Set(['image', 'audio', 'file']);
const NOTE_STATUSES = new Set(['active', 'waiting', 'todo', 'done', 'deleted']);

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

// --- Staging: an uploaded backup's account.db waits here between "check"
// and "apply" (routes/account.js), at most STAGING_TTL_MS. ---
// Expired staged uploads (a restore checked but never applied) and scratch
// files — run on each new upload and at server start.
function cleanStaging() {
  if (!fs.existsSync(stagingDir)) return;
  for (const f of fs.readdirSync(stagingDir)) {
    const p = path.join(stagingDir, f);
    try {
      if (Date.now() - fs.statSync(p).mtimeMs > STAGING_TTL_MS) fs.unlinkSync(p);
    } catch {}
  }
}
fs.mkdirSync(stagingDir, { recursive: true, mode: 0o700 });
cleanStaging();

// Moves an uploaded file (multer's temp file) into staging; returns its token.
function stageUpload(userId, tmpPath) {
  fs.mkdirSync(stagingDir, { recursive: true, mode: 0o700 });
  cleanStaging();
  const token = `${userId}-${crypto.randomBytes(12).toString('hex')}`;
  fs.renameSync(tmpPath, path.join(stagingDir, `${token}.upload`));
  return token;
}

function stagedPath(userId, token) {
  if (typeof token !== 'string' || !/^\d+-[0-9a-f]{24}$/.test(token) || !token.startsWith(`${userId}-`)) return null;
  const p = path.join(stagingDir, `${token}.upload`);
  return fs.existsSync(p) ? p : null;
}

// Scratch path in staging (for extracting account.db out of a zip).
function scratchPath(label) {
  fs.mkdirSync(stagingDir, { recursive: true, mode: 0o700 });
  return path.join(stagingDir, `${label}-${crypto.randomBytes(6).toString('hex')}.tmp`);
}

function dropStaged(userId, token) {
  const p = stagedPath(userId, token);
  if (p) fs.unlink(p, () => {});
}

// --- Reading a backup ---

function openBackup(filePath) {
  const snap = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    const check = snap.pragma('quick_check', { simple: true });
    if (check !== 'ok') throw new Error('the backup file is damaged');
    const notes = snap.prepare("SELECT type FROM sqlite_master WHERE name = 'notes'").get();
    if (!notes || notes.type !== 'table') throw new Error('not a notes backup');
  } catch (err) {
    snap.close();
    throw err;
  }
  return snap;
}

const colsOf = (conn, table) => {
  const t = conn.prepare("SELECT type FROM sqlite_master WHERE name = ?").get(table);
  if (!t || t.type !== 'table') return [];
  return conn.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
};

function backupMeta(snap) {
  if (!colsOf(snap, 'backup_meta').length) return {};
  return Object.fromEntries(snap.prepare('SELECT key, value FROM backup_meta').all().map((r) => [r.key, r.value]));
}

// What restoring `snap` into `userId` would do — no writes. `sourceUserId`
// = whose rows in the file (an account.db says so in backup_meta; a server
// snapshot is always the same user).
function analyze(snap, userId, sourceUserId) {
  const missingColumns = {};
  const missingTables = [];
  for (const t of [...TABLES, 'users']) {
    const have = new Set(colsOf(snap, t));
    if (!have.size) {
      if (t !== 'users') missingTables.push(t);
      continue;
    }
    const want = t === 'users' ? USER_COLS : colsOf(db, t);
    const gone = want.filter((c) => c !== 'id' && c !== 'user_id' && !have.has(c));
    if (gone.length) missingColumns[t] = gone;
  }
  const noteRows = snap.prepare('SELECT id, share_id FROM notes WHERE user_id = ?').all(sourceUserId);
  const memberShares = new Set(
    db.prepare('SELECT share_id FROM share_members WHERE user_id = ?').all(userId).map((r) => r.share_id)
  );
  const hasShareCol = colsOf(snap, 'notes').includes('share_id');
  const leavingSpaces = hasShareCol
    ? noteRows.filter((n) => n.share_id != null && !memberShares.has(n.share_id)).length
    : 0;
  // Ids already taken by someone else's notes (a backup from another
  // server, or another account's) can't be kept — the restore then gives
  // every note a new id, and the undo history can't come along.
  const taken = db.prepare('SELECT 1 FROM notes WHERE id = ? AND user_id != ?');
  const remap = noteRows.some((n) => taken.get(n.id, userId));
  return { notes: noteRows.length, missingColumns, missingTables, leavingSpaces, remap };
}

// --- Writing ---

// Remove this account's graph (and refs/links that point at it).
function clearCurrent(u) {
  const mine = 'SELECT id FROM notes WHERE user_id = ?';
  db.prepare(`UPDATE users SET root_note_id = NULL WHERE root_note_id IN (${mine})`).run(u);
  db.prepare(`DELETE FROM personal_refs WHERE user_id = ? OR personal_note_id IN (${mine}) OR shared_note_id IN (${mine})`).run(u, u, u);
  db.prepare(`DELETE FROM links WHERE note_a IN (${mine}) OR note_b IN (${mine})`).run(u, u);
  db.prepare(`DELETE FROM tabs WHERE user_id = ? OR note_id IN (${mine})`).run(u, u);
  db.prepare(`DELETE FROM reminders WHERE user_id = ? OR note_id IN (${mine})`).run(u, u);
  db.prepare(`DELETE FROM nav_events WHERE user_id = ? OR to_note_id IN (${mine})`).run(u, u);
  db.prepare(`UPDATE nav_events SET from_note_id = NULL WHERE from_note_id IN (${mine})`).run(u);
  db.prepare(`DELETE FROM import_source WHERE user_id = ? OR note_id IN (${mine})`).run(u, u);
  db.prepare('DELETE FROM history WHERE user_id = ?').run(u);
  db.prepare('DELETE FROM notes WHERE user_id = ?').run(u);
}

function insertRow(table, row, { orIgnore = false } = {}) {
  const cols = Object.keys(row);
  return db
    .prepare(`INSERT ${orIgnore ? 'OR IGNORE ' : ''}INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .run(...cols.map((c) => row[c]));
}

// An uploaded file is someone's claim, not ours: same field rules as the
// normal routes (themes through the theme sanitizer, attachment notes may
// only point into /uploads).
function cleanNote(n, userId) {
  if (n.status != null && !NOTE_STATUSES.has(n.status)) n.status = 'active';
  if ('theme' in n && n.theme != null) {
    let style = null;
    try {
      style = themes.sanitizeStyle(JSON.parse(n.theme), { uploadOk: require('./routes/theme').ownsUpload(userId) });
    } catch {
      style = null;
    }
    n.theme = style ? JSON.stringify(style) : null;
    if (!style && 'theme_children' in n) n.theme_children = 0;
  }
  if (ATTACHMENT_TYPES.has(n.type) && !/^\/uploads\/[A-Za-z0-9._-]+$/.test(String(n.attachment_path || ''))) {
    n.type = 'text';
    n.attachment_path = null;
  }
}

// Copy `snap`'s rows for sourceUserId into userId. Exact ids when they're
// free (the normal case: a restore on the server the backup came from);
// otherwise every row gets a new id and references are mapped across.
function loadRows(snap, userId, sourceUserId, { remap, untrusted }) {
  const src = sourceUserId;
  const memberShares = new Set(
    db.prepare('SELECT share_id FROM share_members WHERE user_id = ?').all(userId).map((r) => r.share_id)
  );
  const common = (t) => {
    const main = new Set(colsOf(db, t));
    return colsOf(snap, t).filter((c) => main.has(c));
  };
  const read = (t, where, ...params) => {
    const cols = common(t);
    if (!cols.length) return [];
    return snap.prepare(`SELECT ${cols.join(', ')} FROM ${t} WHERE ${where} ORDER BY rowid`).all(...params);
  };

  // Notes.
  const map = new Map();
  const snapNotes = read('notes', 'user_id = ?', src);
  for (const n of snapNotes) {
    const oldId = n.id;
    n.user_id = userId;
    if ('share_id' in n && n.share_id != null && !memberShares.has(n.share_id)) n.share_id = null;
    if (untrusted) cleanNote(n, userId);
    const fixLater = { created_from_note_id: n.created_from_note_id, done_with_note_id: n.done_with_note_id };
    if ('created_from_note_id' in n) n.created_from_note_id = null;
    if ('done_with_note_id' in n) n.done_with_note_id = null;
    if (remap) delete n.id;
    const info = insertRow('notes', n);
    n._newId = remap ? Number(info.lastInsertRowid) : oldId;
    map.set(oldId, n._newId);
    n._fix = fixLater;
  }

  const accessible = db.prepare(
    `SELECT share_id FROM notes WHERE id = ? AND
       ((user_id = ? AND share_id IS NULL) OR share_id IN (SELECT share_id FROM share_members WHERE user_id = ?))`
  );
  const M = (id) => (id == null ? null : map.has(id) ? map.get(id) : remap ? null : id);
  const acc = (id) => id != null && accessible.get(id, userId, userId);
  const mineSet = new Set(map.values());

  // Parent / done-with pointers, once every note has its final id.
  const setPtrs = db.prepare('UPDATE notes SET created_from_note_id = ?, done_with_note_id = ? WHERE id = ?');
  for (const n of snapNotes) {
    const cf = M(n._fix.created_from_note_id);
    const dw = M(n._fix.done_with_note_id);
    if (cf == null && dw == null) continue;
    setPtrs.run(acc(cf) ? cf : null, acc(dw) ? dw : null, n._newId);
  }

  const scopeOf = (id) => {
    const r = acc(id);
    return r ? r.share_id ?? 0 : undefined;
  };
  const counts = { notes: snapNotes.length, links: 0, references: 0, reminders: 0 };

  const linkTaken = db.prepare('SELECT 1 FROM links WHERE id = ?');
  const userExists = db.prepare('SELECT 1 FROM users WHERE id = ?');
  for (const l of read('links', 'note_a IN (SELECT id FROM notes WHERE user_id = ?) OR note_b IN (SELECT id FROM notes WHERE user_id = ?)', src, src)) {
    const a = M(l.note_a);
    const b = M(l.note_b);
    if (a == null || b == null || a === b || (!mineSet.has(a) && !mineSet.has(b))) continue;
    const sa = scopeOf(a);
    if (sa === undefined || sa !== scopeOf(b)) continue;
    l.note_a = Math.min(a, b);
    l.note_b = Math.max(a, b);
    if (remap || linkTaken.get(l.id)) delete l.id;
    // Creator provenance: whoever made it, if they still exist.
    if ('user_id' in l && (l.user_id === src || !userExists.get(l.user_id))) l.user_id = userId;
    if (insertRow('links', l, { orIgnore: true }).changes) counts.links++;
  }

  for (const r of read('personal_refs', 'user_id = ?', src)) {
    const p = M(r.personal_note_id);
    const s = M(r.shared_note_id);
    const pr = acc(p);
    const sr = acc(s);
    if (!pr || pr.share_id != null || !mineSet.has(p) || !sr || sr.share_id == null || sr.share_id !== r.share_id) continue;
    delete r.id;
    Object.assign(r, { user_id: userId, personal_note_id: p, shared_note_id: s });
    if (insertRow('personal_refs', r, { orIgnore: true }).changes) counts.references++;
  }

  for (const t of read('tabs', 'user_id = ?', src)) {
    const nid = M(t.note_id);
    if (!acc(nid)) continue;
    delete t.id;
    Object.assign(t, { user_id: userId, note_id: nid });
    insertRow('tabs', t);
  }

  const reminderTaken = db.prepare('SELECT 1 FROM reminders WHERE id = ?');
  for (const r of read('reminders', 'user_id = ?', src)) {
    const nid = M(r.note_id);
    if (!acc(nid)) continue;
    // Keep the id (undo history refers to it) unless something else has it.
    if (remap || reminderTaken.get(r.id)) delete r.id;
    Object.assign(r, { user_id: userId, note_id: nid });
    insertRow('reminders', r);
    counts.reminders++;
  }

  for (const e of read('nav_events', 'user_id = ?', src)) {
    const to = M(e.to_note_id);
    if (!acc(to)) continue;
    const from = M(e.from_note_id);
    delete e.id;
    Object.assign(e, { user_id: userId, to_note_id: to, from_note_id: acc(from) ? from : null });
    insertRow('nav_events', e);
  }

  for (const s of read('import_source', 'user_id = ?', src)) {
    const nid = M(s.note_id);
    if (!mineSet.has(nid)) continue;
    Object.assign(s, { user_id: userId, note_id: nid });
    insertRow('import_source', s, { orIgnore: true });
  }

  // Undo history refers to note ids — only meaningful when they were kept.
  if (!remap) {
    for (const h of read('history', 'user_id = ?', src)) {
      delete h.id;
      h.user_id = userId;
      insertRow('history', h);
    }
  }

  const userCols = colsOf(snap, 'users').filter((c) => USER_COLS.includes(c));
  if (userCols.length) {
    const p = snap.prepare(`SELECT ${userCols.join(', ')} FROM users WHERE id = ?`).get(src);
    if (p) {
      if ('root_note_id' in p) p.root_note_id = mineSet.has(M(p.root_note_id)) ? M(p.root_note_id) : null;
      if ('theme_prefs' in p && untrusted && p.theme_prefs != null) {
        try {
          p.theme_prefs = JSON.stringify(require('./routes/theme').cleanPrefs(JSON.parse(p.theme_prefs), userId));
        } catch {
          p.theme_prefs = null;
        }
      }
      const cols = Object.keys(p);
      db.prepare(`UPDATE users SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => p[c]), userId);
    }
  }
  return counts;
}

// Replace this account's graph with the one in `filePath` (a server snapshot
// or a staged account.db). Returns the analysis plus what was restored.
function restoreFromFile(userId, filePath, { untrusted = false } = {}) {
  const snap = openBackup(filePath);
  try {
    const meta = backupMeta(snap);
    const sourceUserId = meta.user_id != null ? Number(meta.user_id) : userId;
    const analysis = analyze(snap, userId, sourceUserId);
    let counts;
    db.transaction(() => {
      clearCurrent(userId);
      counts = loadRows(snap, userId, sourceUserId, { remap: analysis.remap, untrusted });
    })();
    return { ...analysis, restored: counts };
  } finally {
    snap.close();
  }
}

function restoreUserFromSnapshot(userId, file) {
  if (!snapshotExists(file)) throw new Error('that snapshot is no longer available');
  return restoreFromFile(userId, snapshotPath(file));
}

function analyzeSnapshot(userId, file) {
  return analyzeFile(userId, snapshotPath(file));
}

function analyzeFile(userId, filePath) {
  const snap = openBackup(filePath);
  try {
    const meta = backupMeta(snap);
    return { ...analyze(snap, userId, meta.user_id != null ? Number(meta.user_id) : userId), createdAt: meta.created_at || null };
  } finally {
    snap.close();
  }
}

// The attachment files a staged backup's notes point at (basenames).
function referencedUploads(filePath) {
  const snap = openBackup(filePath);
  try {
    const out = new Set();
    const cols = colsOf(snap, 'notes');
    const sel = ['attachment_path', 'content'].filter((c) => cols.includes(c));
    if (!sel.length) return out;
    for (const n of snap.prepare(`SELECT ${sel.join(', ')} FROM notes`).all()) {
      const re = /\/uploads\/([A-Za-z0-9._-]+)/g;
      let m;
      for (const s of [n.attachment_path, n.content]) {
        if (!s) continue;
        while ((m = re.exec(String(s)))) out.add(m[1]);
      }
    }
    return out;
  } finally {
    snap.close();
  }
}

// account.db for a downloaded backup: this account's rows only, same table
// definitions as the live database, plus backup_meta. Returns a Buffer.
function writeAccountDb(userId) {
  fs.mkdirSync(stagingDir, { recursive: true, mode: 0o700 });
  const tmp = path.join(stagingDir, `export-${userId}-${crypto.randomBytes(6).toString('hex')}.db`);
  const out = new Database(tmp);
  // A standalone extract: users/shares rows its tables point at aren't in it.
  out.pragma('foreign_keys = OFF');
  try {
    for (const t of TABLES) {
      const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(t).sql;
      out.exec(sql);
    }
    out.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, ${USER_COLS.join(', ')})`);
    out.exec('CREATE TABLE backup_meta (key TEXT PRIMARY KEY, value TEXT)');
    const mine = 'SELECT id FROM notes WHERE user_id = ?';
    const sources = {
      notes: ['user_id = ?', [userId]],
      links: [`note_a IN (${mine}) OR note_b IN (${mine})`, [userId, userId]],
      personal_refs: ['user_id = ?', [userId]],
      tabs: ['user_id = ?', [userId]],
      reminders: ['user_id = ?', [userId]],
      nav_events: ['user_id = ?', [userId]],
      import_source: ['user_id = ?', [userId]],
      history: ['user_id = ?', [userId]],
    };
    const copy = out.transaction(() => {
      for (const t of TABLES) {
        const [where, params] = sources[t];
        const rows = db.prepare(`SELECT * FROM ${t} WHERE ${where}`).all(...params);
        if (!rows.length) continue;
        const cols = Object.keys(rows[0]);
        const ins = out.prepare(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
        for (const r of rows) ins.run(...cols.map((c) => r[c]));
      }
      const u = db.prepare(`SELECT id, ${USER_COLS.join(', ')} FROM users WHERE id = ?`).get(userId);
      out.prepare(`INSERT INTO users (id, ${USER_COLS.join(', ')}) VALUES (?, ${USER_COLS.map(() => '?').join(', ')})`).run(
        u.id,
        ...USER_COLS.map((c) => u[c])
      );
      const meta = out.prepare('INSERT INTO backup_meta (key, value) VALUES (?, ?)');
      meta.run('format', '1');
      meta.run('user_id', String(userId));
      meta.run('created_at', new Date().toISOString());
    });
    copy();
    out.close();
    return fs.readFileSync(tmp);
  } finally {
    try {
      out.close();
    } catch {}
    fs.unlink(tmp, () => {});
  }
}

module.exports = {
  takeSnapshot,
  restoreUserFromSnapshot,
  restoreFromFile,
  analyzeFile,
  analyzeSnapshot,
  referencedUploads,
  writeAccountDb,
  stageUpload,
  stagedPath,
  scratchPath,
  stagingDir,
  dropStaged,
  snapshotExists,
  listSnapshots,
  ownsSnapshot,
  deleteSnapshot,
};
