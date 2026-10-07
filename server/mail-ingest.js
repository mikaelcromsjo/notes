// Mail-in: email the ingest address (default `<mail.json user>+notes@…`, e.g.
// alf.cromsjo+notes@gmail.com) to create a private note in the account whose
// email matches the From address.
//
// Why IMAP polling and not a local MTA/mail router: the ingest address is a
// Gmail alias, so its mail is delivered to Google's MX, never to this box. A
// local SMTP listener would need its own domain's MX record, an open port 25
// and our own spam/auth handling. Polling the same Gmail account mailer.js
// already sends through (one app password, IMAP + SMTP) needs none of that,
// and Gmail has already done SPF/DKIM/DMARC checking for us — its verdict is
// the topmost Authentication-Results header.
//
// Per message (deduped by Gmail's X-GM-MSGID in the mail_ingest table, see
// db.js):
//   - From must be exactly one address that is a users.email, else ignored
//     (silently — no reply to unknown senders, no backscatter).
//   - Authenticated (self-sent from this Gmail account, or Gmail's own
//     DMARC/aligned DKIM/aligned SPF pass for the From domain) → note created.
//   - Otherwise → nothing created yet; a one-time confirm link, quoting the
//     message, goes to the account's own address (routes/mail-in.js). Only
//     the real mailbox owner can click it, so a spoofed From can't plant notes.
// Note shape: subject → title, text body → content; 0 attachments = text note,
// 1 = image/audio/contact/file note of that kind, 2+ (or one we refuse to
// serve as-is) = one .zip file note. Personal graph, no links — it shows up
// in the agenda's "Orphaned notes" until the user links it somewhere.
//
// Opt-in: only runs with MAIL_INGEST=1, so a second checkout sharing this
// Gmail account (test.ia-ai.se) can't double-import.
const crypto = require('crypto');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const db = require('./db');
const mailer = require('./mailer');
const notes = require('./notes');
const { publicOrigin } = require('./digest');
const { writeUpload, zipAttachments } = require('./upload-config');
const { classify, parseVcard } = require('./attachment-kind');

const TICK_MS = 60 * 1000;
const LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
const CONFIRM_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_MESSAGE_BYTES = 35 * 1024 * 1024; // Gmail's own cap is 25 MB
const MAX_CONTENT_CHARS = 100000;
const MAX_PENDING_PER_HOUR = 5;
const CURSOR_KEY = '__cursor__';

const now = () => new Date().toISOString();
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// --- bookkeeping -------------------------------------------------------------

const seenStmt = db.prepare('SELECT 1 FROM mail_ingest WHERE message_key = ?');
const recordStmt = db.prepare(
  `INSERT OR IGNORE INTO mail_ingest
     (message_key, user_id, from_addr, subject, status, reason, note_id, token_hash, received_at, created_at, expires_at)
   VALUES (@key, @userId, @from, @subject, @status, @reason, @noteId, @tokenHash, @receivedAt, @createdAt, @expiresAt)`
);

function record(r) {
  recordStmt.run({
    userId: null,
    from: null,
    subject: null,
    reason: null,
    noteId: null,
    tokenHash: null,
    receivedAt: null,
    expiresAt: null,
    createdAt: now(),
    ...r,
  });
}

// Mail older than the moment ingest was first switched on is never imported.
function cursorSince() {
  const row = db.prepare('SELECT received_at FROM mail_ingest WHERE message_key = ?').get(CURSOR_KEY);
  if (row) return row.received_at;
  const ts = now();
  record({ key: CURSOR_KEY, status: 'cursor', receivedAt: ts });
  return ts;
}

// --- sender authentication ---------------------------------------------------

function headerLine(parsed, key) {
  const h = (parsed.headerLines || []).find((l) => l.key === key);
  if (!h) return null;
  return h.line.replace(/^[^:]*:\s*/, '').replace(/\r?\n[ \t]+/g, ' ');
}

function senderOf(parsed) {
  const list = (parsed.from && parsed.from.value) || [];
  if (list.length !== 1 || !list[0].address) return null;
  return list[0].address.trim().toLowerCase();
}

// Relaxed DMARC alignment: same domain, or one a subdomain of the other.
function aligned(d, fromDomain) {
  if (!d) return false;
  d = d.toLowerCase().replace(/^.*@/, '').replace(/[>\s]+$/, '');
  if (!d.includes('.')) return false;
  return d === fromDomain || d.endsWith(`.${fromDomain}`) || fromDomain.endsWith(`.${d}`);
}

