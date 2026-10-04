// Shared note spaces: a share is an isolated space of notes+links, separate
// from any owner's personal graph, with its own membership. See CLAUDE.md's
// planning notes for the full reasoning — the short version: membership is
// an explicit, static fact (notes.share_id), never derived by walking the
// link graph from a root note, because that boundary would be unstable
// (private notes already link into most subtrees in a small graph, and any
// later link edit would silently grow what a viewer can reach).
const crypto = require('crypto');
const db = require('./db');
const history = require('./history');
const mailer = require('./mailer');
const {
  subtreeIds,
  firstCreatedRoot,
  rootedDescendants,
  probableRoot,
  hierarchyParentsMap,
} = require('./hierarchy');
const { resolveNoteAccess, scopeOf } = require('./note-access');
const { searchScoped } = require('./notes');
const encryption = require('./encryption');
const { HttpError } = require('./http-error');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const nowIso = () => new Date().toISOString();
const INVITE_TTL_MS = 15 * 60 * 1000;

// resolveNoteAccess/scopeOf live in server/note-access.js (no dependencies of
// their own) so server/history.js can use them with no circular require back
// through this file's own require('./history') below. Re-exported here so
// every other module's per-note ownership check (server/notes.js, links.js,
// routes/history.js, routes/nav.js, reminders.js) can keep saying
// "require('./shares')" for the single source of truth, matching the plan.

function requireMember(shareId, userId) {
  const m = db
    .prepare('SELECT role FROM share_members WHERE share_id = ? AND user_id = ?')
    .get(shareId, userId);
  if (!m) throw new HttpError(404, 'not found');
  return m.role;
}

function requireOwnerOf(shareId, userId) {
  if (requireMember(shareId, userId) !== 'owner') throw new HttpError(404, 'not found');
}

// The reviewable candidate set for "share this note": every note that is a
// genuine *descendant* of it in the caller's personal graph, rooted at their
// marked (or inferred) graph root — see server/hierarchy.js's
// rootedDescendants for the full reasoning. This is the one place that
// decides what a new share starts with, so its correctness is what makes
// "share a note" safe at all; the human still reviews/edits this list
// before anything moves (createShare below just trusts whatever list it's
// given).
//
// Falls back to the narrower explicit-created_from_note_id-only lineage
// (the original, more conservative rule) when there's no usable graph root,
// or the root can't reach `rootNoteId` at all (a disconnected component) —
// same safe default as before rootedDescendants existed.
function candidateLineage(db, userId, rootNoteId) {
  const { role, note } = resolveNoteAccess(db, userId, rootNoteId);
  if (role !== 'owner' || note.share_id != null) throw new HttpError(404, 'not found');

  const userRow = db.prepare('SELECT root_note_id FROM users WHERE id = ?').get(userId);
  let graphRootId = userRow && userRow.root_note_id;
  if (graphRootId == null) {
    // Same inference as server/notes.js's getRootNote — the first note you
    // ever created, not the "largest subtree" (which drifts as the graph
    // grows; see hierarchy.js's firstCreatedRoot doc comment).
    const inferred = firstCreatedRoot({ userId });
    graphRootId = inferred ? inferred.id : null;
  }

  let ids = null;
  if (graphRootId != null) {
    const rooted = rootedDescendants(userId, graphRootId, rootNoteId);
    if (rooted) ids = rooted.ids;
  }

  if (!ids) {
    const rows = db
      .prepare(
        `SELECT id, created_from_note_id FROM notes
         WHERE user_id = ? AND share_id IS NULL AND status != 'deleted'`
      )
      .all(userId);
    const childrenOf = new Map();
    for (const n of rows) {
      if (n.created_from_note_id == null) continue;
      if (!childrenOf.has(n.created_from_note_id)) childrenOf.set(n.created_from_note_id, []);
      childrenOf.get(n.created_from_note_id).push(n.id);
    }
    ids = [rootNoteId, ...subtreeIds(childrenOf, rootNoteId)];
  }

  const placeholders = ids.map(() => '?').join(',');
  const byId = new Map(
    db
      .prepare(`SELECT id, title, status FROM notes WHERE id IN (${placeholders})`)
      .all(...ids)
      .map((n) => [n.id, n])
  );
  return {
    notes: ids.map((id) => byId.get(id)).filter(Boolean).map((n) => ({ id: n.id, title: n.title, status: n.status })),
  };
}

