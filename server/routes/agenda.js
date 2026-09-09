const express = require('express');
const { buildAgenda } = require('../agenda');

const router = express.Router();

// GET /api/agenda?tz=Europe/Stockholm
// One "what's due" bundle for the signed-in user: reminders bucketed into
// overdue / today / this week / later, plus notes carrying open `- [ ]` tasks.
// `tz` is optional — see server/agenda.js for the fallback.
router.get('/', (req, res) => {
  res.json(buildAgenda(req.userId, { tz: req.query.tz }));
});

module.exports = router;
