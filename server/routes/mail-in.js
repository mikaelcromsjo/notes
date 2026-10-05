const express = require('express');
const mailIngest = require('../mail-ingest');

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

module.exports = router;
