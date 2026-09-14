const db = require('./db');

// Builds this user's inferred parent/child hierarchy over the whole link
// graph in one pass — the same "probable parent" rules as GET
// /notes/:id/neighbors (see that route for the full rationale): explicit
// created_from_note_id first, else the oldest surviving link, skipping
// 'done' notes and any candidate that's provably a child (its own
// created_from_note_id points back here, or it was born at the exact
// instant of the link) rather than a parent. Kept as a separate module
// (rather than refactoring /neighbors to share it) so features built on top
// of it — subtree-scoped views, stalled-project detection — can't regress
// that already-tuned single-note route.
function buildHierarchy(uid) {
  const notes = db
    .prepare(
      `SELECT id, title, status, created_from_note_id, created_at FROM notes
       WHERE user_id = ? AND status != 'deleted'`
    )
    .all(uid);
  const byId = new Map(notes.map((n) => [n.id, n]));

  // Degree (hub-ness, for the done-skip tie-break) counts every link the user
  // has ever made, same as /neighbors' degree query — independent of whether
  // the far end is still around. Candidate rows below are filtered to living
  // neighbors separately.
  const links = db.prepare('SELECT note_a, note_b, created_at FROM links WHERE user_id = ?').all(uid);
  const degree = new Map();
  const neighborsOf = new Map(notes.map((n) => [n.id, []]));
  for (const { note_a, note_b, created_at } of links) {
    degree.set(note_a, (degree.get(note_a) || 0) + 1);
    degree.set(note_b, (degree.get(note_b) || 0) + 1);
    if (neighborsOf.has(note_a) && neighborsOf.has(note_b)) {
      neighborsOf.get(note_a).push({ id: note_b, linked_at: created_at });
      neighborsOf.get(note_b).push({ id: note_a, linked_at: created_at });
    }
  }

  const parentOf = new Map();
  for (const n of notes) {
    const rows = neighborsOf
      .get(n.id)
      .slice()
      .sort((a, b) => (a.linked_at < b.linked_at ? 1 : a.linked_at > b.linked_at ? -1 : 0)) // newest first
      .map(({ id, linked_at }) => {
        const other = byId.get(id);
        return other ? { ...other, linked_at } : null;
      })
      .filter(Boolean);

    let parent = null;
    if (n.created_from_note_id) {
      const fb = rows.find((r) => r.id === n.created_from_note_id);
      if (fb && fb.status !== 'done') parent = fb.id;
    }
    if (parent == null) {
      const candidates = rows.filter(
        (r) => r.created_from_note_id !== n.id && r.created_at !== r.linked_at
      );
      let skippedDone = false;
      let oldestSurvivor = null;
      for (let i = candidates.length - 1; i >= 0; i--) {
        if (candidates[i].status === 'done') {
          skippedDone = true;
          continue;
        }
        oldestSurvivor = candidates[i];
        break;
      }
      if (oldestSurvivor && skippedDone) {
        const survivors = candidates.filter((r) => r.status !== 'done');
        survivors.sort((a, b) => {
          const da = degree.get(a.id) || 0;
          const dbDeg = degree.get(b.id) || 0;
          if (da !== dbDeg) return dbDeg - da;
          return a.linked_at < b.linked_at ? -1 : a.linked_at > b.linked_at ? 1 : 0;
        });
        parent = survivors[0] ? survivors[0].id : null;
      } else {
        parent = oldestSurvivor ? oldestSurvivor.id : null;
      }
    }
    parentOf.set(n.id, parent);
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

// The most globally significant root: among every parentless note (one per
// disconnected component — an isolated note is trivially its own), the one
// anchoring the largest subtree. Degree alone isn't a good proxy here — a
// note can rack up a high degree from a pile of shallow one-off children
// (e.g. a shopping-list hub with a dozen single-item notes) without actually
// organizing much of the graph, while the "real" root anchors far more of it
// several levels deep. Used as the landing note when there's no better
// context to resume (e.g. the last open tab was just closed).
function probableRoot(uid) {
  const { byId, parentOf, childrenOf } = buildHierarchy(uid);
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

module.exports = { buildHierarchy, subtreeIds, probableRoot };
