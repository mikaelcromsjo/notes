const express = require('express');
const db = require('../db');
const { buildDigestPage, digestPageDoc } = require('../digest');

const router = express.Router();

// Standalone "view online" page for the digest — the landing spot for the push
// notification and the email "see everything" link. Authenticated by the same
// per-user widget_token as the widget feed (a subset of what that already
// exposes), so it sits above the cookie gate and works from any device.
function originFor(req) {
  if (process.env.PUBLIC_ORIGIN) return process.env.PUBLIC_ORIGIN.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

router.get('/', (req, res) => {
  const token = req.query.token;
  const user =
    typeof token === 'string' && token.length >= 16
      ? db.prepare('SELECT id FROM users WHERE widget_token = ?').get(token)
      : null;
  if (!user) return res.status(401).type('text/plain').send('invalid or missing token');

  const cadence = req.query.cadence === 'weekly' ? 'weekly' : 'daily';
  const page = buildDigestPage(user.id, { tz: req.query.tz });
  res
    .type('html')
    .set('Cache-Control', 'no-store')
    .send(digestPageDoc(page, cadence, { origin: originFor(req) }));
});

module.exports = router;
