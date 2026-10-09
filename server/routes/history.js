const express = require('express');
const db = require('../db');
const { settingsOf } = require('../reminders');
const snapshots = require('../snapshots');
const { resolveNoteAccess, moveNotesIntoShare, moveNotesOutOfShare, captureUnshare } = require('../shares');

const router = express.Router();

const nowIso = () => new Date().toISOString();
const pair = (x, y) => [Math.min(x, y), Math.max(x, y)];

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

// A note this user can act on (personal, or a shared note they're a member
// of) — see server/shares.js's resolveNoteAccess. Undo/redo entries are only
// ever read back by the same user who made them (the routes below filter
// `history WHERE user_id = ?`), so this just confirms the note is still
// reachable to them, the same "world moved on" guard as before.
function ownNote(id, uid) {
  return resolveNoteAccess(db, uid, id).note;
}

// links.user_id is creator provenance, not scope (see server/links.js) — a
// link between two notes this user can act on may have been created by a
// different collaborator in a shared space, so these no longer filter by
// user_id at all; the caller is responsible for checking ownNote() on both
// endpoints first where that matters (every branch below already does).
function linkExists(a, b) {
  return db.prepare('SELECT 1 FROM links WHERE note_a = ? AND note_b = ?').get(a, b);
}

// createdAt/kind: the link's original values when the entry recorded them
// (older entries didn't) — link age drives the hierarchy guess, and a
// 'cross' mark must survive an unlink + undo.
function addLink(a, b, uid, createdAt, kind) {
  db.prepare(
    'INSERT OR IGNORE INTO links (note_a, note_b, created_at, user_id, kind) VALUES (?, ?, ?, ?, ?)'
  ).run(a, b, createdAt || nowIso(), uid, kind || null);
}

// The parent stamp server/links.js's create made from its guess (p.stamped
// = { childId, parentId }) — only cleared/re-set while nothing else has
// changed that note's recorded parent since.
function unstampParent(p) {
  if (!p.stamped) return;
  db.prepare('UPDATE notes SET created_from_note_id = NULL WHERE id = ? AND created_from_note_id = ?').run(
    p.stamped.childId,
    p.stamped.parentId
  );
}
function restampParent(p) {
  if (!p.stamped) return;
  db.prepare('UPDATE notes SET created_from_note_id = ? WHERE id = ? AND created_from_note_id IS NULL').run(
    p.stamped.parentId,
    p.stamped.childId
  );
}

function removeLink(a, b) {
  db.prepare('DELETE FROM links WHERE note_a = ? AND note_b = ?').run(a, b);
}

// A 'status' entry's done-cascade (server/notes.js's setStatus): the sub-notes
// closed or reopened along with p.noteId flip back (undo) or forward (redo)
// together with it, keeping done_with_note_id/done_prev_status in step so a
// later reopen still knows which ones were closed with it. A sub-note that's
// since gone, or whose status was changed on its own afterwards, is left alone.
function applyStatusCascade(p, dir, uid) {
  for (const c of p.cascade || []) {
    const n = ownNote(c.id, uid);
    const [expect, target, other] = dir === 'undo' ? [c.to, c.from, c.to] : [c.from, c.to, c.from];
    if (!n || n.status !== expect) continue;
    const done = target === 'done';
    db.prepare(
      'UPDATE notes SET status = ?, done_with_note_id = ?, done_prev_status = ?, updated_at = ? WHERE id = ?'
    ).run(target, done ? p.noteId : null, done ? other : null, nowIso(), n.id);
  }
}

