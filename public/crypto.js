// Zero-knowledge note-content encryption — the client-only crypto helper for
// docs/plan/08-offline-privacy.md §3.3/§3.4. Loaded as a plain IIFE before
// app.js, exposed as window.NicoCrypto. The server (server/encryption.js)
// never requires this file and never sees a plaintext recovery key or the
// derived key — it only stores/returns whatever bytes it's given.
//
// Format written to notes.content once an account has opted in:
//   "ncv1:" + base64(iv, 12 bytes) + ":" + base64(AES-GCM ciphertext)
// There is no per-note "is this encrypted" flag: encryption is an
// account-wide, one-way switch (see server/encryption.js's enc_enabled_at),
// so the caller always knows from GET /api/session whether to expect this
// format for the signed-in account.
(() => {
  const PREFIX = 'ncv1:';
  const PBKDF2_HASH = 'SHA-256';
  const AES_KEY_LEN = 256;
  const IV_BYTES = 12;
  // Recovery key: 20 random bytes -> Crockford base32 (no 0/O/1/I/L
  // ambiguity), grouped for readability. ~100 bits of entropy either way;
  // this is a "write it down and never lose it" secret, not a memorized
  // password, so length is not a usability concern the way it would be for
  // one the account still needs to *type from memory* day to day.
  const RECOVERY_BYTES = 20;
  const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

  function toBase64(bytes) {
    let bin = '';
    for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
    return btoa(bin);
  }
  function fromBase64(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // A fresh, high-entropy recovery key the account has never seen before —
  // shown once at setup, required to be re-typed on every other device (no
  // server-mediated recovery: see docs/plan/08-offline-privacy.md §6).
  function generateRecoveryKey() {
    const bytes = crypto.getRandomValues(new Uint8Array(RECOVERY_BYTES));
    let chars = '';
    for (const b of bytes) chars += CROCKFORD[b % 32];
    return chars.match(/.{1,4}/g).join('-');
  }

  // Same normalization on entry as on display, so a re-typed key with
  // stray whitespace/case/dashes still matches: uppercase, strip everything
  // that isn't a Crockford character, then re-group for display consistency.
  function normalizeRecoveryKey(input) {
    const clean = String(input || '')
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, '')
      // Crockford's own letter substitutions for characters it excludes.
      .replace(/O/g, '0')
      .replace(/[IL]/g, '1');
    return clean;
  }

  async function deriveKey(recoveryKey, saltB64, iterations) {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(normalizeRecoveryKey(recoveryKey)),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: fromBase64(saltB64), iterations, hash: PBKDF2_HASH },
      keyMaterial,
      { name: 'AES-GCM', length: AES_KEY_LEN },
      true, // extractable — so it can be exported into IndexedDB, see exportKey below
      ['encrypt', 'decrypt']
    );
  }

  function randomSalt() {
    return toBase64(crypto.getRandomValues(new Uint8Array(16)));
  }

  async function exportKeyRaw(key) {
    return toBase64(await crypto.subtle.exportKey('raw', key));
  }
  function importKeyRaw(raw) {
    return crypto.subtle.importKey('raw', fromBase64(raw), 'AES-GCM', true, ['encrypt', 'decrypt']);
  }

  async function encryptText(key, plaintext) {
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(String(plaintext ?? ''))
    );
    return `${PREFIX}${toBase64(iv)}:${toBase64(ciphertext)}`;
  }

  // Throws on a wrong key or corrupt blob — callers decide how to surface that
  // (see public/app.js's "Not available offline"-style handling).
  async function decryptText(key, blob) {
    if (typeof blob !== 'string' || !blob.startsWith(PREFIX)) {
      throw new Error('not an encrypted blob');
    }
    const [, ivB64, ctB64] = blob.split(':');
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(ivB64) },
      key,
      fromBase64(ctB64)
    );
    return new TextDecoder().decode(plainBuf);
  }

  function isEncrypted(blob) {
    return typeof blob === 'string' && blob.startsWith(PREFIX);
  }

  window.NicoCrypto = {
    generateRecoveryKey,
    normalizeRecoveryKey,
    deriveKey,
    randomSalt,
    exportKeyRaw,
    importKeyRaw,
    encryptText,
    decryptText,
    isEncrypted,
  };
})();