// Moves `noteIds` (all currently personal notes the caller owns) into a new
// share in one transaction. A move, not a copy: ids, history, nav_events and
// reminders rows are all untouched, only notes.share_id changes.
function createShare(db, userId, { title, noteIds }) {
  const t = String(title || '').trim();
  if (!t) throw new HttpError(400, 'title is required');
  const ids = [...new Set((Array.isArray(noteIds) ? noteIds : []).map(Number))];
  if (ids.length === 0) throw new HttpError(400, 'noteIds must be a non-empty array');

  for (const id of ids) {
    const { role, note } = resolveNoteAccess(db, userId, id);
    if (role !== 'owner' || note.share_id != null) throw new HttpError(404, 'not found');
  }

  const shareId = db.transaction(() => {
    const info = db
      .prepare('INSERT INTO shares (title, created_by, created_at) VALUES (?, ?, ?)')
      .run(t, userId, nowIso());
    const id = info.lastInsertRowid;
    db.prepare(
      'INSERT INTO share_members (share_id, user_id, role, added_at) VALUES (?, ?, ?, ?)'
    ).run(id, userId, 'owner', nowIso());
    moveNotesIntoShare(db, userId, id, ids);
    return id;
  })();

  history.record(userId, 'create', { noteId: null }, `Shared "${t}"`);
  return getShare(db, userId, shareId);
}

