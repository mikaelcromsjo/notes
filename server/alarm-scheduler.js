const db = require('./db');
const { sendToUser } = require('./webpush');

// The client writes alarm_next_at (absolute UTC of the next ring, computed in
// the viewer's timezone). We just watch the clock: once alarm_next_at is due
// and we haven't already pushed for that instant, send one Web Push. The
// client rolls alarm_next_at forward to the following occurrence whenever the
// app is open (and resets alarm_pushed_at), which re-arms this.
const TICK_MS = 30 * 1000;

const dueStmt = db.prepare(
  `SELECT id, title, user_id, alarm_next_at
   FROM notes
   WHERE alarm_time IS NOT NULL
     AND alarm_next_at IS NOT NULL
     AND status != 'deleted'
     AND alarm_next_at <= ?
     AND (alarm_pushed_at IS NULL OR alarm_pushed_at < alarm_next_at)`
);
const markPushed = db.prepare('UPDATE notes SET alarm_pushed_at = ? WHERE id = ?');

async function tick() {
  const nowIso = new Date().toISOString();
  let due;
  try {
    due = dueStmt.all(nowIso);
  } catch (err) {
    console.error('alarm scheduler query failed:', err);
    return;
  }
  for (const note of due) {
    markPushed.run(nowIso, note.id);
    await sendToUser(note.user_id, {
      type: 'alarm',
      noteId: note.id,
      title: note.title || 'Alarm',
      at: note.alarm_next_at,
    });
  }
}

function start() {
  setInterval(() => {
    tick().catch((err) => console.error('alarm scheduler tick failed:', err));
  }, TICK_MS);
}

module.exports = { start };
