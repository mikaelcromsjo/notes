// Offline store — a thin promise wrapper over one IndexedDB database. The app
// layer (app.js) puts all the meaning on top of this; here we only own schema,
// transactions, and a few generic helpers. Loaded as a plain IIFE before app.js
// and exposed as window.NicoStore.
//
// Object stores (all created in DB version 1 so later phases need no upgrade):
//   notes   keyPath 'id'   — a full note row incl. `content`. `id` is the server
//                            integer, or a string `tmp:<uuid>` for a note created
//                            offline and not yet synced. Local-only bookkeeping
//                            lives under `_dirty` (bool) and `_localUpdatedAt`.
//   links   keyPath 'key'  — 'key' is `${a}:${b}` with a<b (numeric) or a tmp id
//                            on either side. Carries `a`, `b`, `_dirty`,
//                            `_deleted`, `_localUpdatedAt`.
//   outbox  keyPath 'seq' (autoIncrement) — queued mutations, drained in order by
//                            app.js when online. Unused until phase 2.
//   blobs   keyPath 'key'  — pending attachment payloads (File/Blob) awaiting
//                            upload. Unused until phase 2.
//   meta    keyPath 'k'    — scalar bookkeeping: temp-id map, last full-pull time.
(() => {
  const DB_NAME = 'nico';
  const DB_VERSION = 1;
  const STORES = ['notes', 'links', 'outbox', 'blobs', 'meta'];

  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('links')) db.createObjectStore('links', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('outbox'))
          db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch((err) => {
      // A private window / disabled storage / a quota refusal at open time all
      // land here. Reset so a later call can retry, and let callers degrade.
      dbPromise = null;
      throw err;
    });
    return dbPromise;
  }

  function reqAsPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // Run `fn(tx)` inside one transaction and resolve when it commits. `fn` may
  // return a promise of intermediate results; the resolved value is passed
  // through once the transaction actually completes.
  async function tx(stores, mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const t = db.transaction(stores, mode);
      let out;
      let inner = Promise.resolve();
      try {
        inner = Promise.resolve(fn(t));
      } catch (err) {
        reject(err);
        return;
      }
      inner.then((v) => {
        out = v;
      }, reject);
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('transaction aborted'));
    });
  }

  const get = (store, key) => tx(store, 'readonly', (t) => reqAsPromise(t.objectStore(store).get(key)));
  const getAll = (store) => tx(store, 'readonly', (t) => reqAsPromise(t.objectStore(store).getAll()));
  const put = (store, value) => tx(store, 'readwrite', (t) => reqAsPromise(t.objectStore(store).put(value)));
  const del = (store, key) => tx(store, 'readwrite', (t) => reqAsPromise(t.objectStore(store).delete(key)));
  const clear = (store) => tx(store, 'readwrite', (t) => reqAsPromise(t.objectStore(store).clear()));

  function bulkPut(store, values) {
    return tx(store, 'readwrite', (t) => {
      const os = t.objectStore(store);
      for (const v of values) os.put(v);
    });
  }

  // Replace the entire contents of `store` with `values` in one transaction —
  // used when a fresh server list is the new source of truth for that store.
  function replaceAll(store, values) {
    return tx(store, 'readwrite', (t) => {
      const os = t.objectStore(store);
      os.clear();
      for (const v of values) os.put(v);
    });
  }

  async function meta(k, fallback) {
    try {
      const row = await get('meta', k);
      return row ? row.v : fallback;
    } catch {
      return fallback;
    }
  }
  const setMeta = (k, v) => put('meta', { k, v });

  window.NicoStore = {
    available: 'indexedDB' in window,
    ready: () => openDb().then(() => true).catch(() => false),
    tx,
    get,
    getAll,
    put,
    del,
    clear,
    bulkPut,
    replaceAll,
    meta,
    setMeta,
    reqAsPromise,
  };
})();
