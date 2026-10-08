const db = require('./db');

// A `scope` is { userId } (that user's personal graph, share_id IS NULL) or
// { shareId } (a shared space's own graph) — see server/shares.js. Building
// the WHERE clause here, once, is what lets buildHierarchy/computeNeighbors
// (server/neighbors.js) serve personal and shared notes with the same logic.
function scopeClause(scope, alias = '') {
  const col = (name) => (alias ? `${alias}.${name}` : name);
  if (scope.shareId != null) {
    return { sql: `${col('share_id')} = ?`, params: [scope.shareId] };
  }
  return { sql: `${col('user_id')} = ? AND ${col('share_id')} IS NULL`, params: [scope.userId] };
}

// Builds the inferred parent/child hierarchy over one scope's link graph in
// one pass — the same "probable parent" rules as GET /notes/:id/neighbors
// (see that route for the full rationale): explicit created_from_note_id
// first, else the oldest surviving link, skipping any
// candidate that's provably a child (its own created_from_note_id points
// back here, or it was born at the exact instant of the link) rather than a
// parent. Kept as a separate module (rather than refactoring /neighbors to
// share it) so features built on top of it — subtree-scoped views, stalled-
// project detection — can't regress that already-tuned single-note route.
function buildHierarchy(scope) {
  const notesClause = scopeClause(scope);
  const notes = db
    .prepare(
      `SELECT id, title, status, created_from_note_id, created_at, updated_at FROM notes
       WHERE ${notesClause.sql} AND status != 'deleted'`
    )
    .all(...notesClause.params);
  const byId = new Map(notes.map((n) => [n.id, n]));

  // Links: never trust links.user_id as scope (it's creator provenance, and
  // a note's scope can change after a link was made) — derive it from each
  // endpoint's own current note row instead. Fetches any link where *either*
  // endpoint currently matches this scope; the neighborsOf loop below only
  // keeps a link when *both* endpoints resolved into `byId`, which is the
  // real scope boundary.
  const naClause = scopeClause(scope, 'na');
  const nbClause = scopeClause(scope, 'nb');
  const links = db
    .prepare(
      `SELECT l.note_a, l.note_b, l.created_at, l.kind
       FROM links l
       JOIN notes na ON na.id = l.note_a
       JOIN notes nb ON nb.id = l.note_b
       WHERE (${naClause.sql}) OR (${nbClause.sql})`
    )
    .all(...naClause.params, ...nbClause.params);

  // Degree (hub-ness, used to break parent cycles below) counts every link in this
  // scope, same as /neighbors' degree query — independent of whether the far
  // end is still around. Candidate rows below are filtered to living
  // neighbors separately.
  const degree = new Map();
  const neighborsOf = new Map(notes.map((n) => [n.id, []]));
  for (const { note_a, note_b, created_at, kind } of links) {
    degree.set(note_a, (degree.get(note_a) || 0) + 1);
    degree.set(note_b, (degree.get(note_b) || 0) + 1);
    if (neighborsOf.has(note_a) && neighborsOf.has(note_b)) {
      neighborsOf.get(note_a).push({ id: note_b, linked_at: created_at, kind });
      neighborsOf.get(note_b).push({ id: note_a, linked_at: created_at, kind });
    }
  }

  const parentOf = new Map();
  for (const n of notes) {
    const rows = neighborsOf
      .get(n.id)
      .slice()
      .sort((a, b) => (a.linked_at < b.linked_at ? 1 : a.linked_at > b.linked_at ? -1 : 0)) // newest first
      .map(({ id, linked_at, kind }) => {
        const other = byId.get(id);
        return other ? { ...other, linked_at, link_kind: kind } : null;
      })
      .filter(Boolean);

    let parent = null;
    if (n.created_from_note_id) {
      const fb = rows.find((r) => r.id === n.created_from_note_id);
      if (fb) parent = fb.id;
    }
    if (parent == null) {
      const candidates = rows.filter(
        (r) => r.created_from_note_id !== n.id && r.created_at !== r.linked_at && r.link_kind !== 'cross'
      );
      // A link the user marked 'cross' is never a guessed parent edge (same
      // rule as buildRootedTree). rows are newest-link-first, so the last candidate is the oldest link.
      const oldest = candidates[candidates.length - 1];
      parent = oldest ? oldest.id : null;
    }
    parentOf.set(n.id, parent);
  }

  // Never assign a parent to the note explicitly marked as this personal
  // graph's root (users.root_note_id — see server/notes.js's getRootNote) —
  // a root has no parent by definition, so the structural fallback above
  // (which only ever looks at each note's own links) must not get to guess
  // one just because the root happens to have an eligible "oldest" non-child
  // link. Every consumer of parentOf/childrenOf shares this correction from
  // here rather than each reimplementing it — hierarchyParentsMap (theme-
  // ancestor cascade, linkRelationOf's guessed relation icon), the search
  // snippet's parent-title fallback (server/notes.js's searchScoped), and
  // subtreeTodos/subtreeIdsFor's downward walks in particular, which would
  // otherwise treat the root's entire real subtree as living *under*
  // whatever note the structural fallback mistakenly picked for it. Shares
  // have no root concept (server/notes.js's neighbors() comment), so scoped
  // to { userId } only.
  if (scope.userId != null) {
    const rootRow = db.prepare('SELECT root_note_id FROM users WHERE id = ?').get(scope.userId);
    if (rootRow && rootRow.root_note_id != null && byId.has(rootRow.root_note_id)) {
      parentOf.set(rootRow.root_note_id, null);
    }
  }

  // Per-note, the structural fallback only ever looks at that one note's own
  // links, so two notes can end up pointing at each other: a note's oldest
  // *eligible* link can, after excluding same-instant children, land on
  // exactly the link some other note also uses (correctly) to point back at
  // it — most visibly the graph's own root, which nothing marks as
  // deliberately parentless. Detect any such cycle and break it by cutting
  // the parent pointer OUT of whichever member has the highest degree — the
  // hub is the one that shouldn't be pointing "up" to something less
  // connected, so it becomes that cycle's root instead.
  const state = new Map(); // unset = unvisited, 1 = on the current walk, 2 = resolved
  for (const n of notes) {
    if (state.get(n.id) === 2) continue;
    const path = [];
    let cur = n.id;
    while (cur != null && !state.has(cur)) {
      state.set(cur, 1);
      path.push(cur);
      cur = parentOf.get(cur);
    }
    if (cur != null && state.get(cur) === 1) {
      const cycle = path.slice(path.indexOf(cur));
      let root = cycle[0];
      for (const id of cycle) if ((degree.get(id) || 0) > (degree.get(root) || 0)) root = id;
      parentOf.set(root, null);
    }
    for (const id of path) state.set(id, 2);
  }

  const childrenOf = new Map();
  for (const [id, p] of parentOf) {
    if (p == null) continue;
    if (!childrenOf.has(p)) childrenOf.set(p, []);
    childrenOf.get(p).push(id);
  }

  return { byId, parentOf, childrenOf, degree };
}