// `noteId` may be a single id (the common case: the ➕ menu's "Add to an
// existing space") or an array (moving several notes in one batch). The
// batch form matters whenever the notes being added are themselves linked
// to each other: moveNotesIntoShare's straddling check only looks at the
// ids passed in *this* call, so adding A and B one at a time would
// misdetect the A↔B link as straddling on the first call (B isn't share-
// scoped *yet*) and convert it to a personal_ref that then has to be
// undone — moving them together avoids that entirely.
function addNoteToShare(db, userId, shareId, noteId) {
  requireMember(shareId, userId);
  const ids = [...new Set((Array.isArray(noteId) ? noteId : [noteId]).map(Number))];
  if (!ids.length) throw new HttpError(400, 'noteId is required');
  for (const id of ids) {
    const { role, note } = resolveNoteAccess(db, userId, id);
    if (role !== 'owner' || note.share_id != null) throw new HttpError(404, 'not found');
  }
  db.transaction(() => moveNotesIntoShare(db, userId, shareId, ids))();
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM notes WHERE id IN (${placeholders})`).all(...ids);
}

// Shared by createShare/addNoteToShare. Caller already validated every id in
// `ids` resolves to a personal note `userId` owns. Sweeps `links`: a link
// with both endpoints in `ids` is left alone (now legitimately share-scoped);
// a link with exactly one endpoint in `ids` straddles the new boundary and is
// never allowed to survive as a `links` row (see server/links.js's same-scope
// rule) — it's converted to a personal_refs row instead of silently dropped,
// since its existence was real, reviewed intent to keep that note reachable.
function moveNotesIntoShare(db, userId, shareId, ids) {
  const idSet = new Set(ids);
  const placeholders = ids.map(() => '?').join(',');

  const straddling = db
    .prepare(
      `SELECT note_a, note_b FROM links
       WHERE (note_a IN (${placeholders}) AND note_b NOT IN (${placeholders}))
          OR (note_b IN (${placeholders}) AND note_a NOT IN (${placeholders}))`
    )
    .all(...ids, ...ids, ...ids, ...ids);

  db.prepare(`UPDATE notes SET share_id = ? WHERE id IN (${placeholders})`).run(shareId, ...ids);

  const dropLink = db.prepare('DELETE FROM links WHERE note_a = ? AND note_b = ?');
  const addRefStmt = db.prepare(
    `INSERT OR IGNORE INTO personal_refs (user_id, personal_note_id, share_id, shared_note_id, created_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  for (const { note_a, note_b } of straddling) {
    dropLink.run(note_a, note_b);
    const personalNoteId = idSet.has(note_a) ? note_b : note_a;
    const sharedNoteId = idSet.has(note_a) ? note_a : note_b;
    addRefStmt.run(userId, personalNoteId, shareId, sharedNoteId, nowIso());
  }
}

// Inverse of addNoteToShare for a single note: moves it back to its
// author's personal graph (notes.user_id — never re-owned to the caller).
// Allowed for the space's owner or the note's own author. Mirrors
// moveNotesIntoShare/dissolveShare's link handling across the boundary that
// now opens up: an in-space link touching the note straddles scopes and
// becomes a personal_ref from the author's side (if they're still a member
// — otherwise just dropped); existing refs *into* this note become a real
// link when the ref's owner is the author, and are dropped otherwise (a
// different member must not keep a pointer into someone's private note).
function removeNoteFromShare(db, userId, shareId, noteId) {
  const role = requireMember(shareId, userId);
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId);
  if (!note || note.status === 'deleted' || note.share_id !== shareId) throw new HttpError(404, 'not found');
  if (role !== 'owner' && note.user_id !== userId) throw new HttpError(403, 'only the space owner or the note\'s author can remove it');

  const authorStillMember = Boolean(
    db.prepare('SELECT 1 FROM share_members WHERE share_id = ? AND user_id = ?').get(shareId, note.user_id)
  );

  db.transaction(() => {
    const straddling = db
      .prepare('SELECT note_a, note_b FROM links WHERE note_a = ? OR note_b = ?')
      .all(noteId, noteId);
    const refsIn = db
      .prepare(
        `SELECT pr.id, pr.user_id, pr.personal_note_id FROM personal_refs pr
         JOIN notes pn ON pn.id = pr.personal_note_id
         WHERE pr.shared_note_id = ? AND pn.user_id = pr.user_id`
      )
      .all(noteId);

    db.prepare('UPDATE notes SET share_id = NULL WHERE id = ?').run(noteId);

    const dropLink = db.prepare('DELETE FROM links WHERE note_a = ? AND note_b = ?');
    const addRefStmt = db.prepare(
      `INSERT OR IGNORE INTO personal_refs (user_id, personal_note_id, share_id, shared_note_id, created_at)
       VALUES (?, ?, ?, ?, ?)`
    );
    for (const { note_a, note_b } of straddling) {
      dropLink.run(note_a, note_b);
      if (authorStillMember) addRefStmt.run(note.user_id, noteId, shareId, note_a === noteId ? note_b : note_a, nowIso());
    }

    const insertLink = db.prepare(
      'INSERT OR IGNORE INTO links (note_a, note_b, created_at, user_id, kind) VALUES (?, ?, ?, ?, NULL)'
    );
    for (const r of refsIn) {
      if (r.user_id !== note.user_id) continue; // swept by the DELETE below
      insertLink.run(Math.min(r.personal_note_id, noteId), Math.max(r.personal_note_id, noteId), nowIso(), r.user_id);
    }
    db.prepare('DELETE FROM personal_refs WHERE shared_note_id = ?').run(noteId);
  })();

  history.record(userId, 'create', { noteId: null }, `Removed "${note.title}" from a shared space`);
  return { ok: true, mine: note.user_id === userId };
}

function listMyShares(db, userId) {
  return db
    .prepare(
      `SELECT s.id, s.title, s.created_at, sm.role,
              (SELECT COUNT(*) FROM share_members WHERE share_id = s.id) AS member_count
       FROM shares s JOIN share_members sm ON sm.share_id = s.id
       WHERE sm.user_id = ?
       ORDER BY s.created_at DESC`
    )
    .all(userId)
    .map((r) => ({
      id: r.id,
      title: r.title,
      role: r.role,
      memberCount: r.member_count,
      createdAt: r.created_at,
    }));
}

