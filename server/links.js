// Pure link-domain logic, extracted out of server/routes/links.js — see
// docs/plan/08-offline-privacy.md §3.1. No behavior change from the
// pre-extraction handlers.
const history = require('./history');
const { resolveNoteAccess } = require('./shares');
const { guessLinkKind } = require('./hierarchy');
const { HttpError } = require('./http-error');

const nowIso = () => new Date().toISOString();

// The caller's whole *personal* link graph — the client mirrors this into
// IndexedDB so the grid (and offline link edits) can be rebuilt with no
// connection. Never trusts links.user_id as scope (it's creator provenance,
// and a note's scope can change after a link was made, e.g. a move into a
// share) — joins notes on both endpoints and requires both to still be this
// user's own personal notes. Shared-space links are listed separately, via
// GET /api/shares/:id/notes's own graph (v1 is online-only for shares, so
// there's no offline mirror to build there).
function list(db, userId) {
  return db
    .prepare(
      `SELECT l.note_a AS a, l.note_b AS b, l.created_at
       FROM links l
       JOIN notes na ON na.id = l.note_a
       JOIN notes nb ON nb.id = l.note_b
       WHERE na.user_id = ? AND na.share_id IS NULL AND nb.user_id = ? AND nb.share_id IS NULL
       ORDER BY l.created_at`
    )
    .all(userId, userId);
}