// buildHierarchy's parentOf Map, flattened to a plain { childId: parentId }
// object (roots omitted) — the wire shape GET /api/notes/hierarchy-parents
// (and its share-scoped counterpart, server/shares.js's hierarchyParents)
// return. Scope-generic like buildHierarchy itself, so the same function
// serves a personal graph ({ userId }) or a shared space ({ shareId }).
function hierarchyParentsMap(scope) {
  const { parentOf } = buildHierarchy(scope);
  const parents = {};
  for (const [id, p] of parentOf) if (p != null) parents[id] = p;
  return { parents };
}

// The most globally significant root: among every parentless note (one per
// disconnected component — an isolated note is trivially its own), the one
// anchoring the largest subtree. Degree alone isn't a good proxy here — a
// note can rack up a high degree from a pile of shallow one-off children
// (e.g. a shopping-list hub with a dozen single-item notes) without actually
// organizing much of the graph, while the "real" root anchors far more of it
// several levels deep. Used as the landing note when there's no better
// context to resume (e.g. the last open tab was just closed, or a shared
// space is being entered for the first time).
function probableRoot(scope) {
  const { byId, parentOf, childrenOf } = buildHierarchy(scope);
  let best = null;
  let bestSize = -1;
  for (const [id, p] of parentOf) {
    if (p != null) continue;
    const size = subtreeIds(childrenOf, id).length;
    if (size > bestSize) {
      best = id;
      bestSize = size;
    }
  }
  return best == null ? null : byId.get(best);
}

