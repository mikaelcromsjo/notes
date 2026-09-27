// Pure tab-domain logic, extracted out of server/routes/tabs.js — see
// docs/plan/08-offline-privacy.md §3.1. No behavior change from the
// pre-extraction handlers.
const { HttpError } = require('./http-error');

function list(db, userId) {
  return db
    .prepare(
      `SELECT tabs.id, tabs.note_id, tabs.is_active, tabs.sort_order, notes.title
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
  const note = db.prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?').get(note_id, userId);
  if (!note) throw new HttpError(404, 'note not found');

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
  const note = db.prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?').get(note_id, userId);
  if (!note) throw new HttpError(404, 'note not found');

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
