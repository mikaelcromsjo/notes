const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const db = require('../db');
const sessions = require('../sessions');
const mailer = require('../mailer');
const { uploadsDir, IMAGE_EXT, AUDIO_EXT, FILE_EXT } = require('../upload-config');
const history = require('../history');
const snapshots = require('../snapshots');

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

// Every /uploads/<file> a note points at: its attachment_path plus any inline
// ![](...) embeds in the markdown. Inline embeds are invisible here once the
// account encrypts content — the client adds those (see POST /attachments).
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

const SAFE_UPLOAD_NAME = /^[A-Za-z0-9._-]+$/;
const stamp = () => new Date().toISOString().slice(0, 10);

// Backup and export are two downloads each, sharing the second one:
//   backup = GET  /backup       -> notes-backup-<date>.zip  (account.db, exact,
//                                  content still encrypted if the account is)
//   export = client-built          notes-export-<date>.zip  (Markdown, decrypted
//                                  in the browser — public/app.js's exportNotes)
//   both   = POST /attachments  -> notes-attachments-<date>.zip (attachments/…)
// Keeping attachments out of the other two means neither the server nor the
// browser has to rebuild a big zip around them just to add a small file.

// --- GET /api/account/backup -------------------------------------------------
router.get('/backup', (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'no active session' });
  if (rateLimited(`backup:${req.userId}`, 10, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'too many backups — try again later' });
  }
  const zip = new AdmZip();
  zip.addFile('account.db', snapshots.writeAccountDb(req.userId));
  const buf = zip.toBuffer();
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="notes-backup-${stamp()}.zip"`);
  res.setHeader('Content-Length', buf.length);
  res.end(buf);
});

// --- POST /api/account/attachments -------------------------------------------
// A form post (hidden iframe target, so the browser downloads it without
// leaving the app). `names` = comma-separated upload basenames the client
// found inline in decrypted note text, which the server can't see itself;
// /uploads is already served by name, so a name is all a caller needs anyway.
router.post('/attachments', express.urlencoded({ extended: false, limit: '2mb' }), (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'no active session' });
  if (rateLimited(`attachments:${req.userId}`, 10, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'too many downloads — try again later' });
  }
  const names = new Set();
  for (const n of db.prepare('SELECT attachment_path, content FROM notes WHERE user_id = ?').all(req.userId)) {
    for (const f of uploadRefs(n)) names.add(f);
  }
  for (const r of db.prepare('SELECT path FROM theme_images WHERE user_id = ?').all(req.userId)) {
    names.add(path.basename(r.path));
  }
  for (const f of String((req.body && req.body.names) || '').split(',')) {
    if (f) names.add(f.trim());
  }

  const zip = new AdmZip();
  for (const f of names) {
    if (!SAFE_UPLOAD_NAME.test(f)) continue;
    const p = path.join(uploadsDir, f);
    try {
      if (!fs.statSync(p).isFile()) continue;
      zip.addFile(`attachments/${f}`, fs.readFileSync(p));
      zip.getEntry(`attachments/${f}`).header.method = 0; // stored: media is already compressed
    } catch {
      /* missing or unreadable — skip rather than fail the whole download */
    }
  }
  const buf = zip.toBuffer();
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="notes-attachments-${stamp()}.zip"`);
  res.setHeader('Content-Length', buf.length);
  res.end(buf);
});

// --- Restore from a downloaded backup ---------------------------------------
// POST /import/check (the backup .zip, optionally the attachments .zip too)
// stages the upload(s) and reports what a restore would do; POST
// /import/apply { token, filesToken } does it, exactly, through
// server/snapshots.js. Attachment files are only written when missing on
// this server — so restoring on the same server needs the backup alone. A
// server snapshot is taken first, so the restore is undoable. 1 GB cap here —
// nginx's client_max_body_size for this site must allow it too.
// Uploads land straight in snapshots/staging (same filesystem as the
// database, so staging is a rename, never a cross-device copy).
const restoreUpload = multer({
  dest: snapshots.stagingDir,
  limits: { fileSize: 1024 * 1024 * 1024, files: 2 },
});
const RESTORE_FILE_EXT = new Set([...Object.values(IMAGE_EXT), ...Object.values(AUDIO_EXT), ...Object.values(FILE_EXT), '.jpeg']);