function getShare(db, userId, shareId) {
  const role = requireMember(shareId, userId);
  const share = db.prepare('SELECT id, title, created_at FROM shares WHERE id = ?').get(shareId);
  const members = db
    .prepare(
      `SELECT u.id, u.email, sm.role, sm.added_at
       FROM share_members sm JOIN users u ON u.id = sm.user_id
       WHERE sm.share_id = ? ORDER BY sm.added_at`
    )
    .all(shareId);
  const hasViewerLink = Boolean(
    db.prepare('SELECT 1 FROM share_viewer_tokens WHERE share_id = ?').get(shareId)
  );
  return { id: share.id, title: share.title, createdAt: share.created_at, role, members, hasViewerLink };
}

// Mirrors notesCore.list, scoped to a share instead of a user.
function listShareNotes(db, userId, shareId) {
  requireMember(shareId, userId);
  return db
    .prepare(
      `SELECT id, title, created_at, updated_at, pinned, type, status, lat, lon, geo
       FROM notes WHERE share_id = ? AND status != 'deleted'
       ORDER BY updated_at DESC`
    )
    .all(shareId);
}

// Mirrors links.js's list(), scoped to a share instead of a user — the
// client's graph view has no other way to get a space's edges: GET
// /api/links is hard-scoped to the caller's own personal (share_id IS NULL)
// graph (see that file's doc comment), so without this a space's notes show
// up as isolated dots with no adjacency to traverse. Same "join both
// endpoints, don't trust provenance" shape as that function; both ends are
// guaranteed same-share by links.js's create() (a link can never cross
// scopes), so one shared_id match on either endpoint is enough.
function listShareLinks(db, userId, shareId) {
  requireMember(shareId, userId);
  return db
    .prepare(
      `SELECT l.note_a AS a, l.note_b AS b, l.created_at
       FROM links l
       JOIN notes na ON na.id = l.note_a
       JOIN notes nb ON nb.id = l.note_b
       WHERE na.share_id = ? AND nb.share_id = ?
       ORDER BY l.created_at`
    )
    .all(shareId, shareId);
}

// Mirrors notes.js's hierarchyParents, scoped to a share instead of a
// user — public/app.js's refreshThemeContext used to skip fetching this
// entirely while `currentSpace` was set (GET /api/notes/hierarchy-parents is
// hard personal-only), which left a space's neighbor cards unable to show a
// guessed ⤵/⤴ relation and always falling back to the plain auto ⚙ gear even
// where an ordinary parent/child could be inferred, same as a personal note.
// hierarchy.js's buildHierarchy was already scope-generic ({ userId } or
// { shareId }) — this was just the missing route.
function hierarchyParents(db, userId, shareId) {
  requireMember(shareId, userId);
  return hierarchyParentsMap({ shareId });
}

// Full-text search scoped to one share — the topbar search's only path to a
// space's own content: public/app.js's search box is otherwise always local
// now (cache.localSearch), but a space's notes are never mirrored into
// IndexedDB (v1 is online-only for shares, same as getShareNotes/
// getShareLinks above), so there's no local corpus to search there at all.
// Delegates to notes.js's scope-aware searchScoped.
function searchShare(db, userId, shareId, opts) {
  requireMember(shareId, userId);
  // The *viewing* user's own encryption prefs — see searchScoped's doc
  // comment on why a share doesn't reason about per-contributor encryption.
  const encrypted = encryption.getPrefs(db, userId).enabled;
  return searchScoped(db, { shareId }, opts, encrypted);
}

