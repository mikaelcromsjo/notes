const crypto = require('crypto');
const express = require('express');
const mailIngest = require('../mail-ingest');
const mailAliases = require('../mail-aliases');
const mailer = require('../mailer');

// Confirm link for a mailed-in note whose sender couldn't be authenticated
// (server/mail-ingest.js). Token-authed, so mounted above the cookie gate.
// GET only *shows* the note-to-be with a button; the POST does the work —
// mail scanners and link previewers prefetch GETs, and a prefetch must not
// be able to create the note on the user's behalf.
const router = express.Router();

function esc(s) {
  return String(s == null ? '' : s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );
}

function page(heading, bodyHtml, icon) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(heading)}</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f5f7;margin:0;padding:24px;color:#1c1e21">
<div style="max-width:520px;margin:10vh auto 0;background:#fff;border:1px solid #e2e4e9;border-radius:12px;padding:32px;text-align:center">
<div style="font-size:34px;margin-bottom:8px">${icon}</div>
<h1 style="font-size:20px;margin:0 0 12px">${esc(heading)}</h1>
${bodyHtml}
</div></body></html>`;
}

const button = (label) =>
  `<button type="submit" style="background:#4f6df5;color:#fff;border:0;padding:10px 20px;border-radius:8px;font:600 15px inherit;cursor:pointer">${label}</button>`;
const appLink =
  '<a href="/" style="display:inline-block;background:#4f6df5;color:#fff;text-decoration:none;padding:9px 18px;border-radius:8px;font-weight:600">Go to the app</a>';
const invalid = (res) =>
  res
    .status(400)
    .send(
      page(
        'Link no longer valid',
        `<p style="font-size:15px;line-height:1.55;margin:0 0 20px">This link is invalid, already used, or expired. Send the email again to get a new one.</p>${appLink}`,
        '⚠️'
      )
    );

router.get('/confirm', (req, res) => {
  const token = String(req.query.token || '');
  const row = mailIngest.pendingByToken(token);
  if (!row) return invalid(res);
  res.send(
    page(
      'Create note from email?',
      `<p style="font-size:15px;line-height:1.55;margin:0 0 6px">From <strong>${esc(row.from_addr)}</strong></p>
<p style="font-size:15px;line-height:1.55;margin:0 0 20px">“${esc(row.subject || '(no subject)')}”</p>
<form method="post" action="/api/mail-in/confirm"><input type="hidden" name="token" value="${esc(token)}">${button('Create note')}</form>`,
      '✉️'
    )
  );
});

router.post('/confirm', express.urlencoded({ extended: false }), async (req, res) => {
  const token = String((req.body && req.body.token) || '');
  const result = await mailIngest.confirm(token);
  if (result.note) return res.redirect(303, `/#${result.note.id}`);
  if (result.error === 'retry') {
    return res.status(503).send(
      page(
        'Couldn’t create the note',
        `<p style="font-size:15px;line-height:1.55;margin:0 0 20px">Something went wrong fetching the email. Your link still works — try again in a minute.</p>
<form method="post" action="/api/mail-in/confirm"><input type="hidden" name="token" value="${esc(token)}">${button('Try again')}</form>`,
        '⚠️'
      )
    );
  }
  if (result.error === 'gone') {
    return res.status(410).send(
      page('Email not found', `<p style="font-size:15px;line-height:1.55;margin:0 0 20px">That email has been deleted from the mailbox, so there's nothing left to create a note from.</p>${appLink}`, '⚠️')
    );
  }
  return invalid(res);
});

// --- sender aliases (server/mail-aliases.js) ---------------------------------
// The list/add/remove routes are cookie-authed (resolveSession has already run,
// this router just sits above the 401 gate for the token links), so each
// checks req.userId itself.

function needUser(req, res, next) {
  if (!req.userId) return res.status(401).json({ error: 'no active session' });
  next();
}

