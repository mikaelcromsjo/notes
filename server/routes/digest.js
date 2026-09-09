const express = require('express');
const db = require('../db');
const mailer = require('../mailer');
const { sendToUser } = require('../webpush');
const { ensureWidgetToken } = require('../widget-token');
const {
  buildDigest,
  digestSubject,
  digestText,
  digestHtml,
  digestPush,
} = require('../digest');

const router = express.Router();

function originFor(req) {
  if (process.env.PUBLIC_ORIGIN) return process.env.PUBLIC_ORIGIN.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}

function viewUrlFor(req, userId, cadence, tz) {
  const q = new URLSearchParams({ token: ensureWidgetToken(userId), cadence });
  if (tz) q.set('tz', tz);
  return `${originFor(req)}/digest?${q.toString()}`;
}

const CADENCES = ['off', 'daily', 'weekly'];
const CHANNELS = ['push', 'email', 'both'];

function validZone(tz) {
  if (typeof tz !== 'string' || !tz) return null;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

const prefsStmt = db.prepare(
  `SELECT digest_cadence AS cadence, digest_hour AS hour, digest_tz AS tz,
          digest_channel AS channel, digest_last_sent_at AS lastSentAt
   FROM users WHERE id = ?`
);

function prefsBody(req) {
  const p = prefsStmt.get(req.userId);
  return { ...p, mailConfigured: mailer.configured() };
}

// GET /api/digest — the in-app "review": the same bundle the scheduled digest
// sends (overdue / today / this week / open tasks).
router.get('/', (req, res) => {
  res.json(buildDigest(req.userId, { tz: req.query.tz }));
});

router.get('/prefs', (req, res) => {
  res.json(prefsBody(req));
});

router.put('/prefs', (req, res) => {
  const b = req.body || {};
  const cadence = CADENCES.includes(b.cadence) ? b.cadence : null;
  if (!cadence) return res.status(400).json({ error: `cadence must be one of ${CADENCES.join('/')}` });

  const hour = Number(b.hour);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return res.status(400).json({ error: 'hour must be an integer 0-23' });
  }
  const channel = CHANNELS.includes(b.channel) ? b.channel : 'push';
  const tz = validZone(b.tz); // may be null; scheduler falls back like the agenda does

  db.prepare(
    `UPDATE users
     SET digest_cadence = ?, digest_hour = ?, digest_tz = ?, digest_channel = ?
     WHERE id = ?`
  ).run(cadence, hour, tz, channel, req.userId);

  res.json(prefsBody(req));
});

// POST /api/digest/test — send the digest right now through the saved channel,
// so a beta tester can confirm delivery without waiting for their scheduled
// hour. Ignores cadence/hour but respects `channel`; still refuses an empty one.
// `cadence` in the body only picks the wording ('daily' vs 'weekly').
router.post('/test', async (req, res) => {
  const p = prefsStmt.get(req.userId);
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.userId);
  const cadence = req.body && req.body.cadence === 'weekly' ? 'weekly' : 'daily';
  const digest = buildDigest(req.userId, { tz: (req.body && req.body.tz) || p.tz });
  if (digest.isEmpty) {
    return res.status(422).json({ error: 'nothing due — digest would be empty', counts: digest.counts });
  }

  const channel = p.channel || 'push';
  const wantPush = channel === 'push' || channel === 'both';
  const wantEmail = channel === 'email' || channel === 'both';
  const viewUrl = viewUrlFor(req, req.userId, cadence, (req.body && req.body.tz) || p.tz);
  const sent = { push: false, email: false };
  const errors = [];

  if (wantPush) {
    try {
      await sendToUser(req.userId, digestPush(digest, cadence, { url: viewUrl }));
      sent.push = true;
    } catch (err) {
      errors.push(`push: ${err && err.message}`);
    }
  }
  if (wantEmail) {
    if (!mailer.configured()) {
      errors.push('email: mailer not configured on this server');
    } else if (!user || !user.email) {
      errors.push('email: no address on file');
    } else {
      try {
        await mailer.sendMail({
          to: user.email,
          subject: digestSubject(digest, cadence),
          text: digestText(digest, cadence, { viewUrl }),
          html: digestHtml(digest, cadence, { viewUrl }),
        });
        sent.email = true;
      } catch (err) {
        errors.push(`email: ${err && err.message}`);
      }
    }
  }

  res.json({ sent, channel, counts: digest.counts, errors });
});

module.exports = router;
