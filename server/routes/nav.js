const express = require('express');
const db = require('../db');

const router = express.Router();

const VIA = new Set([
  'neighbor', 'parent', 'search', 'pin', 'hash', 'from-link', 'create', 'tab', 'unknown',
]);

// Record one graph move: the user centered `to`, arriving from `from` (null for
// jumps). Fire-and-forget from the client — never blocks navigation.
router.post('/', (req, res) => {
  const to = Number(req.body.to);
  if (!Number.isInteger(to) || to <= 0) {
    return res.status(400).json({ error: 'to is required' });
  }
  const toNote = db
    .prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?')
    .get(to, req.userId);
  if (!toNote) return res.status(404).json({ error: 'note not found' });

  let from = Number(req.body.from);
  if (!Number.isInteger(from) || from <= 0) {
    from = null;
  } else {
    const fromNote = db
      .prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?')
      .get(from, req.userId);
    if (!fromNote) from = null;
  }

  const via = VIA.has(req.body.via) ? req.body.via : 'unknown';

  db.prepare(
    'INSERT INTO nav_events (user_id, from_note_id, to_note_id, via) VALUES (?, ?, ?, ?)'
  ).run(req.userId, from, to, via);

  res.status(204).end();
});

module.exports = router;
