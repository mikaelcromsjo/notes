const express = require('express');
const db = require('../db');
const { buildAgenda, dayIndexInZone, pickZone } = require('../agenda');
const { computeNeighbors } = require('../neighbors');
const { resolveNoteAccess, scopeOf } = require('../note-access');
const { listRefsForNote } = require('../shares');
const themes = require('../../public/themes.js');
const { cleanPrefs } = require('./theme');
const location = require('../location');

const router = express.Router();

const SNIPPET_LEN = 280;

function userForToken(token) {
  if (typeof token !== 'string' || token.length < 16) return null;
  return (
    db.prepare('SELECT id, enc_enabled_at FROM users WHERE widget_token = ?').get(token) || null
  );
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
    // ?preview=1 (app.js's handleDeepLink) opens straight into the fullscreen
    // read-only preview — same reasoning as the grid widget's centre-cell
    // link, just applied to every item here since the agenda widget only
    // ever *opens* a note by URL, never re-centers on one locally.
    const withUrl = (items) => items.map((it) => ({ ...it, url: `${origin}/?preview=1#${it.noteId}` }));
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
      // kind='anytime' reminders — see buildAgenda — kept out of the buckets
      // above for the same reason as everywhere else this shows up; not yet
      // read by AgendaWidgetProvider (only ?mode=nudge is), but included here
      // so this feed's shape matches buildAgenda's actual data model.
      nudges: withUrl(a.nudges),
      open_tasks: withUrl(a.openTasks),
      orphans: withUrl(a.orphans),
    });
  }

  // ?mode=nudge → the Android nudge widget's own feed: every kind='anytime'
  // reminder that's *in range* today — due already (including stale-overdue,
  // same as the in-app toast) or scheduled for later today — not just the
  // ones whose exact picked minute (public/app.js's per-day scheduling) has
  // already passed. A widget only refreshes every 30 min (nudge_widget_info.xml)
  // and has no clock-time math of its own, so handing it just the
  // already-due set left it showing "Nothing due" most of the day even with
  // several nudges genuinely active — the widget caches this whole list and
  // cycles through it locally (NudgeWidgetProvider), `due` just says which
  // ones have actually reached their moment. Deliberately not folded into
  // ?mode=agenda: that feed's reminders buckets are for a *list*, this one is
  // "what to show on a single rotating tile."
  if (req.query.mode === 'nudge') {
    const now = new Date();
    const rows = db
      .prepare(
        `SELECT r.id, r.note_id, r.tz, r.snooze_until, r.next_at, n.title
         FROM reminders r JOIN notes n ON n.id = r.note_id
         WHERE r.user_id = ? AND r.kind = 'anytime' AND n.status NOT IN ('deleted', 'done')
           AND COALESCE(r.snooze_until, r.next_at) IS NOT NULL`
      )
      .all(user.id);

    const zone = pickZone(req.query.tz, rows);
    const today = dayIndexInZone(now, zone);
    const nowMs = now.getTime();

    const nudges = rows
      .map((r) => {
        const snoozed = r.snooze_until && Date.parse(r.snooze_until) > nowMs;
        const dueIso = snoozed ? r.snooze_until : r.next_at;
        return { r, dueIso, dueMs: Date.parse(dueIso) };
      })
      // "In range" = today or earlier in this zone — excludes a reminder
      // whose picked day has rolled forward to tomorrow or later (see
      // db.js's kind='anytime' doc comment on why that can happen).
      .filter(({ dueMs }) => dayIndexInZone(new Date(dueMs), zone) <= today)
      .sort((a, b) => a.dueMs - b.dueMs)
      .map(({ r, dueIso, dueMs }) => ({
        id: r.id,
        noteId: r.note_id,
        title: r.title,
        due: dueMs <= nowMs,
        url: `${origin}/?preview=1#${r.note_id}`,
      }));

    return res.json({
      generated_at: now.toISOString(),
      mode: 'nudge',
      tz: zone,
      theme,
      nudges,
    });
  }

  // A widget that lets you re-center its own 3x3 grid (rather than always
  // mirroring the app's active tab) passes back whichever note it centered on
  // last. Falls through to the usual active-tab/most-recent pick if absent,
  // not found, or since deleted — this never touches `tabs`, so re-centering
  // the widget never changes what the app itself has open. resolveNoteAccess
  // (not a raw `user_id = ?` match) so a shared note this user is only an
  // editor/viewer member of — not the original creator — can still be
  // re-centered on, same as the personal note case.
  let center = req.query.center ? resolveNoteAccess(db, user.id, req.query.center).note : null;

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
  // matches the app instead of approximating it. Same root-note exception
  // too (server/notes.js's neighbors()) — never guess a parent for the
  // note explicitly marked as this user's graph root; a share has no root
  // concept at all. scopeOf(center) — not a hardcoded { userId } — because
  // `center` may be a shared-space note: computeNeighbors's scope clause
  // requires share_id IS NULL for a { userId } scope, so the old hardcoded
  // scope silently found no such note and always fell back to an empty
  // parent/neighbors, leaving a shared center note stranded with no grid.
  const isExplicitRoot =
    center.share_id == null &&
    db.prepare('SELECT 1 FROM users WHERE id = ? AND root_note_id = ?').get(user.id, center.id);
  const result = computeNeighbors(scopeOf(center), center.id, user.id, {
    skipStructuralFallback: Boolean(isExplicitRoot),
  }) || { parent: null, neighbors: [] };
  const withUrl = (n) => ({ id: n.id, title: n.title, type: n.type, url: `${origin}/#${n.id}` });

  // Cross-scope references (server/shares.js's personal_refs) — the same
  // pseudo-neighbor merge public/app.js's loadNeighbors does for the in-app
  // grid, so a personal note's pointer into a space (and a space note's
  // pointer back out to the personal note it was referenced from) shows up
  // here too, not just in-app. Prepended like the web app does; marked
  // `ref: true` (`type: null`, matching the web app's isRef cards) rather
  // than folded in unlabeled, since these are never a real `links` row.
  const refCards = listRefsForNote(db, user.id, center.id).map((ref) => {
    const targetIsShared = ref.personal_note_id === center.id;
    const farId = targetIsShared ? ref.shared_note_id : ref.personal_note_id;
    // noAccess: the space this ref points into was dissolved, or this
    // member was removed from it — title is already the "No access to..."
    // placeholder (never the real, now-unreachable, note title), and there's
    // nothing left to navigate to, so no url (see app.js's same noAccess
    // click-guard).
    return {
      id: farId,
      title: ref.noAccess ? `No access to "${ref.shareTitle}"` : ref.title,
      type: null,
      ref: true,
      refTargetIsShared: targetIsShared,
      noAccess: Boolean(ref.noAccess),
      url: ref.noAccess ? null : `${origin}/#${farId}`,
    };
  });

  // Once the account has opted into content encryption, `center.content` is
  // ciphertext — this native RemoteViews widget has no crypto of its own (see
  // docs/plan/08-offline-privacy.md's widget risk note), so drop the snippet
  // to title-only rather than show garbled bytes.
  const snippet = user.enc_enabled_at
    ? ''
    : (center.content || '').replace(/\s+/g, ' ').trim().slice(0, SNIPPET_LEN);

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
      // ?preview=1 (app.js's handleDeepLink) opens straight into the
      // fullscreen read-only preview — a plain #<id> alone just re-centers
      // the grid on it, which for the *centre* cell is a no-op-looking
      // "nothing happened" (it's already the note the widget was showing).
      // The neighbour/parent links below stay plain #<id> — the grid widget
      // never actually opens those via URL, it re-centers itself locally.
      url: `${origin}/?preview=1#${center.id}`,
    },
    parent: result.parent ? withUrl(result.parent) : null,
    neighbors: refCards.concat(result.neighbors.map(withUrl)),
  });
});

