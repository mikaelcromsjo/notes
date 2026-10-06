// Pure logic for the account's zero-knowledge note-content encryption —
// docs/plan/08-offline-privacy.md §3.3/§3.4. The server never sees a
// plaintext recovery key or the derived AES key, and never encrypts or
// decrypts anything itself: it only stores/returns whatever bytes the client
// hands it (salt, iteration count, ciphertext). All crypto happens in
// public/crypto.js.
//
// Two account-level flags, deliberately kept separate:
//   enc_salt / enc_iterations — set once, at the "Set up encryption" ceremony
//     (milestone 3). Not secret (a KDF salt/work-factor is meant to be
//     public); this alone encrypts nothing.
//   enc_enabled_at — set once the one-time re-encryption migration below has
//     actually run. From this instant on, `notes.content` is ciphertext for
//     this user, for every future read/write, account-wide. There is no
//     partial-migration state: migrate() re-encrypts every note in a single
//     transaction and flips the flag atomically.
const { HttpError } = require('./http-error');

const now = () => new Date().toISOString();

// Generous bounds — not a security boundary (the client always sends a value
// it just used to derive its own key), just sanity limits against a garbage
// or hostile request.
const MIN_ITERATIONS = 100000;
const MAX_ITERATIONS = 5000000;

function getPrefs(db, userId) {
  const row = db
    .prepare('SELECT enc_salt, enc_iterations, enc_enabled_at FROM users WHERE id = ?')
    .get(userId);
  if (!row) throw new HttpError(404, 'not found');
  return {
    salt: row.enc_salt,
    iterations: row.enc_iterations,
    enabled: Boolean(row.enc_enabled_at),
  };
}

// Record the KDF parameters a device just used to derive its key. Callable
// again before enable (e.g. the ceremony was abandoned and restarted) but
// never once content has actually been re-encrypted — changing the salt
// afterwards would orphan it.
function setup(db, userId, { salt, iterations }) {
  if (typeof salt !== 'string' || salt.length < 16 || salt.length > 256) {
    throw new HttpError(400, 'salt must be a base64 string');
  }
  const iter = Number(iterations);
  if (!Number.isInteger(iter) || iter < MIN_ITERATIONS || iter > MAX_ITERATIONS) {
    throw new HttpError(400, `iterations must be between ${MIN_ITERATIONS} and ${MAX_ITERATIONS}`);
  }
  const row = db.prepare('SELECT enc_enabled_at FROM users WHERE id = ?').get(userId);
  if (!row) throw new HttpError(404, 'not found');
  if (row.enc_enabled_at) throw new HttpError(409, 'encryption is already enabled; salt is fixed');

  db.prepare('UPDATE users SET enc_salt = ?, enc_iterations = ? WHERE id = ?').run(salt, iter, userId);
  return getPrefs(db, userId);
}

// Undo setup() — only before enable() has ever run (nothing encrypted yet,
// so there's nothing to lose). Lets an abandoned ceremony start clean.
function cancelSetup(db, userId) {
  const row = db.prepare('SELECT enc_enabled_at FROM users WHERE id = ?').get(userId);
  if (!row) throw new HttpError(404, 'not found');
  if (row.enc_enabled_at) throw new HttpError(409, 'encryption is already enabled; cannot cancel');
  db.prepare('UPDATE users SET enc_salt = NULL, enc_iterations = NULL WHERE id = ?').run(userId);
}

// The one-time re-encryption migration (§3.4). `items` is the client's own
// encrypt-every-note-with-the-freshly-derived-key pass over its
// GET /api/notes/full pull — the server does no crypto, just writes the
// bytes it's given and flips enc_enabled_at, all inside one transaction so
// there's no window where some notes are ciphertext and others aren't.
function migrate(db, userId, items) {
  const prefs = getPrefs(db, userId);
  if (!prefs.salt) throw new HttpError(400, 'call setup first');
  if (prefs.enabled) throw new HttpError(409, 'encryption is already enabled');
  if (!Array.isArray(items)) throw new HttpError(400, 'items must be an array');

  const ownedIds = new Set(
    db.prepare('SELECT id FROM notes WHERE user_id = ?').all(userId).map((r) => r.id)
  );
  for (const item of items) {
    if (!item || !ownedIds.has(Number(item.id)) || typeof item.content !== 'string') {
      throw new HttpError(400, 'every item must be { id, content } for a note you own');
    }
  }

  const updateContent = db.prepare('UPDATE notes SET content = ? WHERE id = ?');
  const runMigration = db.transaction(() => {
    for (const item of items) updateContent.run(item.content, Number(item.id));
    db.prepare('UPDATE users SET enc_enabled_at = ? WHERE id = ?').run(now(), userId);
  });
  runMigration();

  return { ok: true, count: items.length };
}

// Background catch-up for content written while the server couldn't
// encrypt (it never holds the key): mail-in notes (server/mail-ingest.js),
// the Markdown importer, a backup restore of older plaintext rows, notes
// moved back out of a shared space by someone else or by undo. And the
// mirror case: notes the account owns inside a shared space must be
// plaintext (no other member has this key — see public/app.js's
// encryptOutgoing), so any still-ciphertext one there gets decrypted.
//
// pending() lists both sides; sweep() writes back what the client
// converted. Neither touches updated_at or history — the text itself is
// unchanged, only its at-rest encoding.
const PREFIX = 'ncv1:';
const isCipher = (s) => typeof s === 'string' && s.startsWith(PREFIX);

function pending(db, userId) {
  if (!getPrefs(db, userId).enabled) return { encrypt: [], decrypt: [] };
  return {
    encrypt: db
      .prepare(
        "SELECT id, content FROM notes WHERE user_id = ? AND share_id IS NULL AND content IS NOT NULL AND content NOT LIKE 'ncv1:%'"
      )
      .all(userId),
    decrypt: db
      .prepare("SELECT id, content FROM notes WHERE user_id = ? AND share_id IS NOT NULL AND content LIKE 'ncv1:%'")
      .all(userId),
  };
}

// Writes one converted note, compare-and-set on the exact text the client
// read (`expect`) so a concurrent real edit always wins. Personal notes may
// only go plaintext -> ciphertext, space notes only ciphertext -> plaintext.
// Returns whether it wrote. Caller owns the transaction.
function convertOne(db, userId, item) {
  const id = Number(item && item.id);
  const { content, expect } = item || {};
  if (!Number.isInteger(id) || typeof content !== 'string' || typeof expect !== 'string') {
    throw new HttpError(400, 'every item must be { id, content, expect }');
  }
  const note = db.prepare('SELECT share_id FROM notes WHERE id = ? AND user_id = ?').get(id, userId);
  if (!note) return false;
  const toCipher = note.share_id == null;
  if (isCipher(content) !== toCipher || isCipher(expect) === toCipher) return false;
  return db.prepare('UPDATE notes SET content = ? WHERE id = ? AND content = ?').run(content, id, expect).changes > 0;
}

function sweep(db, userId, items) {
  if (!getPrefs(db, userId).enabled) throw new HttpError(409, 'encryption is not enabled');
  if (!Array.isArray(items)) throw new HttpError(400, 'items must be an array');
  let count = 0;
  db.transaction(() => {
    for (const item of items) if (convertOne(db, userId, item)) count++;
  })();
  return { ok: true, count };
}

module.exports = { getPrefs, setup, cancelSetup, migrate, pending, sweep, convertOne, isCipher, MIN_ITERATIONS, MAX_ITERATIONS };