// The landing note for entering a share — the spacesbar chip, the Account
// panel's "Open" button, an invite-accept redirect with no ?center=. Same
// "probable root" picking logic as a personal graph's own landing note and
// the anonymous viewer's pickCenter (server/routes/shares.js) — the note
// anchoring the largest subtree, NOT "whatever was edited most recently"
// (that's what the client used to fall back to, and it's surprising: which
// note you land on then has nothing to do with the space you meant to open
// — see hierarchy.js's probableRoot doc comment).
function shareRootNote(db, userId, shareId) {
  requireMember(shareId, userId);
  const root = probableRoot({ shareId });
  return { note: root ? { id: root.id, title: root.title } : null };
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function originFor(req) {
  if (process.env.PUBLIC_ORIGIN) return process.env.PUBLIC_ORIGIN.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

// Owner-only: plain editors can read/write notes but not manage membership —
// the simplest ACL that still gives "two roles" (see the plan). Mints an
// invite the same way routes/auth.js mints a login link.
async function inviteEditor(db, req, shareId, email) {
  requireOwnerOf(shareId, req.userId);
  const addr = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(addr)) throw new HttpError(400, 'a valid email is required');

  const share = db.prepare('SELECT title FROM shares WHERE id = ?').get(shareId);
  const token = crypto.randomBytes(32).toString('base64url');
  const nowMs = Date.now();
  db.prepare(
    `INSERT INTO share_invites (token_hash, share_id, email, role, invited_by, created_at, expires_at)
     VALUES (?, ?, ?, 'editor', ?, ?, ?)`
  ).run(
    sha256(token),
    shareId,
    addr,
    req.userId,
    new Date(nowMs).toISOString(),
    new Date(nowMs + INVITE_TTL_MS).toISOString()
  );

  const link = `${originFor(req)}/api/shares/invites/accept?token=${token}`;
  const subject = `You've been invited to "${share.title}"`;
  const text = `You've been invited to collaborate on the shared note space "${share.title}".\n\nAccept: ${link}\n\nThis link expires in 15 minutes.`;
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f5f7;padding:24px;color:#1c1e21">
<div style="max-width:520px;margin:auto;background:#fff;border:1px solid #e2e4e9;border-radius:12px;padding:28px;text-align:center">
<h2 style="margin:0 0 12px">You've been invited</h2>
<p style="font-size:15px;line-height:1.5;margin:0 0 20px">Someone invited you to collaborate on the shared note space <strong>${share.title}</strong>.</p>
<p style="margin:0 0 20px"><a href="${link}" style="display:inline-block;background:#4f6df5;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600">Accept invite</a></p>
<p style="font-size:12px;color:#767a82;margin:0">This link expires in 15 minutes.</p>
</div></body></html>`;

  try {
    if (mailer.configured()) {
      await mailer.sendMail({ to: addr, subject, text, html });
    } else {
      console.log(`[shares] mailer not configured — invite link for ${addr}: ${link}`);
    }
  } catch (err) {
    console.error('[shares] failed to send invite:', err && err.message);
  }
  return { ok: true };
}

// Same shape as routes/auth.js's /callback: hash lookup, not-consumed/
// not-expired check, atomic consume (changes === 1 guards the replay race),
// find-or-create the user by email. Deliberately does NOT call
// seedSampleGraph() — that's the organic-signup welcome tour, not what
// someone joining an existing collaborator's space should land in.
function acceptInvite(db, token) {
  const row = db
    .prepare('SELECT token_hash, share_id, email, role, expires_at, consumed_at FROM share_invites WHERE token_hash = ?')
    .get(sha256(String(token || '')));
  if (!row || row.consumed_at || Date.parse(row.expires_at) < Date.now()) {
    throw new HttpError(400, 'invite link is invalid or has expired');
  }
  const consumed = db
    .prepare('UPDATE share_invites SET consumed_at = ? WHERE token_hash = ? AND consumed_at IS NULL')
    .run(nowIso(), row.token_hash);
  if (consumed.changes !== 1) throw new HttpError(400, 'invite link is invalid or has expired');

  let user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(row.email);
  if (!user) {
    const info = db.prepare('INSERT INTO users (email) VALUES (?)').run(row.email);
    user = { id: info.lastInsertRowid, email: row.email };
  }
  db.prepare(
    'INSERT OR IGNORE INTO share_members (share_id, user_id, role, added_at) VALUES (?, ?, ?, ?)'
  ).run(row.share_id, user.id, row.role, nowIso());

  return { userId: user.id, shareId: row.share_id };
}

// Always mints a *fresh* token, invalidating any previous one outright —
// for an explicit "regenerate/invalidate the old link" action, never for
// "get me the link" (see getOrCreateViewerToken below, which the client's
// "Copy viewer link" button actually calls — a plain re-click of that must
// never silently break every copy already handed out).
function mintOrRotateViewerToken(db, userId, shareId) {
  requireOwnerOf(shareId, userId);
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare(
    `INSERT INTO share_viewer_tokens (share_id, token, created_at) VALUES (?, ?, ?)
     ON CONFLICT(share_id) DO UPDATE SET token = excluded.token, created_at = excluded.created_at`
  ).run(shareId, token, nowIso());
  return { token };
}

// Idempotent: returns the existing token if one's already live, mints one
// only if none exists yet. This is what "Copy viewer link" should call —
// clicking it again to grab another copy must never rotate (and so
// invalidate) a link that's already been handed out.
function getOrCreateViewerToken(db, userId, shareId) {
  requireOwnerOf(shareId, userId);
  const existing = db.prepare('SELECT token FROM share_viewer_tokens WHERE share_id = ?').get(shareId);
  if (existing) return { token: existing.token };
  return mintOrRotateViewerToken(db, userId, shareId);
}

function revokeViewerToken(db, userId, shareId) {
  requireOwnerOf(shareId, userId);
  db.prepare('DELETE FROM share_viewer_tokens WHERE share_id = ?').run(shareId);
}

function removeMember(db, userId, shareId, targetUserId) {
  requireOwnerOf(shareId, userId);
  if (Number(targetUserId) === Number(userId)) {
    throw new HttpError(409, 'the owner cannot remove themself');
  }
  const info = db
    .prepare('DELETE FROM share_members WHERE share_id = ? AND user_id = ?')
    .run(shareId, targetUserId);
  if (info.changes === 0) throw new HttpError(404, 'not found');
}

// Owner-only: the inverse of createShare/addNoteToShare — dissolves the
// share, moving every note in it back to personal (share_id = NULL) under
// whichever user_id already owns it (creator provenance — see
// notes.share_id's doc comment in db.js), and dropping every other member's
// access. A link entirely *within* the share, between two notes both moving
// back to the same owner, needs no help — it reappears in that owner's
// personal graph automatically once share_id clears (server/links.js's
// list() only requires both endpoints share_id IS NULL and the same
// user_id) — but the cross-scope personal_refs rows that pointed into it
// (moveNotesIntoShare's straddling conversion, or addRef) split two ways:
//   - a ref this owner made from their own personal note to a note that
//     reverts to that SAME owner is no longer cross-scope at all once both
//     sides are personal — undo exactly what moveNotesIntoShare did on the
//     way in: convert it to a real `links` row and drop the personal_refs
//     row (redundant with the new link).
//   - a ref some OTHER member made (their own personal note pointing at a
//     note that ends up owned by someone else entirely) can never become a
//     link — two different users never share a `links` row — so it's left
//     exactly as it was.
// That second case is why the `shares` row itself is deliberately never
// deleted here, only emptied of members/tokens/invites: a still-alive
// personal_refs row keeps a valid FK target, and requireMember/getShare
// 404 for everyone from here on (no members left) — the exact "no access
// to this space" outcome listRefsForNote surfaces for it below, rather
// than the ref silently vanishing (or the delete failing outright once
// foreign_keys=ON had something left to enforce against it).
function dissolveShare(db, userId, shareId) {
  requireOwnerOf(shareId, userId);
  const share = db.prepare('SELECT title FROM shares WHERE id = ?').get(shareId);

  db.transaction(() => {
    const refs = db
      .prepare(
        `SELECT pr.id, pr.personal_note_id, pr.shared_note_id,
                pn.user_id AS ref_owner, sn.user_id AS note_owner
         FROM personal_refs pr
         JOIN notes pn ON pn.id = pr.personal_note_id
         JOIN notes sn ON sn.id = pr.shared_note_id
         WHERE pr.share_id = ?`
      )
      .all(shareId);

    db.prepare('UPDATE notes SET share_id = NULL WHERE share_id = ?').run(shareId);

    const insertLink = db.prepare(
      'INSERT OR IGNORE INTO links (note_a, note_b, created_at, user_id, kind) VALUES (?, ?, ?, ?, NULL)'
    );
    const dropRef = db.prepare('DELETE FROM personal_refs WHERE id = ?');
    for (const r of refs) {
      if (r.ref_owner !== r.note_owner) continue; // a different member's ref — leave it in place
      const a = Math.min(r.personal_note_id, r.shared_note_id);
      const b = Math.max(r.personal_note_id, r.shared_note_id);
      insertLink.run(a, b, nowIso(), r.ref_owner);
      dropRef.run(r.id);
    }

    db.prepare('DELETE FROM share_members WHERE share_id = ?').run(shareId);
    db.prepare('DELETE FROM share_viewer_tokens WHERE share_id = ?').run(shareId);
    db.prepare('DELETE FROM share_invites WHERE share_id = ?').run(shareId);
  })();

  history.record(
    userId,
    'create',
    { noteId: null },
    `Removed shared space "${share ? share.title : ''}" — notes moved back to private`
  );
}

// -> { shareId } or null. The route itself must still check that shareId
// matches the :id in the URL — a token minted for share A must 404 on share
// B's path even if guessed (see routes/shares.js).
function resolveViewerToken(token) {
  if (typeof token !== 'string' || token.length < 16) return null;
  const row = db.prepare('SELECT share_id FROM share_viewer_tokens WHERE token = ?').get(token);
  return row ? { shareId: row.share_id } : null;
}

// Every read filtered on user_id = the requesting user, always — this IS the
// leak guard for cross-scope refs, not a permission check layered on top.
//
// `farId` is whichever side ISN'T noteId — the far end of the reference as
// seen from the note we're actually looking at (mirrors the pre-noAccess
// version's CASE WHEN personal_note_id = ? THEN shared_note_id ELSE
// personal_note_id END). It only goes stale when it's the shared_note_id
// side: hard-deleted (dropped entirely, same as before — nothing left to
// reference), or this member lost access to the space it now lives in
// (dissolveShare deliberately keeps a different member's ref alive rather
// than cascading it away when the space it pointed into gets dissolved,
// same as an individual removeMember). That's surfaced as a `noAccess`
// placeholder — never the real title of a note this user can no longer
// actually open. The personal_note_id side never goes stale (addRef only
// ever created it as this same user's own note, and a personal note never
// changes owner), so resolveNoteAccess on it always succeeds.
// Shared by listRefsForNote and listRefsForScope below — given a raw
// personal_refs row and which side of it is "far" (the end that isn't the
// note/scope being looked from), resolves that far end down to either its
// title/status or a `noAccess` placeholder, or null to drop the row
// entirely (the far note is gone — see listRefsForNote's doc comment on
// hard-delete vs. lost-access).
function formatRefRow(db, userId, r, farId) {
  const raw = db.prepare('SELECT status FROM notes WHERE id = ?').get(farId);
  if (!raw || raw.status === 'deleted') return null;
  const access = resolveNoteAccess(db, userId, farId);
  const base = {
    id: r.id,
    share_id: r.share_id,
    personal_note_id: r.personal_note_id,
    shared_note_id: r.shared_note_id,
  };
  if (!access.role) {
    return { ...base, title: null, status: null, noAccess: true, shareTitle: r.share_title };
  }
  return { ...base, title: access.note.title, status: access.note.status };
}

function listRefsForNote(db, userId, noteId) {
  const rows = db
    .prepare(
      `SELECT pr.id, pr.share_id, pr.personal_note_id, pr.shared_note_id, s.title AS share_title
       FROM personal_refs pr
       JOIN shares s ON s.id = pr.share_id
       WHERE pr.user_id = ? AND (pr.personal_note_id = ? OR pr.shared_note_id = ?)`
    )
    .all(userId, noteId, noteId);

  const out = [];
  for (const r of rows) {
    const farId = r.personal_note_id === noteId ? r.shared_note_id : r.personal_note_id;
    const formatted = formatRefRow(db, userId, r, farId);
    if (formatted) out.push(formatted);
  }
  return out;
}

// Bulk sibling of listRefsForNote — every one of this user's personal_refs
// rows relevant to a whole scope in one query, for the client's graph view
// (public/app.js's computeGraphData), which needs every ref touching any of
// the up to ~150 notes the level slider can show; calling listRefsForNote
// once per note would be an N+1 clone of loadNeighbors' single-note fetch.
// shareId null = the personal scope: every ref this user has made, from
// whichever of their own personal notes out to whichever space
// (personal_note_id is always this user's own note — addRef enforces that
// on the way in, same invariant listRefsForNote leans on — so it's always
// the "local" side here and shared_note_id the "far" one). shareId set =
// one space's worth, filtered to that share_id — the "local" side is then
// shared_note_id and "far" is personal_note_id; a ref is always
// single-owner (see personal_refs' comment in db.js), so another member's
// own refs never show through this call, same as listRefsForNote never
// leaking one.
function listRefsForScope(db, userId, shareId) {
  if (shareId != null) requireMember(shareId, userId);
  const rows =
    shareId != null
      ? db
          .prepare(
            `SELECT pr.id, pr.share_id, pr.personal_note_id, pr.shared_note_id, s.title AS share_title
             FROM personal_refs pr
             JOIN shares s ON s.id = pr.share_id
             WHERE pr.user_id = ? AND pr.share_id = ?`
          )
          .all(userId, shareId)
      : db
          .prepare(
            `SELECT pr.id, pr.share_id, pr.personal_note_id, pr.shared_note_id, s.title AS share_title
             FROM personal_refs pr
             JOIN shares s ON s.id = pr.share_id
             WHERE pr.user_id = ?`
          )
          .all(userId);

  const out = [];
  for (const r of rows) {
    const farId = shareId != null ? r.personal_note_id : r.shared_note_id;
    const formatted = formatRefRow(db, userId, r, farId);
    if (formatted) out.push(formatted);
  }
  return out;
}

function addRef(db, userId, { shareId, personalNoteId, sharedNoteId }) {
  const personal = resolveNoteAccess(db, userId, personalNoteId);
  if (personal.role !== 'owner' || personal.note.share_id != null) throw new HttpError(404, 'not found');
  const shared = resolveNoteAccess(db, userId, sharedNoteId);
  if (!shared.role || shared.note.share_id !== Number(shareId)) throw new HttpError(404, 'not found');

  db.prepare(
    `INSERT OR IGNORE INTO personal_refs (user_id, personal_note_id, share_id, shared_note_id, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(userId, personalNoteId, shareId, sharedNoteId, nowIso());
  return { ok: true };
}

function removeRef(db, userId, refId) {
  const info = db.prepare('DELETE FROM personal_refs WHERE id = ? AND user_id = ?').run(refId, userId);
  if (info.changes === 0) throw new HttpError(404, 'not found');
}

module.exports = {
  resolveNoteAccess,
  scopeOf,
  candidateLineage,
  createShare,
  addNoteToShare,
  removeNoteFromShare,
  listMyShares,
  getShare,
  listShareNotes,
  listShareLinks,
  hierarchyParents,
  searchShare,
  shareRootNote,
  dissolveShare,
  inviteEditor,
  acceptInvite,
  mintOrRotateViewerToken,
  getOrCreateViewerToken,
  revokeViewerToken,
  removeMember,
  resolveViewerToken,
  listRefsForNote,
  listRefsForScope,
  addRef,
  removeRef,
};
