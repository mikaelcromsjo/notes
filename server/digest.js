const db = require('./db');
const { buildAgenda } = require('./agenda');

// The digest is the user's agenda on a schedule: what's overdue, due today, and
// due this week, plus notes flagged to-do and notes carrying open `- [ ]` tasks.
// It reuses buildAgenda so the in-app view, the scheduled push, and the email
// all show the same thing. `later` reminders are left out — a digest is about
// what needs attention now. The standalone "view online" page (buildDigestPage /
// digestPageDoc) adds context the notification can't fit: every reminder, and a
// few graph orphans to resurface.

function publicOrigin() {
  return (process.env.PUBLIC_ORIGIN || 'https://test.ia-ai.se').replace(/\/+$/, '');
}

function buildDigest(userId, { tz, now = new Date() } = {}) {
  const a = buildAgenda(userId, { tz, now });
  const { overdue, today, week } = a.reminders;
  const todos = a.todos || [];
  const counts = {
    overdue: overdue.length,
    today: today.length,
    week: week.length,
    todos: todos.length,
    openTasks: a.openTasks.length,
  };
  return {
    generatedAt: a.generatedAt,
    tz: a.tz,
    overdue,
    today,
    week,
    todos,
    openTasks: a.openTasks,
    counts,
    isEmpty:
      counts.overdue + counts.today + counts.week + counts.todos + counts.openTasks === 0,
  };
}

// --- Extra sections, only for the standalone page --------------------------

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const allRemindersStmt = db.prepare(
  `SELECT r.id, r.note_id, r.time, r.days, r.date, r.snooze_until, r.next_at, n.title
   FROM reminders r JOIN notes n ON n.id = r.note_id
   WHERE r.user_id = ? AND n.status != 'deleted'
   ORDER BY r.time ASC, n.title ASC`
);

// Structurally disconnected — no links at all — the same "orphans" signal the
// insights overlay shows (server/routes/stats.js). A linked-but-unvisited note
// isn't an orphan; it's reachable via the grid, just not visited yet.
const orphansStmt = db.prepare(
  `SELECT n.id, n.title FROM notes n
   WHERE n.user_id = ? AND n.status != 'deleted'
     AND NOT EXISTS (SELECT 1 FROM links l WHERE l.user_id = ? AND (l.note_a = n.id OR l.note_b = n.id))
   ORDER BY n.updated_at DESC LIMIT 8`
);

function reminderRhythm(r) {
  if (r.days) return `${r.days.split(',').map((d) => DOW[Number(d)] || '?').join(' ')} ${r.time || ''}`.trim();
  if (r.date) return `${r.date} ${r.time || ''}`.trim();
  return r.time || '';
}

function buildDigestPage(userId, { tz, now = new Date() } = {}) {
  const d = buildDigest(userId, { tz, now });
  const allReminders = allRemindersStmt.all(userId).map((r) => ({
    id: r.id,
    noteId: r.note_id,
    title: r.title,
    rhythm: reminderRhythm(r),
    snoozed: !!(r.snooze_until && Date.parse(r.snooze_until) > now.getTime()),
  }));
  const orphans = orphansStmt.all(userId, userId).map((o) => ({ noteId: o.id, title: o.title }));
  return { ...d, allReminders, orphans };
}

// --- Text helpers --------------------------------------------------------

function whenLabel(item) {
  const dt = new Date(item.dueAt);
  if (Number.isNaN(dt.getTime())) return '';
  return `${dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} ${item.time || ''}`.trim();
}

function summaryLine(d, cadence) {
  const bits = [];
  if (d.counts.overdue) bits.push(`${d.counts.overdue} overdue`);
  if (d.counts.today) bits.push(`${d.counts.today} due today`);
  if (cadence === 'weekly' && d.counts.week) bits.push(`${d.counts.week} this week`);
  if (d.counts.todos) bits.push(`${d.counts.todos} to-do`);
  if (d.counts.openTasks) {
    bits.push(`${d.counts.openTasks} note${d.counts.openTasks === 1 ? '' : 's'} with open tasks`);
  }
  return bits.join(' · ') || 'Nothing scheduled';
}

function digestSubject(d, cadence) {
  return `${cadence === 'weekly' ? 'Your week' : 'Your day'}: ${summaryLine(d, cadence)}`;
}

