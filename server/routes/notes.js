const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const db = require('../db');
const history = require('../history');

const router = express.Router();

const now = () => new Date().toISOString();

const uploadsDir = path.join(__dirname, '..', '..', 'data', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

// Stored extension comes from an allowlist keyed to the uploaded MIME type, never
// from the client-supplied filename — otherwise an `x.html` / `x.svg` "image"
// lands under /uploads and executes as script on this origin. SVG is excluded
// deliberately (it can carry script).
const IMAGE_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
};
const AUDIO_EXT = {
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/wave': '.wav',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const ext = IMAGE_EXT[file.mimetype] || AUDIO_EXT[file.mimetype] || '.bin';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, Boolean(IMAGE_EXT[file.mimetype] || AUDIO_EXT[file.mimetype]));
  },
});

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

router.get('/:id', (req, res) => {
  const note = db
    .prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!note) return res.status(404).json({ error: 'not found' });
  res.json(note);
});

router.put('/:id', (req, res) => {
  const { title, content } = req.body;
  const note = db
    .prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!note) return res.status(404).json({ error: 'not found' });

  const newTitle = title !== undefined ? title.trim() : note.title;
  const newContent = content !== undefined ? content : note.content;
  if (!newTitle) return res.status(400).json({ error: 'title is required' });

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
  res.json(db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const note = db
    .prepare('SELECT pinned, type, attachment_path FROM notes WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!note) return res.status(404).json({ error: 'not found' });
  if (note.pinned) return res.status(409).json({ error: 'note is pinned; unpin before deleting' });

  db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);

  if ((note.type === 'image' || note.type === 'audio') && note.attachment_path) {
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

const NOTE_STATUSES = new Set(['active', 'todo', 'done', 'deleted']);

const STATUS_VERB = {
  deleted: 'Deleted',
  done: 'Completed',
  todo: 'Flagged to-do',
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
// "probable parent" (strongest inbound transition, falling back to provenance).
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

  const back = weightMap(
    db
      .prepare(
        `SELECT from_note_id AS nid, ${decaySum} AS w
         FROM nav_events
         WHERE user_id = ? AND to_note_id = ? AND from_note_id IS NOT NULL
         GROUP BY from_note_id`
      )
      .all(uid, id)
  );

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

  // Probable parent: strongest inbound transition, else recorded provenance.
  let parent = null;
  let bestBack = 0;
  for (const row of scored) {
    const w = back.get(row.id) || 0;
    if (w > bestBack) {
      bestBack = w;
      parent = row;
    }
  }
  if (!parent && center.created_from_note_id) {
    parent = scored.find((r) => r.id === center.created_from_note_id) || null;
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

const ATTACHMENT_TYPES = new Set(['image', 'audio', 'contact', 'app']);

// Create a new note of a given attachment type, linked to :id (the note it was
// captured from). One note per attachment — image/audio upload a file; contact
// and app store their data directly on the note.
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

  if (type === 'image' || type === 'audio') {
    if (!req.file) {
      return res.status(400).json({ error: 'a supported image or audio file is required' });
    }
    const kind = req.file.mimetype.split('/')[0];
    if (kind !== type) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: `file type does not match "${type}"` });
    }
    attachmentPath = `/uploads/${req.file.filename}`;
    defaultTitle = type === 'image' ? 'Photo' : 'Recording';
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
