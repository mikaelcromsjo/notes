// svc-auth.js: the /_svc/ guard for Node apps. Source of truth: /srv/platform/svc/node/svc-auth.js
// (copy it into the app, don't edit the copy; see /srv/platform/svc/README.md). No dependencies,
// works as Express middleware or with plain http: svc(req, res, next).
//
// Tokens live in a JSON store written only by the `svc token` CLI:
//   { "tokens": [ { id, principal, hash, scopes: [...], created_at, revoked_at, ...app fields } ] }
// The store holds sha256 hashes, never tokens. It is re-read when its mtime changes.
const crypto = require('crypto');
const fs = require('fs');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function tokenStore(file) {
  let mtime = -1;
  let byHash = new Map();
  return function find(hash) {
    let st;
    try {
      st = fs.statSync(file);
    } catch {
      return null;
    }
    if (st.mtimeMs !== mtime) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      byHash = new Map((data.tokens || []).map((t) => [t.hash, t]));
      mtime = st.mtimeMs;
    }
    return byHash.get(hash) || null;
  };
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// Only direct local calls: nginx always adds X-Forwarded-For / X-Real-IP, and a
// browser would bring cookies. Those get a plain 404 so the path looks absent.
function isDirectLocal(req) {
  const h = req.headers;
  return LOOPBACK.has(req.socket.remoteAddress || '') && !h['x-forwarded-for'] && !h['x-real-ip'] && !h.cookie;
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

// opts: { store: path to the token JSON, log: path to the call log (JSON lines),
//         perMinute: request cap per token (default 120) }
// Sets req.svc = { id, principal, scopes:Set, can(scope), token: the store row }.
function svcAuth({ store, log, perMinute = 120 }) {
  const find = tokenStore(store);
  const hits = new Map();
  const write = (entry) => {
    if (log) fs.appendFile(log, JSON.stringify(entry) + '\n', { mode: 0o600 }, () => {});
  };
  return function svc(req, res, next) {
    const t0 = Date.now();
    const path = (req.originalUrl || req.url).split('?')[0];
    const done = (principal) =>
      res.on('finish', () =>
        write({ t: new Date(t0).toISOString(), who: principal, m: req.method, p: path, s: res.statusCode, ms: Date.now() - t0 })
      );
    if (!isDirectLocal(req)) {
      done('-remote');
      return send(res, 404, { error: 'not found' });
    }
    const m = /^Bearer\s+(\S+)$/.exec(req.headers.authorization || '');
    const row = m ? find(sha256(m[1])) : null;
    if (!row || row.revoked_at) {
      done('-badtoken');
      return send(res, 401, { error: 'valid token required' });
    }
    const minute = Math.floor(t0 / 60000);
    const h = hits.get(row.id);
    if (h && h.minute === minute && ++h.n > perMinute) {
      done(row.principal);
      return send(res, 429, { error: 'rate limit' });
    }
    if (!h || h.minute !== minute) hits.set(row.id, { minute, n: 1 });
    const scopes = new Set(row.scopes || []);
    req.svc = { id: row.id, principal: row.principal, scopes, can: (s) => scopes.has(s), token: row };
    done(row.principal);
    next();
  };
}

// Route guard: requireScope('write') -> 403 unless the token has that scope.
function requireScope(scope) {
  return (req, res, next) => (req.svc && req.svc.can(scope) ? next() : send(res, 403, { error: `scope "${scope}" required` }));
}

module.exports = { svcAuth, requireScope, isDirectLocal, sha256 };
