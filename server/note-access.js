// The single per-note access check, used everywhere a route needs "can this
// user touch this note, and under what role" instead of a raw
// `WHERE ... AND user_id = ?` predicate. Split out of server/shares.js (which
// still re-exports both of these) so that server/history.js, server/notes.js
// and server/links.js — all of which server/shares.js itself depends on via
// server/history.js — can use it with no circular require.
//
// -> { role: 'owner'|'editor'|null, note }. `role` collapses "I personally
// own this note" and "I'm a member of the share this note lives in" into the
// same two write-capable roles — there is no 'viewer' value here because a
// viewer never has a userId at all (see server/shares.js's
// resolveViewerToken; that path never calls this).
function resolveNoteAccess(db, userId, noteId) {
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId);
  if (!note || note.status === 'deleted') return { role: null, note: null };
  if (note.share_id == null) {
    return note.user_id === userId ? { role: 'owner', note } : { role: null, note: null };
  }
  const m = db
    .prepare('SELECT role FROM share_members WHERE share_id = ? AND user_id = ?')
    .get(note.share_id, userId);
  return m ? { role: m.role, note } : { role: null, note: null };
}

// The scope a resolved note lives in, in the shape server/hierarchy.js and
// server/neighbors.js expect: { userId } (personal, share_id IS NULL) or
// { shareId } (a shared space's own graph).
function scopeOf(note) {
  return note.share_id != null ? { shareId: note.share_id } : { userId: note.user_id };
}

module.exports = { resolveNoteAccess, scopeOf };