// The default *graph root* (server/notes.js's getRootNote, used to anchor
// candidateLineage/buildRootedTree/guessLinkKind) when the user hasn't
// explicitly marked one — deliberately not probableRoot above: "largest
// subtree" is itself a moving target that reshuffles as the graph grows
// (that's exactly what caused a long-settled note to suddenly gain a
// spurious guessed parent — the previous "biggest" note lost the title to
// a new one), whereas the first note you ever made is stable by
// construction and, in practice, is almost always the one you already
// think of as "the" root. probableRoot stays as-is for its own purpose
// (picking a good landing spot when there's no other context) — that's a
// different question ("where's richest right now") than "what's the
// stable anchor for hierarchy purposes", so it isn't affected by this.
function firstCreatedRoot(scope) {
  const clause = scopeClause(scope);
  const row = db
    .prepare(
      `SELECT id, title FROM notes WHERE ${clause.sql} AND status != 'deleted' ORDER BY created_at ASC LIMIT 1`
    )
    .get(...clause.params);
  return row || null;
}

// Every descendant id of rootId, any depth (BFS, cycle-safe — the inferred
// hierarchy is a forest in practice, but nothing here assumes it can't loop).
function subtreeIds(childrenOf, rootId) {
  const out = [];
  const seen = new Set([rootId]);
  const queue = [...(childrenOf.get(rootId) || [])];
  for (const id of queue) seen.add(id);
  while (queue.length) {
    const id = queue.shift();
    out.push(id);
    for (const c of childrenOf.get(id) || []) {
      if (!seen.has(c)) {
        seen.add(c);
        queue.push(c);
      }
    }
  }
  return out;
}

// A shortest-*cost* tree over the WHOLE personal graph, anchored at a
// single, stable root (server/notes.js's getRootNote — either explicitly
// marked by the user, or the same "most globally significant note" as
// probableRoot above). Shared by rootedDescendants (below) and
// server/links.js's guessLinkKind.
//
// This is a 0-1 BFS, not a plain one: traversing from a note to another
// note it's the recorded created_from_note_id parent of costs 0; any other
// edge costs 1. That's what makes an explicit parent-child relationship
// (however it was recorded — created_from_note_id from creation/rehome, or
// the user directly correcting it, PUT /api/links/relation) win outright
// over a shorter path elsewhere, not just win a tie: a whole chain of
// explicit parent-child edges costs 0 total, beating even a single plain
// hop. A links.kind = 'cross' edge is excluded as a tree edge entirely —
// the one thing an explicit signal can't win by cost, because it's not
// eligible to be a tree edge at all (see db.js's links.kind comment).
//
// Returns null if `rootId` isn't a real note in this user's personal graph.
// Otherwise { dist, parentOf, childrenOf } over every note reachable from
// it (excluding 'cross'-kind edges) — `dist` is total cost, not hop count.
function buildRootedTree(userId, rootId) {
  const notesClause = scopeClause({ userId });
  const notes = db
    .prepare(`SELECT id, created_from_note_id FROM notes WHERE ${notesClause.sql} AND status != 'deleted'`)
    .all(...notesClause.params);
  const idSet = new Set(notes.map((n) => n.id));
  if (!idSet.has(rootId)) return null;
  const explicitParentOf = new Map(notes.map((n) => [n.id, n.created_from_note_id]));

  const naClause = scopeClause({ userId }, 'na');
  const nbClause = scopeClause({ userId }, 'nb');
  const links = db
    .prepare(
      `SELECT l.note_a, l.note_b, l.created_at, l.kind
       FROM links l
       JOIN notes na ON na.id = l.note_a
       JOIN notes nb ON nb.id = l.note_b
       WHERE (${naClause.sql}) OR (${nbClause.sql})`
    )
    .all(...naClause.params, ...nbClause.params);

  const adj = new Map();
  for (const id of idSet) adj.set(id, []);
  for (const { note_a, note_b, created_at, kind } of links) {
    if (kind === 'cross') continue; // never a tree edge — see doc comment above
    if (adj.has(note_a) && adj.has(note_b)) {
      adj.get(note_a).push({ id: note_b, created_at });
      adj.get(note_b).push({ id: note_a, created_at });
    }
  }

  // Standard 0-1 BFS: a 0-cost edge pushes to the front of the deque (so it's
  // explored before anything already queued at the same or worse cost), a
  // 1-cost edge pushes to the back. Each dequeued entry carries the cost it
  // was pushed with, so a stale entry (superseded by a cheaper path found
  // since) is skipped rather than reprocessed.
  const dist = new Map([[rootId, 0]]);
  const parentOf = new Map([[rootId, null]]);
  const deque = [[rootId, 0]];
  while (deque.length) {
    const [cur, atCost] = deque.shift();
    if (atCost > dist.get(cur)) continue;
    const nbrs = adj
      .get(cur)
      .slice()
      .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
    for (const { id: nb } of nbrs) {
      const free = explicitParentOf.get(nb) === cur;
      const cand = atCost + (free ? 0 : 1);
      if (dist.has(nb) && dist.get(nb) <= cand) continue;
      dist.set(nb, cand);
      parentOf.set(nb, cur);
      if (free) deque.unshift([nb, cand]);
      else deque.push([nb, cand]);
    }
  }

  const childrenOf = new Map();
  for (const [id, p] of parentOf) {
    if (p == null) continue;
    if (!childrenOf.has(p)) childrenOf.set(p, []);
    childrenOf.get(p).push(id);
  }
  return { dist, parentOf, childrenOf, idSet };
}

