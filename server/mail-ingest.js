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
//   - From must be exactly one address that is a users.email or one of that
//     account's verified sender aliases (server/mail-aliases.js), else ignored.
//     The sender gets a how-to reply only if Gmail authenticated the From
//     (so never backscatter to a spoofed address), at most once per 30 days
//     per address — see replyUnknownSender.
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
// Gmail account can't double-import. MAIL_INGEST_SOURCE picks who reads Gmail:
// `imap` (default) = poll() below; `mailrouter` = /srv/mailrouter polls the
// inbox and POSTs each +notes/+note mail to routes/mail-in.js `/ingest`
// (→ ingestRaw). Same pipeline and same message_key (Gmail X-GM-MSGID) either
// way, so switching modes never double-imports.
const crypto = require('crypto');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const db = require('./db');
const mailer = require('./mailer');
const notes = require('./notes');
const { publicOrigin } = require('./digest');
const { writeUpload, zipAttachments } = require('./upload-config');
const { classify, parseVcard } = require('./attachment-kind');
const mailAliases = require('./mail-aliases');

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
     (message_key, user_id, from_addr, subject, status, reason, note_id, token_hash, received_at, created_at, expires_at, replied_at)
   VALUES (@key, @userId, @from, @subject, @status, @reason, @noteId, @tokenHash, @receivedAt, @createdAt, @expiresAt, @repliedAt)`
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
    repliedAt: null,
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

// A forwarded mail's header block: a marker line (Gmail's "---------- Forwarded
// message ---------", Apple Mail's "Begin forwarded message:", Outlook's
// "-----Original Message-----" or "_____" rule, en/sv) then "Key: value" lines
// (From/Från/Date/Datum/Skickat/Subject/Ämne/To/Till/Cc/Kopia…) up to the first
// blank line. The marker and header lines go; text typed above it stays.
const FWD_MARKER_RE =
  /^[ \t>]*(?:-{2,}\s*(?:forwarded message|vidarebefordrat meddelande|original message|ursprungligt meddelande)\s*-{2,}|begin forwarded message:|vidarebefordrat meddelande:|_{10,})[ \t]*$/im;
const FWD_HEADER_RE =
  /^[ \t>]*(from|fr[åa]n|date|datum|sent|skickat|subject|[äa]mne|to|till|cc|kopia|reply-to|svara till)[ \t]*:[ \t]*(.*)$/i;
const FWD_FIELD = {
  from: 'from', 'från': 'from', fran: 'from',
  to: 'to', till: 'to',
  date: 'date', datum: 'date', sent: 'date', skickat: 'date',
  subject: 'subject', 'ämne': 'subject', amne: 'subject',
};

// → { text, header }: `header` = the forwarded mail's own {from, to, date,
// subject} (null when there's no forward block), `text` without that block.
function stripForwardHeader(text) {
  const none = { text, header: null };
  const m = FWD_MARKER_RE.exec(text);
  if (!m) return none;
  const lines = text.slice(m.index + m[0].length).split('\n');
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i += 1; // Apple Mail: blank line after marker
  const start = i;
  const header = {};
  let last = null;
  while (i < lines.length && lines[i].trim()) {
    const h = FWD_HEADER_RE.exec(lines[i]);
    if (!h && i === start) return none;
    if (h) {
      last = FWD_FIELD[h[1].toLowerCase()] || null;
      if (last && !header[last]) header[last] = h[2].trim();
      else if (last) last = null; // a 2nd From:/To: — keep the first
    } else if (last) {
      header[last] += ` ${lines[i].trim()}`; // wrapped To:/Cc: continuation
    }
    i += 1;
  }
  if (i === start) return none;
  const before = text.slice(0, m.index).trim();
  const after = lines.slice(i).join('\n').trim();
  return { text: before && after ? `${before}\n\n${after}` : before || after, header };
}

// What notes.mail records for a mail-in note: the forwarded mail's own
// sender/recipient/date when it's a forward, else this mail's.
function mailInfo(parsed, fwdHeader) {
  const clip = (v) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const info = fwdHeader
    ? {
        from: clip(fwdHeader.from),
        to: clip(fwdHeader.to),
        date: clip(fwdHeader.date),
        subject: clip(cleanSubject(fwdHeader.subject || parsed.subject)),
        forwarded: true,
      }
    : {
        from: clip(parsed.from && parsed.from.text),
        to: clip(parsed.to && (Array.isArray(parsed.to) ? parsed.to.map((t) => t.text).join(', ') : parsed.to.text)),
        date: parsed.date instanceof Date && !isNaN(parsed.date) ? parsed.date.toISOString() : '',
        subject: clip(cleanSubject(parsed.subject)),
      };
  return info.from ? JSON.stringify(info) : null;
}

function noteText(parsed) {
  let text = stripForwardHeader(String(parsed.text || '').replace(/\r\n/g, '\n')).text.trim();
  if (text.length > MAX_CONTENT_CHARS) text = `${text.slice(0, MAX_CONTENT_CHARS)}\n\n…(truncated)`;
  return text;
}

// Reply/forward prefixes mail clients stack onto a subject ("Fwd: RE: SV: …",
// "Fw[2]:", "[Fwd: …]"), in the common languages: Re/Fwd/Fw (en), Sv/Vb/Vs
// (sv/no/da), Aw/Wg (de), Tr/Rv (fr), Antw/Doorst (nl), Rif (it), Odp/Pd (pl),
// Enc/Res (pt/es), Ynt/Ilt (tr), Vl (fi), Vá/Továbbítás (hu), zh.
const SUBJECT_PREFIX_RE =
  /^(?:re|fwd?|fw|sv|vb|vs|aw|wg|tr|rv|antw|doorst|rif|odp|pd|enc|res|ynt|ilt|vl|vá|továbbítás|回复|转发|答复)\s*(?:\[\d+\]|\(\d+\))?\s*[:：]\s*/i;

function cleanSubject(subject) {
  let s = String(subject || '').trim();
  for (;;) {
    const before = s;
    s = s.replace(SUBJECT_PREFIX_RE, '').trim();
    // "[Fwd: Original subject]" (old Thunderbird/Outlook style)
    const wrapped = /^\[(?:fwd?|fw)\s*:\s*(.*)\]$/i.exec(s);
    if (wrapped) s = wrapped[1].trim();
    if (s === before) return s;
  }
}

function noteTitle(parsed, content) {
  const subject = cleanSubject(parsed.subject);
  if (subject) return subject.slice(0, 200);
  const line = content.split('\n').map((l) => l.trim()).find(Boolean);
  return line ? line.slice(0, 120) : '';
}

// Creates the note (own personal graph, no links) and returns it. An empty
// title falls through to createAttachmentNote's per-type default.
function createNoteFromMail(userId, parsed) {
  const note = createMailNote(userId, parsed);
  const mail = mailInfo(parsed, stripForwardHeader(String(parsed.text || '').replace(/\r\n/g, '\n')).header);
  if (note && note.id != null && mail) {
    db.prepare('UPDATE notes SET mail = ? WHERE id = ?').run(mail, note.id);
    note.mail = mail;
  }
  return note;
}

function createMailNote(userId, parsed) {
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

// --- unknown sender reply ----------------------------------------------------

// A From that's no account's address (nor a verified alias) is ignored, but
// we tell the sender how to fix it — only when Gmail proved the From is real
// (authenticate()), so a spoofed From never makes us mail an innocent third
// party (backscatter, which would also hurt this Gmail account's standing).
// Automated mail never gets here (isAutomated runs first). Generic text: it
// doesn't say whether any account exists and doesn't quote the message.
const REPLY_GAP_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_REPLIES_PER_DAY = 20;

async function sendUnknownSenderMail(to, parsed) {
  const link = `${publicOrigin()}/?d=integrate`;
  const subjectLine = String(parsed.subject || '').trim();
  const subject = `Not saved: ${subjectLine || '(no subject)'}`.slice(0, 160);
  const text =
    `Your email to the notes mail-in address wasn't saved: ${to} isn't connected to a notes account.\n\n` +
    `If you have an account and send from this address, add it under Settings → Integrate → Email to note, ` +
    `click the confirmation link we send to it, then send your email again:\n${link}\n\n` +
    `This is an automatic reply; you won't get another one for this address for 30 days.`;
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f5f7;padding:24px;color:#1c1e21">
<div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e2e4e9;border-radius:12px;padding:28px">
<h2 style="margin:0 0 12px;text-align:center">Your email wasn't saved</h2>
<p style="font-size:15px;line-height:1.5;margin:0 0 16px"><strong>${esc(to)}</strong> isn't connected to a notes account, so nothing was created from your email.</p>
<p style="font-size:15px;line-height:1.5;margin:0 0 20px">If you have an account and send from this address, add it under <strong>Settings → Integrate → Email to note</strong>, click the confirmation link we send to it, then send your email again.</p>
<p style="margin:0 0 20px;text-align:center"><a href="${link}" style="display:inline-block;background:#4f6df5;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600">Open Settings</a></p>
<p style="font-size:12px;color:#767a82;margin:0;text-align:center">This is an automatic reply; you won't get another one for this address for 30 days.</p>
</div></body></html>`;
  const thread = parsed.messageId ? { inReplyTo: parsed.messageId, references: parsed.messageId } : {};
  if (mailer.configured()) {
    // Auto-Submitted keeps well-behaved auto-responders from answering back.
    await mailer.sendMail({ to, subject, text, html, headers: { 'Auto-Submitted': 'auto-replied' }, ...thread });
  } else {
    console.log(`[mail-ingest] mailer not configured — would tell ${to} it's not a known sender`);
  }
}