// Returns how the sender was authenticated, or null. Only the *topmost*
// Authentication-Results counts, and only when Gmail's own MX wrote it —
// anything below it came with the message and is attacker-controlled.
function authenticate(parsed, labels, from, cfg) {
  if (labels && labels.has('\\Sent') && from === cfg.user.toLowerCase()) return 'self-sent';
  const ar = headerLine(parsed, 'authentication-results');
  if (!ar || !/^mx\.google\.com\s*;/i.test(ar)) return null;
  const fromDomain = from.split('@')[1];
  for (const clause of ar.split(';').slice(1)) {
    const c = clause.trim();
    const prop = (name) => {
      const m = new RegExp(`\\b${name.replace('.', '\\.')}=([^\\s;]+)`, 'i').exec(c);
      return m && m[1];
    };
    if (/^dmarc=pass\b/i.test(c) && aligned(prop('header.from'), fromDomain)) return 'dmarc';
    if (/^dkim=pass\b/i.test(c) && (aligned(prop('header.d'), fromDomain) || aligned(prop('header.i'), fromDomain))) {
      return 'dkim';
    }
    if (/^spf=pass\b/i.test(c) && aligned(prop('smtp.mailfrom'), fromDomain)) return 'spf';
  }
  return null;
}

// Bounces, vacation replies, list mail: never import, never answer.
function isAutomated(parsed) {
  const auto = (headerLine(parsed, 'auto-submitted') || '').toLowerCase();
  if (auto && auto !== 'no') return true;
  const prec = (headerLine(parsed, 'precedence') || '').toLowerCase();
  return /bulk|junk|list|auto_reply/.test(prec);
}

function addressedToIngest(parsed, addresses) {
  const delivered = (parsed.headerLines || [])
    .filter((l) => l.key === 'delivered-to' || l.key === 'x-original-to')
    .map((l) => l.line.replace(/^[^:]*:\s*/, '').trim().toLowerCase());
  if (delivered.some((a) => addresses.includes(a))) return true;
  const addrs = [parsed.to, parsed.cc]
    .flatMap((f) => (f ? (Array.isArray(f) ? f : [f]) : []))
    .flatMap((f) => f.value || [])
    .map((v) => (v.address || '').toLowerCase());
  return addrs.some((a) => addresses.includes(a));
}

// --- message → note ----------------------------------------------------------

// Real attachments, plus inline cid: images big enough to be a photo. Small
// inline images (signature logos etc.) are part of the HTML body, not
// something the sender attached.
function attachmentsOf(parsed) {
  return (parsed.attachments || []).filter(
    (a) => a.content && a.content.length && (!a.related || isPastedImage(a))
  );
}

// Gmail (esp. mobile) sends a pasted/inserted photo as an inline cid: image,
// not an attachment. Keep those; signature logos and tracking pixels are far
// smaller than any real photo.
const INLINE_IMAGE_MIN = 20 * 1024;
function isPastedImage(a) {
  return /^image\//i.test(a.contentType || '') && a.content.length >= INLINE_IMAGE_MIN;
}

function noteText(parsed) {
  let text = String(parsed.text || '').replace(/\r\n/g, '\n').trim();
  if (text.length > MAX_CONTENT_CHARS) text = `${text.slice(0, MAX_CONTENT_CHARS)}\n\n…(truncated)`;
  return text;
}

function noteTitle(parsed, content) {
  const subject = String(parsed.subject || '').trim();
  if (subject) return subject.slice(0, 200);
  const line = content.split('\n').map((l) => l.trim()).find(Boolean);
  return line ? line.slice(0, 120) : '';
}

