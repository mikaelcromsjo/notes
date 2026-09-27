// Pure link-domain logic, extracted out of server/routes/links.js — see
// docs/plan/08-offline-privacy.md §3.1. No behavior change from the
// pre-extraction handlers.
const history = require('./history');
const { HttpError } = require('./http-error');

const nowIso = () => new Date().toISOString();

// The caller's whole link graph — the client mirrors this into IndexedDB so the
// grid (and offline link edits) can be rebuilt with no connection.
function list(db, userId) {
  return db
    .prepare('SELECT note_a AS a, note_b AS b, created_at FROM links WHERE user_id = ? ORDER BY created_at')
    .all(userId);
}

// Create a link. When `rehomeFrom` is given, this is a card being dragged from
// one anchor to another: link (a ↔ b), drop (rehomeFrom ↔ b), and log the pair
// as a single reversible "moved" entry. `b` is the card; `a` the new anchor.
function create(db, userId, { a, b, rehomeFrom }) {
  const aNum = Number(a);
  const bNum = Number(b);
  if (!Number.isInteger(aNum) || !Number.isInteger(bNum) || aNum <= 0 || bNum <= 0 || aNum === bNum) {
    throw new HttpError(400, 'a and b (distinct note ids) are required');
  }
  const noteA = Math.min(aNum, bNum);
  const noteB = Math.max(aNum, bNum);

  const owned = db
    .prepare('SELECT COUNT(*) AS c FROM notes WHERE id IN (?, ?) AND user_id = ?')
    .get(noteA, noteB, userId);
  if (owned.c !== 2) throw new HttpError(404, 'one or both notes not found');

  const isRehome =
    rehomeFrom &&
    Number(rehomeFrom) !== Number(b) &&
    db.prepare('SELECT 1 FROM notes WHERE id = ? AND user_id = ?').get(rehomeFrom, userId);

  // Recorded pre-move so undo can restore it exactly, rather than leaving
  // stale provenance pointing at whichever anchor a later undo/redo landed on.
  const prevCreatedFrom = isRehome
    ? db.prepare('SELECT created_from_note_id FROM notes WHERE id = ?').get(bNum).created_from_note_id
    : null;

  db.transaction(() => {
    db.prepare(
      'INSERT OR IGNORE INTO links (note_a, note_b, created_at, user_id) VALUES (?, ?, ?, ?)'
    ).run(noteA, noteB, nowIso(), userId);

    if (isRehome) {
      const [fa, fb] = [Math.min(rehomeFrom, b), Math.max(rehomeFrom, b)];
      db.prepare('DELETE FROM links WHERE note_a = ? AND note_b = ? AND user_id = ?').run(fa, fb, userId);
      // A move is explicit intent, stronger evidence than link chronology —
      // stamp it as provenance so the "probable parent" hierarchy (and
      // anything built on it) reflects the move immediately.
      db.prepare('UPDATE notes SET created_from_note_id = ? WHERE id = ? AND user_id = ?').run(
        aNum,
        bNum,
        userId
      );
    }
  })();

  if (isRehome) {
    history.record(
      userId,
      'rehome',
      { card: Number(b), from: Number(rehomeFrom), to: Number(a), prevCreatedFrom },
      `Moved "${history.noteTitle(userId, b)}" from "${history.noteTitle(userId, rehomeFrom)}" into "${history.noteTitle(userId, a)}"`
    );
  } else {
    history.record(
      userId,
      'link',
      { a: noteA, b: noteB },
      `Linked "${history.noteTitle(userId, noteA)}" ↔ "${history.noteTitle(userId, noteB)}"`
    );
  }

  return { a: noteA, b: noteB };
}

function remove(db, userId, { a, b }) {
  if (!a || !b) throw new HttpError(400, 'a and b are required');
  const noteA = Math.min(a, b);
  const noteB = Math.max(a, b);

  const owned = db
    .prepare('SELECT COUNT(*) AS c FROM notes WHERE id IN (?, ?) AND user_id = ?')
    .get(noteA, noteB, userId);
  if (owned.c !== 2) throw new HttpError(404, 'link not found');

  const info = db.prepare('DELETE FROM links WHERE note_a = ? AND note_b = ?').run(noteA, noteB);
  if (info.changes === 0) throw new HttpError(404, 'link not found');

  history.record(
    userId,
    'unlink',
    { a: noteA, b: noteB },
    `Unlinked "${history.noteTitle(userId, noteA)}" ✕ "${history.noteTitle(userId, noteB)}"`
  );
}

module.exports = { list, create, remove };
