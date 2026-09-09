const db = require('./db');

// A cross-note "what's due" view. The client still owns fire-time math (the box
// is UTC, "08:00" means the viewer's 08:00), so this only ever reads the
// absolute instants the client already wrote — reminders.next_at and, on a
// weeks/months snooze, reminders.snooze_until. Day bucketing needs a wall
// calendar, so it takes an IANA zone: an explicit one, else the zone stored on
// most of the user's reminders, else UTC.

const remindersStmt = db.prepare(
  `SELECT r.id, r.note_id, r.time, r.days, r.date, r.tz, r.snooze_until, r.next_at,
          n.title
   FROM reminders r JOIN notes n ON n.id = r.note_id
   WHERE r.user_id = ? AND n.status != 'deleted'`
);

// `[` is not a LIKE metacharacter in SQLite, so this is a literal-substring
// prefilter for "has an unchecked GFM task" — the regex below does the real work.
const taskNotesStmt = db.prepare(
  `SELECT id, title, content, updated_at FROM notes
   WHERE user_id = ? AND status != 'deleted' AND content LIKE '%[ ]%'`
);

// Unchecked task line, matching public/app.js toggleTaskInSource's grammar
// (bullet or "N." ordered marker, then "[ ]", then some text).
const OPEN_TASK_RE = /^[ \t]*(?:[-*+]|\d+\.)[ \t]+\[ \][ \t]*\S/gm;
const OPEN_TASKS_LIMIT = 20;

function validZone(tz) {
  if (typeof tz !== 'string' || !tz) return null;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

// Days since the Unix epoch for `date`'s wall calendar day in `zone`.
function dayIndexInZone(date, zone) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .split('-')
    .map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function pickZone(explicit, rows) {
  const z = validZone(explicit);
  if (z) return z;
  const counts = {};
  for (const r of rows) if (r.tz) counts[r.tz] = (counts[r.tz] || 0) + 1;
  const common = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  return validZone(common) || 'UTC';
}

function buildAgenda(userId, { tz, now = new Date() } = {}) {
  const rows = remindersStmt.all(userId);
  const zone = pickZone(tz, rows);
  const nowMs = now.getTime();
  const today = dayIndexInZone(now, zone);

  const buckets = { overdue: [], today: [], week: [], later: [] };
  for (const r of rows) {
    const snoozed = r.snooze_until && Date.parse(r.snooze_until) > nowMs;
    const dueIso = snoozed ? r.snooze_until : r.next_at;
    const dueMs = dueIso ? Date.parse(dueIso) : NaN;
    if (Number.isNaN(dueMs)) continue; // unscheduled, or an acked one-shot in the past

    const item = {
      id: r.id,
      noteId: r.note_id,
      title: r.title,
      time: r.time,
      dueAt: dueIso,
      snoozed: !!snoozed,
    };
    if (!snoozed && dueMs <= nowMs) {
      buckets.overdue.push(item);
      continue;
    }
    const dd = dayIndexInZone(new Date(dueMs), zone) - today;
    if (dd <= 0) buckets.today.push(item);
    else if (dd < 7) buckets.week.push(item);
    else buckets.later.push(item);
  }
  for (const k of Object.keys(buckets)) {
    buckets[k].sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  }

  const openTasks = [];
  for (const n of taskNotesStmt.all(userId)) {
    const open = (String(n.content || '').match(OPEN_TASK_RE) || []).length;
    if (open > 0) {
      openTasks.push({ noteId: n.id, title: n.title, open, updatedAt: n.updated_at });
    }
  }
  openTasks.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

  return {
    generatedAt: now.toISOString(),
    tz: zone,
    reminders: buckets,
    openTasks: openTasks.slice(0, OPEN_TASKS_LIMIT),
  };
}

module.exports = { buildAgenda };
