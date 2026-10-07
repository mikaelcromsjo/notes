const express = require('express');
const db = require('../db');
const { buildCalendar } = require('../calendar-feed');

const router = express.Router();

function originFor(req) {
  if (process.env.PUBLIC_ORIGIN) return process.env.PUBLIC_ORIGIN.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

// GET /calendar.ics?token=… — the calendar subscription feed (see
// server/calendar-feed.js). Authed by users.calendar_token, so it sits above
// the cookie gate; polled by Google/Apple's servers, never by the app. Every
// fetch stamps calendar_fetched_at, which is how the app knows a
// subscription is live.
router.get('/', (req, res) => {
  const token = req.query.token;
  const user =
    typeof token === 'string' && token.length >= 16
      ? db.prepare('SELECT id FROM users WHERE calendar_token = ?').get(token)
      : null;
  if (!user) return res.status(401).type('text/plain').send('invalid or missing token');

  db.prepare('UPDATE users SET calendar_fetched_at = ? WHERE id = ?').run(new Date().toISOString(), user.id);
  const origin = originFor(req);
  res
    .type('text/calendar; charset=utf-8')
    .set('Cache-Control', 'no-store')
    .set('Content-Disposition', 'inline; filename="notes-reminders.ics"')
    .send(buildCalendar(user.id, { origin, host: new URL(origin).host }));
});

module.exports = router;
