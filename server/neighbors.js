const db = require('./db');
const { scopeClause } = require('./hierarchy');

// --- "Probable next step" / "probable parent" scoring ---------------------
// A nav event's weight halves every HALF_LIFE_DAYS so ranking follows recent
// habits. neighbor score blends: transition probability from the centered note,
// the neighbour's global visit weight, and how recently the link was made.
const HALF_LIFE_DAYS = 14;
const SCORE_W = { transition: 0.6, popularity: 0.15, linkRecency: 0.25 };
const NEIGHBOR_LIMIT = 8;
const decaySum = `SUM(pow(0.5, (julianday('now') - julianday(created_at)) / ${HALF_LIFE_DAYS}.0))`;

// Linked, non-deleted notes ranked by "probable next step", plus the single
// "probable parent" — recorded provenance, falling back to the oldest link.
// Deliberately *not* based on nav_events: as you go back and forth between a
// child and its parent, that back-and-forth would itself pile up "inbound
// transition" weight and could point "back" at whichever note you happened
// to arrive from, rather than the note's actual place in the hierarchy.
//
// `scope` is { userId } (a personal graph, share_id IS NULL) or { shareId }
// (a shared space's own graph) — see server/hierarchy.js's scopeClause and
// server/shares.js. It decides which notes/links are visible; it is NOT who
// the ranking is personal to.
//
// `rankUserId` is whose nav_events to rank by — always a real viewing user
// for the session-authed GET /api/notes/:id/neighbors (routes/notes.js) and
// GET /api/widget (routes/widget.js), even when `scope` is a shared space:
// two collaborators looking at the same shared note each get their own
// "probable next step" ordering, exactly as the "personal metadata stays
// per-user" rule requires. It's `null` for the token-authed, account-less
// shared-space viewer (routes/shares.js) — nothing to rank by, so ranking
// falls back to the same cold-start link-recency order used before any
// nav_events exist. Defaults to scope.userId, which makes every pre-existing
// personal call site work unchanged.
//
// Shared by the session-authed GET /api/notes/:id/neighbors (routes/notes.js),
// the token-authed GET /api/widget (routes/widget.js), and the token-authed
// shared-space viewer (routes/shares.js) — one definition of "probable
// parent"/"probable next step" for all three.
//
// Returns null if `id` isn't a note in `scope`. Shape otherwise:
// { parent: <row|null>, neighbors: [<row with .p and .score>], linkCount, links }
// `skipStructuralFallback` (server/notes.js's neighbors(), for the note the
// user has explicitly marked as their graph root — server/notes.js's
// getRootNote/setRootNote): a root has no parent, full stop, so it should
// never get a *guessed* one either — explicit created_from_note_id (if
// somehow set anyway) still wins, only the oldest-surviving-link guess is
// suppressed. Never set for the auto-*inferred* root (no explicit marking):
// that's itself a heuristic, and suppressing its guess too would compound
// one heuristic's mistake with another.
function computeNeighbors(scope, id, rankUserId = scope.userId ?? null, { skipStructuralFallback = false } = {}) {
  const centerClause = scopeClause(scope);
  const center = db
    .prepare(`SELECT id, created_from_note_id FROM notes WHERE id = ? AND ${centerClause.sql}`)
    .get(id, ...centerClause.params);
  if (!center) return null;

  const linkedClause = scopeClause(scope, 'n');
  const linked = db
    .prepare(
      `SELECT n.id, n.title, n.content, n.updated_at, n.type, n.attachment_path, n.status,
              n.created_from_note_id, n.created_at AS note_created_at,
              l.created_at AS linked_at, l.kind AS link_kind
       FROM links l
       JOIN notes n ON n.id = CASE WHEN l.note_a = ? THEN l.note_b ELSE l.note_a END
       WHERE (l.note_a = ? OR l.note_b = ?) AND ${linkedClause.sql} AND n.status != 'deleted'
       ORDER BY l.created_at DESC`
    )
    .all(id, id, id, ...linkedClause.params);

  if (linked.length === 0) return { parent: null, neighbors: [], linkCount: 0, links: [] };

  const links = linked.map((r) => ({
    id: r.id,
    title: r.title,
    type: r.type,
    status: r.status,
    created_from_note_id: r.created_from_note_id,
    link_kind: r.link_kind,
  }));

  const weightMap = (rows) => new Map(rows.map((r) => [r.nid, r.w]));

  const fwd = rankUserId
    ? weightMap(
        db
          .prepare(
            `SELECT to_note_id AS nid, ${decaySum} AS w
             FROM nav_events WHERE user_id = ? AND from_note_id = ?
             GROUP BY to_note_id`
          )
          .all(rankUserId, id)
      )
    : new Map();
  const fwdTotal = [...fwd.values()].reduce((s, w) => s + w, 0);

  const pop = rankUserId
    ? weightMap(
        db
          .prepare(
            `SELECT to_note_id AS nid, ${decaySum} AS w
             FROM nav_events WHERE user_id = ?
             GROUP BY to_note_id`
          )
          .all(rankUserId)
      )
    : new Map();
  const popMax = Math.max(1, ...pop.values());

  const n = linked.length;
  const scored = linked.map((row, i) => {
    const p = fwdTotal > 0 ? (fwd.get(row.id) || 0) / fwdTotal : 0;
    const popularity = (pop.get(row.id) || 0) / popMax;
    const linkRecency = n > 1 ? (n - 1 - i) / (n - 1) : 1; // 1 = most recently linked
    const score =
      fwdTotal > 0
        ? SCORE_W.transition * p +
          SCORE_W.popularity * popularity +
          SCORE_W.linkRecency * linkRecency
        : linkRecency; // cold start: original link-recency order
    return { ...row, p, score };
  });

  // Probable parent: recorded provenance first. A 'done' parent still counts
  // — skipping it made the hierarchy reshape whenever a note was completed
  // (its children silently re-parented elsewhere), which breaks the
  // done-cascade (server/notes.js's setStatus) and is surprising.
  let parent = null;
  if (center.created_from_note_id) {
    parent = scored.find((r) => r.id === center.created_from_note_id) || null;
  }
  // Structural fallback: no recorded provenance. First, drop any candidate
  // that's provably this note's child rather than its parent:
  //  - created_from_note_id says so explicitly, or
  //  - the candidate's own created_at exactly matches the link's created_at,
  //    meaning it was born at the moment this link was made — the same
  //    "spawned via a `[[wikilink]]`" shape as created_from_note_id, just on
  //    notes old enough (or imported) to predate that column being recorded.
  if (!parent && !skipStructuralFallback) {
    const candidates = scored.filter(
      (r) => r.created_from_note_id !== id && r.note_created_at !== r.linked_at && r.link_kind !== 'cross'
    );
    // `linked` (and so `candidates`, which preserves its order) is sorted by
    // link creation DESC, so the last entry is the oldest link, i.e. the
    // note's probable parent in the hierarchy.
    parent = candidates[candidates.length - 1] || null;
  }

  const parentId = parent ? parent.id : null;
  // 'done' neighbours always rank below active ones, so they're the first to be
  // dropped when the grid can only show NEIGHBOR_LIMIT links.
  const neighbors = scored
    .filter((r) => r.id !== parentId)
    .sort((a, b) => {
      const ad = a.status === 'done' ? 1 : 0;
      const bd = b.status === 'done' ? 1 : 0;
      if (ad !== bd) return ad - bd;
      return b.score - a.score;
    })
    .slice(0, parent ? NEIGHBOR_LIMIT - 1 : NEIGHBOR_LIMIT);

  return { parent, neighbors, linkCount: linked.length, links };
}

module.exports = { computeNeighbors, NEIGHBOR_LIMIT };
