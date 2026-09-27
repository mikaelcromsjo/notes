const express = require('express');
const db = require('../db');
const tabsCore = require('../tabs');
const { HttpError } = require('../http-error');

const router = express.Router();

// Thin Express adapter over server/tabs.js — see server/routes/notes.js's
// `wrap` for the shared convention.
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

router.get('/', wrap((req) => tabsCore.list(db, req.userId)));

router.post('/', wrap((req) => tabsCore.create(db, req.userId, req.body), 201));

router.put('/:id', wrap((req) => tabsCore.move(db, req.userId, req.params.id, req.body)));

router.put('/:id/activate', wrap((req) => tabsCore.activateTab(db, req.userId, req.params.id)));

router.delete('/:id', wrap((req) => tabsCore.remove(db, req.userId, req.params.id)));

module.exports = router;
