const db = require('./db');
const { sendToUser } = require('./webpush');
const mailer = require('./mailer');
const { ensureWidgetToken } = require('./widget-token');
const {
  buildDigest,
  digestSubject,
  digestText,
  digestHtml,
  digestPush,
  publicOrigin,
} = require('./digest');

// URL of the standalone "view online" page (server/routes/digest-page.js).
function viewUrlFor(userId, cadence, tz) {
  const q = new URLSearchParams({ token: ensureWidgetToken(userId), cadence });
  if (tz) q.set('tz', tz);
  return `${publicOrigin()}/digest?${q.toString()}`;
}

// Opt-in scheduled digest of a user's agenda (see server/digest.js). Same
// setInterval-from-index.js pattern as alarm-scheduler.js. We tick every few
// minutes; the "local hour matches digest_hour" test plus a compare-and-set on
// digest_last_sent_at make each occurrence fire at most once. Like reminders,
// the schedule lives in the viewer's timezone — digest_tz, captured by the
// client; we only fall back to UTC if it was never set.
const TICK_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const dueUsersStmt = db.prepare(
  `SELECT id, email, digest_cadence AS cadence, digest_hour AS hour,
          digest_tz AS tz, digest_channel AS channel,
          digest_last_sent_at AS lastSentAt
   FROM users WHERE digest_cadence IN ('daily', 'weekly')`
);

// Null-safe compare-and-set: the row is only claimed if last_sent_at is still
// exactly what this tick read, so two overlapping ticks can't both send.
const claimStmt = db.prepare(
  'UPDATE users SET digest_last_sent_at = ? WHERE id = ? AND digest_last_sent_at IS ?'
);

function localHour(now, tz) {
  try {
    const s = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz || 'UTC',
      hour: '2-digit',
      hour12: false,
    }).format(now);
    return Number(s.slice(0, 2)) % 24;
  } catch {
    return now.getUTCHours();
  }
}

// Enough of the cadence window must have elapsed — guards against a restart
// within the same hour and stops a weekly digest firing on interim days.
function windowElapsed(cadence, lastSentAt, now) {
  if (!lastSentAt) return true;
  const age = now.getTime() - Date.parse(lastSentAt);
  if (Number.isNaN(age)) return true;
  return cadence === 'weekly' ? age > 6 * DAY_MS : age > 20 * 60 * 60 * 1000;
}

async function deliver(user, digest) {
  const cadence = user.cadence;
  const wantPush = user.channel === 'push' || user.channel === 'both';
  const wantEmail = user.channel === 'email' || user.channel === 'both';
  const viewUrl = viewUrlFor(user.id, cadence, user.tz);

  if (wantPush) {
    try {
      await sendToUser(user.id, digestPush(digest, cadence, { url: viewUrl }));
    } catch (err) {
      console.error('digest push failed for user', user.id, err && err.message);
    }
  }
  if (wantEmail && user.email && mailer.configured()) {
    try {
      await mailer.sendMail({
        to: user.email,
        subject: digestSubject(digest, cadence),
        text: digestText(digest, cadence, { viewUrl }),
        html: digestHtml(digest, cadence, { viewUrl }),
      });
    } catch (err) {
      console.error('digest email failed for user', user.id, err && err.message);
    }
  }
}

async function tick() {
  const now = new Date();
  const nowIso = now.toISOString();
  let users;
  try {
    users = dueUsersStmt.all();
  } catch (err) {
    console.error('digest scheduler query failed:', err);
    return;
  }

  for (const u of users) {
    if (localHour(now, u.tz) !== (u.hour | 0)) continue;
    if (!windowElapsed(u.cadence, u.lastSentAt, now)) continue;

    let digest;
    try {
      digest = buildDigest(u.id, { tz: u.tz, now });
    } catch (err) {
      console.error('digest build failed for user', u.id, err && err.message);
      continue;
    }
    // Never send an empty digest; leave last_sent_at untouched so a later tick
    // in the same hour can still send once something becomes due.
    if (digest.isEmpty) continue;

    // Null-safe compare-and-set: whichever tick flips last_sent_at first wins;
    // any other tick that raced this occurrence gets changes === 0 and skips.
    const claimed = claimStmt.run(nowIso, u.id, u.lastSentAt);
    if (claimed.changes === 0) continue;

    await deliver(u, digest);
  }
}

function start() {
  setInterval(() => {
    tick().catch((err) => console.error('digest scheduler tick failed:', err));
  }, TICK_MS);
}

module.exports = { start, tick };
