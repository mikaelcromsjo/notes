const fs = require('fs');
const path = require('path');
const express = require('express');

const sessionRouter = require('./routes/session');
const notesRouter = require('./routes/notes');
const linksRouter = require('./routes/links');
const tabsRouter = require('./routes/tabs');
const navRouter = require('./routes/nav');
const statsRouter = require('./routes/stats');

const app = express();
const PORT = process.env.PORT || 8040;
const HOST = process.env.HOST || '127.0.0.1';

const uploadsDir = path.join(__dirname, '..', 'data', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(uploadsDir));

// Resolve the signed-in user from the plain session cookie (no auth yet).
function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

app.use('/api', (req, res, next) => {
  const uid = Number(parseCookies(req.headers.cookie).nico_uid);
  req.userId = Number.isInteger(uid) && uid > 0 ? uid : null;
  next();
});

app.use('/api/session', sessionRouter);

// Everything below the session endpoint needs a user.
app.use('/api', (req, res, next) => {
  if (!req.userId) return res.status(401).json({ error: 'no active session' });
  next();
});

app.use('/api/notes', notesRouter);
app.use('/api/links', linksRouter);
app.use('/api/tabs', tabsRouter);
app.use('/api/nav', navRouter);
app.use('/api/stats', statsRouter);

app.listen(PORT, HOST, () => {
  console.log(`nico-server running at http://${HOST}:${PORT}/`);
});