// One periodic GPS sample from the Android widget app's own ~30-min background
// refresh tick (piggybacked on GridWidgetProvider.onUpdate, see LocationLogger
// there) — not a continuous background track, notes-android has no foreground
// location service. Token-authed like the feed above, not cookie-based (this
// app has no session). Rate-limited server-side too, in case of a buggy/rogue
// client: at most one accepted sample per MIN_INTERVAL_MS regardless of what
// the widget sends, so this never becomes a way to get finer-grained tracking
// than the design intends.
const MIN_INTERVAL_MS = 5 * 60 * 1000;

router.post('/location', (req, res) => {
  const user = userForToken(req.query.token);
  if (!user) return res.status(401).json({ error: 'invalid or missing widget token' });

  const recordedAt = new Date(req.body.recordedAt);
  const recordedIso = Number.isFinite(recordedAt.getTime())
    ? recordedAt.toISOString()
    : new Date().toISOString();

  const last = db
    .prepare('SELECT recorded_at FROM location_log WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1')
    .get(user.id);
  if (last && Date.parse(recordedIso) - Date.parse(last.recorded_at) < MIN_INTERVAL_MS) {
    return res.json({ ok: true, skipped: 'too soon since last sample' });
  }

  // `geo`, when present, is already encrypted client-side — only the web
  // app's own opportunistic sampling (public/app.js's maybeLogTrailPoint)
  // can ever send it; the Android widget has no crypto of its own and
  // always sends plain lat/lon (left "pending" for the catch-up sweep to
  // encrypt later — see server/location.js's encryptGeo).
  if (typeof req.body.geo === 'string' && req.body.geo) {
    location.insert(db, user.id, { recordedAt: recordedIso, geo: req.body.geo });
    return res.json({ ok: true });
  }

  const lat = Number(req.body.lat);
  const lon = Number(req.body.lon);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return res.status(400).json({ error: 'lat must be between -90 and 90' });
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    return res.status(400).json({ error: 'lon must be between -180 and 180' });
  }
  let accuracy = req.body.accuracy != null ? Number(req.body.accuracy) : null;
  if (!Number.isFinite(accuracy) || accuracy < 0) accuracy = null;

  location.insert(db, user.id, { lat, lon, accuracy, recordedAt: recordedIso });

  res.json({ ok: true });
});

module.exports = router;
