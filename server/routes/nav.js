const express = require('express');
const db = require('../db');
const { resolveNoteAccess } = require('../shares');

const router = express.Router();

const VIA = new Set([
  'neighbor', 'parent', 'search', 'pin', 'todo', 'alarm', 'hash', 'from-link', 'create', 'tab', 'unknown',
]);

// Record one graph move: the user centered `to`, arriving from `from` (null for
// jumps). Fire-and-forget from the client — never blocks navigation.
router.post('/', (req, res) => {
  const to = Number(req.body.to);
  if (!Number.isInteger(to) || to <= 0) {
    return res.status(400).json({ error: 'to is required' });
  }
  const toAccess = resolveNoteAccess(db, req.userId, to);
  if (!toAccess.role) return res.status(404).json({ error: 'note not found' });

  let from = Number(req.body.from);
  if (!Number.isInteger(from) || from <= 0) {
    from = null;
  } else if (!resolveNoteAccess(db, req.userId, from).role) {
    from = null;
  }

  const via = VIA.has(req.body.via) ? req.body.via : 'unknown';

  db.prepare(
    'INSERT INTO nav_events (user_id, from_note_id, to_note_id, via) VALUES (?, ?, ?, ?)'
  ).run(req.userId, from, to, via);

  res.status(204).end();
});

module.exports = router;
