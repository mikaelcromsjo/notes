const fs = require('fs');
const express = require('express');
const db = require('../db');
const history = require('../history');
const { diskUpload } = require('../upload-config');

const router = express.Router();

const now = () => new Date().toISOString();
const upload = diskUpload();

// Run multer but never let a rejected/oversized file abort the share — the text
// part is still worth keeping. A disallowed MIME just leaves req.file undefined.
function acceptShare(req, res, next) {
  upload.single('media')(req, res, () => next());
}

function firstLine(s, max = 120) {
  const line = String(s || '')
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean);
  return line ? line.slice(0, max) : '';
}

// POST /share — target of the manifest `share_target`. multipart/form-data with
// title / text / url text parts and an optional image|audio `media` file.
router.post('/', acceptShare, (req, res) => {
  const body = req.body || {};
  const sharedText = String(body.text || '').trim();
  const sharedUrl = String(body.url || '').trim();
  const title =
    firstLine(body.title) ||
    firstLine(sharedText) ||
    (sharedUrl ? 'Shared link' : 'Shared note');
  const content = [sharedText, sharedUrl].filter(Boolean).join('\n\n');

  // Logged out: the installed PWA's session cookie is 60-day sliding, so this is
  // rare. Stash the text (JS-readable, 10 min) for app.js to turn into a note
  // once a session exists; a file shared in this path is dropped.
  if (!req.userId) {
    if (req.file) fs.unlink(req.file.path, () => {});
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

  let type = 'text';
  let attachmentPath = null;
  let noteTitle = title;
  if (req.file) {
    const kind = req.file.mimetype.split('/')[0];
    if (kind === 'image' || kind === 'audio') {
      type = kind;
      attachmentPath = `/uploads/${req.file.filename}`;
      if (!firstLine(body.title) && !sharedText && !sharedUrl) {
        noteTitle = kind === 'image' ? 'Shared photo' : 'Shared audio';
      }
    } else {
      fs.unlink(req.file.path, () => {});
    }
  }

  const ts = now();
  const info = db
    .prepare(
      `INSERT INTO notes (title, content, created_at, updated_at, type, attachment_path, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(noteTitle, content, ts, ts, type, attachmentPath, req.userId);
  const id = info.lastInsertRowid;
  history.record(req.userId, 'create', { noteId: id, title: noteTitle }, `Shared "${noteTitle}"`);
  res.redirect(303, `/#${id}`);
});

module.exports = router;