// Creates the note (own personal graph, no links) and returns it. An empty
// title falls through to createAttachmentNote's per-type default.
function createNoteFromMail(userId, parsed) {
  const content = noteText(parsed);
  const title = noteTitle(parsed, content);
  const atts = attachmentsOf(parsed);

  if (!atts.length) return notes.create(db, userId, { title: title || 'Email note', content });

  if (atts.length === 1) {
    const c = classify(atts[0]);
    if (c && c.type === 'contact') {
      return notes.createAttachmentNote(db, userId, null, {
        type: 'contact',
        title,
        content,
        contactName: c.contact.name,
        contactPhone: c.contact.phone,
        contactEmail: c.contact.email,
      });
    }
    if (c) {
      const f = writeUpload(atts[0].content, c.ext);
      return notes.createAttachmentNote(
        db,
        userId,
        null,
        { type: c.type, title, content },
        { ...f, mimetype: c.mime, originalname: atts[0].filename || `attachment${c.ext}` }
      );
    }
  }

  const f = writeUpload(zipAttachments(atts), '.zip');
  return notes.createAttachmentNote(
    db,
    userId,
    null,
    { type: 'file', title, content },
    { ...f, mimetype: 'application/zip', originalname: 'email-attachments.zip' }
  );
}

// Human summary of what an email will turn into (confirm mail + page).
function describeAttachments(parsed) {
  const atts = attachmentsOf(parsed);
  const list = atts.map((a) => ({ name: a.filename || '(unnamed)', size: a.content.length }));
  if (!atts.length) return { list, outcome: 'a text note' };
  if (atts.length === 1) {
    const c = classify(atts[0]);
    if (c) return { list, outcome: `${c.type === 'image' || c.type === 'audio' ? 'an' : 'a'} ${c.type} note` };
  }
  return { list, outcome: 'a note with the attachments in one .zip' };
}

// --- confirm mail ------------------------------------------------------------

function esc(s) {
  return String(s == null ? '' : s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );
}

const fmtSize = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);

