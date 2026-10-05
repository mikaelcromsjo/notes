// Pure note-domain logic, extracted out of server/routes/notes.js so it takes
// (db, userId, params) instead of closing over the module-level db singleton
// and reading req/res directly — see docs/plan/08-offline-privacy.md §3.1.
// server/routes/notes.js is now a thin Express wrapper over these functions.
// No behavior change from the pre-extraction handlers.
const fs = require('fs');
const path = require('path');
const history = require('./history');
const { uploadsDir } = require('./upload-config');
const {
  buildHierarchy,
  hierarchyParentsMap,
  subtreeIds,
  probableRoot,
  firstCreatedRoot,
  scopeClause,
} = require('./hierarchy');
const { computeNeighbors } = require('./neighbors');
// Straight from note-access.js, not './shares' — shares.js needs to require
// *this* module (searchShare delegates to searchScoped below), so importing
// resolveNoteAccess/scopeOf via shares.js's re-export would form a cycle.
const { resolveNoteAccess, scopeOf } = require('./note-access');
const { extractTags } = require('./tags');
const themes = require('../public/themes.js');
const { ownsUpload, sweepImages } = require('./routes/theme');
const encryption = require('./encryption');
const { HttpError } = require('./http-error');

const now = () => new Date().toISOString();

// Coerce a lat/lon pair from a request body into finite numbers, or null if
// absent/invalid — OR, once the account has encryption on, accept an opaque
// `geo` ciphertext blob instead (docs/plan/08-offline-privacy.md's location
// encryption note in db.js): the caller already encrypted {lat, lon, ...}
// client-side, so lat/lon are stored NULL and `geo` verbatim. The server
// never validates a geo blob's contents — it can't decrypt it.
function parseGeo(body) {
  if (typeof body.geo === 'string' && body.geo) {
    return { lat: null, lon: null, geo: body.geo };
  }
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  if (body.lat === undefined || body.lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { lat: null, lon: null, geo: null };
  }
  return { lat, lon, geo: null };
}

// List all non-deleted notes for the current user's *personal* graph — used
// for search/picker/pin bar. `AND share_id IS NULL` is what makes a note stop
// appearing here the moment it moves into a share (server/shares.js) — see
// GET /api/shares/:id/notes for the share-scoped equivalent.
function list(db, userId) {
  return db
    .prepare(
      `SELECT id, title, created_at, updated_at, pinned, type, status, lat, lon, geo, theme, theme_children
       FROM notes WHERE user_id = ? AND share_id IS NULL AND status != 'deleted'
       ORDER BY updated_at DESC`
    )
    .all(userId);
}

