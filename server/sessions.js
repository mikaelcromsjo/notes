const crypto = require('crypto');
const db = require('./db');

// Opaque session cookie. The value is 32 random bytes (base64url) and means
// nothing on its own — it is looked up in the `sessions` table on every request.
const SESSION_COOKIE = 'nico_sess';
// The pre-sessions cookie: held the raw users.id. Read once to migrate, then
// cleared. Remove support for it a release or two after this ships.
const LEGACY_COOKIE = 'nico_uid';

const MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000; // 60 days, sliding
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

// `secure` is correct for the real HTTPS site; the escape hatch is only for
// local HTTP testing against a DB_PATH copy on another port.
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.COOKIE_INSECURE !== '1',
  sameSite: 'lax',
  path: '/',
  maxAge: MAX_AGE_MS,
};

const insertStmt = db.prepare(
  `INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at, ua, ip_hash)
   VALUES (@id, @user_id, @now, @now, @expires_at, @ua, @ip_hash)`
);
const selectStmt = db.prepare(
  'SELECT id, user_id, expires_at, last_seen_at FROM sessions WHERE id = ?'
);
const touchStmt = db.prepare(
  'UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?'
);
const deleteStmt = db.prepare('DELETE FROM sessions WHERE id = ?');
const deleteOthersStmt = db.prepare(
  'DELETE FROM sessions WHERE user_id = ? AND id != ?'
);
const deleteExpiredStmt = db.prepare('DELETE FROM sessions WHERE expires_at < ?');
const listStmt = db.prepare(
  `SELECT id, created_at, last_seen_at, expires_at, ua, ip_hash
   FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC`
);

function hashIp(ip) {
  if (!ip) return null;
  return crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0, 32);
}

function create(userId, req) {
  const id = crypto.randomBytes(32).toString('base64url');
  const nowMs = Date.now();
  insertStmt.run({
    id,
    user_id: userId,
    now: new Date(nowMs).toISOString(),
    expires_at: new Date(nowMs + MAX_AGE_MS).toISOString(),
    ua: req && req.headers['user-agent']
      ? String(req.headers['user-agent']).slice(0, 400)
      : null,
    ip_hash: hashIp(req && (req.ip || (req.socket && req.socket.remoteAddress))),
  });
  return id;
}

// Returns { id, user_id } for a live session, or null. Slides the expiry and
// bumps last_seen_at at most once per LAST_SEEN_THROTTLE_MS.
function resolve(token) {
  if (!token) return null;
  const row = selectStmt.get(token);
  if (!row) return null;
  const nowMs = Date.now();
  if (Date.parse(row.expires_at) < nowMs) {
    deleteStmt.run(token);
    return null;
  }
  if (nowMs - Date.parse(row.last_seen_at) > LAST_SEEN_THROTTLE_MS) {
    touchStmt.run(
      new Date(nowMs).toISOString(),
      new Date(nowMs + MAX_AGE_MS).toISOString(),
      token
    );
  }
  return { id: row.id, user_id: row.user_id };
}

function destroy(token) {
  if (token) deleteStmt.run(token);
}

function destroyOthers(userId, keepToken) {
  deleteOthersStmt.run(userId, keepToken || '');
}

function list(userId) {
  return listStmt.all(userId);
}

let lastSweep = 0;
function sweepExpired() {
  const nowMs = Date.now();
  if (nowMs - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = nowMs;
  try {
    deleteExpiredStmt.run(new Date(nowMs).toISOString());
  } catch {
    /* best effort */
  }
}

module.exports = {
  SESSION_COOKIE,
  LEGACY_COOKIE,
  COOKIE_OPTS,
  create,
  resolve,
  destroy,
  destroyOthers,
  list,
  sweepExpired,
};
