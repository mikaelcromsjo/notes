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

// Label propagation over the user's link graph -> { clusters: { id: clusterId } }.
// Cheap, dependency-free community detection for the "clusters" colour mode.
router.get('/clusters', (req, res) => {
  const uid = req.userId;
  const notes = db
    .prepare("SELECT id FROM notes WHERE user_id = ? AND status != 'deleted'")
    .all(uid)
    .map((r) => r.id);
  const links = db
    .prepare(
      `SELECT l.note_a, l.note_b FROM links l
       JOIN notes a ON a.id = l.note_a
       WHERE a.user_id = ?`
    )
    .all(uid);

  const adj = new Map(notes.map((id) => [id, []]));
  for (const { note_a, note_b } of links) {
    if (adj.has(note_a) && adj.has(note_b)) {
      adj.get(note_a).push(note_b);
      adj.get(note_b).push(note_a);
    }
  }

  const label = new Map(notes.map((id) => [id, id]));
  for (let iter = 0; iter < 20; iter++) {
    let changed = false;
    for (const id of notes) {
      const nbrs = adj.get(id);
      if (!nbrs.length) continue;
      const counts = new Map();
      for (const nb of nbrs) {
        const l = label.get(nb);
        counts.set(l, (counts.get(l) || 0) + 1);
      }
      let best = label.get(id);
      let bestC = -1;
      for (const [l, c] of counts) {
        if (c > bestC || (c === bestC && l < best)) {
          best = l;
          bestC = c;
        }
      }
      if (best !== label.get(id)) {
        label.set(id, best);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const clusters = {};
  for (const [id, l] of label) clusters[id] = l;
  res.json({ clusters });
});

// Insights overlay payload: most-visited notes, strongest paths, never-walked
// notes, and the raw event count.
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

  const orphans = db
    .prepare(
      `SELECT n.id, n.title FROM notes n
       WHERE n.user_id = ? AND n.status != 'deleted'
         AND NOT EXISTS (
           SELECT 1 FROM nav_events e
           WHERE e.user_id = ? AND (e.to_note_id = n.id OR e.from_note_id = n.id)
         )
       ORDER BY n.updated_at DESC LIMIT 20`
    )
    .all(uid, uid);

  const { total } = db
    .prepare('SELECT COUNT(*) AS total FROM nav_events WHERE user_id = ?')
    .get(uid);

  res.json({ topNotes, topPaths, orphans, totalEvents: total });
});

module.exports = router;
