const express = require('express');
const db = require('../db');

const router = express.Router();

const DEFAULT_DAYS = 14;
const MAX_DAYS = 90; // matches the location_log retention window in db.js
const MAX_POINTS = 3000; // sanity cap — 30-min samples over 90 days is ~4300 max

// Feeds the web app's map-overlay trail toggle with this account's periodic GPS
// samples (server/routes/widget.js's POST /api/widget/location, appended by the
// Android widget app — see LocationLogger there). Cookie-authed like the rest of
// /api, unlike the widget's own token-authed feed.
router.get('/', (req, res) => {
  let days = Number(req.query.days);
  if (!Number.isFinite(days) || days <= 0) days = DEFAULT_DAYS;
  days = Math.min(days, MAX_DAYS);

  const rows = db
    .prepare(
      `SELECT lat, lon, accuracy_m AS accuracy, recorded_at AS recordedAt
       FROM location_log
       WHERE user_id = ? AND recorded_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)
       ORDER BY recorded_at ASC
       LIMIT ?`
    )
    .all(req.userId, `-${days} days`, MAX_POINTS);

  res.json({ points: rows });
});

module.exports = router;