async function replyUnknownSender(parsed, meta, cfg, base, { reply }) {
  const from = base.from;
  const ignored = { ...base, status: 'ignored', reason: 'unknown sender' };
  const own = [normalize(cfg.user), ...(cfg.ingestAddresses || [cfg.ingestAddress]).map(normalize)];
  if (own.includes(from) || !authenticate(parsed, meta.labels, from, cfg)) return record(ignored);
  const recent = db
    .prepare('SELECT 1 FROM mail_ingest WHERE from_addr = ? AND replied_at > ?')
    .get(from, new Date(Date.now() - REPLY_GAP_MS).toISOString());
  const today = db
    .prepare('SELECT COUNT(*) AS n FROM mail_ingest WHERE replied_at > ?')
    .get(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).n;
  if (recent || today >= MAX_REPLIES_PER_DAY) return record(ignored);

  // Row first, mail second: a crash between the two can never re-send.
  record({ ...ignored, reason: 'unknown sender (replied)', repliedAt: now() });
  try {
    await reply(from, parsed);
    console.log(`[mail-ingest] told unknown sender ${from} how to connect the address`);
  } catch (err) {
    console.error('[mail-ingest] failed to reply to unknown sender:', err && err.message);
  }
}

const normalize = (a) => String(a || '').trim().toLowerCase();

