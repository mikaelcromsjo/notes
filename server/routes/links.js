const express = require('express');
const db = require('../db');

const router = express.Router();

router.post('/', (req, res) => {
  const { a, b } = req.body;
  if (!a || !b || a === b) {
    return res.status(400).json({ error: 'a and b (distinct note ids) are required' });
  }
  const noteA = Math.min(a, b);
  const noteB = Math.max(a, b);

  const owned = db
    .prepare('SELECT COUNT(*) AS c FROM notes WHERE id IN (?, ?) AND user_id = ?')
    .get(noteA, noteB, req.userId);
  if (owned.c !== 2) {
    return res.status(404).json({ error: 'one or both notes not found' });
  }

  db.prepare(
    'INSERT OR IGNORE INTO links (note_a, note_b, created_at, user_id) VALUES (?, ?, ?, ?)'
  ).run(noteA, noteB, new Date().toISOString(), req.userId);

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
  res.status(204).end();
});

module.exports = router;
