const express = require('express');
const db = require('../db');
const { buildAgenda } = require('../agenda');

const router = express.Router();

const NEIGHBOR_LIMIT = 8;
const SNIPPET_LEN = 280;

function userForToken(token) {
  if (typeof token !== 'string' || token.length < 16) return null;
  return db.prepare('SELECT id FROM users WHERE widget_token = ?').get(token) || null;
}

// Base URL for the links in the feed. Pin it with PUBLIC_ORIGIN in deployments
// behind a proxy; otherwise fall back to the forwarded request headers.
function originFor(req) {
  if (process.env.PUBLIC_ORIGIN) return process.env.PUBLIC_ORIGIN.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

// Read-only feed for a home-screen widget: the centered note (active tab, or the
// most recently updated note) plus its linked neighbours, ranked by link recency.
// Authenticated by the per-user widget_token query param, not the session cookie.
router.get('/', (req, res) => {
  const user = userForToken(req.query.token);
  if (!user) return res.status(401).json({ error: 'invalid or missing widget token' });

  const origin = originFor(req);

  // ?mode=agenda → the "what's due" feed instead of the graph neighbourhood.
  if (req.query.mode === 'agenda') {
    const a = buildAgenda(user.id, { tz: req.query.tz });
    const withUrl = (items) => items.map((it) => ({ ...it, url: `${origin}/#${it.noteId}` }));
    return res.json({
      generated_at: a.generatedAt,
      mode: 'agenda',
      tz: a.tz,
      compose_url: `${origin}/?compose=1`,
      reminders: {
        overdue: withUrl(a.reminders.overdue),
        today: withUrl(a.reminders.today),
        week: withUrl(a.reminders.week),
        later: withUrl(a.reminders.later),
      },
      open_tasks: withUrl(a.openTasks),
    });
  }

  let center = db
    .prepare(
      `SELECT n.id, n.title, n.content, n.type, n.updated_at
       FROM tabs t JOIN notes n ON n.id = t.note_id
       WHERE t.user_id = ? AND t.is_active = 1 AND n.status != 'deleted'
       LIMIT 1`
    )
    .get(user.id);

  if (!center) {
    center = db
      .prepare(
        `SELECT id, title, content, type, updated_at
         FROM notes WHERE user_id = ? AND status != 'deleted'
         ORDER BY updated_at DESC LIMIT 1`
      )
      .get(user.id);
  }

  if (!center) {
    return res.json({
      generated_at: new Date().toISOString(),
      compose_url: `${origin}/?compose=1`,
      center: null,
      neighbors: [],
    });
  }

  const neighbors = db
    .prepare(
      `SELECT n.id, n.title, n.type
       FROM links l
       JOIN notes n ON n.id = CASE WHEN l.note_a = ? THEN l.note_b ELSE l.note_a END
       WHERE (l.note_a = ? OR l.note_b = ?) AND n.user_id = ? AND n.status != 'deleted'
       ORDER BY l.created_at DESC
       LIMIT ?`
    )
    .all(center.id, center.id, center.id, user.id, NEIGHBOR_LIMIT);

  const snippet = (center.content || '').replace(/\s+/g, ' ').trim().slice(0, SNIPPET_LEN);

  res.json({
    generated_at: new Date().toISOString(),
    compose_url: `${origin}/?compose=1`,
    center: {
      id: center.id,
      title: center.title,
      type: center.type,
      snippet,
      updated_at: center.updated_at,
      url: `${origin}/#${center.id}`,
    },
    neighbors: neighbors.map((n) => ({ ...n, url: `${origin}/#${n.id}` })),
  });
});

module.exports = router;
