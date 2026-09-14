const fs = require('fs');
const path = require('path');
const express = require('express');
const db = require('../db');
const history = require('../history');
const { uploadsDir, diskUpload } = require('../upload-config');
const { buildHierarchy, subtreeIds, probableRoot } = require('../hierarchy');
const { extractTags } = require('../tags');

const router = express.Router();

const now = () => new Date().toISOString();

const upload = diskUpload();

// Coerce a lat/lon pair from request body into finite numbers, or null if absent/invalid.
function parseCoords(body) {
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  if (body.lat === undefined || body.lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { lat: null, lon: null };
  }
  return { lat, lon };
}

// --- "Probable next step" / "probable parent" scoring ---------------------
// A nav event's weight halves every HALF_LIFE_DAYS so ranking follows recent
// habits. neighbor score blends: transition probability from the centered note,
// the neighbour's global visit weight, and how recently the link was made.
const HALF_LIFE_DAYS = 14;
const SCORE_W = { transition: 0.6, popularity: 0.15, linkRecency: 0.25 };
const NEIGHBOR_LIMIT = 8;
const decaySum = `SUM(pow(0.5, (julianday('now') - julianday(created_at)) / ${HALF_LIFE_DAYS}.0))`;

// List all non-deleted notes for the current user — used for search/picker/pin bar.
router.get('/', (req, res) => {
  const notes = db
    .prepare(
      `SELECT id, title, updated_at, pinned, type, status, lat, lon
       FROM notes WHERE user_id = ? AND status != 'deleted'
       ORDER BY updated_at DESC`
    )
    .all(req.userId);
  res.json(notes);
});

