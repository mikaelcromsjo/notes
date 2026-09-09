const crypto = require('crypto');
const db = require('./db');

// The per-user secret behind the read-only feeds (home-screen widget and the
// standalone digest page). Minted lazily — GET /api/session did this inline
// first; anything that needs a shareable feed URL can call this instead.
function ensureWidgetToken(userId) {
  const row = db.prepare('SELECT widget_token FROM users WHERE id = ?').get(userId);
  if (row && row.widget_token) return row.widget_token;
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('UPDATE users SET widget_token = ? WHERE id = ?').run(token, userId);
  return token;
}

module.exports = { ensureWidgetToken };