// --- per-message handling ----------------------------------------------------

// `meta`: { key, labels (Set), receivedAt }. `send` is injectable for tests.
async function processParsed(parsed, meta, cfg, { send = sendConfirmMail, reply = sendUnknownSenderMail } = {}) {
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
  const user = mailAliases.userForSender(from);
  if (!user) {
    if (!from) return record({ ...base, status: 'ignored', reason: 'no single From' });
    return replyUnknownSender(parsed, meta, cfg, base, { reply });
  }
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

// --- mail handed over by /srv/mailrouter (MAIL_INGEST_SOURCE=mailrouter) ----

function receivesFromRouter() {
  return process.env.MAIL_INGEST === '1' && process.env.MAIL_INGEST_SOURCE === 'mailrouter';
}

// `raw` = the RFC 822 bytes, `meta` = { key (X-GM-MSGID), labels (Set), receivedAt }
// as the router read them from Gmail. → { status, duplicate? }, status being what
// tidy() would have labelled: the router does the Gmail labelling/archiving in
// this mode. A message already in mail_ingest (router retry, or seen by poll()
// before a mode switch) is not processed again.
async function ingestRaw(raw, meta) {
  const cfg = mailer.imapConfig();
  if (!cfg) throw new Error('mail not configured');
  const seen = statusStmt.get(meta.key);
  if (seen) return { status: seen.status, duplicate: true };
  if (raw.length > MAX_MESSAGE_BYTES) {
    record({ key: meta.key, status: 'ignored', reason: 'too large', receivedAt: meta.receivedAt || null });
    return { status: 'ignored' };
  }
  await processParsed(await simpleParser(raw), meta, cfg);
  const row = statusStmt.get(meta.key);
  return { status: row ? row.status : 'ignored' };
}

function start() {
  if (process.env.MAIL_INGEST !== '1') return;
  const cfg = mailer.imapConfig();
  if (!cfg) {
    console.warn('[mail-ingest] MAIL_INGEST=1 but no mail credentials — not polling');
    return;
  }
  if (receivesFromRouter()) {
    if (!process.env.MAIL_INGEST_TOKEN) console.warn('[mail-ingest] MAIL_INGEST_SOURCE=mailrouter but no MAIL_INGEST_TOKEN — /ingest refuses everything');
    console.log(`[mail-ingest] ${cfg.ingestAddresses.join(', ')} delivered by /srv/mailrouter (POST /api/mail-in/ingest), not polling`);
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
  receivesFromRouter,
  ingestRaw,
  pendingByToken,
  // exported for testing
  processParsed,
  authenticate,
  classify,
  parseVcard,
  createNoteFromMail,
};