// A 'share' entry (server/shares.js's createShare/addNoteToShare): p.noteIds
// moved into space p.shareId (p.created = the space was made for them).
// Undo moves whichever of them (still this user's) are still in it back
// out together, then restores the links moveNotesIntoShare had turned into
// refs with their original created_at/kind; a space created by this entry
// that ends up empty is dissolved again (members/tokens/invites dropped,
// the shares row kept — same as dissolveShare). Redo moves them back in,
// re-joining a space it had dissolved, and refreshes p.droppedLinks (the
// route saves p back after every undo/redo).
function sharedNotes(p, uid, inShare) {
  return p.noteIds
    .map((id) => db.prepare('SELECT * FROM notes WHERE id = ?').get(id))
    .filter((n) => n && n.user_id === uid && n.status !== 'deleted' && (inShare ? n.share_id === p.shareId : n.share_id == null));
}
function undoShare(p, uid) {
  const notes = sharedNotes(p, uid, true);
  if (!notes.length) throw new Error('those notes are no longer in that space');
  moveNotesOutOfShare(db, p.shareId, notes);
  for (const l of p.droppedLinks || []) {
    const a = db.prepare('SELECT user_id, share_id, status FROM notes WHERE id = ?').get(l.a);
    const b = db.prepare('SELECT user_id, share_id, status FROM notes WHERE id = ?').get(l.b);
    if (!a || !b || a.share_id != null || b.share_id != null || a.user_id !== b.user_id) continue;
    if (a.status === 'deleted' || b.status === 'deleted') continue;
    db.prepare(
      'INSERT OR IGNORE INTO links (note_a, note_b, created_at, user_id, kind) VALUES (?, ?, ?, ?, ?)'
    ).run(l.a, l.b, l.created_at, a.user_id, l.kind);
    db.prepare('UPDATE links SET created_at = ?, kind = ? WHERE note_a = ? AND note_b = ?').run(l.created_at, l.kind, l.a, l.b);
    db.prepare(
      'DELETE FROM personal_refs WHERE share_id = ? AND ((personal_note_id = ? AND shared_note_id = ?) OR (personal_note_id = ? AND shared_note_id = ?))'
    ).run(p.shareId, l.a, l.b, l.b, l.a);
  }
  if (p.created && !db.prepare('SELECT 1 FROM notes WHERE share_id = ? AND status != ?').get(p.shareId, 'deleted')) {
    db.prepare('DELETE FROM share_members WHERE share_id = ?').run(p.shareId);
    db.prepare('DELETE FROM share_viewer_tokens WHERE share_id = ?').run(p.shareId);
    db.prepare('DELETE FROM share_invites WHERE share_id = ?').run(p.shareId);
  }
  return { noteId: notes[0].id, unshared: true, shareId: p.shareId };
}
function redoShare(p, uid) {
  const member = db.prepare('SELECT 1 FROM share_members WHERE share_id = ? AND user_id = ?').get(p.shareId, uid);
  if (!member) {
    const share = db.prepare('SELECT created_by FROM shares WHERE id = ?').get(p.shareId);
    if (!p.created || !share || share.created_by !== uid) throw new Error('you are no longer in that space');
    db.prepare('INSERT INTO share_members (share_id, user_id, role, added_at) VALUES (?, ?, ?, ?)').run(
      p.shareId,
      uid,
      'owner',
      nowIso()
    );
  }
  const notes = sharedNotes(p, uid, false);
  if (!notes.length) throw new Error('those notes are no longer available to share');
  p.droppedLinks = moveNotesIntoShare(db, uid, p.shareId, notes.map((n) => n.id));
  return { noteId: notes[0].id, shareId: p.shareId };
}