function zipOf(filePath) {
  try {
    return new AdmZip(filePath);
  } catch {
    return null;
  }
}

// attachments/<file> entries we'd be willing to write back (allowlisted
// extension, plain basename — never trust a path from the archive).
function restorableFiles(zip) {
  const out = new Map();
  if (!zip) return out;
  for (const e of zip.getEntries()) {
    if (e.isDirectory || !e.entryName.startsWith('attachments/')) continue;
    const base = path.basename(e.entryName);
    if (!SAFE_UPLOAD_NAME.test(base) || !RESTORE_FILE_EXT.has(path.extname(base).toLowerCase())) continue;
    out.set(base, e);
  }
  return out;
}

router.post('/import/check', restoreUpload.array('files', 2), (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'no active session' });
  const uploaded = req.files || [];
  let token = null;
  let filesToken = null;
  const drop = () => {
    if (token) snapshots.dropStaged(req.userId, token);
    if (filesToken) snapshots.dropStaged(req.userId, filesToken);
  };
  for (const f of uploaded) {
    const t = snapshots.stageUpload(req.userId, f.path);
    const zip = zipOf(snapshots.stagedPath(req.userId, t));
    if (zip && zip.getEntry('account.db') && !token) token = t;
    else if (zip && restorableFiles(zip).size && !filesToken) filesToken = t;
    else snapshots.dropStaged(req.userId, t);
  }
  if (!token) {
    drop();
    return res.status(400).json({ error: 'choose the backup .zip (notes-backup-…) — it holds account.db' });
  }

  const zip = zipOf(snapshots.stagedPath(req.userId, token));
  const tmp = snapshots.scratchPath('check');
  try {
    fs.writeFileSync(tmp, zip.getEntry('account.db').getData(), { mode: 0o600 });
    const analysis = snapshots.analyzeFile(req.userId, tmp);
    const referenced = snapshots.referencedUploads(tmp);
    const inZip = filesToken ? restorableFiles(zipOf(snapshots.stagedPath(req.userId, filesToken))) : new Map();
    const missingOnServer = [...referenced].filter((f) => !fs.existsSync(path.join(uploadsDir, f)));
    res.json({
      token,
      filesToken,
      ...analysis,
      files: {
        referenced: referenced.size,
        toWrite: [...inZip.keys()].filter((f) => !fs.existsSync(path.join(uploadsDir, f))).length,
        unavailable: missingOnServer.filter((f) => !inZip.has(f)).length,
      },
    });
  } catch (err) {
    drop();
    res.status(400).json({ error: `could not read the backup: ${err.message}` });
  } finally {
    fs.unlink(tmp, () => {});
  }
});

