const express = require('express');
const db = require('../db');

const router = express.Router();

const now = () => new Date().toISOString();

// One-shot: wipes the account's current notes/links/reminders (at signup
// time that's exactly the seeded sample graph plus whatever the tour spawned)
// and stamps users.onboarding_cleared_at so a replay (e.g. a second tab still
// showing the tour) can't do it again against real notes made since.
router.post('/begin', (req, res) => {
  const user = db.prepare('SELECT onboarding_cleared_at FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(401).json({ error: 'no active session' });
  if (user.onboarding_cleared_at) return res.status(409).json({ error: 'already cleared' });

  db.transaction(() => {
    db.prepare('DELETE FROM notes WHERE user_id = ?').run(req.userId);
    db.prepare('UPDATE users SET onboarding_cleared_at = ? WHERE id = ?').run(now(), req.userId);
  })();

  res.status(204).end();
});

module.exports = router;
