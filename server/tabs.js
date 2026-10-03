// Pure tab-domain logic, extracted out of server/routes/tabs.js — see
// docs/plan/08-offline-privacy.md §3.1.
//
// A tab row is owned by the user whose tab bar it's in — that's unrelated
// to whether the note it's centered on is personal or shared, so tabs
// themselves need no scope concept at all. What matters is `note_id`: any
// note this user can currently see (resolveNoteAccess) is a valid tab
// target, personal or shared alike — the client tells the two apart by
// `share_id` (included below) and badges a shared one, but there is
// otherwise exactly one kind of tab.
const { resolveNoteAccess } = require('./shares');
const { HttpError } = require('./http-error');

function list(db, userId) {
  return db
    .prepare(
      `SELECT tabs.id, tabs.note_id, tabs.is_active, tabs.sort_order, notes.title, notes.share_id
       FROM tabs
       JOIN notes ON notes.id = tabs.note_id
       WHERE tabs.user_id = ? AND notes.status != 'deleted'
       ORDER BY tabs.sort_order ASC`
    )
    .all(userId);
}

function activate(db, id, userId) {
  db.transaction(() => {
    db.prepare('UPDATE tabs SET is_active = 0 WHERE user_id = ?').run(userId);
    db.prepare('UPDATE tabs SET is_active = 1 WHERE id = ? AND user_id = ?').run(id, userId);
  })();
}

// Always opens a brand new tab on note_id (explicit "+" action).
function create(db, userId, { note_id }) {
  if (!resolveNoteAccess(db, userId, note_id).role) throw new HttpError(404, 'note not found');

  db.transaction(() => {
    const { maxOrder } = db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) AS maxOrder FROM tabs WHERE user_id = ?')
      .get(userId);
    const info = db
      .prepare('INSERT INTO tabs (note_id, sort_order, is_active, user_id) VALUES (?, ?, 0, ?)')
      .run(note_id, maxOrder + 1, userId);
    activate(db, info.lastInsertRowid, userId);
  })();

  return list(db, userId);
}

// Move an existing tab to point at a different note (in-tab navigation).
function move(db, userId, id, { note_id }) {
  if (!resolveNoteAccess(db, userId, note_id).role) throw new HttpError(404, 'note not found');

  const info = db.prepare('UPDATE tabs SET note_id = ? WHERE id = ? AND user_id = ?').run(note_id, id, userId);
  if (info.changes === 0) throw new HttpError(404, 'tab not found');
  return list(db, userId);
}

function activateTab(db, userId, id) {
  const tab = db.prepare('SELECT id FROM tabs WHERE id = ? AND user_id = ?').get(id, userId);
  if (!tab) throw new HttpError(404, 'tab not found');
  activate(db, id, userId);
  return list(db, userId);
}

function remove(db, userId, id) {
  const removed = db.transaction(() => {
    const tab = db.prepare('SELECT * FROM tabs WHERE id = ? AND user_id = ?').get(id, userId);
    if (!tab) return false;

    db.prepare('DELETE FROM tabs WHERE id = ?').run(id);

    if (tab.is_active) {
      const next = db
        .prepare(
          `SELECT id FROM tabs
           WHERE user_id = ?
           ORDER BY ABS(sort_order - ?) ASC, sort_order ASC
           LIMIT 1`
        )
        .get(userId, tab.sort_order);
      if (next) activate(db, next.id, userId);
    }
    return true;
  })();

  if (!removed) throw new HttpError(404, 'tab not found');
  return list(db, userId);
}

module.exports = { list, create, move, activateTab, remove };
