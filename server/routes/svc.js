// /_svc/: the machine API (scripts, Claude Code sessions, the mailrouter acting for a
// client). Bearer tokens from data/svc-tokens.json via the shared guard in
// ../svc-auth.js (copied from /srv/svc, see /srv/svc/README.md); localhost only,
// never through nginx, never with a cookie. Calls are logged to data/svc.log.
//
// A token acts as one user (`user`) and is narrowed further by
//   spaces:   share ids it may touch (absent = every space that user is in)
//   personal: true = also that user's personal notes (default false)
// Scopes: read, write (create/edit/append), attach (file notes), ingest (mail-in,
// for service:mailrouter; the mail itself decides the account). No delete.
// Everything goes through server/notes.js, so links, history and undo work
// exactly as for an edit in the app.
const path = require('path');
const fs = require('fs');
const express = require('express');
const db = require('../db');
const notesCore = require('../notes');
const { resolveNoteAccess } = require('../note-access');
const { HttpError } = require('../http-error');
const { writeUpload, IMAGE_EXT, AUDIO_EXT, FILE_EXT, uploadsDir } = require('../upload-config');
const { svcAuth, requireScope } = require('../svc-auth');
const { ingestFromRequest } = require('./mail-in');

const dataDir = path.dirname(db.name);
const router = express.Router();
router.use(svcAuth({ store: path.join(dataDir, 'svc-tokens.json'), log: path.join(dataDir, 'svc.log') }));

