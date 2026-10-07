const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const sessions = require('../sessions');
const { ensureWidgetToken, ensureCalendarToken } = require('../widget-token');
const encryption = require('../encryption');

const router = express.Router();

const LEGACY_COOKIE = 'nico_uid';

// Current user for the session cookie, or { user: null } when signed out.
// Also hands back the widget feed token, minting one on first read.
router.get('/', (req, res) => {
  if (!req.userId) return res.json({ user: null });
  const user = db.prepare('SELECT id, email, calendar_fetched_at FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.json({ user: null });

  res.json({
    user: { id: user.id, email: user.email },
    widgetToken: ensureWidgetToken(user.id),
    // Calendar subscription feed (routes/calendar.js). calendarFetchedAt =
    // when a calendar app last polled it — the client's "is it set up" signal.
    calendarToken: ensureCalendarToken(user.id),
    calendarFetchedAt: user.calendar_fetched_at || null,
    // Not secret — see server/encryption.js. Lets the client know on boot
    // whether this account's note content is ciphertext, and (if so) whether
    // *this* device still needs the recovery key re-entered to unlock it.
    encryption: encryption.getPrefs(db, user.id),
  });
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

// Rotate the calendar feed token — every existing subscription stops updating
// (the calendar keeps its last copy) and has to be re-added with the new URL.
router.post('/calendar-token', (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'no active session' });
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('UPDATE users SET calendar_token = ?, calendar_fetched_at = NULL WHERE id = ?').run(
    token,
    req.userId
  );
  res.json({ calendarToken: token });
});

// Legacy unauthenticated "log in with just an email" — removed. A session is
// now only minted by the magic-link callback (POST /api/auth/request-link ->
// GET /api/auth/callback). Kept as a 410 so any stale client gets a clear
// signal instead of a silent failure.
router.post('/', (req, res) => {
  res
    .status(410)
    .json({ error: 'use POST /api/auth/request-link', endpoint: '/api/auth/request-link' });
});

router.delete('/', (req, res) => {
  sessions.destroy(req.sessionId);
  res.clearCookie(sessions.SESSION_COOKIE, { path: '/' });
  res.clearCookie(LEGACY_COOKIE, { path: '/' });
  res.status(204).end();
});

module.exports = router;