function section(title, rows) {
  if (!rows.length) return '';
  return `${title}\n${rows.map((r) => `  • ${r}`).join('\n')}\n\n`;
}

function digestText(d, cadence, { viewUrl } = {}) {
  const origin = publicOrigin();
  let out = `${summaryLine(d, cadence)}\n\n`;
  out += section('Overdue', d.overdue.map((r) => `${r.title} — ${whenLabel(r)}  ${origin}/#${r.noteId}`));
  out += section('Today', d.today.map((r) => `${r.title} — ${r.time || ''}  ${origin}/#${r.noteId}`));
  if (cadence === 'weekly') {
    out += section('This week', d.week.map((r) => `${r.title} — ${whenLabel(r)}  ${origin}/#${r.noteId}`));
  }
  out += section('To-do', d.todos.map((t) => `${t.title}  ${origin}/#${t.noteId}`));
  out += section(
    'Open tasks',
    d.openTasks.map((t) => `${t.title} (${t.open} open)  ${origin}/#${t.noteId}`)
  );
  if (viewUrl) out += `See everything — every reminder, orphaned notes, insights:\n  ${viewUrl}\n\n`;
  out += `${origin}/  ·  Change or turn off this digest in the app.`;
  return out.trim();
}

function esc(s) {
  return String(s == null ? '' : s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );
}

function htmlList(title, items) {
  if (!items.length) return '';
  const lis = items.map((i) => `<li style="margin:2px 0">${i}</li>`).join('');
  return `<h3 style="margin:16px 0 4px;font:600 14px system-ui">${esc(title)}</h3><ul style="margin:0;padding-left:18px">${lis}</ul>`;
}

function digestHtml(d, cadence, { viewUrl } = {}) {
  const origin = publicOrigin();
  const link = (r, label) =>
    `<a href="${origin}/#${r.noteId}" style="color:#2563eb;text-decoration:none">${esc(r.title)}</a>` +
    (label ? ` <span style="color:#666">— ${esc(label)}</span>` : '');
  const body =
    `<p style="font:600 15px system-ui;margin:0 0 8px">${esc(summaryLine(d, cadence))}</p>` +
    htmlList('Overdue', d.overdue.map((r) => link(r, whenLabel(r)))) +
    htmlList('Today', d.today.map((r) => link(r, r.time || ''))) +
    (cadence === 'weekly' ? htmlList('This week', d.week.map((r) => link(r, whenLabel(r)))) : '') +
    htmlList('To-do', d.todos.map((t) => link({ noteId: t.noteId, title: t.title }, ''))) +
    htmlList('Open tasks', d.openTasks.map((t) => link({ noteId: t.noteId, title: t.title }, `${t.open} open`))) +
    (viewUrl
      ? `<p style="margin:16px 0 0;font:14px system-ui"><a href="${esc(viewUrl)}" style="color:#2563eb">See everything →</a> <span style="color:#888">every reminder, orphaned notes, insights</span></p>`
      : '') +
    `<p style="margin:20px 0 0;font:12px system-ui;color:#888"><a href="${origin}/" style="color:#888">Open the app</a> · change or turn off this digest in Settings.</p>`;
  return `<div style="max-width:520px;font:14px system-ui;color:#111">${body}</div>`;
}

// Notification body: the actual items, not just counts. Kept to a few lines so
// it survives OS truncation; the rest is behind `url`.
function digestPush(d, cadence, { url } = {}) {
  const lines = [];
  const room = () => 4 - lines.length;
  const push = (arr, fmt) => arr.slice(0, Math.max(0, room())).forEach((r) => lines.push(fmt(r)));
  push(d.overdue, (r) => `⚠ ${r.title} — ${whenLabel(r)}`);
  push(d.today, (r) => `${r.title}${r.time ? ` — ${r.time}` : ''}`);
  if (cadence === 'weekly') push(d.week, (r) => `${r.title} — ${whenLabel(r)}`);
  const shown = lines.length;
  const dueTotal = d.counts.overdue + d.counts.today + (cadence === 'weekly' ? d.counts.week : 0);
  if (dueTotal > shown) lines.push(`+${dueTotal - shown} more`);
  if (d.counts.todos) lines.push(`${d.counts.todos} to-do`);
  if (d.counts.openTasks) {
    lines.push(`${d.counts.openTasks} note${d.counts.openTasks === 1 ? '' : 's'} with open tasks`);
  }
  return {
    type: 'digest',
    title: cadence === 'weekly' ? '🗓️ Your week' : '🗓️ Your day',
    body: lines.join('\n') || summaryLine(d, cadence),
    url: url || '/',
  };
}

