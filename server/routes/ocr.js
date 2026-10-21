// 🔎 Read text on an image note — see server/ocr.js. The client sends the
// image itself (downscaled, tall images sliced into tiles), not just the id:
// it already has the decoded picture, and Claude wants ≤ ~1.5k px pieces.
const express = require('express');
const multer = require('multer');
const db = require('../db');
const ocr = require('../ocr');
const { resolveNoteAccess } = require('../note-access');
const { HttpError } = require('../http-error');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 8 } });

function wrap(fn) {
  return (req, res) => {
    try {
      res.json(fn(req));
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  };
}

// multipart: noteId, mode, images[] -> { job }
router.post(
  '/',
  upload.array('images', 8),
  wrap((req) => {
    const { role, note } = resolveNoteAccess(db, req.userId, Number(req.body.noteId));
    if (!role || note.type !== 'image') throw new HttpError(404, 'not found');
    return ocr.start(req.userId, note.id, String(req.body.mode || 'auto'), req.files);
  })
);

// -> { status: 'running' } | { status: 'done', documents } | { status: 'error', error }
router.get('/:job', wrap((req) => ocr.status(req.userId, req.params.job)));

module.exports = router;
