// iCalendar (RFC 5545) subscription feed of a user's clock reminders, served
// at GET /calendar.ics?token=… (routes/calendar.js). One VEVENT per
// kind='time' reminder on a note that isn't done/deleted: repeat days become a
// weekly RRULE, a one-time date a single event, each with a 0-minute VALARM so
// the phone's calendar rings it natively. Nudges (kind='anytime') never ring
// as hard alarms and location reminders have no time, so neither is listed.
// Snooze/ack are deliberately ignored — this is the plan, not ring state.
const db = require('./db');

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']; // JS getDay() order

function validTz(tz) {
  if (!tz) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

// YYYY-MM-DD of an instant in a zone (null zone = UTC).
function localDate(instant, tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const weekday = (ymd) => new Date(`${ymd}T00:00:00Z`).getUTCDay();

function escapeText(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/([;,])/g, '\\$1');
}

// Fold to 75-octet lines (continuation lines start with a space), never
// splitting a UTF-8 sequence.
function fold(line) {
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function buildCalendar(userId, { origin, host }) {
  const rows = db
    .prepare(
      `SELECT r.id, r.note_id, r.time, r.days, r.date, r.tz, r.created_at, n.title,
              (SELECT title FROM shares WHERE id = n.share_id) AS share_title
         FROM reminders r JOIN notes n ON n.id = r.note_id
        WHERE r.user_id = ? AND COALESCE(r.kind, 'time') = 'time'
          AND n.status NOT IN ('deleted', 'done')
        ORDER BY r.id`
    )
    .all(userId);

  const now = stamp(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ia-ai.se//Notes reminders//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Notes reminders',
    // Hints only — Google ignores both and refreshes on its own schedule.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];

  for (const r of rows) {
    if (!/^\d{2}:\d{2}$/.test(r.time || '')) continue;
    const tz = validTz(r.tz);
    const days = r.days ? r.days.split(',').map(Number).filter((d) => d >= 0 && d <= 6) : [];
    let startDate;
    let rrule = null;
    if (days.length) {
      // Anchor on the first matching weekday on/after the reminder's creation
      // day — DTSTART always counts as an occurrence, so it must be one.
      startDate = localDate(new Date(r.created_at || Date.now()), tz);
      for (let i = 0; i < 7 && !days.includes(weekday(startDate)); i++) startDate = addDays(startDate, 1);
      rrule = `RRULE:FREQ=WEEKLY;BYDAY=${days.map((d) => BYDAY[d]).join(',')}`;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(r.date || '')) {
      startDate = r.date;
    } else {
      continue;
    }
    const dt = `${startDate.replace(/-/g, '')}T${r.time.replace(':', '')}00`;
    const title = r.share_title ? `${r.title} (🔗${r.share_title})` : r.title;
    const url = `${origin}/#${r.note_id}`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:reminder-${r.id}@${host}`,
      `DTSTAMP:${now}`,
      // No TZID = floating time, i.e. the device's own zone — which is what a
      // reminder without a stored zone means in the app too.
      tz ? `DTSTART;TZID=${tz}:${dt}` : `DTSTART:${dt}`,
      'DURATION:PT15M',
      ...(rrule ? [rrule] : []),
      `SUMMARY:${escapeText(title)}`,
      `DESCRIPTION:${escapeText(url)}`,
      `URL:${url}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(title)}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

module.exports = { buildCalendar };
