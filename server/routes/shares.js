const express = require('express');
const db = require('../db');
const sharesCore = require('../shares');
const sessions = require('../sessions');
const { probableRoot } = require('../hierarchy');
const { computeNeighbors } = require('../neighbors');
const { HttpError } = require('../http-error');

const router = express.Router();

// Mounted above the blanket `/api` 401 gate in server/index.js (grouped with
// widgetRouter/digestPageRouter), because most of this router's routes are
// session-authed while a few (the viewer-token feed, invite-accept) are not
// — same reasoning as accountRouter's comment there. Every route below
// checks its own auth.
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

function requireSession(req, res, next) {
  if (!req.userId) return res.status(401).json({ error: 'no active session' });
  next();
}

// --- Literal-path routes first — see server/routes/notes.js's own comment
// on why these must be declared before the dynamic "/:id" routes below.

router.get(
  '/candidates',
  requireSession,
  wrap((req) => sharesCore.candidateLineage(db, req.userId, Number(req.query.rootNoteId)))
);

router.get(
  '/refs/:noteId',
  requireSession,
  wrap((req) => sharesCore.listRefsForNote(db, req.userId, Number(req.params.noteId)))
);

// Bulk sibling of the above — every ref touching the current scope in one
// call, for graph view. ?shareId= scopes to one space; omitted = personal.
// See sharesCore.listRefsForScope's doc comment.
router.get(
  '/refs',
  requireSession,
  wrap((req) => sharesCore.listRefsForScope(db, req.userId, req.query.shareId != null ? Number(req.query.shareId) : null))
);

router.delete(
  '/refs/:refId',
  requireSession,
  wrap((req) => sharesCore.removeRef(db, req.userId, Number(req.params.refId)), 204)
);

// Invite acceptance: a magic link, so (like /api/auth/callback) no session is
// required going in — it creates one. Failure redirects rather than erroring,
// since this is always opened directly in a browser, never fetched.
router.get('/invites/accept', (req, res) => {
  try {
    const { userId, shareId } = sharesCore.acceptInvite(db, req.query.token);
    const sessionToken = sessions.create(userId, req);
    res.cookie(sessions.SESSION_COOKIE, sessionToken, sessions.COOKIE_OPTS);
    res.redirect(`/?space=${shareId}`);
  } catch (err) {
    if (err instanceof HttpError) return res.redirect('/?space=invalid');
    throw err;
  }
});

// --- Viewer-token routes: no session, no account at all — token possession
// is the only credential (see server/shares.js's resolveViewerToken). No
// write route exists under this path at all; that absence is the read-only
// enforcement.

// The default landing note for a share's viewer feed when no ?center= is
// given, or it didn't resolve — the share's own "probable root", same
// picking logic as a personal graph's landing note.
function pickCenter(shareId, centerParam) {
  if (centerParam) {
    const row = db
      .prepare(`SELECT * FROM notes WHERE id = ? AND share_id = ? AND status != 'deleted'`)
      .get(centerParam, shareId);
    if (row) return row;
  }
  const root = probableRoot({ shareId });
  return root ? db.prepare('SELECT * FROM notes WHERE id = ?').get(root.id) : null;
}

function viewerSnapshot(shareId, note) {
  if (!note) return { center: null, parent: null, neighbors: [] };
  // rankUserId is deliberately omitted (null) — an anonymous viewer has no
  // nav_events of their own, so this always falls back to the same cold-start
  // link-recency order computeNeighbors already produces when fwdTotal === 0.
  const result = computeNeighbors({ shareId }, note.id, null) || { parent: null, neighbors: [] };
  return {
    center: {
      id: note.id,
      title: note.title,
      content: note.content,
      type: note.type,
      status: note.status,
      attachment_path: note.attachment_path,
      updated_at: note.updated_at,
    },
    parent: result.parent,
    neighbors: result.neighbors,
  };
}

function requireViewerToken(req, res, shareId) {
  const resolved = sharesCore.resolveViewerToken(req.query.token);
  // A token minted for share A must 404 on share B's URL even if guessed —
  // resolved.shareId must match the :id in the path, not just be *some*
  // valid token.
  if (!resolved || resolved.shareId !== shareId) {
    res.status(404).json({ error: 'not found' });
    return false;
  }
  return true;
}

router.get('/:id/viewer', (req, res) => {
  const shareId = Number(req.params.id);
  if (!requireViewerToken(req, res, shareId)) return;
  const note = pickCenter(shareId, req.query.center ? Number(req.query.center) : null);
  res.json(viewerSnapshot(shareId, note));
});

// id+title only, every note in the share — just enough for the fullscreen
// preview's [[wikilinks]] to resolve a title to a note id and navigate,
// same as the main app's allNotesCache does for its own markdown rendering
// (public/app.js's wikiResolve). Never content/type/attachment_path: those
// only matter once a note is actually the centered one, which the ordinary
// viewer routes above already cover in full.
router.get('/:id/viewer/index', (req, res) => {
  const shareId = Number(req.params.id);
  if (!requireViewerToken(req, res, shareId)) return;
  const rows = db
    .prepare(`SELECT id, title FROM notes WHERE share_id = ? AND status != 'deleted'`)
    .all(shareId);
  res.json(rows);
});

