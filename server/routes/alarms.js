const express = require('express');
const db = require('../db');

const router = express.Router();

const now = () => new Date().toISOString();
const validTs = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const tsOrNull = (v) => (validTs(v) ? v : null);

// The server never computes fire times: "11:00" means 11:00 in the *viewer's*
// timezone and the box runs in UTC. The client (public/app.js) computes both
// alarm_ack_at (last "OK") and alarm_next_at (absolute UTC of the next ring)
// and this route just persists them. alarm_next_at + alarm_pushed_at drive the
// server-side Web Push scheduler (server/alarm-scheduler.js).
function serialize(r) {
  return {
    id: r.id,
    title: r.title,
    time: r.alarm_time,
    days: r.alarm_days ? r.alarm_days.split(',').map(Number) : [],
    date: r.alarm_date,
    ackAt: r.alarm_ack_at,
    nextAt: r.alarm_next_at,
  };
}

const selectOne = db.prepare(
  `SELECT id, title, alarm_time, alarm_days, alarm_date, alarm_ack_at, alarm_next_at
   FROM notes WHERE id = ?`
);

router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, title, alarm_time, alarm_days, alarm_date, alarm_ack_at, alarm_next_at
       FROM notes
       WHERE user_id = ? AND alarm_time IS NOT NULL AND status != 'deleted'
       ORDER BY alarm_time ASC, title ASC`
    )
    .all(req.userId);
  res.json(rows.map(serialize));
});

router.put('/:noteId', (req, res) => {
  const note = db
    .prepare("SELECT id FROM notes WHERE id = ? AND user_id = ? AND status != 'deleted'")
    .get(req.params.noteId, req.userId);
  if (!note) return res.status(404).json({ error: 'not found' });

  const { time, days, date, ackAt, nextAt } = req.body;
  if (!time || !/^\d{2}:\d{2}$/.test(time)) {
    return res.status(400).json({ error: 'time must be HH:MM' });
  }

  const daysStr = Array.isArray(days)
    ? [...new Set(days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))]
        .sort((a, b) => a - b)
        .join(',')
    : '';
  const dateStr =
    !daysStr && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  if (!daysStr && !dateStr) {
    return res.status(400).json({ error: 'pick repeat days or a one-time date' });
  }

  // ackAt seeds the current cycle as already-seen; nextAt arms the push scheduler.
  const ack = validTs(ackAt) ? ackAt : now();

  db.prepare(
    `UPDATE notes
     SET alarm_time = ?, alarm_days = ?, alarm_date = ?,
         alarm_last_fired = NULL, alarm_ack_at = ?, alarm_next_at = ?, alarm_pushed_at = NULL
     WHERE id = ? AND user_id = ?`
  ).run(time, daysStr, dateStr, ack, tsOrNull(nextAt), req.params.noteId, req.userId);

  res.json(serialize(selectOne.get(req.params.noteId)));
});

router.delete('/:noteId', (req, res) => {
  const info = db
    .prepare(
      `UPDATE notes
       SET alarm_time = NULL, alarm_days = '', alarm_date = NULL,
           alarm_last_fired = NULL, alarm_ack_at = NULL,
           alarm_next_at = NULL, alarm_pushed_at = NULL
       WHERE id = ? AND user_id = ?`
    )
    .run(req.params.noteId, req.userId);
  if (info.changes === 0) return res.status(404).json({ error: 'not found' });
  res.status(204).end();
});

// "OK" on the popup — quiet until the alarm next goes off. The client also
// sends the rolled-forward nextAt so the scheduler re-arms for that occurrence.
router.post('/:noteId/ack', (req, res) => {
  const at = validTs(req.body && req.body.at) ? req.body.at : now();
  const next = tsOrNull(req.body && req.body.nextAt);
  const info = db
    .prepare(
      `UPDATE notes
       SET alarm_ack_at = ?, alarm_next_at = ?, alarm_pushed_at = NULL
       WHERE id = ? AND user_id = ? AND alarm_time IS NOT NULL`
    )
    .run(at, next, req.params.noteId, req.userId);
  if (info.changes === 0) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// Roll the next-ring instant forward (client does this on every poll while the
// app is open, so future occurrences stay armed for push).
router.post('/:noteId/schedule', (req, res) => {
  const next = tsOrNull(req.body && req.body.nextAt);
  const info = db
    .prepare(
      `UPDATE notes
       SET alarm_next_at = ?, alarm_pushed_at = NULL
       WHERE id = ? AND user_id = ? AND alarm_time IS NOT NULL`
    )
    .run(next, req.params.noteId, req.userId);
  if (info.changes === 0) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

module.exports = router;