router.post('/import/apply', express.json(), (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'no active session' });
  const { token, filesToken } = req.body || {};
  const staged = snapshots.stagedPath(req.userId, token);
  if (!staged) return res.status(404).json({ error: 'that upload has expired — choose the file again' });
  const filesStaged = filesToken ? snapshots.stagedPath(req.userId, filesToken) : null;
  if (filesToken && !filesStaged) return res.status(404).json({ error: 'that upload has expired — choose the files again' });
  const entry = zipOf(staged)?.getEntry('account.db');
  if (!entry) return res.status(400).json({ error: 'not a backup .zip' });

  const tmp = snapshots.scratchPath('apply');
  try {
    fs.writeFileSync(tmp, entry.getData(), { mode: 0o600 });
    snapshots.analyzeFile(req.userId, tmp); // validates before anything changes
    let before;
    try {
      before = snapshots.takeSnapshot(req.userId, 'pre-restore');
    } catch (err) {
      console.error('[account] pre-restore snapshot failed:', err && err.message);
      return res.status(500).json({ error: 'could not save a snapshot of your current notes first — nothing was changed' });
    }
    // Every allowlisted file the server is missing, same name (the notes
    // refer to it by name). Not limited to what account.db visibly
    // references: an encrypted account's inline embeds can't be seen here.
    let filesWritten = 0;
    for (const [base, e] of restorableFiles(filesStaged && zipOf(filesStaged))) {
      const dest = path.join(uploadsDir, base);
      if (fs.existsSync(dest)) continue;
      fs.writeFileSync(dest, e.getData());
      filesWritten++;
    }
    const result = snapshots.restoreFromFile(req.userId, tmp, { untrusted: true });
    const historyId = history.record(
      req.userId,
      'restore',
      { before, after: null },
      `Restored backup (${result.restored.notes} notes)`
    );
    res.json({ ok: true, ...result, restored: { ...result.restored, attachments: filesWritten }, historyId });
  } catch (err) {
    console.error('[account] restore failed:', err && err.message);
    res.status(500).json({ error: `restore failed and was rolled back: ${err.message}` });
  } finally {
    fs.unlink(tmp, () => {});
    snapshots.dropStaged(req.userId, token);
    if (filesToken) snapshots.dropStaged(req.userId, filesToken);
  }
});

// --- Server backups (exact snapshots, see server/snapshots.js) -------------
// Unlike the .zip download these are lossless (every column of every row,
// spaces and references included) but live on this server — they don't
// contain the attachment files themselves, which stay in /uploads.
router.get('/snapshots', (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'no active session' });
  res.json(snapshots.listSnapshots(req.userId));
});

router.post('/snapshots', (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'no active session' });
  if (rateLimited(`snapshot:${req.userId}`, 10, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'too many backups — try again later' });
  }
  try {
    const id = snapshots.takeSnapshot(req.userId, 'manual');
    res.status(201).json(snapshots.listSnapshots(req.userId).find((s) => s.id === id));
  } catch (err) {
    console.error('[account] snapshot failed:', err && err.message);
    res.status(500).json({ error: 'could not create the backup' });
  }
});

// What restoring it would do (an older snapshot may lack newer columns).
router.get('/snapshots/:id/check', (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'no active session' });
  if (!snapshots.ownsSnapshot(req.userId, req.params.id)) return res.status(404).json({ error: 'backup not found' });
  try {
    res.json(snapshots.analyzeSnapshot(req.userId, req.params.id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Restore = same undoable swap as undoing a .zip restore: snapshot what's
// here now (the undo point), load the chosen one, record a 'restore' entry.
router.post('/snapshots/:id/restore', (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'no active session' });
  const id = req.params.id;
  if (!snapshots.ownsSnapshot(req.userId, id)) return res.status(404).json({ error: 'backup not found' });
  let before;
  try {
    before = snapshots.takeSnapshot(req.userId, 'pre-restore');
    snapshots.restoreUserFromSnapshot(req.userId, id);
  } catch (err) {
    console.error('[account] snapshot restore failed:', err && err.message);
    return res.status(500).json({ error: `restore failed and was rolled back: ${err.message}` });
  }
  const when = new Date(Number(id.split('-')[1])).toISOString().slice(0, 16).replace('T', ' ');
  const historyId = history.record(req.userId, 'restore', { before, after: null }, `Restored server backup from ${when} UTC`);
  res.json({ ok: true, historyId });
});

router.delete('/snapshots/:id', (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'no active session' });
  if (!snapshots.deleteSnapshot(req.userId, req.params.id)) return res.status(404).json({ error: 'backup not found' });
  res.status(204).end();
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
      'DELETE FROM reminder_events WHERE user_id = ?',
      'DELETE FROM import_source WHERE user_id = ?',
      'DELETE FROM import_jobs WHERE user_id = ?',
      'DELETE FROM nav_events WHERE user_id = ?',
      'DELETE FROM history WHERE user_id = ?',
      'DELETE FROM push_subscriptions WHERE user_id = ?',
      'DELETE FROM location_log WHERE user_id = ?',
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