// --- Standalone "view online" page ------------------------------------------

function pageLink(origin, noteId, text, extra) {
  return (
    `<a href="${origin}/#${noteId}">${esc(text)}</a>` +
    (extra ? ` <span class="meta">${esc(extra)}</span>` : '')
  );
}

function pageSection(title, rows) {
  if (!rows.length) return '';
  return `<section><h2>${esc(title)}</h2><ul>${rows.map((r) => `<li>${r}</li>`).join('')}</ul></section>`;
}

function digestPageDoc(page, cadence, { origin: pageOrigin } = {}) {
  const origin = (pageOrigin || publicOrigin()).replace(/\/+$/, '');
  const L = (r, extra) => pageLink(origin, r.noteId, r.title, extra);
  const heading = cadence === 'weekly' ? 'Your week' : 'Your day';
  const generated = new Date(page.generatedAt).toLocaleString('en-GB', { timeZone: page.tz });

  const sections =
    pageSection('Overdue', page.overdue.map((r) => L(r, whenLabel(r)))) +
    pageSection('Today', page.today.map((r) => L(r, r.time || ''))) +
    pageSection('This week', page.week.map((r) => L(r, whenLabel(r)))) +
    pageSection('To-do', page.todos.map((t) => L({ noteId: t.noteId, title: t.title }, ''))) +
    pageSection(
      'Open tasks',
      page.openTasks.map((t) => L({ noteId: t.noteId, title: t.title }, `${t.open} open`))
    ) +
    pageSection(
      'All reminders',
      (page.allReminders || []).map((r) => L(r, r.snoozed ? `${r.rhythm} · snoozed` : r.rhythm))
    ) +
    pageSection(
      'Orphans',
      (page.orphans || []).map((o) => L({ noteId: o.noteId, title: o.title }, ''))
    );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(heading)} · Anandas's Notes</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.5 system-ui, sans-serif; background: #f7f7f8; color: #111; }
  main { max-width: 640px; margin: 0 auto; padding: 24px 18px 60px; }
  h1 { font-size: 1.4rem; margin: 0 0 2px; }
  .sub { color: #666; font-size: 0.85rem; margin: 0 0 20px; }
  .summary { font-weight: 600; margin: 0 0 18px; }
  section { margin: 0 0 22px; }
  h2 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: #888; margin: 0 0 8px; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { padding: 8px 0; border-top: 1px solid #e3e3e6; }
  li:first-child { border-top: none; }
  a { color: #2563eb; text-decoration: none; font-weight: 600; overflow-wrap: anywhere; }
  .meta { color: #777; font-weight: 400; font-size: 0.85rem; }
  .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
  .actions a { display: inline-block; padding: 9px 14px; border: 1px solid #d0d0d5; border-radius: 8px; background: #fff; }
  .empty { color: #666; }
  @media (prefers-color-scheme: dark) {
    body { background: #16161a; color: #e9e9ec; }
    li { border-color: #2c2c33; }
    a { color: #6ea8fe; }
    .actions a { background: #1f1f25; border-color: #35353d; }
    .sub, h2, .meta, .empty { color: #9a9aa4; }
  }
</style>
</head>
<body>
<main>
  <h1>${esc(heading)}</h1>
  <p class="sub">Generated ${esc(generated)} · ${esc(page.tz)}</p>
  <p class="summary">${esc(summaryLine(page, cadence))}</p>
  ${sections || '<p class="empty">Nothing scheduled and no loose ends. Nice.</p>'}
  <div class="actions">
    <a href="${origin}/?d=agenda">Open agenda in app</a>
    <a href="${origin}/?d=insights">Insights</a>
    <a href="${origin}/">Open the app</a>
  </div>
</main>
</body>
</html>`;
}

module.exports = {
  buildDigest,
  buildDigestPage,
  digestSubject,
  digestText,
  digestHtml,
  digestPush,
  digestPageDoc,
  publicOrigin,
};