router.get('/:id/viewer/notes/:noteId', (req, res) => {
  const shareId = Number(req.params.id);
  if (!requireViewerToken(req, res, shareId)) return;
  const note = db
    .prepare(`SELECT * FROM notes WHERE id = ? AND share_id = ? AND status != 'deleted'`)
    .get(Number(req.params.noteId), shareId);
  if (!note) return res.status(404).json({ error: 'not found' });
  res.json(viewerSnapshot(shareId, note));
});

// --- Session-authed routes ---------------------------------------------

router.post('/', requireSession, wrap((req) => sharesCore.createShare(db, req.userId, req.body), 201));

router.get('/', requireSession, wrap((req) => sharesCore.listMyShares(db, req.userId)));

router.post(
  '/:shareId/refs',
  requireSession,
  wrap((req) =>
    sharesCore.addRef(db, req.userId, {
      shareId: Number(req.params.shareId),
      personalNoteId: Number(req.body.personalNoteId),
      sharedNoteId: Number(req.body.sharedNoteId),
    })
  , 201)
);

router.get('/:id', requireSession, wrap((req) => sharesCore.getShare(db, req.userId, Number(req.params.id))));

// Owner-only "remove this space": moves every note back to personal and
// drops every other member's access. See sharesCore.dissolveShare's doc
// comment.
router.delete('/:id', requireSession, wrap((req) => sharesCore.dissolveShare(db, req.userId, Number(req.params.id)), 204));

router.get('/:id/root', requireSession, wrap((req) => sharesCore.shareRootNote(db, req.userId, Number(req.params.id))));

router.get('/:id/notes', requireSession, wrap((req) => sharesCore.listShareNotes(db, req.userId, Number(req.params.id))));

// Mirrors GET /api/links, scoped to a share — see listShareLinks's doc
// comment. Only real client so far is graph view's buildGraphAdjacency.
router.get('/:id/links', requireSession, wrap((req) => sharesCore.listShareLinks(db, req.userId, Number(req.params.id))));

// Mirrors GET /api/notes/hierarchy-parents, scoped to a share — see
// sharesCore.hierarchyParents's doc comment.
router.get(
  '/:id/hierarchy-parents',
  requireSession,
  wrap((req) => sharesCore.hierarchyParents(db, req.userId, Number(req.params.id)))
);

// Mirrors GET /api/notes/search, scoped to a share — see searchShare's doc
// comment. Unlike that route (superseded by the client's local search),
// this is a live call on every debounced keystroke while browsing a space.
router.get(
  '/:id/search',
  requireSession,
  wrap((req) => sharesCore.searchShare(db, req.userId, Number(req.params.id), req.query))
);

// body.noteId may be a single id or an array (see server/shares.js's
// addNoteToShare doc comment on why the batch form matters).
router.post(
  '/:id/notes',
  requireSession,
  wrap((req) => sharesCore.addNoteToShare(db, req.userId, Number(req.params.id), req.body.noteId), 201)
);

// Moves one note back to its author's personal graph — see
// sharesCore.removeNoteFromShare's doc comment.
router.delete(
  '/:id/notes/:noteId',
  requireSession,
  wrap((req) => sharesCore.removeNoteFromShare(db, req.userId, Number(req.params.id), Number(req.params.noteId)))
);

// inviteEditor sends mail (async); handled directly rather than through
// `wrap` so a rejected promise can never escape uncaught (see routes/auth.js's
// request-link handler for the same self-contained async try/catch shape).
router.post('/:id/invite', requireSession, async (req, res) => {
  try {
    const result = await sharesCore.inviteEditor(db, req, Number(req.params.id), req.body && req.body.email);
    res.json(result);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error('[shares] invite failed:', err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.delete(
  '/:id/members/:userId',
  requireSession,
  wrap((req) => sharesCore.removeMember(db, req.userId, Number(req.params.id), Number(req.params.userId)), 204)
);

// Idempotent — "get me the link", never rotates an existing one. See
// sharesCore.getOrCreateViewerToken's doc comment.
router.get(
  '/:id/viewer-token',
  requireSession,
  wrap((req) => sharesCore.getOrCreateViewerToken(db, req.userId, Number(req.params.id)))
);

// Explicit "regenerate" — always mints a fresh token, invalidating the
// previous one outright. Not currently wired to any client button (there's
// no UI need for it yet beyond revoke-and-recreate), kept for parity with
// revoke below and because sharesCore already had it before this route did.
router.post(
  '/:id/viewer-token',
  requireSession,
  wrap((req) => sharesCore.mintOrRotateViewerToken(db, req.userId, Number(req.params.id)))
);

router.delete(
  '/:id/viewer-token',
  requireSession,
  wrap((req) => sharesCore.revokeViewerToken(db, req.userId, Number(req.params.id)), 204)
);

module.exports = router;