function wrap(fn, status = 200) {
  return (req, res) => {
    try {
      res.status(status).json(fn(req, res));
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  };
}

function who(req) {
  const t = req.svc.token;
  const userId = Number(t.user);
  if (!Number.isInteger(userId) || userId <= 0) throw new HttpError(500, 'token has no user');
  const spaces = t.spaces == null ? null : [].concat(t.spaces).map(Number);
  return { userId, spaces, personal: t.personal === true };
}

function spaceAllowed(w, shareId) {
  if (shareId == null) return w.personal;
  return w.spaces == null || w.spaces.includes(Number(shareId));
}

// The note, if this token may see it; 404 otherwise (same answer as "missing").
function noteFor(req, id) {
  const w = who(req);
  const { role, note } = resolveNoteAccess(db, w.userId, Number(id));
  if (!role || !spaceAllowed(w, note.share_id)) throw new HttpError(404, 'not found');
  return { w, note };
}

const isEncrypted = (s) => typeof s === 'string' && s.startsWith('ncv1:');

function shape(note, withContent) {
  const out = {
    id: note.id,
    title: note.title,
    type: note.type,
    status: note.status,
    space: note.share_id,
    parent: note.created_from_note_id,
    attachment: note.type === 'text' ? null : note.attachment_path,
    created_at: note.created_at,
    updated_at: note.updated_at,
  };
  if (withContent) {
    out.encrypted = isEncrypted(note.content);
    out.content = out.encrypted ? null : note.content;
  }
  return out;
}

router.get(
  '/whoami',
  wrap((req) => ({ principal: req.svc.principal, scopes: [...req.svc.scopes], ...(req.svc.token.user ? who(req) : {}) }))
);

router.get(
  '/spaces',
  requireScope('read'),
  wrap((req) => {
    const w = who(req);
    return db
      .prepare(
        `SELECT s.id, s.title, m.role FROM share_members m JOIN shares s ON s.id = m.share_id
         WHERE m.user_id = ? ORDER BY s.id`
      )
      .all(w.userId)
      .filter((s) => spaceAllowed(w, s.id));
  })
);

// ?space=<id>|personal  ?q=<text in title or content>  ?limit=  (default 500)
router.get(
  '/notes',
  requireScope('read'),
  wrap((req) => {
    const w = who(req);
    const where = ["status != 'deleted'"];
    const args = [];
    const memberOf = db.prepare('SELECT share_id FROM share_members WHERE user_id = ?').all(w.userId).map((r) => r.share_id);
    const spaces = memberOf.filter((id) => spaceAllowed(w, id));
    const scope = [];
    if (req.query.space === 'personal' || req.query.space == null) {
      if (w.personal) {
        scope.push('(share_id IS NULL AND user_id = ?)');
        args.push(w.userId);
      }
    }
    if (req.query.space !== 'personal') {
      const want = req.query.space == null ? spaces : spaces.filter((id) => id === Number(req.query.space));
      if (want.length) scope.push(`share_id IN (${want.map(() => '?').join(',')})`);
      args.push(...want);
    }
    if (!scope.length) return [];
    where.push(`(${scope.join(' OR ')})`);
    if (req.query.q) {
      where.push('(title LIKE ? OR content LIKE ?)');
      args.push(`%${req.query.q}%`, `%${req.query.q}%`);
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 5000);
    return db
      .prepare(`SELECT * FROM notes WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT ${limit}`)
      .all(...args)
      .map((n) => shape(n, false));
  })
);

router.get(
  '/notes/:id',
  requireScope('read'),
  wrap((req) => {
    const { w, note } = noteFor(req, req.params.id);
    const links = db
      .prepare(
        `SELECT n.* FROM links l JOIN notes n ON n.id = CASE WHEN l.note_a = ? THEN l.note_b ELSE l.note_a END
         WHERE (l.note_a = ? OR l.note_b = ?) AND n.status != 'deleted'`
      )
      .all(note.id, note.id, note.id)
      .filter((n) => resolveNoteAccess(db, w.userId, n.id).role && spaceAllowed(w, n.share_id))
      .map((n) => ({ id: n.id, title: n.title, type: n.type, parent: n.created_from_note_id }));
    return { ...shape(note, true), links };
  })
);

// The attachment file of a file/image/audio note.
router.get('/notes/:id/file', requireScope('read'), (req, res) => {
  try {
    const { note } = noteFor(req, req.params.id);
    if (!['image', 'audio', 'file'].includes(note.type) || !note.attachment_path) throw new HttpError(404, 'no file');
    res.sendFile(path.join(uploadsDir, path.basename(note.attachment_path)));
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

// { title, content?, parent?: note id, space?: share id } -> new text note.
// With parent it lands in the parent's space, linked under it.
router.post(
  '/notes',
  requireScope('write'),
  wrap((req) => {
    const w = who(req);
    const { title, content = '', parent, space } = req.body || {};
    let shareId = space == null ? null : Number(space);
    if (parent != null) shareId = noteFor(req, parent).note.share_id;
    if (!spaceAllowed(w, shareId)) throw new HttpError(404, 'space not found');
    if (typeof content !== 'string') throw new HttpError(400, 'content must be a string');
    return shape(notesCore.create(db, w.userId, { title, content, linkTo: parent, shareId }), true);
  }, 201)
);

// { title?, content? } replaces; { append } adds a paragraph at the end.
router.patch(
  '/notes/:id',
  requireScope('write'),
  wrap((req) => {
    const { w, note } = noteFor(req, req.params.id);
    const { title, content, append } = req.body || {};
    if (note.type !== 'text' && (content !== undefined || append !== undefined)) throw new HttpError(400, 'not a text note');
    if (isEncrypted(note.content) && (content !== undefined || append !== undefined)) {
      throw new HttpError(409, 'note is end-to-end encrypted; edit it in the app');
    }
    for (const v of [title, content, append]) if (v !== undefined && typeof v !== 'string') throw new HttpError(400, 'strings only');
    let next = content;
    if (append !== undefined) next = (content !== undefined ? content : note.content).replace(/\s*$/, '') + '\n\n' + append;
    return shape(notesCore.update(db, w.userId, note.id, { title, content: next }), true);
  })
);

// Raw file body (Content-Type = its MIME, X-Filename optional) -> a file/image/audio
// note linked under :id. ?title= sets the note title. Same type allowlist as the app.
router.post(
  '/notes/:id/attachments',
  requireScope('attach'),
  express.raw({ type: () => true, limit: '50mb' }),
  wrap((req) => {
    const { w } = noteFor(req, req.params.id);
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'empty body');
    const mime = String(req.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const ext = IMAGE_EXT[mime] || AUDIO_EXT[mime] || FILE_EXT[mime];
    if (!ext) throw new HttpError(415, `type ${mime || '(none)'} not allowed`);
    const original = path.basename(String(req.get('x-filename') || `file${ext}`));
    const file = { ...writeUpload(req.body, ext), mimetype: mime, originalname: original };
    try {
      const note = notesCore.createAttachmentNote(db, w.userId, Number(req.params.id), { type: 'file', title: req.query.title || original }, file);
      return shape(note, false);
    } catch (err) {
      fs.unlink(file.path, () => {});
      throw err;
    }
  }, 201)
);

// Raw RFC 822 mail from the mailrouter (+notes@), same headers as /api/mail-in/ingest:
// X-Gm-Msgid, X-Gm-Labels, X-Internal-Date. The sender lookup is mail-ingest's own.
router.post('/mail-in', requireScope('ingest'), express.raw({ type: () => true, limit: '40mb' }), ingestFromRequest);

router.use((req, res) => res.status(404).json({ error: 'not found' }));

module.exports = router;