router.post('/', (req, res) => {
  const { title, content = '', linkTo } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  const { lat, lon } = parseCoords(req.body);

  let linkToId = null;
  if (linkTo) {
    const target = db
      .prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?')
      .get(linkTo, req.userId);
    if (!target) return res.status(404).json({ error: 'linkTo note not found' });
    linkToId = target.id;
  }

  const insertNote = db.prepare(
    `INSERT INTO notes (title, content, created_at, updated_at, lat, lon, created_from_note_id, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const linkNotes = db.prepare(
    'INSERT OR IGNORE INTO links (note_a, note_b, created_at, user_id) VALUES (?, ?, ?, ?)'
  );

  const create = db.transaction(() => {
    const ts = now();
    const info = insertNote.run(title.trim(), content, ts, ts, lat, lon, linkToId, req.userId);
    const id = info.lastInsertRowid;
    if (linkToId) {
      linkNotes.run(Math.min(id, linkToId), Math.max(id, linkToId), ts, req.userId);
    }
    return id;
  });

  const id = create();
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
  history.record(req.userId, 'create', { noteId: id, title: note.title }, `Created "${note.title}"`);
  res.status(201).json(note);
});

// Full-text search over the caller's notes. Must be declared before "/:id".
router.get('/search', (req, res) => {
  const raw = String(req.query.q || '').trim();
  const terms = raw.toLowerCase().match(/[\p{L}\p{N}_]+/gu) || [];
  if (!terms.length) return res.json([]);

  // Quote each term (defuses FTS operators); prefix-match the last one so
  // results appear while the user is still typing.
  const match = terms
    .map((t, i) => (i === terms.length - 1 ? `"${t}"*` : `"${t}"`))
    .join(' ');
  const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 30);

  try {
    const rows = db
      .prepare(
        `SELECT n.id, n.title, n.type,
                snippet(notes_fts, 1, '[', ']', '…', 12) AS snippet
         FROM notes_fts
         JOIN notes n ON n.id = notes_fts.rowid
         WHERE notes_fts MATCH ? AND n.user_id = ? AND n.status != 'deleted'
         ORDER BY bm25(notes_fts, 5.0, 1.0)
         LIMIT ?`
      )
      .all(match, req.userId, limit);
    res.json(rows);
  } catch (err) {
    res.json([]);
  }
});

// GTD context tags are just `@word` mentions in a note's own text (see
// server/tags.js) — no column, nothing to keep in sync. This lists what's
// already in use, for the editor's tag-insert modal — a reuse convenience,
// typing `@word` directly works with no server involved at all. Must be
// declared before "/:id" for the same reason as "/search" above.
const DEFAULT_TAGS = ['phone', 'errands', 'home', 'computer', 'anywhere'];

router.get('/tags', (req, res) => {
  // Finished (done) or removed notes don't need re-surfacing as suggestions.
  const rows = db
    .prepare(
      "SELECT title, content FROM notes WHERE user_id = ? AND status NOT IN ('deleted', 'done')"
    )
    .all(req.userId);

  const counts = new Map();
  for (const { title, content } of rows) {
    for (const tag of new Set([...extractTags(title), ...extractTags(content)])) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  const used = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
  const tags = [...used, ...DEFAULT_TAGS.filter((t) => !counts.has(t))].slice(0, 8);
  res.json({ tags });
});

// The most globally significant root note — the landing spot when there's no
// better context to resume (e.g. the last open tab was just closed). Must be
// declared before "/:id" for the same reason as "/search" above.
router.get('/probable-root', (req, res) => {
  const root = probableRoot(req.userId);
  res.json({ note: root ? { id: root.id, title: root.title } : null });
});

router.get('/:id', (req, res) => {
  const note = db
    .prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!note) return res.status(404).json({ error: 'not found' });
  res.json(note);
});

// Optional offline-sync fields in the body:
//   baseUpdatedAt   — the `updated_at` the client last saw for this row. If it
//                     no longer matches, the row changed elsewhere while the
//                     client was offline: that's a conflict.
//   clientUpdatedAt — when the offline edit was actually made. On a conflict,
//                     a field the client sent is kept only if the client's edit
//                     is newer than the server's current `updated_at`; otherwise
//                     the server's value wins that field. The response carries
//                     `conflict: true` so the client can preserve the loser as a
//                     "conflicted copy" note.
// Clients that send neither field keep the old last-write-wins behaviour.
router.put('/:id', (req, res) => {
  const { title, content, baseUpdatedAt, clientUpdatedAt } = req.body;
  const note = db
    .prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!note) return res.status(404).json({ error: 'not found' });

  let newTitle = title !== undefined ? title.trim() : note.title;
  let newContent = content !== undefined ? content : note.content;
  if (!newTitle) return res.status(400).json({ error: 'title is required' });

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
    req.params.id
  );
  history.recordUpdate(
    req.userId,
    note.id,
    { title: note.title, content: note.content },
    { title: newTitle, content: newContent },
    `Edited "${newTitle}"`
  );
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  res.json(conflict ? { ...row, conflict: true } : row);
});

router.delete('/:id', (req, res) => {
  const note = db
    .prepare('SELECT pinned, type, attachment_path FROM notes WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!note) return res.status(404).json({ error: 'not found' });
  if (note.pinned) return res.status(409).json({ error: 'note is pinned; unpin before deleting' });

  db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);

  if (
    (note.type === 'image' || note.type === 'audio' || note.type === 'file') &&
    note.attachment_path
  ) {
    const filePath = path.join(uploadsDir, path.basename(note.attachment_path));
    fs.unlink(filePath, () => {});
  }

  res.status(204).end();
});

router.put('/:id/pin', (req, res) => {
  const info = db
    .prepare('UPDATE notes SET pinned = 1 WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.userId);
  if (info.changes === 0) return res.status(404).json({ error: 'not found' });
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  history.record(req.userId, 'pin', { noteId: note.id }, `Pinned "${note.title}"`);
  res.json(note);
});

router.delete('/:id/pin', (req, res) => {
  const info = db
    .prepare('UPDATE notes SET pinned = 0 WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.userId);
  if (info.changes === 0) return res.status(404).json({ error: 'not found' });
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  history.record(req.userId, 'unpin', { noteId: note.id }, `Unpinned "${note.title}"`);
  res.json(note);
});

const NOTE_STATUSES = new Set(['active', 'waiting', 'todo', 'done', 'deleted']);

const STATUS_VERB = {
  deleted: 'Deleted',
  done: 'Completed',
  todo: 'Flagged to-do',
  waiting: 'Flagged waiting',
  active: 'Reopened',
};

router.put('/:id/status', (req, res) => {
  const { status } = req.body;
  if (!NOTE_STATUSES.has(status)) {
    return res.status(400).json({ error: `status must be one of: ${[...NOTE_STATUSES].join(', ')}` });
  }
  const prev = db
    .prepare('SELECT id, title, status FROM notes WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!prev) return res.status(404).json({ error: 'not found' });

  db.prepare('UPDATE notes SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(
    status,
    now(),
    req.params.id,
    req.userId
  );

  if (status !== prev.status) {
    history.record(
      req.userId,
      'status',
      { noteId: prev.id, from: prev.status, to: status },
      `${STATUS_VERB[status] || 'Changed'} "${prev.title}"`
    );
  }
  res.json(db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id));
});

// Linked, non-deleted notes ranked by "probable next step", plus the single
// "probable parent" — recorded provenance, falling back to the oldest link.
// Deliberately *not* based on nav_events: as you go back and forth between a
// child and its parent, that back-and-forth would itself pile up "inbound
// transition" weight and could point "back" at whichever note you happened
// to arrive from, rather than the note's actual place in the hierarchy.
// Shape: { parent: <neighbor|null>, neighbors: [<neighbor with .p and .score>] }.
router.get('/:id/neighbors', (req, res) => {
  const id = Number(req.params.id);
  const uid = req.userId;

  const center = db
    .prepare('SELECT id, created_from_note_id FROM notes WHERE id = ? AND user_id = ?')
    .get(id, uid);
  if (!center) return res.status(404).json({ error: 'not found' });

  const linked = db
    .prepare(
      `SELECT n.id, n.title, n.updated_at, n.type, n.attachment_path, n.status,
              n.created_from_note_id, n.created_at AS note_created_at,
              l.created_at AS linked_at
       FROM links l
       JOIN notes n ON n.id = CASE WHEN l.note_a = ? THEN l.note_b ELSE l.note_a END
       WHERE (l.note_a = ? OR l.note_b = ?) AND n.user_id = ? AND n.status != 'deleted'
       ORDER BY l.created_at DESC`
    )
    .all(id, id, id, uid);

  if (linked.length === 0) return res.json({ parent: null, neighbors: [], linkCount: 0, links: [] });

  const links = linked.map((r) => ({ id: r.id, title: r.title, type: r.type, status: r.status }));

  const weightMap = (rows) => new Map(rows.map((r) => [r.nid, r.w]));

  const fwd = weightMap(
    db
      .prepare(
        `SELECT to_note_id AS nid, ${decaySum} AS w
         FROM nav_events WHERE user_id = ? AND from_note_id = ?
         GROUP BY to_note_id`
      )
      .all(uid, id)
  );
  const fwdTotal = [...fwd.values()].reduce((s, w) => s + w, 0);

  const pop = weightMap(
    db
      .prepare(
        `SELECT to_note_id AS nid, ${decaySum} AS w
         FROM nav_events WHERE user_id = ?
         GROUP BY to_note_id`
      )
      .all(uid)
  );
  const popMax = Math.max(1, ...pop.values());

  const n = linked.length;
  const scored = linked.map((row, i) => {
    const p = fwdTotal > 0 ? (fwd.get(row.id) || 0) / fwdTotal : 0;
    const popularity = (pop.get(row.id) || 0) / popMax;
    const linkRecency = n > 1 ? (n - 1 - i) / (n - 1) : 1; // 1 = most recently linked
    const score =
      fwdTotal > 0
        ? SCORE_W.transition * p +
          SCORE_W.popularity * popularity +
          SCORE_W.linkRecency * linkRecency
        : linkRecency; // cold start: original link-recency order
    return { ...row, p, score };
  });

  // Probable parent: recorded provenance first. 'done' notes are dimmed/sunk
  // everywhere else, so they're never picked as the back-link either — a
  // finished note shouldn't be where "back" lands.
  let parent = null;
  if (center.created_from_note_id) {
    const fallback = scored.find((r) => r.id === center.created_from_note_id) || null;
    parent = fallback && fallback.status !== 'done' ? fallback : null;
  }
  // Structural fallback: no recorded provenance. First, drop any candidate
  // that's provably this note's child rather than its parent:
  //  - created_from_note_id says so explicitly, or
  //  - the candidate's own created_at exactly matches the link's created_at,
  //    meaning it was born at the moment this link was made — the same
  //    "spawned via a `[[wikilink]]`" shape as created_from_note_id, just on
  //    notes old enough (or imported) to predate that column being recorded.
  if (!parent) {
    const candidates = scored.filter(
      (r) => r.created_from_note_id !== id && r.note_created_at !== r.linked_at
    );
    // `linked` (and so `candidates`, which preserves its order) is sorted by
    // link creation DESC, so the last non-done entry is the oldest surviving
    // link, i.e. the note's probable parent in the hierarchy.
    let skippedDone = false;
    let oldestSurvivor = null;
    for (let i = candidates.length - 1; i >= 0; i--) {
      if (candidates[i].status === 'done') {
        skippedDone = true;
        continue;
      }
      oldestSurvivor = candidates[i];
      break;
    }
    // But if a 'done' note had to be skipped to get there, the *true* oldest
    // link got archived — the next-oldest survivor is often just an
    // incidental note linked around the same time, not a real parent. In
    // that case prefer the most-linked survivor instead: a structural parent
    // tends to be a hub other notes also point to, which chronology alone
    // can't tell once the actual oldest link is gone.
    if (oldestSurvivor && skippedDone) {
      const degreeRows = db
        .prepare(
          `SELECT nid, COUNT(*) AS deg FROM (
             SELECT note_a AS nid FROM links WHERE user_id = ?
             UNION ALL
             SELECT note_b AS nid FROM links WHERE user_id = ?
           ) GROUP BY nid`
        )
        .all(uid, uid);
      const degree = new Map(degreeRows.map((r) => [r.nid, r.deg]));
      const survivors = candidates.filter((r) => r.status !== 'done');
      survivors.sort((a, b) => {
        const da = degree.get(a.id) || 0;
        const dbDeg = degree.get(b.id) || 0;
        if (da !== dbDeg) return dbDeg - da;
        return a.linked_at < b.linked_at ? -1 : a.linked_at > b.linked_at ? 1 : 0;
      });
      parent = survivors[0];
    } else {
      parent = oldestSurvivor;
    }
  }

  const parentId = parent ? parent.id : null;
  // 'done' neighbours always rank below active ones, so they're the first to be
  // dropped when the grid can only show NEIGHBOR_LIMIT links.
  const neighbors = scored
    .filter((r) => r.id !== parentId)
    .sort((a, b) => {
      const ad = a.status === 'done' ? 1 : 0;
      const bd = b.status === 'done' ? 1 : 0;
      if (ad !== bd) return ad - bd;
      return b.score - a.score;
    })
    .slice(0, parent ? NEIGHBOR_LIMIT - 1 : NEIGHBOR_LIMIT);

  res.json({ parent, neighbors, linkCount: linked.length, links });
});

// Every 'todo'-flagged note anywhere under this one in the inferred hierarchy
// (any depth) — the to-do header bar scopes to this instead of every open
// note account-wide, so it reads as "what's left to do in this project."
router.get('/:id/subtree-todos', (req, res) => {
  const id = Number(req.params.id);
  const uid = req.userId;
  const center = db.prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?').get(id, uid);
  if (!center) return res.status(404).json({ error: 'not found' });

  const { byId, childrenOf } = buildHierarchy(uid);
  const todos = subtreeIds(childrenOf, id)
    .map((nid) => byId.get(nid))
    .filter((n) => n && n.status === 'todo')
    .map((n) => ({ id: n.id, title: n.title }));
  res.json({ todos });
});

// Every note id anywhere under this one, any depth — excludes the note
// itself. Generic version of subtree-todos, for scoping other per-note lists
// (the alarm header bar) to "under here" instead of account-wide.
router.get('/:id/subtree-ids', (req, res) => {
  const id = Number(req.params.id);
  const uid = req.userId;
  const center = db.prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?').get(id, uid);
  if (!center) return res.status(404).json({ error: 'not found' });

  const { childrenOf } = buildHierarchy(uid);
  res.json({ ids: subtreeIds(childrenOf, id) });
});

const ATTACHMENT_TYPES = new Set(['image', 'audio', 'file', 'contact', 'app']);

// Create a new note of a given attachment type, linked to :id (the note it was
// captured from). One note per attachment — image/audio/file upload a file;
// contact and app store their data directly on the note.
router.post('/:id/attachments', upload.single('file'), (req, res) => {
  const parentId = Number(req.params.id);
  const parent = db
    .prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?')
    .get(parentId, req.userId);
  if (!parent) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: 'parent note not found' });
  }

  // Inline image: store the file through the same MIME allowlist + size cap as a
  // normal attachment, but create no attachment note and no link — the caller
  // drops a `![](<path>)` into the markdown source instead. No history entry.
  if (req.body.inline === '1' || req.body.inline === 'true') {
    if (!req.file || req.file.mimetype.split('/')[0] !== 'image') {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'a supported image file is required' });
    }
    return res.status(201).json({ path: `/uploads/${req.file.filename}` });
  }

  const { type, contactName, contactPhone, contactEmail, appUri, appLabel } = req.body;
  if (!ATTACHMENT_TYPES.has(type)) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: `type must be one of: ${[...ATTACHMENT_TYPES].join(', ')}` });
  }

  let attachmentPath = null;
  let defaultTitle = 'Attachment';

  if (type === 'image' || type === 'audio' || type === 'file') {
    if (!req.file) {
      return res.status(400).json({ error: 'a supported file is required' });
    }
    if (type !== 'file') {
      const kind = req.file.mimetype.split('/')[0];
      if (kind !== type) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: `file type does not match "${type}"` });
      }
    }
    attachmentPath = `/uploads/${req.file.filename}`;
    defaultTitle =
      type === 'image' ? 'Photo' : type === 'audio' ? 'Recording' : req.file.originalname || 'File';
  } else if (type === 'contact') {
    if (!contactName || !contactName.trim()) {
      return res.status(400).json({ error: 'contactName is required for contact attachments' });
    }
    attachmentPath = JSON.stringify({
      name: contactName.trim(),
      phone: contactPhone || '',
      email: contactEmail || '',
    });
    defaultTitle = contactName.trim();
  } else if (type === 'app') {
    if (!appUri || !appUri.trim()) {
      return res.status(400).json({ error: 'appUri is required for app attachments' });
    }
    attachmentPath = appUri.trim();
    defaultTitle = (appLabel && appLabel.trim()) || appUri.trim();
  }

  const title = (req.body.title && req.body.title.trim()) || defaultTitle;
  const content = req.body.content || '';
  const { lat, lon } = parseCoords(req.body);

  const insertNote = db.prepare(
    `INSERT INTO notes (title, content, created_at, updated_at, type, lat, lon, created_from_note_id, attachment_path, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const linkNotes = db.prepare(
    'INSERT OR IGNORE INTO links (note_a, note_b, created_at, user_id) VALUES (?, ?, ?, ?)'
  );

  const create = db.transaction(() => {
    const ts = now();
    const info = insertNote.run(title, content, ts, ts, type, lat, lon, parentId, attachmentPath, req.userId);
    const id = info.lastInsertRowid;
    linkNotes.run(Math.min(id, parentId), Math.max(id, parentId), ts, req.userId);
    return id;
  });

  const id = create();
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
  history.record(
    req.userId,
    'create',
    { noteId: id, title: note.title },
    `Added ${type} "${note.title}"`
  );
  res.status(201).json(note);
});

module.exports = router;
