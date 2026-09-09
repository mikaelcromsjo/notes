const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const db = require('../db');
const sessions = require('../sessions');
const mailer = require('../mailer');
const { uploadsDir } = require('../upload-config');

const router = express.Router();

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const DELETE_TOKEN_TTL_MS = 15 * 60 * 1000;
const LEGACY_COOKIE = 'nico_uid';

// Pin the link base with PUBLIC_ORIGIN behind a proxy; else trust forwarded
// headers (mirrors server/routes/auth.js / widget.js).
function originFor(req) {
  if (process.env.PUBLIC_ORIGIN) return process.env.PUBLIC_ORIGIN.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

// --- tiny in-memory rate limiter (resets on restart; one box) ---
const hits = new Map();
function rateLimited(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > max;
}

function slug(s) {
  return (
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'note'
  );
}

// Quote a front-matter scalar only when it could otherwise be misread as YAML.
function yamlScalar(v) {
  const s = String(v);
  return /^[\w .,/@()+&']*$/.test(s) && s.trim() === s ? s : JSON.stringify(s);
}

// Every /uploads/<file> a note points at: its attachment_path plus any inline
// ![](...) embeds in the markdown.
function uploadRefs(note) {
  const out = new Set();
  if (note.attachment_path && note.attachment_path.startsWith('/uploads/')) {
    out.add(path.basename(note.attachment_path));
  }
  const re = /\/uploads\/([A-Za-z0-9._-]+)/g;
  let m;
  while ((m = re.exec(note.content || ''))) out.add(m[1]);
  return [...out];
}

// --- GET /api/account/export -------------------------------------------------
// A .zip of the caller's whole account: one Markdown file per note (front-matter
// + [[wikilink]] "## Links", re-importable via Settings -> Import), the
// referenced upload files, and data.json (every row, every column).
router.get('/export', (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'no active session' });
  if (rateLimited(`export:${req.userId}`, 3, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'too many exports — try again later' });
  }

  const user = db
    .prepare(
      `SELECT id, email, created_at, widget_token,
              digest_cadence, digest_hour, digest_tz, digest_channel, digest_last_sent_at
       FROM users WHERE id = ?`
    )
    .get(req.userId);
  if (!user) return res.status(401).json({ error: 'no active session' });

  const notes = db.prepare('SELECT * FROM notes WHERE user_id = ? ORDER BY id').all(user.id);
  const links = db
    .prepare('SELECT note_a, note_b, created_at FROM links WHERE user_id = ? ORDER BY note_a, note_b')
    .all(user.id);
  const tabs = db
    .prepare('SELECT note_id, sort_order, is_active, created_at FROM tabs WHERE user_id = ? ORDER BY sort_order')
    .all(user.id);
  const reminders = db.prepare('SELECT * FROM reminders WHERE user_id = ? ORDER BY id').all(user.id);
  const navEvents = db
    .prepare('SELECT from_note_id, to_note_id, via, created_at FROM nav_events WHERE user_id = ? ORDER BY id')
    .all(user.id);
  const history = db
    .prepare('SELECT action, summary, payload, created_at, undone_at FROM history WHERE user_id = ? ORDER BY id')
    .all(user.id);

  const titleById = new Map(notes.map((n) => [n.id, n.title]));
  const neighboursOf = new Map();
  const addEdge = (a, b) => {
    if (!neighboursOf.has(a)) neighboursOf.set(a, []);
    neighboursOf.get(a).push(b);
  };
  for (const l of links) {
    addEdge(l.note_a, l.note_b);
    addEdge(l.note_b, l.note_a);
  }

  const zip = new AdmZip();

  for (const n of notes) {
    const fm = [
      '---',
      `title: ${yamlScalar(n.title)}`,
      `id: ${n.id}`,
      `created: ${n.created_at}`,
      `updated: ${n.updated_at}`,
      `type: ${n.type}`,
      `status: ${n.status}`,
    ];
    if (n.lat != null && n.lon != null) {
      fm.push(`lat: ${n.lat}`, `lon: ${n.lon}`);
    }
    fm.push('---', '');

    const parts = [fm.join('\n')];
    // Inline embeds point at the bundled attachments/ folder, not /uploads.
    parts.push((n.content || '').replace(/\]\(\/uploads\//g, '](attachments/'));

    if (n.attachment_path && n.attachment_path.startsWith('/uploads/')) {
      const f = path.basename(n.attachment_path);
      parts.push('', n.type === 'audio' ? `[audio](attachments/${f})` : `![${n.title}](attachments/${f})`);
    }

    const outs = neighboursOf.get(n.id) || [];
    if (outs.length) {
      parts.push('', '## Links', ...outs.map((id) => `- [[${titleById.get(id) || `#${id}`}]]`));
    }

    zip.addFile(`notes/${n.id}-${slug(n.title)}.md`, Buffer.from(parts.join('\n'), 'utf8'));
  }

  const bundled = new Set();
  for (const n of notes) {
    for (const f of uploadRefs(n)) {
      if (bundled.has(f)) continue;
      bundled.add(f);
      const p = path.join(uploadsDir, f);
      try {
        if (fs.existsSync(p)) zip.addLocalFile(p, 'attachments');
      } catch {
        /* skip an unreadable file rather than fail the whole export */
      }
    }
  }

  zip.addFile(
    'data.json',
    Buffer.from(
      JSON.stringify(
        {
          exported_at: new Date().toISOString(),
          user: {
            id: user.id,
            email: user.email,
            created_at: user.created_at,
            digest: {
              cadence: user.digest_cadence,
              hour: user.digest_hour,
              tz: user.digest_tz,
              channel: user.digest_channel,
              last_sent_at: user.digest_last_sent_at,
            },
          },
          notes,
          links,
          tabs,
          reminders,
          nav_events: navEvents,
          history,
        },
        null,
        2
      ),
      'utf8'
    )
  );

  zip.addFile(
    'README.txt',
    Buffer.from(
      `Your notes export
=================

notes/        One Markdown file per note. The YAML front-matter carries the
              metadata; a "## Links" list names the notes it connects to as
              [[wikilinks]]. Re-import this folder with Settings -> Import &
              export -> "Markdown folder" to rebuild the notes and the graph.
attachments/  The image / audio files the notes reference.
data.json     A complete machine-readable copy of everything stored for your
              account - every column of every row - for backup or inspection.

Generated ${new Date().toISOString()}
`,
      'utf8'
    )
  );

  const buf = zip.toBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="notes-export-${stamp}.zip"`);
  res.setHeader('Content-Length', buf.length);
  res.end(buf);
});

// --- POST /api/account/import ---------------------------------------------
// Restore an export produced by GET /api/account/export: replaces THIS account's
// graph (notes, links, tabs, reminders, nav history, undo log) with the snapshot
// in the upload's data.json, re-linking every note reference to freshly assigned
// ids and copying the bundled attachment files back into /uploads. This is the
// lossless path — the per-note Markdown files are for reading / other tools.
const restoreUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 },
});

// Extensions we are willing to write back under /uploads (mirrors the upload
// allowlist in server/upload-config.js — never trust a path from the archive).
const RESTORE_EXT = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif',
  '.webm', '.ogg', '.mp3', '.m4a', '.aac', '.wav',
]);

// Column allowlists — a snapshot from a newer build may carry extra keys.
const NOTE_COLS = [
  'title', 'content', 'created_at', 'updated_at', 'pinned', 'type', 'lat', 'lon',
  'attachment_path', 'status',
  'alarm_time', 'alarm_days', 'alarm_date', 'alarm_last_fired', 'alarm_ack_at',
  'alarm_next_at', 'alarm_pushed_at',
];
const REMINDER_COLS = [
  'time', 'days', 'date', 'tz', 'next_at', 'ack_at', 'pushed_at', 'snooze_until',
  'created_at', 'kind', 'lat', 'lon', 'radius_m',
];
// Every key in a history payload that holds a note id (see server/routes/history.js).
const HISTORY_ID_KEYS = ['noteId', 'a', 'b', 'to', 'from', 'card'];

function parseSnapshot(file) {
  const name = (file.originalname || '').toLowerCase();
  const attachments = new Map(); // basename -> Buffer
  let json;
  if (name.endsWith('.zip') || file.mimetype === 'application/zip') {
    const zip = new AdmZip(file.buffer);
    const entry = zip.getEntry('data.json');
    if (!entry) throw new Error('no data.json in the archive');
    json = JSON.parse(zip.readAsText(entry));
    for (const e of zip.getEntries()) {
      if (e.isDirectory || !e.entryName.startsWith('attachments/')) continue;
      attachments.set(path.basename(e.entryName), e.getData());
    }
  } else {
    json = JSON.parse(file.buffer.toString('utf8'));
  }
  if (!json || !Array.isArray(json.notes)) throw new Error('not a notes export (missing notes[])');
  return { json, attachments };
}

router.post('/import', restoreUpload.single('file'), (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'no active session' });
  if (!req.file) return res.status(400).json({ error: 'a .zip or data.json file is required' });

  let snapshot;
  try {
    snapshot = parseSnapshot(req.file);
  } catch (err) {
    return res.status(400).json({ error: `could not read the export: ${err.message}` });
  }
  const { json, attachments } = snapshot;

  // Old upload basename -> new one, for every bundled attachment we accept.
  const fileRenames = new Map();
  const filesToWrite = []; // { newBase, buf }
  for (const [base, buf] of attachments) {
    const ext = path.extname(base).toLowerCase();
    if (!RESTORE_EXT.has(ext)) continue;
    const newBase = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    fileRenames.set(base, newBase);
    filesToWrite.push({ newBase, buf });
  }

  const rewriteUploadRefs = (s) => {
    if (!s) return s;
    let out = String(s);
    for (const [oldBase, newBase] of fileRenames) {
      out = out.split(`/uploads/${oldBase}`).join(`/uploads/${newBase}`);
      out = out.split(`attachments/${oldBase}`).join(`/uploads/${newBase}`);
    }
    return out;
  };

  const idMap = new Map();
  const mapId = (v) => {
    const n = Number(v);
    return Number.isInteger(n) && idMap.has(n) ? idMap.get(n) : null;
  };

  const counts = { notes: 0, links: 0, tabs: 0, reminders: 0, navEvents: 0, history: 0, attachments: 0, attachmentsSkipped: attachments.size - fileRenames.size };
  const oldUploadFiles = new Set();

  const insNote = db.prepare(
    `INSERT INTO notes (${NOTE_COLS.join(', ')}, user_id) VALUES (${NOTE_COLS.map(() => '?').join(', ')}, ?)`
  );

  try {
    db.transaction(() => {
      // Note which files the current graph uses, so we can delete them after.
      for (const n of db.prepare('SELECT attachment_path, content FROM notes WHERE user_id = ?').all(req.userId)) {
        for (const f of uploadRefs(n)) oldUploadFiles.add(f);
      }

      // Wipe this account's graph (push subscriptions + login tokens are device
      // / auth state, not part of a graph snapshot — leave them).
      for (const sql of [
        'DELETE FROM reminders WHERE user_id = ?',
        'DELETE FROM nav_events WHERE user_id = ?',
        'DELETE FROM history WHERE user_id = ?',
        'DELETE FROM tabs WHERE user_id = ?',
        'DELETE FROM links WHERE user_id = ?',
        'DELETE FROM notes WHERE user_id = ?',
      ]) {
        db.prepare(sql).run(req.userId);
      }

      // Notes first, building old id -> new id.
      const deferredParents = [];
      for (const n of json.notes) {
        const vals = NOTE_COLS.map((c) => {
          const v = n[c];
          if (v === undefined) return null;
          if (c === 'content' || c === 'attachment_path') return rewriteUploadRefs(v);
          return v;
        });
        const info = insNote.run(...vals, req.userId);
        idMap.set(Number(n.id), info.lastInsertRowid);
        counts.notes++;
        if (n.created_from_note_id) deferredParents.push([n.id, n.created_from_note_id]);
      }
      const setParent = db.prepare('UPDATE notes SET created_from_note_id = ? WHERE id = ?');
      for (const [childOld, parentOld] of deferredParents) {
        const child = mapId(childOld);
        const parent = mapId(parentOld);
        if (child && parent) setParent.run(parent, child);
      }

      const insLink = db.prepare(
        'INSERT OR IGNORE INTO links (note_a, note_b, created_at, user_id) VALUES (?, ?, ?, ?)'
      );
      for (const l of json.links || []) {
        const a = mapId(l.note_a);
        const b = mapId(l.note_b);
        if (!a || !b || a === b) continue;
        insLink.run(Math.min(a, b), Math.max(a, b), l.created_at || new Date().toISOString(), req.userId);
        counts.links++;
      }

      const insTab = db.prepare(
        'INSERT INTO tabs (note_id, sort_order, is_active, created_at, user_id) VALUES (?, ?, ?, ?, ?)'
      );
      let order = 0;
      for (const t of json.tabs || []) {
        const nid = mapId(t.note_id);
        if (!nid) continue;
        insTab.run(nid, t.sort_order != null ? t.sort_order : order++, t.is_active ? 1 : 0, t.created_at || new Date().toISOString(), req.userId);
        counts.tabs++;
      }

      const insRem = db.prepare(
        `INSERT INTO reminders (note_id, user_id, ${REMINDER_COLS.join(', ')})
         VALUES (?, ?, ${REMINDER_COLS.map(() => '?').join(', ')})`
      );
      for (const r of json.reminders || []) {
        const nid = mapId(r.note_id);
        if (!nid) continue;
        insRem.run(nid, req.userId, ...REMINDER_COLS.map((c) => (r[c] === undefined ? null : r[c])));
        counts.reminders++;
      }

      const insNav = db.prepare(
        'INSERT INTO nav_events (user_id, from_note_id, to_note_id, via, created_at) VALUES (?, ?, ?, ?, ?)'
      );
      for (const ev of json.nav_events || []) {
        const to = mapId(ev.to_note_id);
        if (!to) continue; // to_note_id is NOT NULL — drop events we can't anchor
        insNav.run(req.userId, mapId(ev.from_note_id), to, ev.via || 'unknown', ev.created_at || new Date().toISOString());
        counts.navEvents++;
      }

      const insHist = db.prepare(
        'INSERT INTO history (user_id, action, summary, payload, created_at, undone_at) VALUES (?, ?, ?, ?, ?, ?)'
      );
      for (const h of json.history || []) {
        let payload = {};
        try {
          payload = JSON.parse(h.payload || '{}');
        } catch {
          payload = {};
        }
        for (const k of HISTORY_ID_KEYS) {
          if (payload[k] != null) payload[k] = mapId(payload[k]) || payload[k];
        }
        insHist.run(req.userId, h.action || 'update', h.summary || '', JSON.stringify(payload), h.created_at || new Date().toISOString(), h.undone_at || null);
        counts.history++;
      }

      // Digest prefs travel with the account.
      if (json.user && json.user.digest) {
        const d = json.user.digest;
        db.prepare(
          `UPDATE users SET digest_cadence = COALESCE(?, digest_cadence),
             digest_hour = COALESCE(?, digest_hour), digest_tz = COALESCE(?, digest_tz),
             digest_channel = COALESCE(?, digest_channel) WHERE id = ?`
        ).run(d.cadence || null, d.hour != null ? d.hour : null, d.tz || null, d.channel || null, req.userId);
      }
    })();
  } catch (err) {
    console.error('[account] restore failed:', err && err.message);
    return res.status(500).json({ error: `restore failed and was rolled back: ${err.message}` });
  }

  // DB committed — now the filesystem. Write the new attachment files, then drop
  // the ones only the replaced graph used.
  for (const { newBase, buf } of filesToWrite) {
    try {
      fs.writeFileSync(path.join(uploadsDir, newBase), buf);
      counts.attachments++;
    } catch (err) {
      console.error('[account] could not write restored upload', newBase, err && err.message);
    }
  }
  const kept = new Set(fileRenames.values());
  for (const f of oldUploadFiles) {
    if (!kept.has(f)) fs.unlink(path.join(uploadsDir, f), () => {});
  }

  res.json({ ok: true, restored: counts });
});

// --- Account deletion: emailed-link re-auth --------------------------------
// POST /api/account/delete-request  -> mails a one-time confirmation link
// GET  /api/account/delete-confirm  -> the link; performs the irreversible wipe

router.post('/delete-request', async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'no active session' });
  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(401).json({ error: 'no active session' });

  const ok = () => res.status(202).json({ ok: true });
  if (rateLimited(`del:${user.id}`, 3, 30 * 60 * 1000)) return ok();

  const token = crypto.randomBytes(32).toString('base64url');
  const nowMs = Date.now();
  db.prepare(
    `INSERT INTO login_tokens (token_hash, email, created_at, expires_at, purpose)
     VALUES (?, ?, ?, ?, 'delete-account')`
  ).run(
    sha256(token),
    user.email,
    new Date(nowMs).toISOString(),
    new Date(nowMs + DELETE_TOKEN_TTL_MS).toISOString()
  );

  const link = `${originFor(req)}/api/account/delete-confirm?token=${token}`;
  const subject = 'Confirm deleting your notes account';
  const text =
    `Open this link to permanently delete your account and every note, link, ` +
    `reminder and file in it:\n${link}\n\nThis cannot be undone. The link ` +
    `expires in 15 minutes. If you didn't ask to delete your account, ignore ` +
    `this email — nothing happens.`;
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f5f7;padding:24px;color:#1c1e21">
<div style="max-width:520px;margin:auto;background:#fff;border:1px solid #e2e4e9;border-radius:12px;padding:28px;text-align:center">
<h2 style="margin:0 0 12px">Delete your account?</h2>
<p style="font-size:15px;line-height:1.5;margin:0 0 8px">This permanently removes your account and <strong>every note, link, reminder and uploaded file</strong> in it.</p>
<p style="font-size:15px;line-height:1.5;margin:0 0 20px"><strong>It cannot be undone.</strong> Export your data first if you might want it.</p>
<p style="margin:0 0 20px"><a href="${link}" style="display:inline-block;background:#d92c2c;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600">Permanently delete my account</a></p>
<p style="font-size:12px;color:#767a82;margin:0">This link expires in 15 minutes. If you didn't request it, ignore this email — nothing happens.</p>
</div></body></html>`;

  try {
    if (mailer.configured()) {
      await mailer.sendMail({ to: user.email, subject, text, html });
    } else {
      console.log(`[account] mailer not configured — delete link for ${user.email}: ${link}`);
    }
  } catch (err) {
    console.error('[account] failed to send delete link:', err && err.message);
  }
  return ok();
});

function resultDoc(heading, body, ok) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${heading}</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f5f7;margin:0;padding:24px;color:#1c1e21">
<div style="max-width:520px;margin:10vh auto 0;background:#fff;border:1px solid #e2e4e9;border-radius:12px;padding:32px;text-align:center">
<div style="font-size:34px;margin-bottom:8px">${ok ? '✓' : '⚠️'}</div>
<h1 style="font-size:20px;margin:0 0 12px">${heading}</h1>
<p style="font-size:15px;line-height:1.55;margin:0 0 20px">${body}</p>
<a href="/" style="display:inline-block;background:#4f6df5;color:#fff;text-decoration:none;padding:9px 18px;border-radius:8px;font-weight:600">Go to the app</a>
</div></body></html>`;
}

router.get('/delete-confirm', (req, res) => {
  const token = String(req.query.token || '');
  const invalid = (msg) => res.status(400).send(resultDoc('Link no longer valid', msg, false));
  if (!token) return invalid('This link is missing its token.');

  const row = db
    .prepare(
      'SELECT token_hash, email, expires_at, consumed_at, purpose FROM login_tokens WHERE token_hash = ?'
    )
    .get(sha256(token));
  if (!row || row.consumed_at || row.purpose !== 'delete-account' || Date.parse(row.expires_at) < Date.now()) {
    return invalid('This deletion link is invalid, already used, or expired. Start again from Settings if you still want to delete your account.');
  }

  const consumed = db
    .prepare('UPDATE login_tokens SET consumed_at = ? WHERE token_hash = ? AND consumed_at IS NULL')
    .run(new Date().toISOString(), row.token_hash);
  if (consumed.changes !== 1) return invalid('This deletion link was just used.');

  const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(row.email);
  if (!user) {
    return res.status(200).send(resultDoc('Account already gone', 'That account no longer exists.', true));
  }

  // Note the upload files to unlink after the rows are gone.
  const files = new Set();
  for (const n of db.prepare('SELECT attachment_path, content FROM notes WHERE user_id = ?').all(user.id)) {
    for (const f of uploadRefs(n)) files.add(f);
  }

  db.transaction(() => {
    for (const sql of [
      'DELETE FROM reminders WHERE user_id = ?',
      'DELETE FROM import_source WHERE user_id = ?',
      'DELETE FROM import_jobs WHERE user_id = ?',
      'DELETE FROM nav_events WHERE user_id = ?',
      'DELETE FROM history WHERE user_id = ?',
      'DELETE FROM push_subscriptions WHERE user_id = ?',
      'DELETE FROM tabs WHERE user_id = ?',
      'DELETE FROM links WHERE user_id = ?',
      'DELETE FROM notes WHERE user_id = ?',
      'DELETE FROM sessions WHERE user_id = ?',
    ]) {
      db.prepare(sql).run(user.id);
    }
    db.prepare('DELETE FROM login_tokens WHERE email = ?').run(user.email);
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  })();

  for (const f of files) {
    fs.unlink(path.join(uploadsDir, f), () => {});
  }

  res.clearCookie(sessions.SESSION_COOKIE, { path: '/' });
  res.clearCookie(LEGACY_COOKIE, { path: '/' });
  return res
    .status(200)
    .send(
      resultDoc(
        'Account deleted',
        'Your account and every note, link, reminder and file in it have been permanently deleted.',
        true
      )
    );
});

module.exports = router;
