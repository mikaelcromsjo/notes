const express = require('express');
const db = require('../db');
const reminders = require('../reminders');
const { HttpError } = require('../http-error');

const router = express.Router();

// Thin Express adapter over server/reminders.js — see server/routes/notes.js's
// `wrap` for the shared convention.
function wrap(fn, status = 200) {
  return (req, res) => {
    try {
      const result = fn(req, res);
      if (status === 204) return res.status(204).end();
      res.status(status).json(result === undefined ? { ok: true } : result);
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  };
}

router.get('/', wrap((req) => reminders.list(db, req.userId)));

// Background catch-up sweep for location encryption — see server/notes.js's
// /encrypt-geo route for the same pattern.
router.post(
  '/encrypt-geo',
  wrap((req) => reminders.encryptGeo(db, req.userId, req.body && req.body.items))
);

// Create a reminder for a note.
router.post('/', wrap((req) => reminders.create(db, req.userId, req.body), 201));

// Update a reminder by its own id.
router.put('/:id', wrap((req) => reminders.update(db, req.userId, req.params.id, req.body)));

router.delete('/:id', wrap((req) => reminders.remove(db, req.userId, req.params.id), 204));

// "OK" on the popup — quiet until the reminder next goes off. The client sends
// the rolled-forward nextAt so the scheduler re-arms for that occurrence; any
// active snooze is spent.
router.post('/:id/ack', wrap((req) => reminders.ack(db, req.userId, req.params.id, req.body)));

// Push the reminder out to an absolute instant (weeks/months). The client
// computes `until` in the viewer's timezone; the scheduler treats snooze_until
// as the due time while it is set.
router.post('/:id/snooze', wrap((req) => reminders.snooze(db, req.userId, req.params.id, req.body)));

// Roll the next-ring instant forward (client does this on every poll while the
// app is open, so future occurrences stay armed for push).
router.post('/:id/schedule', wrap((req) => reminders.schedule(db, req.userId, req.params.id, req.body)));

// The client's foreground geofence watch calls this when the viewer crosses into
// a location reminder's radius.
router.post('/:id/arrive', wrap((req) => ({ ok: true, ...reminders.arrive(db, req.userId, req.params.id) })));

module.exports = router;
