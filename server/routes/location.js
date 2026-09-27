const express = require('express');
const db = require('../db');
const location = require('../location');
const { HttpError } = require('../http-error');

const router = express.Router();

function wrap(fn, status = 200) {
  return (req, res) => {
    try {
      res.status(status).json(fn(req, res));
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  };
}

// Feeds the web app's map-overlay trail toggle with this account's periodic GPS
// samples (server/routes/widget.js's POST /api/widget/location, appended by the
// Android widget app — see LocationLogger there). Cookie-authed like the rest of
// /api, unlike the widget's own token-authed feed.
router.get('/', wrap((req) => ({ points: location.list(db, req.userId, req.query.days) })));

// Background catch-up sweep for location encryption — see server/notes.js's
// /encrypt-geo route for the same pattern.
router.post(
  '/encrypt-geo',
  wrap((req) => location.encryptGeo(db, req.userId, req.body && req.body.items))
);

module.exports = router;
