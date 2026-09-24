const express = require('express');
const db = require('../db');
const { buildAgenda } = require('../agenda');
const { computeNeighbors } = require('../neighbors');
const themes = require('../../public/themes.js');
const { cleanPrefs } = require('./theme');

const router = express.Router();

const SNIPPET_LEN = 280;

function userForToken(token) {
  if (typeof token !== 'string' || token.length < 16) return null;
  return db.prepare('SELECT id FROM users WHERE widget_token = ?').get(token) || null;
}

// The account's *app* theme (not any per-note override — a widget has no
// concept of "ancestor notes" to cascade through) as flat resolved colours +
// font key, for a client that can't run themes.js's cssVars/CSS-var pipeline
// itself (the Android widget). Matches what the web app's chrome looks like
// when nothing else overrides it.
function appTheme(userId) {
  const row = db.prepare('SELECT theme_prefs FROM users WHERE id = ?').get(userId);
  let raw;
  try {
    raw = JSON.parse((row && row.theme_prefs) || 'null');
  } catch {
    raw = null;
  }
  const prefs = cleanPrefs(raw, userId);
  const preset = themes.PRESETS[prefs.active];
  const custom = !preset && prefs.custom.find((t) => t.id === prefs.active);
  const style = (preset && preset.style) || (custom && custom.style) || {};
  return { colors: themes.effectiveColors(style), font: style.font || 'system' };
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
  const theme = appTheme(user.id);

  // ?mode=agenda → the "what's due" feed instead of the graph neighbourhood.
  if (req.query.mode === 'agenda') {
    const a = buildAgenda(user.id, { tz: req.query.tz });
    const withUrl = (items) => items.map((it) => ({ ...it, url: `${origin}/#${it.noteId}` }));
    return res.json({
      generated_at: a.generatedAt,
      mode: 'agenda',
      tz: a.tz,
      compose_url: `${origin}/?compose=1`,
      theme,
      reminders: {
        overdue: withUrl(a.reminders.overdue),
        today: withUrl(a.reminders.today),
        week: withUrl(a.reminders.week),
        later: withUrl(a.reminders.later),
      },
      open_tasks: withUrl(a.openTasks),
      orphans: withUrl(a.orphans),
    });
  }

  // A widget that lets you re-center its own 3x3 grid (rather than always
  // mirroring the app's active tab) passes back whichever note it centered on
  // last. Falls through to the usual active-tab/most-recent pick if absent,
  // not found, or since deleted — this never touches `tabs`, so re-centering
  // the widget never changes what the app itself has open.
  let center = req.query.center
    ? db
        .prepare(
          `SELECT id, title, content, type, updated_at FROM notes
           WHERE id = ? AND user_id = ? AND status != 'deleted'`
        )
        .get(req.query.center, user.id)
    : null;

  if (!center) {
    center = db
      .prepare(
        `SELECT n.id, n.title, n.content, n.type, n.updated_at
         FROM tabs t JOIN notes n ON n.id = t.note_id
         WHERE t.user_id = ? AND t.is_active = 1 AND n.status != 'deleted'
         LIMIT 1`
      )
      .get(user.id);
  }

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
      theme,
      center: null,
      parent: null,
      neighbors: [],
    });
  }

  // Same ranking the app's own grid uses (server/neighbors.js) — nav-history
  // scored where there's history, link-recency cold-start otherwise — plus the
  // "probable parent" the app always places in the top-center cell, so a
  // widget that reproduces that layout (the Android grid widget) genuinely
  // matches the app instead of approximating it.
  const result = computeNeighbors(user.id, center.id) || { parent: null, neighbors: [] };
  const withUrl = (n) => ({ id: n.id, title: n.title, type: n.type, url: `${origin}/#${n.id}` });

  const snippet = (center.content || '').replace(/\s+/g, ' ').trim().slice(0, SNIPPET_LEN);

  res.json({
    generated_at: new Date().toISOString(),
    compose_url: `${origin}/?compose=1`,
    theme,
    center: {
      id: center.id,
      title: center.title,
      type: center.type,
      snippet,
      updated_at: center.updated_at,
      url: `${origin}/#${center.id}`,
    },
    parent: result.parent ? withUrl(result.parent) : null,
    neighbors: result.neighbors.map(withUrl),
  });
});

module.exports = router;
