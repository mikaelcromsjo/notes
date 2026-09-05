const express = require('express');
const db = require('../db');

const router = express.Router();

const listStmt = db.prepare(`
  SELECT tabs.id, tabs.note_id, tabs.is_active, tabs.sort_order, notes.title
  FROM tabs
  JOIN notes ON notes.id = tabs.note_id
  WHERE tabs.user_id = ? AND notes.status != 'deleted'
  ORDER BY tabs.sort_order ASC
`);

function listTabs(userId) {
  return listStmt.all(userId);
}

const activateStmt = db.transaction((id, userId) => {
  db.prepare('UPDATE tabs SET is_active = 0 WHERE user_id = ?').run(userId);
  db.prepare('UPDATE tabs SET is_active = 1 WHERE id = ? AND user_id = ?').run(id, userId);
});

router.get('/', (req, res) => {
  res.json(listTabs(req.userId));
});

// Always opens a brand new tab on note_id (explicit "+" action).
router.post('/', (req, res) => {
  const { note_id } = req.body;
  const note = db
    .prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?')
    .get(note_id, req.userId);
  if (!note) return res.status(404).json({ error: 'note not found' });

  const create = db.transaction(() => {
    const { maxOrder } = db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) AS maxOrder FROM tabs WHERE user_id = ?')
      .get(req.userId);
    const info = db
      .prepare('INSERT INTO tabs (note_id, sort_order, is_active, user_id) VALUES (?, ?, 0, ?)')
      .run(note_id, maxOrder + 1, req.userId);
    activateStmt(info.lastInsertRowid, req.userId);
  });
  create();

  res.status(201).json(listTabs(req.userId));
});

// Move an existing tab to point at a different note (in-tab navigation).
router.put('/:id', (req, res) => {
  const { note_id } = req.body;
  const note = db
    .prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?')
    .get(note_id, req.userId);
  if (!note) return res.status(404).json({ error: 'note not found' });

  const info = db
    .prepare('UPDATE tabs SET note_id = ? WHERE id = ? AND user_id = ?')
    .run(note_id, req.params.id, req.userId);
  if (info.changes === 0) return res.status(404).json({ error: 'tab not found' });
  res.json(listTabs(req.userId));
});

router.put('/:id/activate', (req, res) => {
  const tab = db
    .prepare('SELECT id FROM tabs WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!tab) return res.status(404).json({ error: 'tab not found' });
  activateStmt(req.params.id, req.userId);
  res.json(listTabs(req.userId));
});

router.delete('/:id', (req, res) => {
  const remove = db.transaction(() => {
    const tab = db
      .prepare('SELECT * FROM tabs WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.userId);
    if (!tab) return false;

    db.prepare('DELETE FROM tabs WHERE id = ?').run(req.params.id);

    if (tab.is_active) {
      const next = db
        .prepare(
          `SELECT id FROM tabs
           WHERE user_id = ?
           ORDER BY ABS(sort_order - ?) ASC, sort_order ASC
           LIMIT 1`
        )
        .get(req.userId, tab.sort_order);
      if (next) activateStmt(next.id, req.userId);
    }
    return true;
  });

  if (!remove()) return res.status(404).json({ error: 'tab not found' });
  res.json(listTabs(req.userId));
});

module.exports = router;
