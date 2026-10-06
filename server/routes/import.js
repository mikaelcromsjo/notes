const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const db = require('../db');
const importer = require('../importer');

const router = express.Router();

// Whole archive(s) held in memory and handed straight to the runner. Up to
// two files: a notes .zip (or one .md) plus, optionally, the matching
// attachments .zip (this app's export comes as that pair).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 300 * 1024 * 1024, files: 2 },
});

const FORMATS = new Set(['markdown', 'obsidian']);
const now = () => new Date().toISOString();

function safeParse(s) {
  try {
    return JSON.parse(s || '{}');
  } catch {
    return {};
  }
}

const shape = (j) => ({
  id: j.id,
  format: j.format,
  status: j.status,
  totals: safeParse(j.totals),
  error: j.error,
  created_at: j.created_at,
  finished_at: j.finished_at,
});

router.get('/', (req, res) => {
  const jobs = db
    .prepare(
      `SELECT id, format, status, totals, error, created_at, finished_at
       FROM import_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`
    )
    .all(req.userId);
  res.json(jobs.map(shape));
});

router.get('/:jobId', (req, res) => {
  const job = db
    .prepare(
      `SELECT id, format, status, totals, error, created_at, finished_at
       FROM import_jobs WHERE id = ? AND user_id = ?`
    )
    .get(req.params.jobId, req.userId);
  if (!job) return res.status(404).json({ error: 'job not found' });
  res.json(shape(job));
});

router.post('/', upload.array('files', 2), (req, res) => {
  const format = String(req.body.format || '').toLowerCase();
  if (!FORMATS.has(format)) {
    return res.status(400).json({ error: `format must be one of: ${[...FORMATS].join(', ')}` });
  }
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'a .zip or .md file is required' });

  const parts = [];
  for (const f of files) {
    const name = (f.originalname || '').toLowerCase();
    const single = name.endsWith('.md') || name.endsWith('.markdown') || f.mimetype === 'text/markdown';
    const zipish =
      name.endsWith('.zip') || f.mimetype === 'application/zip' || f.mimetype === 'application/x-zip-compressed';
    if (!single && !zipish) {
      return res.status(400).json({ error: 'files must be .zip archives or a single .md file' });
    }
    parts.push({ buf: f.buffer, single, filename: f.originalname });
  }

  const id = crypto.randomUUID();
  db.prepare(
    'INSERT INTO import_jobs (id, user_id, format, status, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, req.userId, format, 'pending', now());

  setImmediate(() => importer.runJob(id, parts));
  res.status(202).json({ jobId: id });
});

module.exports = router;
