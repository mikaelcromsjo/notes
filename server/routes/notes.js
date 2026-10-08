const express = require('express');
const db = require('../db');
const { diskUpload } = require('../upload-config');
const notesCore = require('../notes');
const { HttpError } = require('../http-error');

const router = express.Router();
const upload = diskUpload();

// Thin Express adapter over the pure functions in server/notes.js — see
// docs/plan/08-offline-privacy.md §3.1. `fn` gets (req, res) and returns the
// JSON body to send; `status` is only the *success* status code (errors are
// carried by the thrown HttpError). Returning undefined with status 204
// sends an empty body, matching the original handlers' res.status(204).end().
function wrap(fn, status = 200) {
  return (req, res) => {
    try {
      const result = fn(req, res);
      if (status === 204) return res.status(204).end();
      res.status(status).json(result);
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  };
}

// List all non-deleted notes for the current user — used for search/picker/pin bar.
router.get('/', wrap((req) => notesCore.list(db, req.userId)));

router.post('/', wrap((req) => notesCore.create(db, req.userId, req.body), 201));

// Full-text search over the caller's notes. Must be declared before "/:id".
router.get('/search', wrap((req) => notesCore.search(db, req.userId, req.query)));

// GTD context tags already in use, for the editor's tag-insert modal. Must be
// declared before "/:id" for the same reason as "/search" above.
router.get('/tags', wrap((req) => notesCore.listTags(db, req.userId)));

// The most globally significant root note. Must be declared before "/:id"
// for the same reason as "/search" above.
router.get('/probable-root', wrap((req) => notesCore.probableRootNote(db, req.userId)));

// The "graph root" anchoring server/shares.js's candidateLineage (explicit
// users.root_note_id, or the same inferred probable-root as above). Must be
// declared before "/:id" for the same reason as "/search" above.
router.get('/root', wrap((req) => notesCore.getRootNote(db, req.userId)));
router.put('/root', wrap((req) => notesCore.setRootNote(db, req.userId, req.body && req.body.noteId != null ? Number(req.body.noteId) : null)));

// Background catch-up sweep for location encryption (docs/plan/
// 08-offline-privacy.md's location note in db.js) — body: { items: [{id, geo}] }.
// Not gated on account state the way /api/encryption/migrate is; the client
// only calls this when it actually has pending geo to encrypt.
router.post('/encrypt-geo', wrap((req) => notesCore.encryptGeo(db, req.userId, req.body && req.body.items)));

// The fields the list endpoint above omits to stay light — content (arbitrary
// length) and attachment_path. Must be declared before "/:id" for the same
// reason as "/search" above.
router.get('/full', wrap((req) => notesCore.listFull(db, req.userId)));

// The inbox row: every note outside its scope's home tree (orphans, separate
// trees, cross-linked-only notes), one item per tree top — see notes.js's
// inbox. Must be declared before "/:id" like "/full".
router.get('/inbox', wrap((req) => notesCore.inbox(db, req.userId)));

// The inferred hierarchy as a flat { childId: parentId } map (roots omitted).
// Must be declared before "/:id" like "/full".
router.get('/hierarchy-parents', wrap((req) => notesCore.hierarchyParents(db, req.userId)));

// Every cacheable attachment, newest-updated first, with a byte size. Must be
// declared before "/:id" for the same reason as "/search" above.
router.get('/attachments-manifest', wrap((req) => notesCore.attachmentsManifest(db, req.userId)));

router.get('/:id', wrap((req) => notesCore.get(db, req.userId, req.params.id)));

router.put('/:id', wrap((req) => notesCore.update(db, req.userId, req.params.id, req.body)));

router.delete(
  '/:id',
  wrap((req) => notesCore.remove(db, req.userId, req.params.id), 204)
);

router.put('/:id/pin', wrap((req) => notesCore.pin(db, req.userId, req.params.id)));

router.delete('/:id/pin', wrap((req) => notesCore.unpin(db, req.userId, req.params.id)));

// Per-note theme: { theme: <style>|null, children: bool }. Cosmetic, so it does
// not touch updated_at (no conflict base shift, no "latest" bar reshuffle) and
// is not in the undo history.
router.put('/:id/theme', wrap((req) => notesCore.setTheme(db, req.userId, req.params.id, req.body)));

router.put('/:id/status', wrap((req) => notesCore.setStatus(db, req.userId, req.params.id, req.body.status, req.body.cascade)));

// Linked, non-deleted notes ranked by "probable next step", plus the single
// "probable parent" — recorded provenance, falling back to the oldest link.
// Shape: { parent: <neighbor|null>, neighbors: [<neighbor with .p and .score>] }.
router.get('/:id/neighbors', wrap((req) => notesCore.neighbors(db, req.userId, Number(req.params.id))));

// Every 'todo'-flagged note anywhere under this one in the inferred hierarchy.
router.get('/:id/subtree-todos', wrap((req) => notesCore.subtreeTodos(db, req.userId, Number(req.params.id))));

// Every note id anywhere under this one, any depth — excludes the note itself.
router.get('/:id/subtree-ids', wrap((req) => notesCore.subtreeIdsFor(db, req.userId, Number(req.params.id))));

// Create a new note of a given attachment type, linked to :id (the note it was
// captured from). One note per attachment — image/audio/file upload a file;
// contact and app store their data directly on the note.
router.post(
  '/:id/attachments',
  upload.single('file'),
  wrap((req) => {
    const parentId = Number(req.params.id);
    // Inline image: no attachment note, no link — see server/notes.js.
    if (req.body.inline === '1' || req.body.inline === 'true') {
      return notesCore.createInlineImage(db, req.userId, parentId, req.file);
    }
    return notesCore.createAttachmentNote(db, req.userId, parentId, req.body, req.file);
  }, 201)
);

// Same as above but with no parent/link at all — a standalone attachment note.
router.post(
  '/attachments',
  upload.single('file'),
  wrap((req) => notesCore.createAttachmentNote(db, req.userId, null, req.body, req.file), 201)
);

// Replace *this* note's own attachment — distinct from POST /:id/attachments
// above, which creates a brand-new linked attachment note.
router.put(
  '/:id/attachment',
  upload.single('file'),
  wrap((req) => notesCore.replaceAttachment(db, req.userId, req.params.id, req.body, req.file))
);

// Remove this note's attachment, reverting it to a plain text note.
router.delete('/:id/attachment', wrap((req) => notesCore.removeAttachment(db, req.userId, req.params.id)));

module.exports = router;
