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
router.get('/', (req, res) => {
  if (!req.userId) return res.json({ user: null });
  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(req.userId);
  res.json({ user: user || null });
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
