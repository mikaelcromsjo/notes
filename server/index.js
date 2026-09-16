const fs = require('fs');
const path = require('path');
const express = require('express');

const db = require('./db');
const sessions = require('./sessions');
const sessionRouter = require('./routes/session');
const authRouter = require('./routes/auth');
const notesRouter = require('./routes/notes');
const linksRouter = require('./routes/links');
const tabsRouter = require('./routes/tabs');
const navRouter = require('./routes/nav');
const statsRouter = require('./routes/stats');
const alarmsRouter = require('./routes/alarms');
const agendaRouter = require('./routes/agenda');
const digestRouter = require('./routes/digest');
const digestPageRouter = require('./routes/digest-page');
const pushRouter = require('./routes/push');
const widgetRouter = require('./routes/widget');
const historyRouter = require('./routes/history');
const importRouter = require('./routes/import');
const onboardingRouter = require('./routes/onboarding');
const shareRouter = require('./routes/share');
const accountRouter = require('./routes/account');
const alarmScheduler = require('./alarm-scheduler');
const digestScheduler = require('./digest-scheduler');

const app = express();
const PORT = process.env.PORT || 8040;
const HOST = process.env.HOST || '127.0.0.1';

const uploadsDir = path.join(__dirname, '..', 'data', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

app.use(express.json());

// Marketing landing page for signed-out visitors; signed-in users (and
// anyone who has ever had a session, valid or expired) go straight to the
// app, matching the existing behaviour before this route existed.
// `/app` always serves the app shell directly, e.g. as a link target from
// the landing page.
app.get('/', (req, res) => {
  sessions.sweepExpired();
  const cookies = parseCookies(req.headers.cookie);
  const sess = sessions.resolve(cookies[sessions.SESSION_COOKIE]);
  const legacyUid = Number(cookies[sessions.LEGACY_COOKIE]);
  const loggedIn = Boolean(sess) || (Number.isInteger(legacyUid) && legacyUid > 0);
  res.sendFile(path.join(__dirname, '..', 'public', loggedIn ? 'index.html' : 'landing.html'));
});

app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, '..', 'public')));
// Defence in depth for user uploads: forbid MIME sniffing and load any file
// that is opened top-level as a scriptless, opaque-origin document.
app.use(
  '/uploads',
  (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    next();
  },
  express.static(uploadsDir)
);

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

// Resolve the session cookie into req.userId for the API and the PWA share
// target (which is a top-level POST from the OS, not an /api call).
function resolveSession(req, res, next) {
  sessions.sweepExpired();
  const cookies = parseCookies(req.headers.cookie);

  const sess = sessions.resolve(cookies[sessions.SESSION_COOKIE]);
  if (sess) {
    req.userId = sess.user_id;
    req.sessionId = sess.id;
    return next();
  }

  // One-release migration shim: a valid legacy raw-id cookie is silently
  // upgraded to a real session, then cleared.
  const legacyUid = Number(cookies[sessions.LEGACY_COOKIE]);
  if (Number.isInteger(legacyUid) && legacyUid > 0) {
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(legacyUid);
    if (user) {
      const token = sessions.create(user.id, req);
      res.cookie(sessions.SESSION_COOKIE, token, sessions.COOKIE_OPTS);
      res.clearCookie(sessions.LEGACY_COOKIE, { path: '/' });
      req.userId = user.id;
      req.sessionId = token;
      return next();
    }
  }

  req.userId = null;
  next();
}

app.use(['/api', '/share'], resolveSession);

app.use('/api/session', sessionRouter);
// Magic-link login: issues/consumes tokens, so it must sit above the cookie gate.
app.use('/api/auth', authRouter);

// Token-authed (widget_token query param), so these sit above the cookie gate.
app.use('/api/widget', widgetRouter);
app.use('/digest', digestPageRouter);

// Account export + deletion. `delete-confirm` is authed by its emailed one-time
// token (not the cookie), so the router sits above the 401 gate; its cookie-only
// routes re-check req.userId themselves.
app.use('/api/account', accountRouter);

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
app.use('/api/alarms', alarmsRouter);
app.use('/api/agenda', agendaRouter);
app.use('/api/digest', digestRouter);
app.use('/api/push', pushRouter);
app.use('/api/history', historyRouter);
app.use('/api/import', importRouter);
app.use('/api/onboarding', onboardingRouter);

// PWA share target — a top-level multipart POST from the OS share sheet, so it
// lives outside /api (and its 401 gate); resolveSession above still runs.
app.use('/share', shareRouter);

app.listen(PORT, HOST, () => {
  console.log(`nico-server running at http://${HOST}:${PORT}/`);
});

alarmScheduler.start();
digestScheduler.start();
