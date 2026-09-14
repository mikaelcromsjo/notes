const express = require('express');
const db = require('../db');

const router = express.Router();

// Exponential time-decay: a nav event's weight halves every HALF_LIFE_DAYS, so
// rankings track recent habits instead of all-time totals.
const HALF_LIFE_DAYS = 14;
const decay = (col) =>
  `SUM(pow(0.5, (julianday('now') - julianday(${col})) / ${HALF_LIFE_DAYS}.0))`;

// id -> 0..1 "heat" = normalized decayed visit count. Used by the "note heat"
// colour mode.
router.get('/note-heat', (req, res) => {
  const rows = db
    .prepare(
      `SELECT to_note_id AS id, ${decay('created_at')} AS w
       FROM nav_events WHERE user_id = ?
       GROUP BY to_note_id`
    )
    .all(req.userId);
  const max = Math.max(1, ...rows.map((r) => r.w));
  const out = {};
  for (const r of rows) out[r.id] = r.w / max;
  res.json(out);
});

// Insights overlay payload: most-visited notes, strongest paths, orphaned
// (linkless) notes, and the raw event count.
router.get('/insights', (req, res) => {
  const uid = req.userId;

  const topNotes = db
    .prepare(
      `SELECT n.id, n.title, COUNT(*) AS visits, ${decay('e.created_at')} AS weight
       FROM nav_events e JOIN notes n ON n.id = e.to_note_id
       WHERE e.user_id = ? AND n.status != 'deleted'
       GROUP BY e.to_note_id
       ORDER BY weight DESC LIMIT 10`
    )
    .all(uid);

  const topPaths = db
    .prepare(
      `SELECT e.from_note_id AS from_id, a.title AS from_title,
              e.to_note_id AS to_id, b.title AS to_title,
              COUNT(*) AS count, ${decay('e.created_at')} AS weight
       FROM nav_events e
       JOIN notes a ON a.id = e.from_note_id
       JOIN notes b ON b.id = e.to_note_id
       WHERE e.user_id = ? AND e.from_note_id IS NOT NULL
         AND a.status != 'deleted' AND b.status != 'deleted'
       GROUP BY e.from_note_id, e.to_note_id
       ORDER BY weight DESC LIMIT 12`
    )
    .all(uid);

  // Orphan = structurally disconnected — no links at all, so it can't be
  // reached via the grid, only by search. A linked note that just hasn't been
  // navigated to yet isn't an orphan; it's reachable, only unvisited.
  const orphans = db
    .prepare(
      `SELECT n.id, n.title FROM notes n
       WHERE n.user_id = ? AND n.status != 'deleted'
         AND NOT EXISTS (SELECT 1 FROM links l WHERE l.user_id = ? AND (l.note_a = n.id OR l.note_b = n.id))
       ORDER BY n.updated_at DESC LIMIT 20`
    )
    .all(uid, uid);

  const { total } = db
    .prepare('SELECT COUNT(*) AS total FROM nav_events WHERE user_id = ?')
    .get(uid);

  res.json({ topNotes, topPaths, orphans, totalEvents: total });
});

module.exports = router;