// Create a link. When `rehomeFrom` is given, this is a card being dragged from
// one anchor to another: link (a ↔ b), drop (rehomeFrom ↔ b), and log the pair
// as a single reversible "moved" entry. `b` is the card; `a` the new anchor.
//
// A link must never span scopes (a personal note ↔ a shared note) — that's
// the write-time half of the shares boundary (server/shares.js's
// resolveNoteAccess is the read-time half; a cross-scope pointer instead goes
// through personal_refs, never a links row). Both ends must resolve for this
// user AND land in the same scope: two personal notes of this same user, or
// two notes of the same share.
function create(db, userId, { a, b, rehomeFrom }) {
  const aNum = Number(a);
  const bNum = Number(b);
  if (!Number.isInteger(aNum) || !Number.isInteger(bNum) || aNum <= 0 || bNum <= 0 || aNum === bNum) {
    throw new HttpError(400, 'a and b (distinct note ids) are required');
  }
  const noteA = Math.min(aNum, bNum);
  const noteB = Math.max(aNum, bNum);

  const accessA = resolveNoteAccess(db, userId, noteA);
  const accessB = resolveNoteAccess(db, userId, noteB);
  if (!accessA.role || !accessB.role || accessA.note.share_id !== accessB.note.share_id) {
    throw new HttpError(404, 'one or both notes not found');
  }

  const accessFrom = rehomeFrom != null ? resolveNoteAccess(db, userId, rehomeFrom) : null;
  const isRehome =
    rehomeFrom &&
    Number(rehomeFrom) !== Number(b) &&
    accessFrom &&
    accessFrom.role &&
    accessFrom.note.share_id === accessB.note.share_id;

  // Recorded pre-move so undo can restore it exactly, rather than leaving
  // stale provenance pointing at whichever anchor a later undo/redo landed on.
  const prevCreatedFrom = isRehome
    ? db.prepare('SELECT created_from_note_id FROM notes WHERE id = ?').get(bNum).created_from_note_id
    : null;

  // A plain connect between two already-existing notes gets guessed
  // (server/hierarchy.js's guessLinkKind, computed now, before the edge
  // exists, since the guess is "would removing this edge disconnect one
  // side from the graph root"). Personal-graph only — a shared space has
  // no per-user root_note_id anchor to guess against, and a rehome already
  // carries its own explicit intent below, no guessing needed.
  const guess = !isRehome && accessA.note.share_id == null ? guessLinkKind(userId, noteA, noteB) : null;
  const kind = guess && guess.cross ? 'cross' : null;

  db.transaction(() => {
    db.prepare(
      'INSERT OR IGNORE INTO links (note_a, note_b, created_at, user_id, kind) VALUES (?, ?, ?, ?, ?)'
    ).run(noteA, noteB, nowIso(), userId, kind);

    if (guess && guess.childId != null) {
      // The child side was previously unreachable from the graph root at
      // all — this connection *is* its real structural parent, however it
      // was created (including "created standalone via the header, then
      // linked to its actual parent afterward", which created_from_note_id
      // alone never captures). Never overwrite an existing explicit
      // parent — if this note already has one recorded, this new link is
      // additional, not a replacement for it.
      db.prepare(
        'UPDATE notes SET created_from_note_id = ? WHERE id = ? AND user_id = ? AND created_from_note_id IS NULL'
      ).run(guess.parentId, guess.childId, userId);
    }

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

  const accessA = resolveNoteAccess(db, userId, noteA);
  const accessB = resolveNoteAccess(db, userId, noteB);
  if (!accessA.role || !accessB.role || accessA.note.share_id !== accessB.note.share_id) {
    throw new HttpError(404, 'link not found');
  }

  const info = db.prepare('DELETE FROM links WHERE note_a = ? AND note_b = ?').run(noteA, noteB);
  if (info.changes === 0) throw new HttpError(404, 'link not found');

  history.record(
    userId,
    'unlink',
    { a: noteA, b: noteB },
    `Unlinked "${history.noteTitle(userId, noteA)}" ✕ "${history.noteTitle(userId, noteB)}"`
  );
}

// User-correctable override for how a link is treated for hierarchy
// purposes — see db.js's links.kind comment and hierarchy.js's
// buildRootedTree. `center`/`other` give the direction (unlike note ids
// alone, which don't — see hierarchy.js's guessLinkKind on why direction
// matters): "mark `other`, as seen from `center`, as..."
//   'child'  — other really is a child of center: other.created_from_note_id
//              = center.
//   'parent' — other really is center's parent (the reverse of 'child', the
//              same underlying fact seen from the other side):
//              center.created_from_note_id = other.
//              Only one of these two can ever be true for a given link —
//              at most one of its two notes has the other recorded as its
//              parent — so setting one direction clears the other by
//              construction (there's only one created_from_note_id column
//              per note, and this always writes to a specific note, never
//              both). Either one also clears any 'cross' mark this link
//              had. Both are deliberate, explicit statements, so they DO
//              overwrite an existing recorded parent outright, same as any
//              other direct edit in this app (pin/status/attach) — no
//              confirmation dialog, but undoable (history 'attach'-style
//              before/after, same as everything else here).
//   'cross'  — this is a lateral reference, never hierarchy, no matter how
//              the graph reshapes around it: sets links.kind='cross'. Does
//              NOT touch created_from_note_id either direction, even if one
//              side already had the other recorded as parent — an explicit
//              provenance fact and a "don't use this edge for hierarchy"
//              fact are different statements, even about the same edge.
//   'auto'   — clears the 'cross' mark, back to "let it guess" for this edge
//              specifically (created_from_note_id, if any, is untouched).
function setRelation(db, userId, { center, other, relation }) {
  const centerId = Number(center);
  const otherId = Number(other);
  if (!Number.isInteger(centerId) || !Number.isInteger(otherId)) {
    throw new HttpError(400, 'center and other (note ids) are required');
  }
  if (!['child', 'parent', 'cross', 'auto'].includes(relation)) {
    throw new HttpError(400, "relation must be 'child', 'parent', 'cross', or 'auto'");
  }

  const accessCenter = resolveNoteAccess(db, userId, centerId);
  const accessOther = resolveNoteAccess(db, userId, otherId);
  if (!accessCenter.role || !accessOther.role || accessCenter.note.share_id !== accessOther.note.share_id) {
    throw new HttpError(404, 'link not found');
  }
  const noteA = Math.min(centerId, otherId);
  const noteB = Math.max(centerId, otherId);
  const link = db.prepare('SELECT kind FROM links WHERE note_a = ? AND note_b = ?').get(noteA, noteB);
  if (!link) throw new HttpError(404, 'link not found');

  // Track BOTH notes' created_from_note_id, not just the one this relation
  // sets — a note has exactly one created_from_note_id, so "other is
  // center's child" and "other is center's parent" can never both be true,
  // but nothing stopped them being true in *opposite* directions before
  // this (other.created_from_note_id = center AND, independently,
  // center.created_from_note_id = other), which is exactly the "both look
  // like children of each other" bug: setting one direction must clear a
  // stale reverse pointer, or the cycle just reappears from the other side.
  let centerCreatedFrom = accessCenter.note.created_from_note_id;
  let otherCreatedFrom = accessOther.note.created_from_note_id;
  const beforeCenterCreatedFrom = centerCreatedFrom;
  const beforeOtherCreatedFrom = otherCreatedFrom;

  if (relation === 'child') {
    otherCreatedFrom = centerId;
    if (centerCreatedFrom === otherId) centerCreatedFrom = null; // clear a stale reverse pointer
  } else if (relation === 'parent') {
    centerCreatedFrom = otherId;
    if (otherCreatedFrom === centerId) otherCreatedFrom = null;
  }
  // 'cross'/'auto': neither side's created_from_note_id changes at all —
  // see the class doc comment above.

  const kindAfter = relation === 'cross' ? 'cross' : null;

  db.transaction(() => {
    db.prepare('UPDATE links SET kind = ? WHERE note_a = ? AND note_b = ?').run(kindAfter, noteA, noteB);
    if (centerCreatedFrom !== beforeCenterCreatedFrom) {
      db.prepare('UPDATE notes SET created_from_note_id = ? WHERE id = ? AND user_id = ?').run(
        centerCreatedFrom,
        centerId,
        userId
      );
    }
    if (otherCreatedFrom !== beforeOtherCreatedFrom) {
      db.prepare('UPDATE notes SET created_from_note_id = ? WHERE id = ? AND user_id = ?').run(
        otherCreatedFrom,
        otherId,
        userId
      );
    }
  })();

  history.record(
    userId,
    'link-relation',
    {
      noteA,
      noteB,
      centerId,
      otherId,
      before: { kind: link.kind || null, centerCreatedFrom: beforeCenterCreatedFrom, otherCreatedFrom: beforeOtherCreatedFrom },
      after: { kind: kindAfter, centerCreatedFrom, otherCreatedFrom },
    },
    relation === 'child'
      ? `Marked "${history.noteTitle(userId, otherId)}" as a child of "${history.noteTitle(userId, centerId)}"`
      : relation === 'parent'
        ? `Marked "${history.noteTitle(userId, otherId)}" as the parent of "${history.noteTitle(userId, centerId)}"`
        : relation === 'cross'
          ? `Marked "${history.noteTitle(userId, otherId)}" ↔ "${history.noteTitle(userId, centerId)}" as a cross-reference`
          : `Reset "${history.noteTitle(userId, otherId)}" ↔ "${history.noteTitle(userId, centerId)}" to auto`
  );

  return { center: centerId, other: otherId, relation };
}

module.exports = { list, create, remove, setRelation };
