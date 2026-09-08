const crypto = require('crypto');
const express = require('express');
const db = require('../db');

const router = express.Router();

const COOKIE = 'nico_uid';
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 365 * 24 * 60 * 60 * 1000,
};
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Current user for the session cookie, or { user: null } when signed out.
// Also hands back the widget feed token, minting one on first read.
router.get('/', (req, res) => {
  if (!req.userId) return res.json({ user: null });
  const user = db.prepare('SELECT id, email, widget_token FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.json({ user: null });

  let token = user.widget_token;
  if (!token) {
    token = crypto.randomBytes(24).toString('hex');
    db.prepare('UPDATE users SET widget_token = ? WHERE id = ?').run(token, user.id);
  }

  res.json({ user: { id: user.id, email: user.email }, widgetToken: token });
});

// Rotate the widget feed token — the previous value stops working immediately.
// Use this if the URL (which carries the token as a query param) has leaked.
router.post('/widget-token', (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'no active session' });
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('UPDATE users SET widget_token = ? WHERE id = ?').run(token, req.userId);
  res.json({ widgetToken: token });
});

// Revoke the widget feed token. GET /api/session mints a fresh one on next read.
router.delete('/widget-token', (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'no active session' });
  db.prepare('UPDATE users SET widget_token = NULL WHERE id = ?').run(req.userId);
  res.status(204).end();
});

// "Log in": look up (or create) the user for an email and set the cookie.
// No password — identity only, until real auth lands.
router.post('/', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'a valid email is required' });
  }

  let user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);
  if (!user) {
    const info = db.prepare('INSERT INTO users (email) VALUES (?)').run(email);
    user = { id: info.lastInsertRowid, email };
  }

  res.cookie(COOKIE, String(user.id), COOKIE_OPTS);
  res.json({ user });
});

router.delete('/', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.status(204).end();
});

module.exports = router;
