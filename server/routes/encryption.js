const express = require('express');
const db = require('../db');
const encryption = require('../encryption');
const { HttpError } = require('../http-error');

const router = express.Router();

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

// Current KDF params + whether the one-time migration has run. Not secret —
// see server/encryption.js.
router.get('/', wrap((req) => encryption.getPrefs(db, req.userId)));

// "Set up encryption" ceremony (docs/plan/08-offline-privacy.md §3.3): record
// the salt/iteration count this device just derived its key with. No content
// touched yet.
router.put('/setup', wrap((req) => encryption.setup(db, req.userId, req.body)));

// Abandon an unused setup (before the migration below has ever run).
router.delete('/setup', wrap((req) => encryption.cancelSetup(db, req.userId), 204));

// The one-time re-encryption migration (§3.4) — body: { items: [{id, content}] },
// content already ciphertext (encrypted client-side with the derived key).
router.post('/migrate', wrap((req) => encryption.migrate(db, req.userId, req.body && req.body.items)));

// Content-encryption catch-up sweep — see server/encryption.js's pending().
router.get('/pending', wrap((req) => encryption.pending(db, req.userId)));
// body: { items: [{id, content, expect}] } — content already converted
// client-side, expect = the exact text it was converted from.
router.post('/sweep', wrap((req) => encryption.sweep(db, req.userId, req.body && req.body.items)));

module.exports = router;
