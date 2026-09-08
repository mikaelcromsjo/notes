const express = require('express');
const db = require('../db');

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

function ownNote(id, uid) {
  return db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(id, uid);
}

function linkExists(a, b, uid) {
  return db
    .prepare('SELECT 1 FROM links WHERE note_a = ? AND note_b = ? AND user_id = ?')
    .get(a, b, uid);
}

function addLink(a, b, uid) {
  db.prepare(
    'INSERT OR IGNORE INTO links (note_a, note_b, created_at, user_id) VALUES (?, ?, ?, ?)'
  ).run(a, b, nowIso(), uid);
}

function removeLink(a, b, uid) {
  db.prepare('DELETE FROM links WHERE note_a = ? AND note_b = ? AND user_id = ?').run(a, b, uid);
}

// Reverse one recorded action. Throws with a human message when the world has
// moved on far enough that the undo can't be applied safely; returns
// { noteId } for the note the caller may want to recenter/refresh on.
function applyUndo(action, p, uid) {
  if (action === 'link') {
    const [a, b] = pair(p.a, p.b);
    removeLink(a, b, uid);
    return {};
  }

  if (action === 'unlink') {
    const [a, b] = pair(p.a, p.b);
    if (!ownNote(a, uid) || !ownNote(b, uid)) throw new Error('one of those notes no longer exists');
    addLink(a, b, uid);
    return {};
  }

  if (action === 'rehome') {
    // Original move: linked (to ↔ card), unlinked (from ↔ card).
    const [ta, tb] = pair(p.to, p.card);
    removeLink(ta, tb, uid);
    if (ownNote(p.from, uid) && ownNote(p.card, uid)) {
      const [fa, fb] = pair(p.from, p.card);
      addLink(fa, fb, uid);
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

  if (action === 'status') {
    const n = ownNote(p.noteId, uid);
    if (!n) throw new Error('that note no longer exists');
    db.prepare('UPDATE notes SET status = ?, updated_at = ? WHERE id = ?').run(p.from, nowIso(), n.id);
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

  throw new Error('unknown action');
}

// Re-apply an undone action (redo). Same "world moved on" guards as applyUndo,
// just in the original direction.
function applyRedo(action, p, uid) {
  if (action === 'link') {
    const [a, b] = pair(p.a, p.b);
    if (!ownNote(a, uid) || !ownNote(b, uid)) throw new Error('one of those notes no longer exists');
    addLink(a, b, uid);
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
    addLink(ta, tb, uid);
    const [fa, fb] = pair(p.from, p.card);
    removeLink(fa, fb, uid);
    return { noteId: p.card };
  }

  if (action === 'create') {
    const n = ownNote(p.noteId, uid);
    if (!n) throw new Error('that note no longer exists');
    db.prepare("UPDATE notes SET status = 'active', updated_at = ? WHERE id = ?").run(nowIso(), n.id);
    return { noteId: n.id };
  }

  if (action === 'status') {
    const n = ownNote(p.noteId, uid);
    if (!n) throw new Error('that note no longer exists');
    db.prepare('UPDATE notes SET status = ?, updated_at = ? WHERE id = ?').run(p.to, nowIso(), n.id);
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
  } catch {
    return true;
  }
  return false;
}

router.post('/:id/undo', (req, res) => {
  const row = db
    .prepare('SELECT * FROM history WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ error: 'not found' });
  if (row.undone_at) return res.status(409).json({ error: 'already undone' });

  const p = safeParse(row.payload);
  try {
    const out = db.transaction(() => {
      const r = applyUndo(row.action, p, req.userId);
      db.prepare("UPDATE history SET undone_at = ? WHERE id = ?").run(nowIso(), row.id);
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

  const p = safeParse(row.payload);
  try {
    const out = db.transaction(() => {
      const r = applyRedo(row.action, p, req.userId);
      db.prepare('UPDATE history SET undone_at = NULL WHERE id = ?').run(row.id);
      return r;
    })();
    res.json({ ok: true, ...out });
  } catch (e) {
    res.status(409).json({ error: e.message || 'could not redo' });
  }
});

module.exports = router;
