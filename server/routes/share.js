const fs = require('fs');
const path = require('path');
const express = require('express');
const db = require('../db');
const notes = require('../notes');
const { diskUpload, writeUpload, zipAttachments } = require('../upload-config');
const { classify, uploadedFileType } = require('../attachment-kind');
const { describeFile, looksLikeFilename } = require('../file-title');

const router = express.Router();

const upload = diskUpload();
const MAX_FILES = 20;

// Run multer but never let a rejected/oversized file abort the share — the text
// part is still worth keeping. A disallowed MIME is just left out of req.files.
function acceptShare(req, res, next) {
  upload.array('media', MAX_FILES)(req, res, (err) => {
    req.shareUploadError = err || null;
    next();
  });
}

// One line per share in server.log — shapes only (field names, MIME types,
// sizes), never the text — so a share that arrives without its file can be
// told apart from one the upload step dropped.
function logShare(req, files) {
  const body = req.body || {};
  const fields = Object.keys(body)
    .map((k) => `${k}:${String(body[k]).length}`)
    .join(',');
  const err = req.shareUploadError;
  console.log(
    `[share] user=${req.userId || '-'} type=${String(req.headers['content-type'] || '').split(';')[0]} ` +
      `len=${req.headers['content-length'] || '?'} fields=${fields || '-'} ` +
      `files=${files.map((f) => `${f.mimetype}:${f.size}`).join(',') || '0'}` +
      (err ? ` error=${err.code || err.message}` : '')
  );
}

function firstLine(s, max = 120) {
  const line = String(s || '')
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean);
  return line ? line.slice(0, max) : '';
}

const unlinkAll = (files) => files.forEach((f) => fs.unlink(f.path, () => {}));

// The shared files -> one note, same shape rules as mail-in: one file = an
// image/audio/contact/file note, two or more = one .zip file note.
function createFromFiles(userId, files, { title, content }) {
  if (files.length === 1) {
    const f = files[0];
    if (/\.vcf$/i.test(f.originalname || '') || /vcard|directory/i.test(f.mimetype || '')) {
      let c = null;
      try {
        c = classify({ filename: f.originalname, contentType: f.mimetype, content: fs.readFileSync(f.path) });
      } catch {}
      if (c && c.type === 'contact') {
        unlinkAll(files);
        return notes.createAttachmentNote(db, userId, null, {
          type: 'contact',
          title,
          content,
          contactName: c.contact.name,
          contactPhone: c.contact.phone,
          contactEmail: c.contact.email,
        });
      }
    }
    // type 'file' is upgraded to image/audio by createAttachmentNote itself.
    return notes.createAttachmentNote(db, userId, null, { type: 'file', title, content }, f);
  }
  const zipTitle = title || `${describeFile(uploadedFileType(files[0]), files[0])} + ${files.length - 1} more`;
  const buf = zipAttachments(
    files.map((f) => ({ filename: f.originalname || path.basename(f.filename), content: fs.readFileSync(f.path) }))
  );
  unlinkAll(files);
  const z = writeUpload(buf, '.zip');
  return notes.createAttachmentNote(
    db,
    userId,
    null,
    { type: 'file', title: zipTitle, content },
    { ...z, mimetype: 'application/zip', originalname: 'shared-files.zip' }
  );
}

// POST /share — target of the manifest `share_target`. multipart/form-data with
// title / text / url text parts and any number of `media` files (any type the
// upload allowlist takes). `?json=1` (the service worker replaying a share
// made offline — see sw.js) answers {id} instead of redirecting.
router.post('/', acceptShare, (req, res) => {
  const body = req.body || {};
  const files = Array.isArray(req.files) ? req.files : [];
  const json = req.query.json === '1';
  let sharedText = String(body.text || '').trim();
  const sharedUrl = String(body.url || '').trim();
  logShare(req, files);
  // Android puts the file's name in the share's subject (sometimes its text
  // too); leave the title to createAttachmentNote's describeFile (the
  // document's own title, else a cleaned-up name).
  const isFileName = (s) => files.some((f) => f.originalname && f.originalname === s);
  if (isFileName(sharedText)) sharedText = '';
  const content = [sharedText, sharedUrl].filter(Boolean).join('\n\n');
  let textTitle = firstLine(body.title) || firstLine(sharedText);
  if (isFileName(textTitle)) textTitle = '';

  // Logged out: the installed PWA's session cookie is 60-day sliding, so this is
  // rare. Stash the text (JS-readable, 10 min) for app.js to turn into a note
  // once a session exists; files shared in this path are dropped.
  if (!req.userId) {
    unlinkAll(files);
    if (json) return res.status(401).json({ error: 'no active session' });
    const title = textTitle || (sharedUrl ? 'Shared link' : 'Shared note');
    const stash = JSON.stringify({ title, content }).slice(0, 6000);
    res.cookie('nico_share', stash, {
      httpOnly: false,
      secure: process.env.COOKIE_INSECURE !== '1',
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60 * 1000,
    });
    return res.redirect(303, '/');
  }

  // Nothing arrived but (at most) a file's name: the file itself was lost on
  // the way (the phone didn't hand it to the web app, or the upload failed).
  // An empty note helps nobody — send the user to pick the file instead.
  if (!files.length && !sharedUrl && (!sharedText || looksLikeFilename(sharedText)) &&
      (!textTitle || looksLikeFilename(textTitle))) {
    if (json) return res.status(422).json({ error: 'the shared file did not arrive' });
    const q = new URLSearchParams({ shared: 'nofile' });
    if (textTitle) q.set('name', textTitle);
    return res.redirect(303, `/?${q}`);
  }

  let note;
  try {
    note = files.length
      ? createFromFiles(req.userId, files, { title: textTitle, content })
      : notes.create(db, req.userId, {
          title: textTitle || (sharedUrl ? 'Shared link' : 'Shared note'),
          content,
        });
  } catch (err) {
    unlinkAll(files);
    if (json) return res.status(err.status || 500).json({ error: err.message });
    return res.redirect(303, '/');
  }
  if (json) return res.json({ id: note.id });
  res.redirect(303, `/#${note.id}`);
});

module.exports = router;
