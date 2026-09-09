const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const db = require('../db');
const importer = require('../importer');

const router = express.Router();

// Whole archive is held in memory and handed straight to the runner.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
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

router.post('/', upload.single('file'), (req, res) => {
  const format = String(req.body.format || '').toLowerCase();
  if (!FORMATS.has(format)) {
    return res.status(400).json({ error: `format must be one of: ${[...FORMATS].join(', ')}` });
  }
  if (!req.file) return res.status(400).json({ error: 'a .zip or .md file is required' });

  const name = (req.file.originalname || '').toLowerCase();
  const single =
    name.endsWith('.md') || name.endsWith('.markdown') || req.file.mimetype === 'text/markdown';
  const zipish =
    name.endsWith('.zip') ||
    req.file.mimetype === 'application/zip' ||
    req.file.mimetype === 'application/x-zip-compressed';
  if (!single && !zipish) {
    return res.status(400).json({ error: 'file must be a .zip archive or a single .md file' });
  }

  const id = crypto.randomUUID();
  db.prepare(
    'INSERT INTO import_jobs (id, user_id, format, status, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, req.userId, format, 'pending', now());

  const buf = req.file.buffer;
  setImmediate(() => importer.runJob(id, buf, { single, filename: req.file.originalname }));
  res.status(202).json({ jobId: id });
});

module.exports = router;
