const db = require('./db');

const nowIso = () => new Date().toISOString();

const insertStmt = db.prepare(
  `INSERT INTO history (user_id, action, summary, payload, created_at)
   VALUES (?, ?, ?, ?, ?)`
);

// Title of a note the user owns, or a stable "#id" fallback (the note may have
// been hard-deleted since the entry was written).
function noteTitle(userId, id) {
  if (!id) return '(none)';
  const n = db.prepare('SELECT title FROM notes WHERE id = ? AND user_id = ?').get(id, userId);
  return n ? n.title : `note #${id}`;
}

function record(userId, action, payload, summary) {
  if (!userId) return;
  insertStmt.run(userId, action, summary, JSON.stringify(payload || {}), nowIso());
}

// Edits fire on every autosave; fold a run of them on the same note into one
// entry (keeping the earliest "before") so undo jumps back to where the edit
// session started rather than one keystroke-batch.
const UPDATE_COALESCE_MS = 5 * 60 * 1000;

function recordUpdate(userId, noteId, before, after, summary) {
  if (!userId) return;
  if (before.title === after.title && before.content === after.content) return;

  const last = db
    .prepare('SELECT id, action, payload, created_at, undone_at FROM history WHERE user_id = ? ORDER BY id DESC LIMIT 1')
    .get(userId);

  if (
    last &&
    last.action === 'update' &&
    !last.undone_at &&
    Date.now() - new Date(last.created_at).getTime() < UPDATE_COALESCE_MS
  ) {
    let prev;
    try {
      prev = JSON.parse(last.payload);
    } catch {
      prev = null;
    }
    if (prev && prev.noteId === noteId) {
      db.prepare('UPDATE history SET payload = ?, summary = ?, created_at = ? WHERE id = ?').run(
        JSON.stringify({ noteId, before: prev.before, after }),
        summary,
        nowIso(),
        last.id
      );
      return;
    }
  }

  record(userId, 'update', { noteId, before, after }, summary);
}

module.exports = { record, recordUpdate, noteTitle };
