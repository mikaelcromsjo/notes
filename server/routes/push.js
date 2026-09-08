const express = require('express');
const db = require('../db');
const { publicKey, assertSafeEndpoint } = require('../webpush');

const router = express.Router();

router.get('/key', (req, res) => {
  res.json({ key: publicKey });
});

router.post('/subscribe', async (req, res) => {
  const sub = req.body || {};
  const endpoint = sub.endpoint;
  const p256dh = sub.keys && sub.keys.p256dh;
  const auth = sub.keys && sub.keys.auth;
  if (!endpoint || !p256dh || !auth) {
    return res.status(400).json({ error: 'invalid subscription' });
  }

  const issue = await assertSafeEndpoint(endpoint);
  if (issue) return res.status(400).json({ error: `invalid subscription endpoint: ${issue}` });

  // endpoint is globally UNIQUE. Only upsert when the row is unowned or already
  // ours — a collision with another user's endpoint is ignored, not reassigned,
  // so knowing someone's endpoint string can't hijack their push delivery.
  db.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       p256dh = excluded.p256dh, auth = excluded.auth
     WHERE push_subscriptions.user_id = excluded.user_id`
  ).run(req.userId, endpoint, p256dh, auth);
  res.status(201).json({ ok: true });
});

router.post('/unsubscribe', (req, res) => {
  const endpoint = req.body && req.body.endpoint;
  if (endpoint) {
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(
      endpoint,
      req.userId
    );
  }
  res.json({ ok: true });
});

module.exports = router;
