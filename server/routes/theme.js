const fs = require('fs');
const path = require('path');
const express = require('express');
const db = require('../db');
const themes = require('../../public/themes.js');
const { uploadsDir, IMAGE_EXT, diskUpload } = require('../upload-config');

const router = express.Router();

const MAX_CUSTOM_THEMES = 24;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
// Browsers can't paint HEIC/HEIF as a CSS background, so only these are taken.
const BG_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
// An upload only becomes garbage once no theme references it; give a just-made one
// this long to be saved into a theme before the sweep may touch it.
const SWEEP_GRACE_MS = 60 * 60 * 1000;

const upload = diskUpload();

const ownsUpload = (userId) => {
  const stmt = db.prepare('SELECT 1 FROM theme_images WHERE path = ? AND user_id = ?');
  return (p) => Boolean(stmt.get(p, userId));
};

function cleanId(v) {
  return typeof v === 'string' && /^[a-z0-9-]{1,40}$/i.test(v) ? v : null;
}

// Normalise the account theme prefs: { active, custom: [{ id, name, style }] }.
// `active` is a built-in preset key or the id of one of the custom themes.
function cleanPrefs(raw, userId) {
  const uploadOk = ownsUpload(userId);
  const custom = [];
  const seen = new Set();
  for (const t of Array.isArray(raw && raw.custom) ? raw.custom : []) {
    const id = cleanId(t && t.id);
    if (!id || seen.has(id) || themes.PRESETS[id]) continue;
    seen.add(id);
    custom.push({
      id,
      name: String((t && t.name) || 'My theme').trim().slice(0, 40) || 'My theme',
      style: themes.sanitizeStyle(t && t.style, { uploadOk }) || {},
    });
    if (custom.length >= MAX_CUSTOM_THEMES) break;
  }
  const active = raw && typeof raw.active === 'string' ? raw.active : 'light';
  return {
    active: themes.PRESETS[active] || seen.has(active) ? active : 'light',
    custom,
  };
}

function readPrefs(userId) {
  const row = db.prepare('SELECT theme_prefs FROM users WHERE id = ?').get(userId);
  try {
    return cleanPrefs(JSON.parse((row && row.theme_prefs) || 'null'), userId);
  } catch {
    return { active: 'light', custom: [] };
  }
}

// Delete uploaded background images no theme (account or note) refers to any more.
function sweepImages(userId) {
  const used = new Set();
  const collect = (json) => {
    try {
      const s = JSON.parse(json || 'null');
      if (!s) return;
      const styles = Array.isArray(s.custom) ? s.custom.map((t) => t.style || {}) : [s];
      for (const st of styles) for (const k of ['bg', 'card']) if (st[k] && st[k].img) used.add(st[k].img);
    } catch {
      /* unreadable theme JSON references nothing */
    }
  };
  collect(db.prepare('SELECT theme_prefs FROM users WHERE id = ?').get(userId).theme_prefs);
  for (const n of db.prepare("SELECT theme FROM notes WHERE user_id = ? AND theme IS NOT NULL").all(userId)) {
    collect(n.theme);
  }
  const cutoff = new Date(Date.now() - SWEEP_GRACE_MS).toISOString();
  for (const r of db
    .prepare('SELECT path FROM theme_images WHERE user_id = ? AND created_at < ?')
    .all(userId, cutoff)) {
    if (used.has(r.path)) continue;
    db.prepare('DELETE FROM theme_images WHERE path = ?').run(r.path);
    fs.unlink(path.join(uploadsDir, path.basename(r.path)), () => {});
  }
}

router.get('/', (req, res) => {
  res.json(readPrefs(req.userId));
});

router.put('/', (req, res) => {
  const prefs = cleanPrefs(req.body, req.userId);
  db.prepare('UPDATE users SET theme_prefs = ? WHERE id = ?').run(JSON.stringify(prefs), req.userId);
  sweepImages(req.userId);
  res.json(prefs);
});

// Upload one background image (the client downsizes it first). Returns the
// '/uploads/<file>' path to reference from a theme's bg/card `img`.
router.post('/image', upload.single('file'), (req, res) => {
  const f = req.file;
  if (!f) return res.status(400).json({ error: 'no image received' });
  const reject = (code, error) => {
    fs.unlink(f.path, () => {});
    return res.status(code).json({ error });
  };
  if (!BG_MIMES.has(f.mimetype) || !IMAGE_EXT[f.mimetype]) {
    return reject(415, 'use a JPEG, PNG, WebP or GIF image');
  }
  if (f.size > MAX_IMAGE_BYTES) return reject(413, 'image is too large (8 MB max)');

  const p = `/uploads/${f.filename}`;
  db.prepare('INSERT INTO theme_images (path, user_id) VALUES (?, ?)').run(p, req.userId);
  res.status(201).json({ path: p });
});

module.exports = router;
module.exports.cleanPrefs = cleanPrefs;
module.exports.sweepImages = sweepImages;
module.exports.ownsUpload = ownsUpload;