// `shareId`, when given, must be a share the caller already belongs to —
// this is how a note created while browsing a shared space (public/app.js's
// currentSpace) lands inside it instead of the caller's personal graph.
// `linkTo` must resolve inside that same scope (a share note can only link
// to another note in the same share; a personal note only to another
// personal note of the caller's) — see server/links.js's same-scope rule,
// which this mirrors at creation time.
function create(db, userId, { title, content = '', linkTo, shareId, ...coordBody }) {
  if (!title || !title.trim()) throw new HttpError(400, 'title is required');
  const { lat, lon, geo } = parseGeo(coordBody);

  let scopedShareId = null;
  if (shareId != null) {
    const m = db
      .prepare('SELECT 1 FROM share_members WHERE share_id = ? AND user_id = ?')
      .get(shareId, userId);
    if (!m) throw new HttpError(404, 'share not found');
    scopedShareId = Number(shareId);
  }

  let linkToId = null;
  if (linkTo) {
    const { role, note: target } = resolveNoteAccess(db, userId, linkTo);
    if (!role || target.share_id !== scopedShareId) throw new HttpError(404, 'linkTo note not found');
    linkToId = target.id;
  }

  const insertNote = db.prepare(
    `INSERT INTO notes (title, content, created_at, updated_at, lat, lon, geo, created_from_note_id, user_id, share_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  // No links.kind needed here — created_from_note_id (set on this same
  // insert, just above) already IS the explicit parent-child signal
  // hierarchy.js's buildRootedTree looks for. kind is reserved for
  // 'cross' (see links.js's create/guessLinkKind), which never applies to
  // a link that exists *because* a note was just created from it.
  const linkNotes = db.prepare(
    'INSERT OR IGNORE INTO links (note_a, note_b, created_at, user_id) VALUES (?, ?, ?, ?)'
  );

  const doCreate = db.transaction(() => {
    const ts = now();
    const info = insertNote.run(title.trim(), content, ts, ts, lat, lon, geo, linkToId, userId, scopedShareId);
    const id = info.lastInsertRowid;
    if (linkToId) {
      linkNotes.run(Math.min(id, linkToId), Math.max(id, linkToId), ts, userId);
    }
    return id;
  });

  const id = doCreate();
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
  history.record(userId, 'create', { noteId: id, title: note.title }, `Created "${note.title}"`);
  return note;
}

// The background catch-up sweep (docs/plan/08-offline-privacy.md's location
// note in db.js): `items` is [{id, geo}], geo already encrypted client-side
// from this note's current (plaintext) lat/lon. Clears lat/lon once geo is
// stored — unlike location_log, notes.lat/lon are nullable, no placeholder
// needed.
function encryptGeo(db, userId, items) {
  if (!Array.isArray(items)) throw new HttpError(400, 'items must be an array');
  const ownedIds = new Set(
    db.prepare('SELECT id FROM notes WHERE user_id = ? AND share_id IS NULL').all(userId).map((r) => r.id)
  );
  for (const item of items) {
    if (!item || !ownedIds.has(Number(item.id)) || typeof item.geo !== 'string' || !item.geo) {
      throw new HttpError(400, 'every item must be { id, geo } for a note you own');
    }
  }
  const update = db.prepare('UPDATE notes SET geo = ?, lat = NULL, lon = NULL WHERE id = ?');
  db.transaction(() => {
    for (const item of items) update.run(item.geo, Number(item.id));
  })();
  return { ok: true, count: items.length };
}

// Full-text search over one scope's notes ({ userId } personal, or
// { shareId } a shared space's own graph — see hierarchy.js's scopeClause).
// `encrypted` is always the *viewing* user's own encryption prefs, even for
// a share: a shared note may have been contributed by a different account
// than the one whose encryption setting is in effect for the ciphertext
// question below, but shares don't otherwise reason about per-contributor
// encryption anywhere else either (v1 has no concept of a "mixed" share),
// so this just matches that same simplification.
function searchScoped(db, scope, { q, limit: limitRaw }, encrypted) {
  const raw = String(q || '').trim();
  const terms = raw.toLowerCase().match(/[\p{L}\p{N}_]+/gu) || [];
  if (!terms.length) return [];

  // Quote each term (defuses FTS operators); prefix-match the last one so
  // results appear while the user is still typing.
  const match = terms
    .map((t, i) => (i === terms.length - 1 ? `"${t}"*` : `"${t}"`))
    .join(' ');
  const limit = Math.min(Math.max(Number(limitRaw) || 12, 1), 30);
  const scopeCond = scopeClause(scope, 'n');

  // notes_fts mirrors notes.content verbatim (its triggers fire on every
  // write, plaintext or not) — once this account has opted into content
  // encryption, that column is ciphertext and indexing/snippeting it is
  // meaningless. Narrow the query to the title column and skip snippet()
  // entirely rather than searching or ever surfacing that ciphertext.
  try {
    const rows = encrypted
      ? db
          .prepare(
            `SELECT n.id, n.title, n.type, n.status
             FROM notes_fts
             JOIN notes n ON n.id = notes_fts.rowid
             WHERE notes_fts MATCH ? AND ${scopeCond.sql} AND n.status != 'deleted'
             ORDER BY n.status = 'done', bm25(notes_fts, 5.0, 1.0)
             LIMIT ?`
          )
          .all(`{title} : (${match})`, ...scopeCond.params, limit)
      : db
          .prepare(
            `SELECT n.id, n.title, n.type, n.status,
                    snippet(notes_fts, 1, '[', ']', '…', 12) AS snippet
             FROM notes_fts
             JOIN notes n ON n.id = notes_fts.rowid
             WHERE notes_fts MATCH ? AND ${scopeCond.sql} AND n.status != 'deleted'
             ORDER BY n.status = 'done', bm25(notes_fts, 5.0, 1.0)
             LIMIT ?`
          )
          .all(match, ...scopeCond.params, limit);
    // A match with no content (title-only match, an attachment note, or an
    // encrypted account) gets an empty snippet — fall back to the inferred
    // parent's title so the result still has some disambiguating subtitle.
    if (rows.some((r) => !r.snippet)) {
      const { byId, parentOf } = buildHierarchy(scope);
      for (const r of rows) {
        if (r.snippet) continue;
        const parentId = parentOf.get(r.id);
        const parent = parentId != null ? byId.get(parentId) : null;
        if (parent) r.parentTitle = parent.title || 'Untitled';
      }
    }
    return rows;
  } catch (err) {
    return [];
  }
}

// Full-text search over the caller's own personal notes. Nothing in the
// client calls this any more (see public/app.js's cache.localSearch, docs/
// plan/08-offline-privacy.md §3.2) — kept as an online-only fallback/back-
// compat path, narrowed rather than retired (§3.7). searchScoped's { shareId }
// form, by contrast, is what a shared space's search actually calls: a
// space has no offline mirror to search locally against (same "v1 is
// online-only for shares" rule as getShareNotes/getShareLinks), so there's
// no local alternative to narrow *that* one down to.
function search(db, userId, opts) {
  const encrypted = encryption.getPrefs(db, userId).enabled;
  return searchScoped(db, { userId }, opts, encrypted);
}

// GTD context tags are just `@word` mentions in a note's own text (see
// server/tags.js) — no column, nothing to keep in sync. This lists what's
// already in use, for the editor's tag-insert modal.
const DEFAULT_TAGS = ['phone', 'errands', 'home', 'computer', 'anywhere'];

function listTags(db, userId) {
  // Finished (done) or removed notes don't need re-surfacing as suggestions.
  const rows = db
    .prepare(
      "SELECT title, content FROM notes WHERE user_id = ? AND share_id IS NULL AND status NOT IN ('deleted', 'done')"
    )
    .all(userId);

  const counts = new Map();
  for (const { title, content } of rows) {
    for (const tag of new Set([...extractTags(title), ...extractTags(content)])) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  const used = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
  const tags = [...used, ...DEFAULT_TAGS.filter((t) => !counts.has(t))].slice(0, 8);
  return { tags };
}

// The most globally significant root note — the landing spot when there's no
// better context to resume.
function probableRootNote(db, userId) {
  const root = probableRoot({ userId });
  return { note: root ? { id: root.id, title: root.title } : null };
}

// The "graph root" used to anchor server/hierarchy.js's rootedDescendants/
// buildRootedTree/guessLinkKind (server/shares.js's candidateLineage,
// server/links.js's create) — an explicit users.root_note_id if one's been
// marked, else your first-ever-created note (hierarchy.js's
// firstCreatedRoot — deliberately not probableRootNote's own
// "largest subtree" heuristic; see that function's doc comment for why).
// `marked` tells the client whether this is a deliberate pin or a guess.
function getRootNote(db, userId) {
  const row = db.prepare('SELECT root_note_id FROM users WHERE id = ?').get(userId);
  if (row && row.root_note_id != null) {
    const note = db
      .prepare("SELECT id, title FROM notes WHERE id = ? AND user_id = ? AND share_id IS NULL AND status != 'deleted'")
      .get(row.root_note_id, userId);
    if (note) return { note, marked: true };
  }
  const inferred = firstCreatedRoot({ userId });
  return { note: inferred ? { id: inferred.id, title: inferred.title } : null, marked: false };
}

// noteId null clears the mark (revert to inferred).
function setRootNote(db, userId, noteId) {
  if (noteId == null) {
    db.prepare('UPDATE users SET root_note_id = NULL WHERE id = ?').run(userId);
    return getRootNote(db, userId);
  }
  const { role, note } = resolveNoteAccess(db, userId, noteId);
  if (!role || note.share_id != null) throw new HttpError(404, 'not found');
  db.prepare('UPDATE users SET root_note_id = ? WHERE id = ?').run(noteId, userId);
  return getRootNote(db, userId);
}

// The fields the list endpoint above omits to stay light — content (arbitrary
// length) and attachment_path. The client pulls this once per online app-open
// to pre-cache every note for offline reading. Personal graph only (shared
// spaces are online-only in v1 — see public/app.js's currentSpace).
function listFull(db, userId) {
  return db
    .prepare(
      `SELECT id, content, attachment_path, updated_at
       FROM notes WHERE user_id = ? AND share_id IS NULL AND status != 'deleted'`
    )
    .all(userId);
}

// The inferred hierarchy as a flat { childId: parentId } map (roots omitted).
// Personal graph only — a shared space's own hierarchy is
// server/shares.js's hierarchyParents (GET /api/shares/:id/hierarchy-parents),
// both wrapping hierarchy.js's scope-generic hierarchyParentsMap.
function hierarchyParents(db, userId) {
  return hierarchyParentsMap({ userId });
}

// Every cacheable attachment (image/audio/file), newest-updated first, with a
// byte size so the client can plan an offline cache budget without
// downloading anything first. Backfills attachment_size for rows uploaded
// before that column existed. Personal graph only (see listFull above).
function attachmentsManifest(db, userId) {
  const rows = db
    .prepare(
      `SELECT id, type, attachment_path, attachment_size, updated_at
       FROM notes
       WHERE user_id = ? AND share_id IS NULL AND status != 'deleted' AND type IN ('image', 'audio', 'file')
             AND attachment_path IS NOT NULL
       ORDER BY updated_at DESC`
    )
    .all(userId);

  const backfillSize = db.prepare('UPDATE notes SET attachment_size = ? WHERE id = ?');
  for (const r of rows) {
    if (r.attachment_size != null) continue;
    try {
      const stat = fs.statSync(path.join(uploadsDir, path.basename(r.attachment_path)));
      r.attachment_size = stat.size;
      backfillSize.run(stat.size, r.id);
    } catch {
      r.attachment_size = 0;
    }
  }

  return rows;
}

function get(db, userId, id) {
  const { role, note } = resolveNoteAccess(db, userId, id);
  if (!role) throw new HttpError(404, 'not found');
  return note;
}

// Optional offline-sync fields in params:
//   baseUpdatedAt   — the `updated_at` the client last saw for this row. If it
//                     no longer matches, the row changed elsewhere while the
//                     client was offline: that's a conflict.
//   clientUpdatedAt — when the offline edit was actually made. On a conflict,
//                     a field the client sent is kept only if the client's edit
//                     is newer than the server's current `updated_at`; otherwise
//                     the server's value wins that field. The result carries
//                     `conflict: true` so the client can preserve the loser as a
//                     "conflicted copy" note.
// Callers that send neither field keep the old last-write-wins behaviour.
function update(db, userId, id, { title, content, baseUpdatedAt, clientUpdatedAt }) {
  const { role, note } = resolveNoteAccess(db, userId, id);
  if (!role) throw new HttpError(404, 'not found');

  let newTitle = title !== undefined ? title.trim() : note.title;
  let newContent = content !== undefined ? content : note.content;
  if (!newTitle) throw new HttpError(400, 'title is required');

  const conflict = Boolean(baseUpdatedAt) && baseUpdatedAt !== note.updated_at;
  if (conflict) {
    const serverWins = !clientUpdatedAt || note.updated_at > clientUpdatedAt;
    if (serverWins) {
      if (title !== undefined) newTitle = note.title;
      if (content !== undefined) newContent = note.content;
    }
  }

  db.prepare('UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ?').run(
    newTitle,
    newContent,
    now(),
    id
  );
  history.recordUpdate(
    userId,
    note.id,
    { title: note.title, content: note.content },
    { title: newTitle, content: newContent },
    `Edited "${newTitle}"`
  );
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
  return conflict ? { ...row, conflict: true } : row;
}

// Deletes the note row and, for a file-backed attachment, the file on disk.
// Callers get no return value — this is the hard, unreversible delete.
function remove(db, userId, id) {
  const { role, note } = resolveNoteAccess(db, userId, id);
  if (!role) throw new HttpError(404, 'not found');
  if (note.pinned) throw new HttpError(409, 'note is pinned; unpin before deleting');

  db.prepare('DELETE FROM notes WHERE id = ?').run(id);

  if (
    (note.type === 'image' || note.type === 'audio' || note.type === 'file') &&
    note.attachment_path
  ) {
    const filePath = path.join(uploadsDir, path.basename(note.attachment_path));
    fs.unlink(filePath, () => {});
  }
}

function pin(db, userId, id) {
  const { role } = resolveNoteAccess(db, userId, id);
  if (!role) throw new HttpError(404, 'not found');
  db.prepare('UPDATE notes SET pinned = 1 WHERE id = ?').run(id);
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
  history.record(userId, 'pin', { noteId: note.id }, `Pinned "${note.title}"`);
  return note;
}

function unpin(db, userId, id) {
  const { role } = resolveNoteAccess(db, userId, id);
  if (!role) throw new HttpError(404, 'not found');
  db.prepare('UPDATE notes SET pinned = 0 WHERE id = ?').run(id);
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
  history.record(userId, 'unpin', { noteId: note.id }, `Unpinned "${note.title}"`);
  return note;
}

// Per-note theme: { theme: <style>|null, children: bool }. Cosmetic, so it does
// not touch updated_at and is not in the undo history. Not supported on
// shared notes yet — theme_children/theme are single columns (one value per
// note), which doesn't fit "personal metadata per collaborator"; a shared
// note renders under the viewing editor's own app theme instead (see
// public/app.js's styleFor). A real note_theme_overrides(user_id, note_id)
// table is a clean follow-up, not built now.
function setTheme(db, userId, id, body) {
  const { role, note } = resolveNoteAccess(db, userId, id);
  if (!role) throw new HttpError(404, 'not found');
  if (note.share_id != null) throw new HttpError(409, 'theme overrides are not supported on shared notes yet');

  const style = themes.sanitizeStyle(body.theme, { uploadOk: ownsUpload(userId) });
  db.prepare('UPDATE notes SET theme = ?, theme_children = ? WHERE id = ?').run(
    style ? JSON.stringify(style) : null,
    style && body.children ? 1 : 0,
    note.id
  );
  sweepImages(userId);
  return db.prepare('SELECT * FROM notes WHERE id = ?').get(note.id);
}

const NOTE_STATUSES = new Set(['active', 'waiting', 'todo', 'done', 'deleted']);

const STATUS_VERB = {
  deleted: 'Deleted',
  done: 'Completed',
  todo: 'Flagged to-do',
  waiting: 'Flagged waiting',
  active: 'Reopened',
};

function setStatus(db, userId, id, status) {
  if (!NOTE_STATUSES.has(status)) {
    throw new HttpError(400, `status must be one of: ${[...NOTE_STATUSES].join(', ')}`);
  }
  const { role, note: prev } = resolveNoteAccess(db, userId, id);
  if (!role) throw new HttpError(404, 'not found');

  db.prepare('UPDATE notes SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id);

  if (status !== prev.status) {
    history.record(
      userId,
      'status',
      { noteId: prev.id, from: prev.status, to: status },
      `${STATUS_VERB[status] || 'Changed'} "${prev.title}"`
    );
  }
  return db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
}

// Linked, non-deleted notes ranked by "probable next step", plus the single
// "probable parent". Shape: { parent: <neighbor|null>, neighbors: [...] }.
// `rankUserId` stays the viewing user even when the note is shared — see
// server/neighbors.js's doc comment: two collaborators looking at the same
// shared note each get their own ranking.
function neighbors(db, userId, id) {
  const { role, note } = resolveNoteAccess(db, userId, id);
  if (!role) throw new HttpError(404, 'not found');
  // Never guess a parent for the note explicitly marked as this user's
  // graph root (server/hierarchy.js's rootedDescendants anchor) — a root
  // has no parent, so the grid's "back" slot shouldn't imply one just
  // because the structural fallback found *some* oldest link. Personal
  // notes only; a share has no root concept.
  const isExplicitRoot =
    note.share_id == null &&
    db.prepare('SELECT 1 FROM users WHERE id = ? AND root_note_id = ?').get(userId, id);
  const result = computeNeighbors(scopeOf(note), id, userId, {
    skipStructuralFallback: Boolean(isExplicitRoot),
  });
  if (!result) throw new HttpError(404, 'not found');
  return result;
}

// Every 'todo'-flagged note anywhere under this one in the inferred hierarchy.
function subtreeTodos(db, userId, id) {
  const { role, note: center } = resolveNoteAccess(db, userId, id);
  if (!role) throw new HttpError(404, 'not found');

  const { byId, childrenOf } = buildHierarchy(scopeOf(center));
  const todos = subtreeIds(childrenOf, id)
    .map((nid) => byId.get(nid))
    .filter((n) => n && n.status === 'todo')
    .map((n) => ({ id: n.id, title: n.title }));
  return { todos };
}

// Every note id anywhere under this one, any depth — excludes the note itself.
function subtreeIdsFor(db, userId, id) {
  const { role, note: center } = resolveNoteAccess(db, userId, id);
  if (!role) throw new HttpError(404, 'not found');

  const { childrenOf } = buildHierarchy(scopeOf(center));
  return { ids: subtreeIds(childrenOf, id) };
}

const ATTACHMENT_TYPES = new Set(['image', 'audio', 'file', 'contact', 'app']);

// Shared by both create routes: validate + insert a new attachment note.
// `parentId` is null for a standalone attachment with no link at all — in
// that case an explicit `body.shareId` (a share the caller belongs to) can
// still place it inside a shared space; otherwise it lands in the caller's
// personal graph. A parented attachment always inherits its parent's scope,
// same as `create`'s `linkTo`. `file` is the multer file descriptor (or
// undefined); on any validation failure this unlinks it itself so no temp
// upload is ever orphaned on disk.
function createAttachmentNote(db, userId, parentId, body, file) {
  let parent = null;
  let scopedShareId = null;
  if (parentId != null) {
    const access = resolveNoteAccess(db, userId, parentId);
    if (!access.role) {
      if (file) fs.unlink(file.path, () => {});
      throw new HttpError(404, 'parent note not found');
    }
    parent = access.note;
    scopedShareId = parent.share_id;
  } else if (body && body.shareId != null) {
    const m = db
      .prepare('SELECT 1 FROM share_members WHERE share_id = ? AND user_id = ?')
      .get(body.shareId, userId);
    if (!m) {
      if (file) fs.unlink(file.path, () => {});
      throw new HttpError(404, 'share not found');
    }
    scopedShareId = Number(body.shareId);
  }

  const { type, contactName, contactPhone, contactEmail, appUri, appLabel } = body;
  if (!ATTACHMENT_TYPES.has(type)) {
    if (file) fs.unlink(file.path, () => {});
    throw new HttpError(400, `type must be one of: ${[...ATTACHMENT_TYPES].join(', ')}`);
  }

  let attachmentPath = null;
  let attachmentSize = null;
  let defaultTitle = 'Attachment';

  if (type === 'image' || type === 'audio' || type === 'file') {
    if (!file) throw new HttpError(400, 'a supported file is required');
    if (type !== 'file') {
      const kind = file.mimetype.split('/')[0];
      if (kind !== type) {
        fs.unlink(file.path, () => {});
        throw new HttpError(400, `file type does not match "${type}"`);
      }
    }
    attachmentPath = `/uploads/${file.filename}`;
    attachmentSize = file.size;
    defaultTitle = type === 'image' ? 'Photo' : type === 'audio' ? 'Recording' : file.originalname || 'File';
  } else if (type === 'contact') {
    if (!contactName || !contactName.trim()) {
      throw new HttpError(400, 'contactName is required for contact attachments');
    }
    attachmentPath = JSON.stringify({
      name: contactName.trim(),
      phone: contactPhone || '',
      email: contactEmail || '',
    });
    defaultTitle = contactName.trim();
  } else if (type === 'app') {
    if (!appUri || !appUri.trim()) {
      throw new HttpError(400, 'appUri is required for app attachments');
    }
    attachmentPath = appUri.trim();
    defaultTitle = (appLabel && appLabel.trim()) || appUri.trim();
  }

  const title = (body.title && body.title.trim()) || defaultTitle;
  const content = body.content || '';
  const { lat, lon, geo } = parseGeo(body);

  const insertNote = db.prepare(
    `INSERT INTO notes (title, content, created_at, updated_at, type, lat, lon, geo, created_from_note_id, attachment_path, attachment_size, user_id, share_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  // No links.kind needed — same reasoning as create()'s own linkNotes above.
  const linkNotes = db.prepare(
    'INSERT OR IGNORE INTO links (note_a, note_b, created_at, user_id) VALUES (?, ?, ?, ?)'
  );

  const doCreate = db.transaction(() => {
    const ts = now();
    const info = insertNote.run(
      title,
      content,
      ts,
      ts,
      type,
      lat,
      lon,
      geo,
      parent ? parent.id : null,
      attachmentPath,
      attachmentSize,
      userId,
      scopedShareId
    );
    const id = info.lastInsertRowid;
    if (parent) linkNotes.run(Math.min(id, parent.id), Math.max(id, parent.id), ts, userId);
    return id;
  });

  const id = doCreate();
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
  history.record(userId, 'create', { noteId: id, title: note.title }, `Added ${type} "${note.title}"`);
  return note;
}

// Inline image paste/drop: stores the file through the same MIME allowlist +
// size cap as a normal attachment, but creates no attachment note and no
// link — the caller drops a `![](<path>)` into the markdown source instead.
function createInlineImage(db, userId, parentId, file) {
  const { role: parentRole } = resolveNoteAccess(db, userId, parentId);
  if (!parentRole) {
    if (file) fs.unlink(file.path, () => {});
    throw new HttpError(404, 'parent note not found');
  }
  if (!file || file.mimetype.split('/')[0] !== 'image') {
    if (file) fs.unlink(file.path, () => {});
    throw new HttpError(400, 'a supported image file is required');
  }
  return { path: `/uploads/${file.filename}` };
}

// Replace *this* note's own attachment — distinct from createAttachmentNote,
// which creates a brand-new linked attachment note. No link row, no new note.
// Undoable (history action 'attach'); the file being replaced is deliberately
// NOT deleted here — see server/routes/notes.js's comment history for why.
function replaceAttachment(db, userId, id, body, file) {
  const { role, note } = resolveNoteAccess(db, userId, id);
  if (!role) {
    if (file) fs.unlink(file.path, () => {});
    throw new HttpError(404, 'not found');
  }

  const { type, contactName, contactPhone, contactEmail, appUri, appLabel } = body;
  if (!ATTACHMENT_TYPES.has(type)) {
    if (file) fs.unlink(file.path, () => {});
    throw new HttpError(400, `type must be one of: ${[...ATTACHMENT_TYPES].join(', ')}`);
  }

  let attachmentPath = null;
  let attachmentSize = null;

  if (type === 'image' || type === 'audio' || type === 'file') {
    if (!file) throw new HttpError(400, 'a supported file is required');
    if (type !== 'file') {
      const kind = file.mimetype.split('/')[0];
      if (kind !== type) {
        fs.unlink(file.path, () => {});
        throw new HttpError(400, `file type does not match "${type}"`);
      }
    }
    attachmentPath = `/uploads/${file.filename}`;
    attachmentSize = file.size;
  } else if (type === 'contact') {
    if (!contactName || !contactName.trim()) {
      throw new HttpError(400, 'contactName is required for contact attachments');
    }
    attachmentPath = JSON.stringify({
      name: contactName.trim(),
      phone: contactPhone || '',
      email: contactEmail || '',
    });
  } else if (type === 'app') {
    if (!appUri || !appUri.trim()) {
      throw new HttpError(400, 'appUri is required for app attachments');
    }
    attachmentPath = appUri.trim();
  }

  const titleOverride = (body.title && body.title.trim()) || (type === 'app' && appLabel && appLabel.trim());
  const newTitle = titleOverride || note.title;
  db.prepare(
    'UPDATE notes SET type = ?, title = ?, attachment_path = ?, attachment_size = ?, updated_at = ? WHERE id = ?'
  ).run(type, newTitle, attachmentPath, attachmentSize, now(), note.id);

  const updated = db.prepare('SELECT * FROM notes WHERE id = ?').get(note.id);
  history.record(
    userId,
    'attach',
    {
      noteId: note.id,
      before: { type: note.type, attachment_path: note.attachment_path, attachment_size: note.attachment_size },
      after: { type, attachment_path: attachmentPath, attachment_size: attachmentSize },
    },
    `${note.type === 'text' ? 'Attached' : 'Changed'} ${type} on "${newTitle}"`
  );
  return updated;
}

// Remove this note's attachment, reverting it to a plain text note.
function removeAttachment(db, userId, id) {
  const { role, note } = resolveNoteAccess(db, userId, id);
  if (!role) throw new HttpError(404, 'not found');
  if (note.type === 'text') throw new HttpError(409, 'note has no attachment');

  db.prepare(
    "UPDATE notes SET type = 'text', attachment_path = NULL, attachment_size = NULL, updated_at = ? WHERE id = ?"
  ).run(now(), note.id);

  history.record(
    userId,
    'attach',
    {
      noteId: note.id,
      before: { type: note.type, attachment_path: note.attachment_path, attachment_size: note.attachment_size },
      after: { type: 'text', attachment_path: null, attachment_size: null },
    },
    `Removed attachment from "${note.title}"`
  );

  return db.prepare('SELECT * FROM notes WHERE id = ?').get(note.id);
}

module.exports = {
  parseGeo,
  list,
  create,
  encryptGeo,
  search,
  searchScoped,
  listTags,
  probableRootNote,
  getRootNote,
  setRootNote,
  listFull,
  hierarchyParents,
  attachmentsManifest,
  get,
  update,
  remove,
  pin,
  unpin,
  setTheme,
  setStatus,
  neighbors,
  subtreeTodos,
  subtreeIdsFor,
  createAttachmentNote,
  createInlineImage,
  replaceAttachment,
  removeAttachment,
};
