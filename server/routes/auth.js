const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const sessions = require('../sessions');
const mailer = require('../mailer');

const router = express.Router();

const LEGACY_COOKIE = 'nico_uid';
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const TOKEN_TTL_MS = 15 * 60 * 1000;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Pin the link base with PUBLIC_ORIGIN behind a proxy; else trust forwarded
// headers (mirrors server/routes/widget.js).
function originFor(req) {
  if (process.env.PUBLIC_ORIGIN) return process.env.PUBLIC_ORIGIN.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

// --- tiny in-memory rate limiter (resets on restart; one box) ---
const hits = new Map(); // key -> [timestamps]
function rateLimited(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > max;
}

const insertToken = db.prepare(
  `INSERT INTO login_tokens (token_hash, email, created_at, expires_at)
   VALUES (?, ?, ?, ?)`
);
const findToken = db.prepare(
  'SELECT token_hash, email, expires_at, consumed_at FROM login_tokens WHERE token_hash = ?'
);
const consumeToken = db.prepare(
  'UPDATE login_tokens SET consumed_at = ? WHERE token_hash = ? AND consumed_at IS NULL'
);
const purgeTokens = db.prepare(
  "DELETE FROM login_tokens WHERE expires_at < ? OR consumed_at IS NOT NULL"
);

router.post('/request-link', async (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

  // Uniform response — never reveal whether the address is known or was sent.
  const ok = () => res.status(202).json({ ok: true });

  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'a valid email is required' });
  if (rateLimited(`ip:${ip}`, 12, 10 * 60 * 1000)) return ok();
  if (rateLimited(`em:${email}`, 4, 10 * 60 * 1000)) return ok();

  try {
    purgeTokens.run(new Date().toISOString());
  } catch {
    /* best effort */
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const nowMs = Date.now();
  insertToken.run(
    sha256(token),
    email,
    new Date(nowMs).toISOString(),
    new Date(nowMs + TOKEN_TTL_MS).toISOString()
  );

  const link = `${originFor(req)}/api/auth/callback?token=${token}`;
  const subject = 'Your login link';
  const text = `Click to sign in:\n${link}\n\nThis link expires in 15 minutes. If you didn't request it, ignore this email.`;
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f5f7;padding:24px;color:#1c1e21">
<div style="max-width:520px;margin:auto;background:#fff;border:1px solid #e2e4e9;border-radius:12px;padding:28px;text-align:center">
<h2 style="margin:0 0 12px">Sign in</h2>
<p style="font-size:15px;line-height:1.5;margin:0 0 20px">Click the button to sign in to your notes.</p>
<p style="margin:0 0 20px"><a href="${link}" style="display:inline-block;background:#4f6df5;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600">Sign in</a></p>
<p style="font-size:12px;color:#767a82;margin:0">This link expires in 15 minutes. If you didn't request it, ignore this email.</p>
</div></body></html>`;

  try {
    if (mailer.configured()) {
      await mailer.sendMail({ to: email, subject, text, html });
    } else {
      console.log(`[auth] mailer not configured — login link for ${email}: ${link}`);
    }
  } catch (err) {
    console.error('[auth] failed to send login link:', err && err.message);
  }

  return ok();
});

router.get('/callback', (req, res) => {
  const token = String(req.query.token || '');
  const fail = () => res.redirect('/?login=invalid');
  if (!token) return fail();

  const row = findToken.get(sha256(token));
  if (!row || row.consumed_at) return fail();
  if (Date.parse(row.expires_at) < Date.now()) return fail();

  const consumed = consumeToken.run(new Date().toISOString(), row.token_hash);
  if (consumed.changes !== 1) return fail(); // lost a race

  let user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(row.email);
  if (!user) {
    const info = db.prepare('INSERT INTO users (email) VALUES (?)').run(row.email);
    user = { id: info.lastInsertRowid, email: row.email };
  }

  const sessionId = sessions.create(user.id, req);
  res.cookie(sessions.SESSION_COOKIE, sessionId, sessions.COOKIE_OPTS);
  res.clearCookie(LEGACY_COOKIE, { path: '/' });
  res.redirect('/');
});

module.exports = router;
