const db = require('./db');
const { sendToUser } = require('./webpush');

// The client writes reminders.next_at (absolute UTC of the next ring, computed
// in the viewer's timezone) and, on a weeks/months snooze, reminders.snooze_until.
// We just watch the clock: once the due instant (snooze_until when set, else
// next_at) has passed and we haven't already pushed for it, send one Web Push.
// The client rolls next_at forward to the following occurrence whenever the app
// is open (and resets pushed_at), which re-arms this.
const TICK_MS = 30 * 1000;

const dueStmt = db.prepare(
  `SELECT r.id, r.note_id, r.user_id,
          COALESCE(r.snooze_until, r.next_at) AS due_at,
          n.title
   FROM reminders r
   JOIN notes n ON n.id = r.note_id
   WHERE COALESCE(r.snooze_until, r.next_at) IS NOT NULL
     AND n.status != 'deleted'
     AND COALESCE(r.snooze_until, r.next_at) <= ?
     AND (r.pushed_at IS NULL OR r.pushed_at < COALESCE(r.snooze_until, r.next_at))`
);
const markPushed = db.prepare('UPDATE reminders SET pushed_at = ? WHERE id = ?');

async function tick() {
  const nowIso = new Date().toISOString();
  let due;
  try {
    due = dueStmt.all(nowIso);
  } catch (err) {
    console.error('alarm scheduler query failed:', err);
    return;
  }
  for (const r of due) {
    markPushed.run(nowIso, r.id);
    await sendToUser(r.user_id, {
      type: 'alarm',
      noteId: r.note_id,
      title: r.title || 'Alarm',
      at: r.due_at,
    });
  }
}

function start() {
  setInterval(() => {
    tick().catch((err) => console.error('alarm scheduler tick failed:', err));
  }, TICK_MS);
}

module.exports = { start };
