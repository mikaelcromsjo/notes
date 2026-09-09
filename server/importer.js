// Bulk import of notes from other tools. v1 handles a Markdown folder / Obsidian
// vault delivered as a .zip (or a single .md). Runs in-process off a setImmediate
// tick like the schedulers — no external queue. Every source note maps to one
// `notes` row; folders and #tags become hub notes that members link to;
// [[wikilinks]] and relative [md](./x.md) links become graph edges; unresolved
// links are dropped and reported. Re-import UPDATES via import_source, never
// deletes.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const db = require('./db');

const uploadsDir = path.join(__dirname, '..', 'data', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

// Extension allowlist for embedded images (mirrors the MIME allowlist in
// routes/notes.js — SVG deliberately excluded). Anything else is left as text
// and counted as skipped.
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif']);
const STORE_EXT = { '.jpeg': '.jpg' };

const MAX_RECORDS = 5000;
const CHUNK = 200;

const now = () => new Date().toISOString();
const tick = () => new Promise((r) => setImmediate(r));
const toPosix = (p) => String(p).replace(/\\/g, '/').replace(/^\.\//, '');

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v === undefined || v === null || v === '') return [];
  return [v];
}

function stripQuotes(s) {
  const m = /^(["'])(.*)\1$/.exec(s);
  return m ? m[2] : s;
}

function pickDate(v) {
  if (!v || typeof v !== 'string') return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?/.test(s)) {
    const d = new Date(s.replace(' ', 'T'));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

// Minimal YAML front-matter reader — enough for title / tags / aliases / dates.
// Handles `key: value`, inline `[a, b]`, and indented block lists.
function parseFrontMatter(text) {
  if (!text.startsWith('---')) return { data: {}, body: text };
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/.exec(text);
  if (!m) return { data: {}, body: text };
  const data = {};
  let key = null;
  for (const line of m[1].split(/\r?\n/)) {
    const li = /^[ \t]+-[ \t]+(.*)$/.exec(line);
    if (li && key) {
      (data[key] = Array.isArray(data[key]) ? data[key] : []).push(stripQuotes(li[1].trim()));
      continue;
    }
    const km = /^([A-Za-z0-9_-]+)[ \t]*:[ \t]*(.*)$/.exec(line);
    if (!km) continue;
    key = km[1].toLowerCase();
    const raw = km[2].trim();
    if (raw === '') {
      data[key] = [];
    } else if (/^\[.*\]$/.test(raw)) {
      data[key] = raw
        .slice(1, -1)
        .split(',')
        .map((s) => stripQuotes(s.trim()))
        .filter(Boolean);
    } else {
      data[key] = stripQuotes(raw);
    }
  }
  return { data, body: text.slice(m[0].length) };
}

// One source .md file -> a normalized record.
function buildRecord(relPath, text) {
  const { data, body } = parseFrontMatter(text);
  const rel = toPosix(relPath);
  const dir = toPosix(path.posix.dirname(rel));
  const base = path.posix.basename(rel).replace(/\.(md|markdown)$/i, '');

  let title = typeof data.title === 'string' ? data.title.trim() : '';
  if (!title) {
    const h1 = /^#[ \t]+(.+?)[ \t]*$/m.exec(body);
    if (h1) title = h1[1].trim();
  }
  if (!title) title = base || 'Untitled';

  const folders = [];
  if (dir && dir !== '.' && dir !== '') {
    let acc = '';
    for (const seg of dir.split('/').filter(Boolean)) {
      acc = acc ? `${acc}/${seg}` : seg;
      folders.push(acc);
    }
  }

  const noFence = body.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
  const tags = new Set();
  for (const t of asArray(data.tags)) {
    const clean = String(t).replace(/^#/, '').trim();
    if (clean) tags.add(clean);
  }
  const inlineTag = /(?:^|[\s(])#([A-Za-z_][A-Za-z0-9_/-]*)/g;
  let tm;
  while ((tm = inlineTag.exec(noFence))) tags.add(tm[1]);

  const links = [];
  const images = [];

  // `[[link]]` but not `![[embed]]` (handled as an image below).
  const wiki = /(?<!!)\[\[([^\]]+?)\]\]/g;
  let wm;
  while ((wm = wiki.exec(body))) {
    const target = wm[1].split('|')[0].split('#')[0].trim();
    if (target) links.push({ kind: 'wiki', target });
  }

  const embed = /!\[\[([^\]]+?)\]\]/g;
  let em;
  while ((em = embed.exec(body))) {
    const name = em[1].split('|')[0].trim();
    if (/\.(png|jpe?g|gif|webp|heic|heif)$/i.test(name)) {
      images.push({ mode: 'embed', token: em[0], relPath: name });
    }
  }

  const mdLink = /(!?)\[[^\]]*\]\(([^)\s]+)(?:[ \t]+"[^"]*")?\)/g;
  let mm;
  while ((mm = mdLink.exec(body))) {
    let href = mm[2].trim();
    try {
      href = decodeURI(href);
    } catch {
      /* keep raw */
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#')) continue;
    href = href.replace(/^\.\//, '');
    const abs = dir && dir !== '.' ? toPosix(path.posix.join(dir, href)) : href;
    if (mm[1] === '!') {
      images.push({ mode: 'md', token: `](${mm[2]})`, relPath: abs });
    } else if (/\.(md|markdown)$/i.test(href)) {
      links.push({ kind: 'path', target: abs });
    }
  }

  return {
    sourceKey: rel,
    title,
    markdown: body,
    folders,
    tags: [...tags],
    links,
    images,
    createdAt: pickDate(data.created || data.date || data['created-at']),
    updatedAt: pickDate(data.updated || data.modified || data['updated-at']),
  };
}

function parseArchive(buf) {
  const zip = new AdmZip(buf);
  const records = [];
  const assets = new Map();
  const assetsByBase = new Map();
  for (const e of zip.getEntries()) {
    if (e.isDirectory) continue;
    const rel = toPosix(e.entryName);
    if (/(^|\/)(\.obsidian|\.trash|\.git|\.smart-env|__MACOSX)(\/|$)/.test(rel)) continue;
    if (/(^|\/)\.[^/]+$/.test(rel)) continue;
    if (/\.(md|markdown)$/i.test(rel)) {
      records.push(buildRecord(rel, e.getData().toString('utf8')));
    } else {
      assets.set(rel, e.getData());
      const b = rel.split('/').pop().toLowerCase();
      if (!assetsByBase.has(b)) assetsByBase.set(b, rel);
    }
  }
  return { records, assets, assetsByBase };
}

async function ingest({ userId, format, records, assets, assetsByBase }) {
  const totals = {
    notes: 0,
    updated: 0,
    links: 0,
    hubs: 0,
    images: 0,
    skipped: 0,
    unresolved: [],
    unresolvedCount: 0,
  };

  const getSource = db.prepare(
    'SELECT note_id FROM import_source WHERE user_id = ? AND format = ? AND source_key = ?'
  );
  const putSource = db.prepare(
    'INSERT OR IGNORE INTO import_source (user_id, format, source_key, note_id) VALUES (?, ?, ?, ?)'
  );
  const insNote = db.prepare(
    `INSERT INTO notes (title, content, created_at, updated_at, type, user_id)
     VALUES (?, ?, ?, ?, 'text', ?)`
  );
  const updNote = db.prepare(
    'UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ? AND user_id = ?'
  );
  const insLink = db.prepare(
    'INSERT OR IGNORE INTO links (note_a, note_b, created_at, user_id) VALUES (?, ?, ?, ?)'
  );

  // Resolve tables: existing notes first so imported links prefer a real note
  // the user already had; then filled in as records are inserted.
  const keyToId = new Map();
  const titleToId = new Map();
  for (const r of db
    .prepare("SELECT id, title FROM notes WHERE user_id = ? AND status != 'deleted'")
    .all(userId)) {
    const k = (r.title || '').trim().toLowerCase();
    if (k && !titleToId.has(k)) titleToId.set(k, r.id);
  }

  // Copy embedded images into /uploads and rewrite the markdown to point at
  // them, before the note rows are written so `content` is final.
  for (const r of records) {
    for (const img of r.images) {
      if (!img.token || img.token.length < 3) {
        totals.skipped += 1;
        continue;
      }
      const relExact = assets.has(img.relPath) ? img.relPath : null;
      const relBase = assetsByBase.get((img.relPath.split('/').pop() || '').toLowerCase());
      const rel = relExact || relBase;
      const bufImg = rel ? assets.get(rel) : null;
      const ext = path.posix.extname(rel || img.relPath).toLowerCase();
      if (!bufImg || !IMAGE_EXT.has(ext)) {
        totals.skipped += 1;
        continue;
      }
      const fname = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${STORE_EXT[ext] || ext}`;
      fs.writeFileSync(path.join(uploadsDir, fname), bufImg);
      const repl = img.mode === 'embed' ? `![](/uploads/${fname})` : `](/uploads/${fname})`;
      r.markdown = r.markdown.split(img.token).join(repl);
      totals.images += 1;
    }
  }

  // Pass 1 — create or update every note.
  for (let i = 0; i < records.length; i += CHUNK) {
    const slice = records.slice(i, i + CHUNK);
    db.transaction(() => {
      for (const r of slice) {
        const existing = getSource.get(userId, format, r.sourceKey);
        const ca = r.createdAt || now();
        const ua = r.updatedAt || ca;
        if (existing) {
          updNote.run(r.title, r.markdown, ua, existing.note_id, userId);
          r.noteId = existing.note_id;
          totals.updated += 1;
        } else {
          r.noteId = insNote.run(r.title, r.markdown, ca, ua, userId).lastInsertRowid;
          putSource.run(userId, format, r.sourceKey, r.noteId);
          totals.notes += 1;
        }
        keyToId.set(r.sourceKey, r.noteId);
        const tk = r.title.trim().toLowerCase();
        if (tk && !titleToId.has(tk)) titleToId.set(tk, r.noteId);
      }
    })();
    await tick();
  }

  // Get-or-create a hub note (folder or tag) keyed by a synthetic source_key.
  const hubId = (kind, name, label) => {
    const key = `hub:${kind}:${name}`;
    const ex = getSource.get(userId, format, key);
    if (ex) return ex.note_id;
    const t = now();
    const id = insNote.run(label, '', t, t, userId).lastInsertRowid;
    putSource.run(userId, format, key, id);
    totals.hubs += 1;
    return id;
  };

  const linkPair = (a, b) => {
    if (!a || !b || a === b) return;
    const info = insLink.run(Math.min(a, b), Math.max(a, b), now(), userId);
    if (info.changes) totals.links += 1;
  };

  const unresolved = new Set();

  // Pass 2 — folder/tag hubs and cross links.
  for (let i = 0; i < records.length; i += CHUNK) {
    const slice = records.slice(i, i + CHUNK);
    db.transaction(() => {
      for (const r of slice) {
        let prevHub = null;
        for (const f of r.folders) {
          const h = hubId('folder', f.toLowerCase(), f.split('/').pop());
          if (prevHub) linkPair(prevHub, h);
          prevHub = h;
        }
        if (prevHub) linkPair(prevHub, r.noteId);

        for (const t of r.tags) linkPair(hubId('tag', t.toLowerCase(), `#${t}`), r.noteId);

        for (const l of r.links) {
          const tid =
            l.kind === 'path'
              ? keyToId.get(toPosix(l.target))
              : titleToId.get(l.target.trim().toLowerCase());
          if (tid) linkPair(r.noteId, tid);
          else unresolved.add(l.target);
        }
      }
    })();
    await tick();
  }

  totals.unresolvedCount = unresolved.size;
  totals.unresolved = [...unresolved].slice(0, 100);
  return totals;
}

async function runJob(jobId, buf, opts = {}) {
  const job = db.prepare('SELECT * FROM import_jobs WHERE id = ?').get(jobId);
  if (!job) return;
  const finish = db.prepare(
    'UPDATE import_jobs SET status = ?, totals = ?, error = ?, finished_at = ? WHERE id = ?'
  );
  try {
    db.prepare('UPDATE import_jobs SET status = ? WHERE id = ?').run('running', jobId);
    let parsed;
    if (opts.single) {
      parsed = {
        records: [buildRecord(opts.filename || 'note.md', buf.toString('utf8'))],
        assets: new Map(),
        assetsByBase: new Map(),
      };
    } else {
      parsed = parseArchive(buf);
    }
    if (parsed.records.length === 0) throw new Error('no .md files found in the upload');
    if (parsed.records.length > MAX_RECORDS) {
      throw new Error(`upload has ${parsed.records.length} notes; the limit is ${MAX_RECORDS}`);
    }
    const totals = await ingest({ userId: job.user_id, format: job.format, ...parsed });
    finish.run('done', JSON.stringify(totals), null, now(), jobId);
  } catch (e) {
    finish.run('error', job.totals, String((e && e.message) || e).slice(0, 500), now(), jobId);
  }
}

module.exports = { runJob, buildRecord, parseArchive, parseFrontMatter };
