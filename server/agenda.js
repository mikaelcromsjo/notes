const db = require('./db');
const { extractTags } = require('./tags');

// A cross-note "what's due" view. The client still owns fire-time math (the box
// is UTC, "08:00" means the viewer's 08:00), so this only ever reads the
// absolute instants the client already wrote — reminders.next_at and, on a
// weeks/months snooze, reminders.snooze_until. Day bucketing needs a wall
// calendar, so it takes an IANA zone: an explicit one, else the zone stored on
// most of the user's reminders, else UTC.

// 'done' notes are excluded from every agenda list below (and the digest/
// widget built on it): finished business, nothing left to act on.

const remindersStmt = db.prepare(
  `SELECT r.id, r.note_id, r.kind, r.time, r.days, r.date, r.radius_m,
          r.window_start, r.window_end, r.tz, r.snooze_until, r.next_at, n.title
   FROM reminders r JOIN notes n ON n.id = r.note_id
   WHERE r.user_id = ? AND n.status NOT IN ('deleted', 'done')`
);

// Every note this user can see, personal or shared: their own personal notes
// (share_id IS NULL) plus every note in a share they're a member of. Reused
// below by the notes-table scans (open tasks / to-dos / orphans) — a
// reminder is always personal (r.user_id above), but a checked-off task, a
// note's todo status, and whether it has any links at all are properties of
// the *note*, not of whoever's asking, so a collaborator on a shared to-do
// note should see it in their own agenda exactly like the note's creator
// does, not just the creator. Takes userId twice (matches the two `?`s).
const VISIBLE_NOTES = `((n.user_id = ? AND n.share_id IS NULL) OR n.share_id IN (SELECT share_id FROM share_members WHERE user_id = ?))`;

// `[` is not a LIKE metacharacter in SQLite, so this is a literal-substring
// prefilter for "has an unchecked GFM task" — the regex below does the real
// work. Once an account has opted into content encryption (docs/plan/
// 08-offline-privacy.md §3.4), `content` here is ciphertext and this
// harmlessly matches nothing — openTasks/todos below come back empty for
// that account rather than garbled text, both for GET /api/agenda (the
// in-app 🔔 overlay recomputes them client-side instead, see public/app.js's
// localOpenTasksAndTodos, §3.5) and for the Android widget feed, which has
// no crypto of its own and so is *meant* to just show nothing here.
const taskNotesStmt = db.prepare(
  `SELECT id, title, content, updated_at FROM notes n
   WHERE ${VISIBLE_NOTES} AND n.status NOT IN ('deleted', 'done') AND n.content LIKE '%[ ]%'`
);

// Notes the user flagged as an open thing to do (the center-cell status button's
// middle state). Distinct from `- [ ]` checkbox lines inside a note's body.
// `content` is only pulled to extract GTD `@context` tags (server/tags.js)
// for the agenda's by-tag grouping — never sent on to the client as-is.
const todoNotesStmt = db.prepare(
  `SELECT id, title, content, updated_at FROM notes n
   WHERE ${VISIBLE_NOTES} AND n.status = 'todo'
   ORDER BY n.updated_at DESC`
);

// Unchecked task line, matching public/app.js toggleTaskInSource's grammar
// (bullet or "N." ordered marker, then "[ ]", then some text).
const OPEN_TASK_RE = /^[ \t]*(?:[-*+]|\d+\.)[ \t]+\[ \][ \t]*\S/gm;
const OPEN_TASKS_LIMIT = 20;

// Structurally disconnected — no links at all — so it can't be reached via the
// grid, only by search; the same signal the insights overlay shows. A linked
// note that just hasn't been navigated to yet isn't an orphan, it's reachable,
// only unvisited. Most-recently-touched first: an orphan you edited yesterday
// is more likely worth resurfacing than one from years ago. The links check
// deliberately ignores links.user_id (creator provenance, never scope — see
// links.js's list() doc comment): a shared note linked by a collaborator, not
// by this user, still has a link and must not show as orphaned.
const orphansStmt = db.prepare(
  `SELECT n.id, n.title FROM notes n
   WHERE ${VISIBLE_NOTES} AND n.status NOT IN ('deleted', 'done')
     AND NOT EXISTS (SELECT 1 FROM links l WHERE l.note_a = n.id OR l.note_b = n.id)
   ORDER BY n.updated_at DESC LIMIT 20`
);

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
  const nudges = []; // kind='anytime' — see below, kept out of the buckets above
  for (const r of rows) {
    const snoozed = r.snooze_until && Date.parse(r.snooze_until) > nowMs;
    const dueIso = snoozed ? r.snooze_until : r.next_at;
    const dueMs = dueIso ? Date.parse(dueIso) : NaN;
    if (Number.isNaN(dueMs)) continue; // unscheduled, or an acked one-shot in the past

    const item = {
      id: r.id,
      noteId: r.note_id,
      title: r.title,
      kind: r.kind || 'time',
      time: r.time,
      radiusM: r.radius_m,
      windowStart: r.window_start,
      windowEnd: r.window_end,
      dueAt: dueIso,
      snoozed: !!snoozed,
    };

    // kind='anytime' has no committed clock time (a day pattern + window,
    // see db.js) — bucketing it as "Overdue"/"Today" the same as a real
    // clock-time reminder would misrepresent something deliberately left
    // untimed. It gets its own list instead, due ones first (mirrors
    // public/app.js's openAgenda 'Nudges' section) — every consumer
    // (digest.js, routes/widget.js) decides for itself whether/how to show it.
    if (item.kind === 'anytime') {
      nudges.push({ ...item, due: !snoozed && dueMs <= nowMs });
      continue;
    }

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
  nudges.sort((a, b) => Number(b.due) - Number(a.due) || Date.parse(a.dueAt) - Date.parse(b.dueAt));

  const openTasks = [];
  for (const n of taskNotesStmt.all(userId, userId)) {
    const open = (String(n.content || '').match(OPEN_TASK_RE) || []).length;
    if (open > 0) {
      openTasks.push({ noteId: n.id, title: n.title, open, updatedAt: n.updated_at });
    }
  }
  openTasks.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

  const todos = todoNotesStmt.all(userId, userId).map((n) => ({
    noteId: n.id,
    title: n.title,
    updatedAt: n.updated_at,
    tags: [...new Set([...extractTags(n.title), ...extractTags(n.content)])],
  }));

  const orphans = orphansStmt.all(userId, userId).map((n) => ({ noteId: n.id, title: n.title }));

  return {
    generatedAt: now.toISOString(),
    tz: zone,
    reminders: buckets,
    nudges,
    todos,
    openTasks: openTasks.slice(0, OPEN_TASKS_LIMIT),
    orphans,
  };
}

// dayIndexInZone/pickZone are also reused by routes/widget.js's ?mode=nudge —
// same "which wall-calendar day is this instant on" question, just answered
// for "is it today (or already overdue) in this account's zone" instead of
// the overdue/today/week/later buckets above.
module.exports = { buildAgenda, dayIndexInZone, pickZone };