async function sendConfirmMail(to, token, parsed) {
  const link = `${publicOrigin()}/api/mail-in/confirm?token=${token}`;
  const subjectLine = String(parsed.subject || '').trim() || '(no subject)';
  const body = noteText(parsed);
  const preview = body.length > 2000 ? `${body.slice(0, 2000)}…` : body;
  const { list, outcome } = describeAttachments(parsed);
  const attText = list.map((a) => `  - ${a.name} (${fmtSize(a.size)})`).join('\n');

  const subject = `Confirm new note: ${subjectLine}`.slice(0, 160);
  const text =
    `We got an email asking to create a note in your account, but couldn't verify it really came from you.\n\n` +
    `Subject: ${subjectLine}\n\n${preview || '(no text)'}\n\n` +
    (list.length ? `Attachments:\n${attText}\n\n` : '') +
    `It will become ${outcome}. To create it, open:\n${link}\n\n` +
    `The link works for 3 days. If you didn't send this, ignore this email — nothing is created.`;
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f5f7;padding:24px;color:#1c1e21">
<div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e2e4e9;border-radius:12px;padding:28px">
<h2 style="margin:0 0 12px;text-align:center">Create this note?</h2>
<p style="font-size:15px;line-height:1.5;margin:0 0 16px">We got an email asking to create a note in your account, but couldn't verify it really came from you.</p>
<div style="border:1px solid #e2e4e9;border-radius:8px;padding:14px 16px;margin:0 0 16px;background:#fafbfc">
<div style="font-weight:600;margin:0 0 8px">${esc(subjectLine)}</div>
<div style="white-space:pre-wrap;font-size:14px;line-height:1.45;color:#3a3d42">${esc(preview || '(no text)')}</div>
${list.length ? `<div style="margin-top:10px;font-size:13px;color:#555">📎 ${list.map((a) => `${esc(a.name)} (${fmtSize(a.size)})`).join(', ')}</div>` : ''}
</div>
<p style="font-size:14px;margin:0 0 20px">It will become ${esc(outcome)}.</p>
<p style="margin:0 0 20px;text-align:center"><a href="${link}" style="display:inline-block;background:#4f6df5;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600">Review &amp; create note</a></p>
<p style="font-size:12px;color:#767a82;margin:0;text-align:center">The link works for 3 days. If you didn't send this, ignore this email — nothing is created.</p>
</div></body></html>`;

  if (mailer.configured()) {
    await mailer.sendMail({ to, subject, text, html });
  } else {
    console.log(`[mail-ingest] mailer not configured — confirm link for ${to}: ${link}`);
  }
}

// --- per-message handling ----------------------------------------------------

// `meta`: { key, labels (Set), receivedAt }. `send` is injectable for tests.
async function processParsed(parsed, meta, cfg, { send = sendConfirmMail } = {}) {
  const base = {
    key: meta.key,
    subject: String(parsed.subject || '').slice(0, 300),
    receivedAt: meta.receivedAt || null,
  };
  if (!addressedToIngest(parsed, cfg.ingestAddresses || [cfg.ingestAddress])) {
    return record({ ...base, status: 'ignored', reason: 'not addressed to ingest address' });
  }
  const from = senderOf(parsed);
  base.from = from;
  if (isAutomated(parsed)) return record({ ...base, status: 'ignored', reason: 'automated' });
  const user = from && db.prepare('SELECT id, email FROM users WHERE email = ?').get(from);
  if (!user) return record({ ...base, status: 'ignored', reason: from ? 'unknown sender' : 'no single From' });
  base.userId = user.id;

  const how = authenticate(parsed, meta.labels, from, cfg);
  if (how) {
    try {
      const note = createNoteFromMail(user.id, parsed);
      record({ ...base, status: 'created', reason: how, noteId: note.id });
      console.log(`[mail-ingest] note ${note.id} for user ${user.id} (${how})`);
    } catch (err) {
      record({ ...base, status: 'failed', reason: String(err && err.message).slice(0, 300) });
      console.error('[mail-ingest] create failed:', err && err.message);
    }
    return;
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recent = db
    .prepare("SELECT COUNT(*) AS n FROM mail_ingest WHERE user_id = ? AND token_hash IS NOT NULL AND created_at > ?")
    .get(user.id, hourAgo).n;
  if (recent >= MAX_PENDING_PER_HOUR) {
    return record({ ...base, status: 'ignored', reason: 'confirm rate limit' });
  }

  // Row first, mail second: a crash between the two can never re-send.
  const token = crypto.randomBytes(32).toString('base64url');
  record({
    ...base,
    status: 'pending',
    reason: 'unauthenticated',
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + CONFIRM_TTL_MS).toISOString(),
  });
  try {
    await send(user.email, token, parsed);
    console.log(`[mail-ingest] confirm link sent to user ${user.id}`);
  } catch (err) {
    console.error('[mail-ingest] failed to send confirm mail:', err && err.message);
  }
}

// --- IMAP --------------------------------------------------------------------

async function withMailbox(cfg, fn) {
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: true,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
  });
  await client.connect();
  try {
    // Gmail's "All Mail" (localized name — find it by special-use flag) sees
    // archived and self-sent mail too, not just what's still in INBOX.
    const box = (await client.list()).find((b) => b.specialUse === '\\All');
    const lock = await client.getMailboxLock(box ? box.path : 'INBOX');
    try {
      return await fn(client);
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

// Gmail housekeeping once a message is handled: a `notes/<status>` label,
// marked read, archived (out of the Inbox — still in All Mail, which the
// confirm flow re-fetches from, so nothing is ever deleted). A failure is the
// exception: left unread in the Inbox so a human notices. Best effort — a
// labelling error never undoes or repeats the import (mail_ingest dedupes).
const LABELS = ['created', 'pending', 'ignored', 'failed'].map((s) => `notes/${s}`);

async function tidy(client, uid, status) {
  const label = `notes/${status}`;
  if (!LABELS.includes(label)) return;
  try {
    const stale = LABELS.filter((l) => l !== label);
    await client.messageFlagsRemove(uid, stale, { uid: true, useLabels: true });
    await client.messageFlagsAdd(uid, [label], { uid: true, useLabels: true });
    if (status === 'failed') return;
    await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
    await client.messageFlagsRemove(uid, ['\\Inbox'], { uid: true, useLabels: true });
  } catch (err) {
    console.error('[mail-ingest] could not label/archive message:', err && err.message);
  }
}

const statusStmt = db.prepare('SELECT status FROM mail_ingest WHERE message_key = ?');

let polling = false;

async function poll() {
  const cfg = mailer.imapConfig();
  if (!cfg || polling) return;
  polling = true;
  try {
    await withMailbox(cfg, async (client) => {
      const since = cursorSince();
      const afterSec = Math.floor(Math.max(Date.parse(since), Date.now() - LOOKBACK_MS) / 1000);
      const any = (cfg.ingestAddresses || [cfg.ingestAddress])
        .map((a) => `deliveredto:${a} to:${a} cc:${a}`).join(' ');
      const uids = await client.search(
        { gmraw: `{${any}} after:${afterSec}` },
        { uid: true }
      );
      if (!uids || !uids.length) return;

      // Metadata in one pass, bodies after — imapflow can't nest a fetch
      // inside a running fetch iterator.
      const metas = [];
      for await (const m of client.fetch(uids, { uid: true, emailId: true, size: true, labels: true, internalDate: true }, { uid: true })) {
        metas.push(m);
      }
      for (const m of metas) {
        const key = String(m.emailId || `uid:${m.uid}`);
        if (seenStmt.get(key)) continue;
        const receivedAt = m.internalDate ? new Date(m.internalDate).toISOString() : null;
        if (receivedAt && receivedAt < since) continue;
        if (m.size > MAX_MESSAGE_BYTES) {
          record({ key, status: 'ignored', reason: 'too large', receivedAt });
          await tidy(client, m.uid, 'ignored');
          continue;
        }
        const msg = await client.fetchOne(m.uid, { source: true }, { uid: true });
        const parsed = await simpleParser(msg.source);
        await processParsed(parsed, { key, labels: m.labels || new Set(), receivedAt }, cfg);
        const row = statusStmt.get(key);
        if (row) await tidy(client, m.uid, row.status);
      }
    });
  } catch (err) {
    console.error('[mail-ingest] poll failed:', err && err.message);
  } finally {
    polling = false;
  }
}

// --- confirm (routes/mail-in.js) ---------------------------------------------

function pendingByToken(token) {
  if (!token) return null;
  const row = db.prepare('SELECT * FROM mail_ingest WHERE token_hash = ?').get(sha256(token));
  if (!row || row.status !== 'pending' || Date.parse(row.expires_at) < Date.now()) return null;
  return row;
}

// Re-fetches the message from Gmail (nothing of it was stored) and creates
// the note. Claims the row first so a double-submit can't create two notes;
// releases it again if anything fails, so the link can simply be retried.
async function confirm(token) {
  const row = pendingByToken(token);
  if (!row) return { error: 'invalid' };
  const claimed = db
    .prepare("UPDATE mail_ingest SET status = 'processing' WHERE message_key = ? AND status = 'pending'")
    .run(row.message_key);
  if (claimed.changes !== 1) return { error: 'invalid' };

  try {
    const cfg = mailer.imapConfig();
    if (!cfg) throw new Error('mail not configured');
    // Create inside the IMAP session so the label can flip pending → created
    // on the same connection.
    const result = await withMailbox(cfg, async (client) => {
      const uids = await client.search({ emailId: row.message_key }, { uid: true });
      if (!uids || !uids.length) return null;
      const msg = await client.fetchOne(uids[0], { source: true }, { uid: true });
      const parsed = await simpleParser(msg.source);
      if (senderOf(parsed) !== row.from_addr) throw new Error('sender mismatch');
      const note = createNoteFromMail(row.user_id, parsed);
      db.prepare(
        "UPDATE mail_ingest SET status = 'created', reason = 'confirmed', note_id = ?, token_hash = NULL, consumed_at = ? WHERE message_key = ?"
      ).run(note.id, now(), row.message_key);
      await tidy(client, uids[0], 'created');
      return note;
    });
    if (!result) {
      db.prepare("UPDATE mail_ingest SET status = 'failed', reason = 'message gone', token_hash = NULL WHERE message_key = ?").run(row.message_key);
      return { error: 'gone' };
    }
    const note = result;
    return { note };
  } catch (err) {
    db.prepare("UPDATE mail_ingest SET status = 'pending' WHERE message_key = ? AND status = 'processing'").run(row.message_key);
    console.error('[mail-ingest] confirm failed:', err && err.message);
    return { error: 'retry' };
  }
}

function start() {
  if (process.env.MAIL_INGEST !== '1') return;
  const cfg = mailer.imapConfig();
  if (!cfg) {
    console.warn('[mail-ingest] MAIL_INGEST=1 but no mail credentials — not polling');
    return;
  }
  console.log(`[mail-ingest] polling ${cfg.ingestAddresses.join(', ')} every ${TICK_MS / 1000}s`);
  poll();
  setInterval(poll, TICK_MS);
}

module.exports = {
  start,
  poll,
  confirm,
  pendingByToken,
  // exported for testing
  processParsed,
  authenticate,
  classify,
  parseVcard,
  createNoteFromMail,
};
