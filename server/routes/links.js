const express = require('express');
const db = require('../db');
const linksCore = require('../links');
const { HttpError } = require('../http-error');

const router = express.Router();

// Thin Express adapter over server/links.js — see server/routes/notes.js's
// `wrap` for the shared convention.
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

router.get('/', wrap((req) => linksCore.list(db, req.userId)));

router.post('/', wrap((req) => linksCore.create(db, req.userId, req.body), 201));

router.delete('/', wrap((req) => linksCore.remove(db, req.userId, req.body), 204));

// User-correctable override for how a link is treated for hierarchy
// purposes ('child'/'cross'/'auto') — see server/links.js's setRelation.
// Declared after '/' (not a collision either way — different path shapes —
// but keeps this file's route order matching its rough "specific action
// after the base CRUD" convention).
router.put('/relation', wrap((req) => linksCore.setRelation(db, req.userId, req.body)));

module.exports = router;