// 'ref'/'unref' (server/shares.js's addRef/removeRef): one cross-space
// reference, put back with its original created_at.
function refRow(p, uid) {
  return db
    .prepare('SELECT id FROM personal_refs WHERE user_id = ? AND personal_note_id = ? AND shared_note_id = ?')
    .get(uid, p.personalNoteId, p.sharedNoteId);
}
function putRef(p, uid) {
  const personal = db.prepare('SELECT user_id, share_id, status FROM notes WHERE id = ?').get(p.personalNoteId);
  const shared = ownNote(p.sharedNoteId, uid);
  if (!personal || personal.user_id !== uid || personal.share_id != null || personal.status === 'deleted') {
    throw new Error('that note no longer exists');
  }
  if (!shared || shared.share_id !== p.shareId || shared.status === 'deleted') {
    throw new Error('that note is no longer in the space');
  }
  db.prepare(
    `INSERT OR IGNORE INTO personal_refs (user_id, personal_note_id, share_id, shared_note_id, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(uid, p.personalNoteId, p.shareId, p.sharedNoteId, p.created_at || nowIso());
  return { noteId: p.personalNoteId };
}
function dropRef(p, uid) {
  db.prepare('DELETE FROM personal_refs WHERE user_id = ? AND personal_note_id = ? AND shared_note_id = ?').run(
    uid,
    p.personalNoteId,
    p.sharedNoteId
  );
  return { noteId: p.personalNoteId };
}

// 'unshare' (server/shares.js's removeNoteFromShare). Undo moves the note back
// into the space, turns the refs the removal created from its side back
// into its original in-space links (same created_at/kind), and restores
// every ref that pointed into it. Redo removes it again, re-capturing that
// state into p (the route saves p back).
function undoUnshare(p, uid) {
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(p.noteId);
  if (!note || note.status === 'deleted') throw new Error('that note no longer exists');
  if (note.share_id === p.shareId) throw new Error('that note is already back in the space');
  if (note.share_id != null) throw new Error('that note is in another space now');
  if (!db.prepare('SELECT 1 FROM share_members WHERE share_id = ? AND user_id = ?').get(p.shareId, uid)) {
    throw new Error('you are no longer in that space');
  }
  moveNotesIntoShare(db, note.user_id, p.shareId, [note.id]);
  db.prepare('DELETE FROM personal_refs WHERE personal_note_id = ? AND share_id = ?').run(note.id, p.shareId);
  const inShare = db.prepare("SELECT 1 FROM notes WHERE id = ? AND share_id = ? AND status != 'deleted'");
  for (const l of p.inLinks || []) {
    const other = l.a === note.id ? l.b : l.a;
    if (!inShare.get(other, p.shareId)) continue;
    db.prepare(
      'INSERT OR IGNORE INTO links (note_a, note_b, created_at, user_id, kind) VALUES (?, ?, ?, ?, ?)'
    ).run(l.a, l.b, l.created_at, note.user_id, l.kind);
    db.prepare('UPDATE links SET created_at = ?, kind = ? WHERE note_a = ? AND note_b = ?').run(l.created_at, l.kind, l.a, l.b);
  }
  for (const r of p.refsIn || []) {
    const pn = db.prepare('SELECT user_id, share_id, status FROM notes WHERE id = ?').get(r.personal_note_id);
    if (!pn || pn.share_id != null || pn.status === 'deleted' || pn.user_id !== r.user_id) continue;
    if (!db.prepare('SELECT 1 FROM share_members WHERE share_id = ? AND user_id = ?').get(p.shareId, r.user_id)) continue;
    db.prepare(
      `INSERT OR IGNORE INTO personal_refs (user_id, personal_note_id, share_id, shared_note_id, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(r.user_id, r.personal_note_id, p.shareId, note.id, r.created_at);
    db.prepare(
      'UPDATE personal_refs SET created_at = ? WHERE user_id = ? AND personal_note_id = ? AND shared_note_id = ?'
    ).run(r.created_at, r.user_id, r.personal_note_id, note.id);
  }
  return { noteId: note.id, shareId: p.shareId, reshared: true };
}
function redoUnshare(p, uid) {
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(p.noteId);
  if (!note || note.status === 'deleted' || note.share_id !== p.shareId) throw new Error('that note is no longer in the space');
  if (!db.prepare('SELECT 1 FROM share_members WHERE share_id = ? AND user_id = ?').get(p.shareId, uid)) {
    throw new Error('you are no longer in that space');
  }
  Object.assign(p, captureUnshare(db, note.id));
  moveNotesOutOfShare(db, p.shareId, [note]);
  return { noteId: note.id, unshared: true, shareId: p.shareId };
}

// 'reminder' (server/reminders.js): make reminder p.id exactly `row` again —
// null = removed. The raw row carries every column, so a removed reminder
// comes back with its own id, schedule and snooze state.
function setReminderState(p, row, uid) {
  if (!row) {
    db.prepare('DELETE FROM reminders WHERE id = ? AND user_id = ?').run(p.id, uid);
    return { noteId: p.noteId, reminders: true };
  }
  const n = ownNote(row.note_id, uid);
  if (!n || n.status === 'deleted') throw new Error('that note no longer exists');
  const cols = Object.keys(row).filter((c) => c !== 'id');
  const exists = db.prepare('SELECT 1 FROM reminders WHERE id = ? AND user_id = ?').get(p.id, uid);
  if (exists) {
    db.prepare(`UPDATE reminders SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(
      ...cols.map((c) => row[c]),
      p.id
    );
  } else {
    db.prepare(`INSERT INTO reminders (id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`).run(
      p.id,
      ...cols.map((c) => row[c])
    );
  }
  return { noteId: p.noteId, reminders: true };
}
// Already in `row`'s state, as far as the user-chosen settings go?
function reminderIs(p, row, uid) {
  const cur = db.prepare('SELECT * FROM reminders WHERE id = ? AND user_id = ?').get(p.id, uid);
  if (!row || !cur) return !row && !cur;
  return JSON.stringify(settingsOf(cur)) === JSON.stringify(settingsOf(row));
}

// Shared by the 'link-relation' undo/redo branches below (server/links.js's
// setRelation) — restores a link's kind AND both its notes'
// created_from_note_id to a given
// {kind, centerCreatedFrom, otherCreatedFrom} snapshot. Both sides, always
// — setRelation itself may touch either or both (clearing a stale reverse
// pointer when flipping direction), so undo/redo has to put both back
// exactly, not just the one this particular action's `relation` primarily
// targeted. Requires both notes and the link itself to still exist (the
// one piece of "world moved on" a plain note-existence check can't cover
// here).
function applyLinkRelation(noteA, noteB, centerId, otherId, state, uid) {
  if (!ownNote(noteA, uid) || !ownNote(noteB, uid)) throw new Error('one of those notes no longer exists');
  if (!linkExists(noteA, noteB)) throw new Error('that link no longer exists');
  db.prepare('UPDATE links SET kind = ? WHERE note_a = ? AND note_b = ?').run(state.kind, noteA, noteB);
  db.prepare('UPDATE notes SET created_from_note_id = ? WHERE id = ?').run(state.centerCreatedFrom, centerId);
  db.prepare('UPDATE notes SET created_from_note_id = ? WHERE id = ?').run(state.otherCreatedFrom, otherId);
  return { noteId: otherId };
}

// Reverse one recorded action. Throws with a human message when the world has
// moved on far enough that the undo can't be applied safely; returns
// { noteId } for the note the caller may want to recenter/refresh on.
function applyUndo(action, p, uid) {
  if (action === 'link') {
    const [a, b] = pair(p.a, p.b);
    removeLink(a, b, uid);
    unstampParent(p);
    return {};
  }

  if (action === 'unlink') {
    const [a, b] = pair(p.a, p.b);
    if (!ownNote(a, uid) || !ownNote(b, uid)) throw new Error('one of those notes no longer exists');
    addLink(a, b, uid, p.created_at, p.kind);
    return {};
  }

  if (action === 'rehome') {
    // Original move: linked (to ↔ card), unlinked (from ↔ card).
    const [ta, tb] = pair(p.to, p.card);
    removeLink(ta, tb, uid);
    if (ownNote(p.from, uid) && ownNote(p.card, uid)) {
      const [fa, fb] = pair(p.from, p.card);
      addLink(fa, fb, uid, p.fromLink && p.fromLink.created_at, p.fromLink && p.fromLink.kind);
    }
    // Restore whatever provenance the card had before this move stamped it —
    // 'prevCreatedFrom' is absent on history recorded before that stamping
    // existed, so older entries just leave the field alone.
    if (Object.prototype.hasOwnProperty.call(p, 'prevCreatedFrom') && ownNote(p.card, uid)) {
      db.prepare('UPDATE notes SET created_from_note_id = ? WHERE id = ? AND user_id = ?').run(
        p.prevCreatedFrom,
        p.card,
        uid
      );
    }
    return { noteId: p.card };
  }

  if (action === 'create') {
    const n = ownNote(p.noteId, uid);
    if (!n || n.status === 'deleted') return {}; // already gone — nothing to do
    db.prepare("UPDATE notes SET status = 'deleted', pinned = 0, updated_at = ? WHERE id = ?").run(
      nowIso(),
      n.id
    );
    return { noteId: n.id, deleted: true };
  }

  if (action === 'share') return undoShare(p, uid);
  if (action === 'unshare') return undoUnshare(p, uid);
  if (action === 'reminder') return setReminderState(p, p.before, uid);
  if (action === 'ref') return dropRef(p, uid);
  if (action === 'unref') return putRef(p, uid);

  if (action === 'status') {
    const n = ownNote(p.noteId, uid);
    if (!n) throw new Error('that note no longer exists');
    db.prepare('UPDATE notes SET status = ?, updated_at = ? WHERE id = ?').run(p.from, nowIso(), n.id);
    applyStatusCascade(p, 'undo', uid);
    return { noteId: n.id };
  }

  if (action === 'pin' || action === 'unpin') {
    const n = ownNote(p.noteId, uid);
    if (!n) throw new Error('that note no longer exists');
    db.prepare('UPDATE notes SET pinned = ? WHERE id = ?').run(action === 'pin' ? 0 : 1, n.id);
    return { noteId: n.id };
  }

  if (action === 'update') {
    const n = ownNote(p.noteId, uid);
    if (!n) throw new Error('that note no longer exists');
    db.prepare('UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ?').run(
      p.before.title,
      p.before.content,
      nowIso(),
      n.id
    );
    return { noteId: n.id };
  }

  if (action === 'attach') {
    const n = ownNote(p.noteId, uid);
    if (!n) throw new Error('that note no longer exists');
    db.prepare(
      'UPDATE notes SET type = ?, attachment_path = ?, attachment_size = ?, updated_at = ? WHERE id = ?'
    ).run(p.before.type, p.before.attachment_path, p.before.attachment_size, nowIso(), n.id);
    return { noteId: n.id };
  }

  if (action === 'mail') {
    const n = ownNote(p.noteId, uid);
    if (!n) throw new Error('that note no longer exists');
    db.prepare('UPDATE notes SET mail = ? WHERE id = ?').run(p.before, n.id);
    return { noteId: n.id };
  }

  if (action === 'link-relation') {
    return applyLinkRelation(p.noteA, p.noteB, p.centerId, p.otherId, p.before, uid);
  }

  throw new Error('unknown action');
}

// Re-apply an undone action (redo). Same "world moved on" guards as applyUndo,
// just in the original direction.
function applyRedo(action, p, uid) {
  if (action === 'link') {
    const [a, b] = pair(p.a, p.b);
    if (!ownNote(a, uid) || !ownNote(b, uid)) throw new Error('one of those notes no longer exists');
    addLink(a, b, uid, p.created_at, p.kind);
    restampParent(p);
    return {};
  }

  if (action === 'unlink') {
    const [a, b] = pair(p.a, p.b);
    removeLink(a, b, uid);
    return {};
  }

  if (action === 'rehome') {
    if (!ownNote(p.to, uid) || !ownNote(p.card, uid)) {
      throw new Error('one of those notes no longer exists');
    }
    const [ta, tb] = pair(p.to, p.card);
    addLink(ta, tb, uid, p.toCreatedAt);
    const [fa, fb] = pair(p.from, p.card);
    removeLink(fa, fb, uid);
    // Re-apply the same provenance stamp the original move made.
    db.prepare('UPDATE notes SET created_from_note_id = ? WHERE id = ? AND user_id = ?').run(
      p.to,
      p.card,
      uid
    );
    return { noteId: p.card };
  }

  if (action === 'create') {
    const n = ownNote(p.noteId, uid);
    if (!n) throw new Error('that note no longer exists');
    db.prepare("UPDATE notes SET status = 'active', updated_at = ? WHERE id = ?").run(nowIso(), n.id);
    return { noteId: n.id };
  }

  if (action === 'share') return redoShare(p, uid);
  if (action === 'unshare') return redoUnshare(p, uid);
  if (action === 'reminder') return setReminderState(p, p.after, uid);
  if (action === 'ref') return putRef(p, uid);
  if (action === 'unref') return dropRef(p, uid);

  if (action === 'status') {
    const n = ownNote(p.noteId, uid);
    if (!n) throw new Error('that note no longer exists');
    db.prepare('UPDATE notes SET status = ?, updated_at = ? WHERE id = ?').run(p.to, nowIso(), n.id);
    applyStatusCascade(p, 'redo', uid);
    return { noteId: n.id };
  }

  if (action === 'pin' || action === 'unpin') {
    const n = ownNote(p.noteId, uid);
    if (!n) throw new Error('that note no longer exists');
    db.prepare('UPDATE notes SET pinned = ? WHERE id = ?').run(action === 'pin' ? 1 : 0, n.id);
    return { noteId: n.id };
  }

  if (action === 'update') {
    const n = ownNote(p.noteId, uid);
    if (!n) throw new Error('that note no longer exists');
    db.prepare('UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ?').run(
      p.after.title,
      p.after.content,
      nowIso(),
      n.id
    );
    return { noteId: n.id };
  }

  if (action === 'attach') {
    const n = ownNote(p.noteId, uid);
    if (!n) throw new Error('that note no longer exists');
    db.prepare(
      'UPDATE notes SET type = ?, attachment_path = ?, attachment_size = ?, updated_at = ? WHERE id = ?'
    ).run(p.after.type, p.after.attachment_path, p.after.attachment_size, nowIso(), n.id);
    return { noteId: n.id };
  }

  if (action === 'mail') {
    const n = ownNote(p.noteId, uid);
    if (!n) throw new Error('that note no longer exists');
    db.prepare('UPDATE notes SET mail = ? WHERE id = ?').run(p.after, n.id);
    return { noteId: n.id };
  }

  if (action === 'link-relation') {
    return applyLinkRelation(p.noteA, p.noteB, p.centerId, p.otherId, p.after, uid);
  }

  throw new Error('unknown action');
}

// Most recent entries, newest first. `stale` flags entries whose actionable
// direction (undo for a live entry, redo for an undone one) would now be a
// no-op or is blocked, so the client can explain why up front.
router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, action, summary, payload, created_at, undone_at
       FROM history WHERE user_id = ? ORDER BY id DESC LIMIT 20`
    )
    .all(req.userId);

  res.json(
    rows.map((r) => {
      const p = safeParse(r.payload);
      return {
        id: r.id,
        action: r.action,
        summary: r.summary,
        created_at: r.created_at,
        undone_at: r.undone_at,
        stale: r.undone_at
          ? isRedoStale(r.action, p, req.userId)
          : isStale(r.action, p, req.userId),
      };
    })
  );
});

// Would undoing this entry currently do nothing / be impossible? (Advisory —
// the POST still re-checks and is the source of truth.)
function isStale(action, p, uid) {
  try {
    if (action === 'link') {
      const [a, b] = pair(p.a, p.b);
      return !linkExists(a, b, uid); // link already gone
    }
    if (action === 'unlink') {
      const [a, b] = pair(p.a, p.b);
      if (!ownNote(a, uid) || !ownNote(b, uid)) return true;
      return Boolean(linkExists(a, b, uid)); // already re-linked
    }
    if (action === 'rehome') {
      const [ta, tb] = pair(p.to, p.card);
      return !linkExists(ta, tb, uid);
    }
    if (action === 'create') {
      const n = ownNote(p.noteId, uid);
      return !n || n.status === 'deleted';
    }
    if (action === 'status') {
      const n = ownNote(p.noteId, uid);
      return !n || n.status === p.from;
    }
    if (action === 'share') return !sharedNotes(p, uid, true).length;
    if (action === 'unshare') {
      const n = db.prepare('SELECT share_id, status FROM notes WHERE id = ?').get(p.noteId);
      return !n || n.status === 'deleted' || n.share_id != null;
    }
    if (action === 'ref') return !refRow(p, uid);
    if (action === 'reminder') return reminderIs(p, p.before, uid);
    if (action === 'restore') return !snapshots.snapshotExists(p.before);
    if (action === 'unref') return Boolean(refRow(p, uid));
    if (action === 'pin') {
      const n = ownNote(p.noteId, uid);
      return !n || !n.pinned;
    }
    if (action === 'unpin') {
      const n = ownNote(p.noteId, uid);
      return !n || Boolean(n.pinned);
    }
    if (action === 'update') {
      const n = ownNote(p.noteId, uid);
      if (!n) return true;
      return n.title === p.before.title && n.content === p.before.content;
    }
    if (action === 'attach') {
      const n = ownNote(p.noteId, uid);
      if (!n) return true;
      return n.type !== p.after.type || n.attachment_path !== p.after.attachment_path;
    }
    if (action === 'mail') {
      const n = ownNote(p.noteId, uid);
      return !n || n.mail === p.before;
    }
    if (action === 'link-relation') {
      const center = ownNote(p.centerId, uid);
      const other = ownNote(p.otherId, uid);
      if (!center || !other || !linkExists(p.noteA, p.noteB, uid)) return true;
      const link = db.prepare('SELECT kind FROM links WHERE note_a = ? AND note_b = ?').get(p.noteA, p.noteB);
      // Already undone (or changed back to `before` by something else)?
      return (
        center.created_from_note_id === p.before.centerCreatedFrom &&
        other.created_from_note_id === p.before.otherCreatedFrom &&
        (link.kind || null) === p.before.kind
      );
    }
  } catch {
    return true;
  }
  return false;
}

// Would redoing this undone entry currently do nothing / be impossible?
function isRedoStale(action, p, uid) {
  try {
    if (action === 'link') {
      const [a, b] = pair(p.a, p.b);
      if (!ownNote(a, uid) || !ownNote(b, uid)) return true;
      return Boolean(linkExists(a, b, uid)); // link already back
    }
    if (action === 'unlink') {
      const [a, b] = pair(p.a, p.b);
      return !linkExists(a, b, uid); // link already gone
    }
    if (action === 'rehome') {
      if (!ownNote(p.to, uid) || !ownNote(p.card, uid)) return true;
      const [ta, tb] = pair(p.to, p.card);
      return Boolean(linkExists(ta, tb, uid));
    }
    if (action === 'create') {
      const n = ownNote(p.noteId, uid);
      return !n || n.status !== 'deleted';
    }
    if (action === 'status') {
      const n = ownNote(p.noteId, uid);
      return !n || n.status === p.to;
    }
    if (action === 'share') return !sharedNotes(p, uid, false).length;
    if (action === 'unshare') {
      const n = db.prepare('SELECT share_id, status FROM notes WHERE id = ?').get(p.noteId);
      return !n || n.status === 'deleted' || n.share_id !== p.shareId;
    }
    if (action === 'ref') return Boolean(refRow(p, uid));
    if (action === 'reminder') return reminderIs(p, p.after, uid);
    if (action === 'restore') return !snapshots.snapshotExists(p.after);
    if (action === 'unref') return !refRow(p, uid);
    if (action === 'pin') {
      const n = ownNote(p.noteId, uid);
      return !n || Boolean(n.pinned);
    }
    if (action === 'unpin') {
      const n = ownNote(p.noteId, uid);
      return !n || !n.pinned;
    }
    if (action === 'update') {
      const n = ownNote(p.noteId, uid);
      if (!n) return true;
      return n.title === p.after.title && n.content === p.after.content;
    }
    if (action === 'attach') {
      const n = ownNote(p.noteId, uid);
      if (!n) return true;
      return n.type !== p.before.type || n.attachment_path !== p.before.attachment_path;
    }
    if (action === 'mail') {
      const n = ownNote(p.noteId, uid);
      return !n || n.mail === p.after;
    }
    if (action === 'link-relation') {
      const center = ownNote(p.centerId, uid);
      const other = ownNote(p.otherId, uid);
      if (!center || !other || !linkExists(p.noteA, p.noteB, uid)) return true;
      const link = db.prepare('SELECT kind FROM links WHERE note_a = ? AND note_b = ?').get(p.noteA, p.noteB);
      // Already redone (or independently set to `after` by something else)?
      return (
        center.created_from_note_id === p.after.centerCreatedFrom &&
        other.created_from_note_id === p.after.otherCreatedFrom &&
        (link.kind || null) === p.after.kind
      );
    }
  } catch {
    return true;
  }
  return false;
}

// 'restore' (routes/account.js's backup restore) swaps the whole account
// back from a snapshot — including the history table itself, so the entry
// being undone/redone disappears with it. Undo snapshots the restored state
// first (p.after, for redo), loads p.before, then appends a fresh, already-
// undone 'restore' entry so redo stays reachable; redo loads p.after, whose
// own history still holds the original (not undone) entry. Runs outside
// db.transaction — ATTACH/VACUUM can't run inside one.
function swapRestore(row, p, uid, dir) {
  if (dir === 'undo') {
    if (!p.after) p.after = snapshots.takeSnapshot(uid, 'post-restore');
    snapshots.restoreUserFromSnapshot(uid, p.before);
    db.prepare(
      'INSERT INTO history (user_id, action, summary, payload, created_at, undone_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(uid, 'restore', row.summary, JSON.stringify(p), row.created_at, nowIso());
  } else {
    snapshots.restoreUserFromSnapshot(uid, p.after);
  }
  return { ok: true, reload: true };
}

router.post('/:id/undo', (req, res) => {
  const row = db
    .prepare('SELECT * FROM history WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ error: 'not found' });
  if (row.undone_at) return res.status(409).json({ error: 'already undone' });
  if (row.action === 'restore') {
    try {
      return res.json(swapRestore(row, safeParse(row.payload), req.userId, 'undo'));
    } catch (e) {
      return res.status(409).json({ error: e.message || 'could not undo' });
    }
  }

  const p = safeParse(row.payload);
  try {
    const out = db.transaction(() => {
      const r = applyUndo(row.action, p, req.userId);
      // p may have been updated in place (see undoShare/redoShare).
      db.prepare('UPDATE history SET undone_at = ?, payload = ? WHERE id = ?').run(nowIso(), JSON.stringify(p), row.id);
      return r;
    })();
    res.json({ ok: true, ...out });
  } catch (e) {
    res.status(409).json({ error: e.message || 'could not undo' });
  }
});

router.post('/:id/redo', (req, res) => {
  const row = db
    .prepare('SELECT * FROM history WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ error: 'not found' });
  if (!row.undone_at) return res.status(409).json({ error: 'not undone' });
  if (row.action === 'restore') {
    try {
      return res.json(swapRestore(row, safeParse(row.payload), req.userId, 'redo'));
    } catch (e) {
      return res.status(409).json({ error: e.message || 'could not redo' });
    }
  }

  const p = safeParse(row.payload);
  try {
    const out = db.transaction(() => {
      const r = applyRedo(row.action, p, req.userId);
      db.prepare('UPDATE history SET undone_at = NULL, payload = ? WHERE id = ?').run(JSON.stringify(p), row.id);
      return r;
    })();
    res.json({ ok: true, ...out });
  } catch (e) {
    res.status(409).json({ error: e.message || 'could not redo' });
  }
});

module.exports = router;