// Descendants of `targetId` in the tree built above. Returns null if
// `rootId` isn't usable, or `targetId` isn't reachable from it at all (a
// disconnected component, or only reachable via a 'cross'-kind edge) —
// server/shares.js falls back to the narrower explicit-provenance-only
// lineage in that case.
function rootedDescendants(userId, rootId, targetId) {
  const tree = buildRootedTree(userId, rootId);
  if (!tree) return null;
  const { dist, childrenOf, parentOf } = tree;
  if (!dist.has(targetId)) return null;

  return { ids: [targetId, ...subtreeIds(childrenOf, targetId)], parentOf };
}

// The guess applied to a newly created link between two *already-existing*
// personal notes (server/links.js's create, the non-rehome case): would
// removing this edge leave one side unable to reach the graph root at all
// (or only via a 'cross'-kind path)? If so, that side was effectively an
// orphan/leaf being attached here for the first time — it's the child, and
// the caller should record that via created_from_note_id (the same
// directional signal buildRootedTree's 0-cost edges look for — no separate
// "kind='child'" value needed). If both sides already have their own
// independent route to the root, this is a genuine cross-link joining two
// established areas — kind='cross'. If there's no usable root, or
// *neither* side can reach it, there's no signal either way — null, left
// unmarked for the user to decide.
//
// `a`/`b` may include the root itself — deliberately not special-cased away:
// the root is trivially "reachable from the root" (buildRootedTree seeds
// dist.set(rootId, 0)), so aReachable/bReachable below is always true on
// root's side, which means root can only ever come out the *other* end of
// the childId/parentId split below, never the child — so there is no case
// where this could wrongly hand the root a created_from_note_id. And
// linking straight to the root is the single clearest, most common case
// for a real parent-child claim (an established note gaining a new child),
// so it's the one case this must NOT skip: leaving it unmarked was exactly
// what let the structural-parent fallback in buildHierarchy above guess a
// direction backwards later (a link to the root looking, in hindsight,
// like any other unmarked link).
//
// Returns { childId, parentId } | { cross: true } | null.
function guessLinkKind(userId, a, b) {
  const userRow = db.prepare('SELECT root_note_id FROM users WHERE id = ?').get(userId);
  let rootId = userRow && userRow.root_note_id;
  if (rootId == null) {
    const inferred = firstCreatedRoot({ userId });
    rootId = inferred ? inferred.id : null;
  }
  if (rootId == null) return null;

  const tree = buildRootedTree(userId, rootId);
  if (!tree) return null;
  const aReachable = tree.dist.has(a);
  const bReachable = tree.dist.has(b);
  if (aReachable === bReachable) return aReachable ? { cross: true } : null;
  return aReachable ? { childId: b, parentId: a } : { childId: a, parentId: b };
}

module.exports = {
  buildHierarchy,
  hierarchyParentsMap,
  subtreeIds,
  probableRoot,
  firstCreatedRoot,
  buildRootedTree,
  rootedDescendants,
  guessLinkKind,
  scopeClause,
};
