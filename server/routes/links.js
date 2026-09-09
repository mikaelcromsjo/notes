const express = require('express');
const db = require('../db');
const history = require('../history');

const router = express.Router();

const nowIso = () => new Date().toISOString();

// Create a link. When `rehomeFrom` is given, this is a card being dragged from
// one anchor to another: link (a ↔ b), drop (rehomeFrom ↔ b), and log the pair
// as a single reversible "moved" entry. `b` is the card; `a` the new anchor.
router.post('/', (req, res) => {
  const { a, b, rehomeFrom } = req.body;
  const aNum = Number(a);
  const bNum = Number(b);
  if (!Number.isInteger(aNum) || !Number.isInteger(bNum) || aNum <= 0 || bNum <= 0 || aNum === bNum) {
    return res.status(400).json({ error: 'a and b (distinct note ids) are required' });
  }
  const noteA = Math.min(aNum, bNum);
  const noteB = Math.max(aNum, bNum);

  const owned = db
    .prepare('SELECT COUNT(*) AS c FROM notes WHERE id IN (?, ?) AND user_id = ?')
    .get(noteA, noteB, req.userId);
  if (owned.c !== 2) {
    return res.status(404).json({ error: 'one or both notes not found' });
  }

  const isRehome =
    rehomeFrom &&
    Number(rehomeFrom) !== Number(b) &&
    db.prepare('SELECT 1 FROM notes WHERE id = ? AND user_id = ?').get(rehomeFrom, req.userId);

  db.transaction(() => {
    db.prepare(
      'INSERT OR IGNORE INTO links (note_a, note_b, created_at, user_id) VALUES (?, ?, ?, ?)'
    ).run(noteA, noteB, nowIso(), req.userId);

    if (isRehome) {
      const [fa, fb] = [Math.min(rehomeFrom, b), Math.max(rehomeFrom, b)];
      db.prepare('DELETE FROM links WHERE note_a = ? AND note_b = ? AND user_id = ?').run(
        fa,
        fb,
        req.userId
      );
    }
  })();

  if (isRehome) {
    history.record(
      req.userId,
      'rehome',
      { card: Number(b), from: Number(rehomeFrom), to: Number(a) },
      `Moved "${history.noteTitle(req.userId, b)}" from "${history.noteTitle(
        req.userId,
        rehomeFrom
      )}" into "${history.noteTitle(req.userId, a)}"`
    );
  } else {
    history.record(
      req.userId,
      'link',
      { a: noteA, b: noteB },
      `Linked "${history.noteTitle(req.userId, noteA)}" ↔ "${history.noteTitle(req.userId, noteB)}"`
    );
  }

  res.status(201).json({ a: noteA, b: noteB });
});

router.delete('/', (req, res) => {
  const { a, b } = req.body;
  if (!a || !b) return res.status(400).json({ error: 'a and b are required' });
  const noteA = Math.min(a, b);
  const noteB = Math.max(a, b);

  const owned = db
    .prepare('SELECT COUNT(*) AS c FROM notes WHERE id IN (?, ?) AND user_id = ?')
    .get(noteA, noteB, req.userId);
  if (owned.c !== 2) return res.status(404).json({ error: 'link not found' });

  const info = db
    .prepare('DELETE FROM links WHERE note_a = ? AND note_b = ?')
    .run(noteA, noteB);
  if (info.changes === 0) return res.status(404).json({ error: 'link not found' });

  history.record(
    req.userId,
    'unlink',
    { a: noteA, b: noteB },
    `Unlinked "${history.noteTitle(req.userId, noteA)}" ✕ "${history.noteTitle(req.userId, noteB)}"`
  );

  res.status(204).end();
});

module.exports = router;
