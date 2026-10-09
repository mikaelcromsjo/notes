// Sender aliases for mail-in (server/mail-ingest.js): extra From addresses an
// account accepts mail from, besides its own users.email — e.g. a work address
// you forward things from. An alias only counts once verified: we mail a
// one-time link to the address itself, so claiming an address you don't read
// gets you nothing (otherwise anyone could route a stranger's mail to the
// ingest address into their own account).
//
// Verification proves you own the mailbox; each mail from it still goes
// through mail-ingest's normal sender authentication (DKIM/SPF/DMARC, else a
// confirm link to the account's own address).
const crypto = require('crypto');
const db = require('./db');
const mailer = require('./mailer');
const { publicOrigin } = require('./digest');

const VERIFY_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const RESEND_GAP_MS = 60 * 1000;
const MAX_ALIASES = 10;
const MAX_SENDS_PER_HOUR = 5;

const now = () => new Date().toISOString();
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;
const normalize = (a) => String(a || '').trim().toLowerCase();

// The account a From address belongs to: its own email, or a verified alias.
function userForSender(from) {
  if (!from) return null;
  const own = db.prepare('SELECT id, email FROM users WHERE email = ?').get(from);
  if (own) return own;
  return (
    db
      .prepare(
        `SELECT u.id, u.email FROM mail_aliases a JOIN users u ON u.id = a.user_id
          WHERE a.address = ? AND a.verified_at IS NOT NULL`
      )
      .get(from) || null
  );
}

function list(userId) {
  return db
    .prepare(
      `SELECT address, verified_at AS verifiedAt, created_at AS createdAt,
              token_expires_at AS expiresAt
         FROM mail_aliases WHERE user_id = ? ORDER BY created_at`
    )
    .all(userId)
    .map((a) => ({ ...a, expired: !a.verifiedAt && (!a.expiresAt || Date.parse(a.expiresAt) < Date.now()) }));
}

async function sendVerifyMail(address, token, accountEmail) {
  const link = `${publicOrigin()}/api/mail-in/alias/verify?token=${token}`;
  const subject = 'Confirm this address for mail-in notes';
  const text =
    `${accountEmail} asked to accept notes emailed from this address (${address}).\n\n` +
    `If that's you, confirm here:\n${link}\n\n` +
    `The link works for 3 days. If you didn't ask for this, ignore this email — nothing changes.`;
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f5f7;padding:24px;color:#1c1e21">
<div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e2e4e9;border-radius:12px;padding:28px">
<h2 style="margin:0 0 12px;text-align:center">Confirm this address?</h2>
<p style="font-size:15px;line-height:1.5;margin:0 0 16px"><strong>${esc(accountEmail)}</strong> asked to accept notes emailed from this address (<strong>${esc(address)}</strong>).</p>
<p style="margin:0 0 20px;text-align:center"><a href="${link}" style="display:inline-block;background:#4f6df5;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600">Review &amp; confirm</a></p>
<p style="font-size:12px;color:#767a82;margin:0;text-align:center">The link works for 3 days. If you didn't ask for this, ignore this email — nothing changes.</p>
</div></body></html>`;
  if (mailer.configured()) {
    await mailer.sendMail({ to: address, subject, text, html });
  } else {
    console.log(`[mail-aliases] mailer not configured — verify link for ${address}: ${link}`);
  }
}

function esc(s) {
  return String(s == null ? '' : s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );
}

// Adds (or re-sends the link for) an unverified alias. Returns { alias } or
// { error, status }.
async function add(userId, rawAddress) {
  const address = normalize(rawAddress);
  if (!EMAIL_RE.test(address) || address.length > 254) return { error: 'not a valid email address', status: 400 };
  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId);
  if (!user) return { error: 'no such user', status: 401 };
  if (address === normalize(user.email)) return { error: "that's already your account's address", status: 400 };
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(address)) {
    return { error: 'that address belongs to another account', status: 409 };
  }
  const mailCfg = mailer.imapConfig();
  if (mailCfg && (mailCfg.ingestAddresses.includes(address) || address === normalize(mailCfg.user))) {
    return { error: "that's the mail-in mailbox itself", status: 400 };
  }

  const existing = db.prepare('SELECT * FROM mail_aliases WHERE address = ?').get(address);
  if (existing && existing.user_id !== userId) {
    // Someone else's claim. A verified one is theirs; an unverified one that
    // expired is up for grabs, a live one isn't (no tug-of-war of mails).
    if (existing.verified_at || Date.parse(existing.token_expires_at) > Date.now()) {
      return { error: 'that address is already in use', status: 409 };
    }
    db.prepare('DELETE FROM mail_aliases WHERE address = ?').run(address);
  } else if (existing && existing.verified_at) {
    return { error: 'already confirmed', status: 409 };
  } else if (existing && existing.last_sent_at && Date.now() - Date.parse(existing.last_sent_at) < RESEND_GAP_MS) {
    return { error: 'link just sent — wait a minute before resending', status: 429 };
  }

  if (!existing || existing.user_id !== userId) {
    const n = db.prepare('SELECT COUNT(*) AS n FROM mail_aliases WHERE user_id = ?').get(userId).n;
    if (n >= MAX_ALIASES) return { error: `at most ${MAX_ALIASES} addresses`, status: 400 };
  }
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const sent = db
    .prepare('SELECT COUNT(*) AS n FROM mail_aliases WHERE user_id = ? AND last_sent_at > ?')
    .get(userId, hourAgo).n;
  if (sent >= MAX_SENDS_PER_HOUR) return { error: 'too many confirmation emails — try again in an hour', status: 429 };

  const token = crypto.randomBytes(32).toString('base64url');
  const ts = now();
  db.prepare(
    `INSERT INTO mail_aliases (address, user_id, token_hash, token_expires_at, last_sent_at, created_at)
     VALUES (@address, @userId, @hash, @expires, @ts, @ts)
     ON CONFLICT(address) DO UPDATE SET token_hash = @hash, token_expires_at = @expires, last_sent_at = @ts`
  ).run({ address, userId, hash: sha256(token), expires: new Date(Date.now() + VERIFY_TTL_MS).toISOString(), ts });
  try {
    await sendVerifyMail(address, token, user.email);
  } catch (err) {
    console.error('[mail-aliases] failed to send verify mail:', err && err.message);
    return { error: "couldn't send the confirmation email — try again later", status: 502 };
  }
  return { alias: list(userId).find((a) => a.address === address) };
}

function remove(userId, rawAddress) {
  return db.prepare('DELETE FROM mail_aliases WHERE user_id = ? AND address = ?').run(userId, normalize(rawAddress)).changes > 0;
}

function pendingByToken(token) {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT a.*, u.email AS account_email FROM mail_aliases a JOIN users u ON u.id = a.user_id
        WHERE a.token_hash = ?`
    )
    .get(sha256(token));
  if (!row || row.verified_at || Date.parse(row.token_expires_at) < Date.now()) return null;
  return row;
}

function verify(token) {
  const row = pendingByToken(token);
  if (!row) return null;
  db.prepare(
    'UPDATE mail_aliases SET verified_at = ?, token_hash = NULL, token_expires_at = NULL WHERE address = ? AND token_hash = ?'
  ).run(now(), row.address, row.token_hash);
  return row;
}

module.exports = { userForSender, list, add, remove, pendingByToken, verify };