// Also hands back the ingest address so Settings can show it.
router.get('/aliases', needUser, (req, res) => {
  const cfg = mailer.imapConfig();
  res.json({
    ingestAddress: cfg ? cfg.ingestAddress : null,
    enabled: process.env.MAIL_INGEST === '1' && Boolean(cfg),
    aliases: mailAliases.list(req.userId),
  });
});

router.post('/aliases', needUser, express.json(), async (req, res) => {
  const result = await mailAliases.add(req.userId, req.body && req.body.address);
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  res.json(result);
});

router.delete('/aliases/:address', needUser, (req, res) => {
  if (!mailAliases.remove(req.userId, req.params.address)) return res.status(404).json({ error: 'not found' });
  res.status(204).end();
});

// Verify link mailed to the alias address. Same GET-shows / POST-does split
// as /confirm, for the same prefetch reason.
const aliasInvalid = (res) =>
  res
    .status(400)
    .send(
      page(
        'Link no longer valid',
        `<p style="font-size:15px;line-height:1.55;margin:0 0 20px">This link is invalid, already used, or expired. Add the address again in Settings → Integrate to get a new one.</p>${appLink}`,
        '⚠️'
      )
    );

router.get('/alias/verify', (req, res) => {
  const token = String(req.query.token || '');
  const row = mailAliases.pendingByToken(token);
  if (!row) return aliasInvalid(res);
  res.send(
    page(
      'Accept notes from this address?',
      `<p style="font-size:15px;line-height:1.55;margin:0 0 6px">Mail from <strong>${esc(row.address)}</strong></p>
<p style="font-size:15px;line-height:1.55;margin:0 0 20px">will become notes in <strong>${esc(row.account_email)}</strong>'s account.</p>
<form method="post" action="/api/mail-in/alias/verify"><input type="hidden" name="token" value="${esc(token)}">${button('Confirm address')}</form>`,
      '✉️'
    )
  );
});

router.post('/alias/verify', express.urlencoded({ extended: false }), (req, res) => {
  const row = mailAliases.verify(String((req.body && req.body.token) || ''));
  if (!row) return aliasInvalid(res);
  res.send(
    page(
      'Address confirmed',
      `<p style="font-size:15px;line-height:1.55;margin:0 0 20px">Mail from <strong>${esc(row.address)}</strong> to the mail-in address now becomes notes in your account.</p>${appLink}`,
      '✅'
    )
  );
});

// MAIL_INGEST_SOURCE=mailrouter: /srv/mailrouter (handler `notes`) hands over each
// +notes/+note mail as raw RFC 822, with Gmail's X-GM-MSGID / X-GM-LABELS /
// INTERNALDATE in headers. Shared-secret MAIL_INGEST_TOKEN, and only straight from
// this box — nginx always adds X-Forwarded-For, so a proxied request is refused.
// 409 in imap mode tells the router to leave the mail for poll().
function tokenOk(got) {
  const want = process.env.MAIL_INGEST_TOKEN || '';
  got = String(got || '');
  return want.length >= 16 && got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

router.post('/ingest', express.raw({ type: () => true, limit: '40mb' }), async (req, res) => {
  if (req.get('x-forwarded-for') || !tokenOk(req.get('x-ingest-token'))) return res.status(403).json({ error: 'forbidden' });
  if (!mailIngest.receivesFromRouter()) return res.status(409).json({ error: 'MAIL_INGEST_SOURCE is not mailrouter' });
  const key = String(req.get('x-gm-msgid') || '').trim();
  if (!/^\d+$/.test(key) || !Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'bad request' });
  let labels = [];
  try {
    labels = JSON.parse(req.get('x-gm-labels') || '[]');
  } catch {}
  const date = Date.parse(req.get('x-internal-date') || '');
  try {
    res.json(await mailIngest.ingestRaw(req.body, {
      key,
      labels: new Set(Array.isArray(labels) ? labels.map(String) : []),
      receivedAt: isNaN(date) ? null : new Date(date).toISOString(),
    }));
  } catch (err) {
    console.error('[mail-ingest] /ingest failed:', err && err.message);
    res.status(500).json({ error: 'ingest failed' });
  }
});

module.exports = router;
