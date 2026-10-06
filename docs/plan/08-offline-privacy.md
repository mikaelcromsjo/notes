# Domain 8 — Offline & Privacy

> Companion note: this grew out of a design discussion (2026-09-27) about
> whether to rebuild `notes-android` as a full offline app. **This file covers
> Phase 1 only** — the subset that ships without going fully offline and
> without touching the Android wrapper. Phase 2 (embedded client database,
> encrypted op-log sync, optional wrapper revival) is sketched at the end as a
> placeholder for a later domain file; do not start it from this doc.

## 0. Status (2026-09-27)

Milestones 1-6 shipped in this pass; milestone 7 (attachment encryption) was
explicitly deferred, per §3.6's own recommendation. Open questions (§7)
resolved as built:

1. **KDF: PBKDF2** (`public/crypto.js`), 600,000 iterations — no new vendored
   dependency, per the doc's own lean.
2. **Attachment encryption: deferred**, not started.
3. **Server FTS5: narrowed, not retired.** `GET /api/notes/search` still
   exists (nothing in the client calls it any more since milestone 2's
   `cache.localSearch`), and now runs title-only with no content snippet for
   an account that has enabled content encryption (`server/notes.js`'s
   `search`) — `notes_fts` itself is untouched, since it mirrors
   `notes.content` verbatim regardless.
4. **Encryption rollout: opt-in, indefinitely**, not a forced migration.
   Milestone 3's ceremony and milestone 4's "Encrypt my notes now" action are
   two separate, user-triggered steps (👤 Settings → Privacy) — nothing is
   encrypted until an account explicitly runs both.
5. **Recovery-key transfer: manual retype only** for this pass (no QR
   pairing) — `enc-unlock-overlay` in `public/index.html`.

Notes for whoever picks this up next:
- The one-time re-encryption migration (`POST /api/encryption/migrate`,
  `server/encryption.js`) was rehearsed end to end against a `DB_PATH` copy
  (99 real notes, full round-trip verified byte-for-byte) — it only ever runs
  when a signed-in user clicks through the ceremony themselves. It has since
  been run for real by `alf.cromsjo@gmail.com` on this checkout.
- **Server-side writers vs. the key (2026-10-06).** Export, the Markdown
  importer, mail-in and space moves all run where the key isn't. Resolved
  without ever decrypting the whole account server-side (the old
  `revert()` round-trip around imports is gone): a client-side catch-up
  sweep (`GET /api/encryption/pending` + `POST /api/encryption/sweep`,
  run on app open/reconnect/unlock/after import) encrypts any plaintext
  personal note and decrypts any of the account's own notes sitting in a
  shared space; moving notes into a space sends their decrypted text with
  the move. Export is now built in the browser (decrypted Markdown), the
  exact backup is a separate `account.db`-only zip, and attachments are a
  third download both share — see CLAUDE.md's Content encryption and Undo coverage bullets.
- **Scope extended beyond content: location is now encrypted too**
  (`notes.lat/lon`, `reminders.lat/lon/radius_m` for kind='location'
  geofences, and `location_log`, the GPS trail). Originally out of scope —
  §1 only ever named note *content* — added after review found the server
  does zero computation on any of it (no geofence math, no distance sorting;
  the client's own foreground GPS watch decides "arrived" and just tells the
  server to fire). Deliberately a **separate mechanism from content's
  migrate()/revert() ceremony**: every writer either already has the key
  (the web app encrypts inline at write time) or never will (the Android
  widget's background trail sampling, `POST /api/widget/location`, has no
  crypto of its own) — so instead of a one-time batch, each of
  `notes.geo`/`reminders.geo`/`location_log.geo` is a nullable ciphertext
  column that starts NULL ("pending", real plaintext lat/lon still sitting
  there) and a background sweep (`public/app.js`'s `sweepGeoEncryption()`,
  run alongside `warmCache()` on init/reconnect/unlock) catches up whatever's
  pending, every time, for as long as the account has encryption on. This
  also transparently catches up an account (this checkout's own) that
  enabled encryption *before* this existed — no separate migration needed.
  One schema wrinkle: `location_log.lat`/`lon` are `NOT NULL` from the
  original `CREATE TABLE` (never edit that block, per this file's standing
  convention) — `encryptGeo()` writes a `(0, 0)` placeholder there once `geo`
  is set rather than leaving them real; every reader checks `geo` first.
  Verified end to end against a copy of the live, already-encrypted account
  (`alf.cromsjo@gmail.com`) — real pre-existing plaintext notes/trail data,
  swept and round-tripped correctly, including the widget's plain-lat/lon
  path staying unchanged and a web-app-sourced sample landing pre-encrypted.
- Milestone 1's route extraction was verified by diffing every response
  (reads and writes, success and error paths) between the pre- and
  post-extraction handlers against an identical `DB_PATH` copy — byte-for-byte
  identical except for inherently volatile fields (timestamps, generated
  filenames).
- `server/routes/widget.js`'s content snippet and `server/agenda.js`'s
  openTasks/todos both degrade to empty/title-only for an encrypted account
  (§6's widget risk item) rather than showing ciphertext; the in-app 🔔 agenda
  overlay recomputes openTasks/todos client-side instead (§3.5,
  `public/app.js`'s `localOpenTasksAndTodos`).

## 1. Goal

Two independent wins, both deliverable without an offline-first rewrite:

1. **Search that doesn't depend on the network or the server seeing your
   text** — build it over the content the client already mirrors, instead of
   round-tripping to server-side FTS5.
2. **Zero-knowledge encryption at rest for note content** — the server keeps
   storing and syncing notes exactly as it does today (same HTTP round trips,
   same routes), but `content` becomes ciphertext it can't read. Titles and
   reminder due-times stay plaintext so push/digest/widget keep working
   unchanged.

Neither requires an embedded client database, a new sync protocol, or
touching `notes-android`. Both requires no changes to the online/offline
runtime model already in place (`public/store.js`'s mirror + outbox stays
exactly as is).

## 2. Current state in code

- **Route logic is inline in Express handlers**, not extracted. `server/routes/notes.js`'s
  handlers (e.g. `router.get('/search', ...)` at `:83`) read `req.userId`/`req.query`
  directly; `server/db.js:4` opens one module-level `db` singleton. The one
  place this is already done right: `server/agenda.js` exports a plain
  `buildAgenda(userId, { tz, now })` (`:85`) with no `req`/`res`, and
  `server/routes/agenda.js` is a one-line wrapper around it.
- **Search today**: `GET /api/notes/search?q=` (`server/routes/notes.js`) over
  the FTS5 `notes_fts` external-content table (`server/db.js`, added per
  `docs/plan/04-editor-search.md` milestone 3). Client-side: the topbar does an
  instant local title-only filter over `allNotesCache`, then swaps in
  debounced server results (`public/app.js`). Offline, only the title filter
  works — no content search offline at all, even though...
- **...content is already mirrored client-side.** `warmCache()` (`public/store.js`,
  called from `init()`/`reconnect()`) pulls `GET /api/notes/full` — `{id, content,
  attachment_path, updated_at}` for every note — specifically so the editor
  doesn't show `"undefined"` offline. That mirror already has everything a
  client-side search index needs; it's just not used for search.
- **Auth is passwordless magic-link** (`server/routes/auth.js`: `POST
  /api/auth/request-link` → `GET /api/auth/callback`, `login_tokens` table).
  There is no user-held secret anywhere today — sessions are an opaque
  `nico_sess` cookie the server mints (`server/sessions.js`). This matters
  because zero-knowledge encryption needs a secret the server never learns,
  and nothing in the current auth flow provides one.
- **Content is read server-side in more places than just the note itself**:
  - `server/agenda.js`'s `taskNotesStmt` (`:20-24`) does `content LIKE '%[ ]%'`
    to prefilter for open `- [ ]` tasks, then regex-scans the actual text
    (`OPEN_TASK_RE`, `:35`) for the agenda's "open tasks" section.
  - `server/agenda.js`'s `todoNotesStmt` (`:26-31`) pulls `content` from
    status=`todo` notes only to run `extractTags()` (`server/tags.js`) for the
    agenda's by-tag grouping.
  - `server/routes/widget.js` (`:149,158,169,195`) selects `n.content` for the
    centered note and slices a 280-char snippet (`SNIPPET_LEN`) into the
    read-only Android home-screen grid widget feed. **The widget is a native
    `RemoteViews` surface with no crypto of its own** — it can only show what
    the server hands it in plaintext JSON.
  - `alarm-scheduler.js`/`digest-scheduler.js` only ever read reminder
    **titles** (via `notes.title`, joined in `agenda.js`'s `remindersStmt`)
    and due-instants (`next_at`/`snooze_until`), never note body — good, this
    is exactly the plaintext boundary this plan proposes keeping.
- **Attachments** are files on disk under `data/uploads/`, served directly by
  `/uploads` with `nosniff` + sandbox CSP (`CLAUDE.md`). No encryption at any
  layer today.

## 3. Proposed design

### 3.1 Extract route logic into pure functions (prerequisite for everything else)

Pull the body of every `notes.js`/`links.js`/`tabs.js`/`alarms.js` route
handler into a plain function `(db, userId, params) => result`, with `db`
passed in rather than closed over from the module-level singleton — the same
shape `agenda.js`/`digest.js` already use. The Express handler becomes a
one-line wrapper, same as `server/routes/agenda.js` today. No behavior
change, no schema change, no client change. This is what lets milestone 3.4
below encrypt/decrypt at a single seam instead of patching every handler
individually, and it's the same seam a future Phase 2 embedded client would
need — do it once, benefit twice.

### 3.2 Client-side content search over the existing mirror

Build search over `warmCache()`'s already-mirrored `{id, content}` pairs
instead of (or as the primary path ahead of) `GET /api/notes/search`. At
personal-notebook scale (hundreds to low thousands of notes) a plain
substring/token scan over the in-memory mirror is fast enough without a real
index; rank by title match first, then content match, same shape as the
current instant-title-filter-then-server-results progressive UX so the
topbar wiring barely changes — just point the "debounced results" step at the
local mirror instead of a `fetch`. This removes the online-search / no-search
offline split entirely, and (not incidentally) is what makes 3.4's encryption
not cost you search: once `content` is ciphertext server-side, server FTS
over it is useless anyway, and this milestone already stopped depending on
it.

### 3.3 Recovery-key ceremony + crypto helper module

- Generate a high-entropy secret client-side at opt-in ("Set up encryption" in
  the 👤 account overlay, alongside the existing digest settings). Show it
  once, require an explicit "I saved this" confirmation — there is no
  password-reset equivalent for it, by design (a server-recoverable key isn't
  zero-knowledge).
- Derive a symmetric key from it via WebCrypto's built-in `PBKDF2` (no new
  dependency) or a vendored Argon2id WASM build (stronger, but another
  vendored file in `public/vendor/` like `marked`/`purify` — open question,
  see §7).
- New device / re-pairing: type the recovery key in by hand, or transfer it
  device-to-device out of band (QR code). No server-mediated recovery path —
  that would reintroduce the thing this is meant to avoid.
- Store the derived key in IndexedDB (`store.js`'s `meta` store) so it doesn't
  need re-entry every session; the recovery key itself is never persisted
  anywhere, only typed at setup/pairing time.
- New `users` columns for the KDF parameters (salt, iteration count) —
  idempotent `PRAGMA table_info` + `ALTER TABLE` in `db.js`, per the project's
  existing schema-change convention. These are not secret and can stay
  plaintext.

### 3.4 Encrypt `content` at rest; leave title and scheduling plaintext

- Client encrypts `content` (AES-GCM, WebCrypto) before every `PUT
  /api/notes/:id` / `POST /api/notes`; decrypts after every `GET` and after
  `warmCache()`'s `GET /api/notes/full` pull. The pure functions from 3.1 are
  the one place the server touches the `content` column, so this is a
  contained change: the server never encrypts/decrypts, it just stores and
  returns whatever bytes it's given.
- **Boundary**: `title` and `reminders.next_at`/`snooze_until`/`tz` stay
  plaintext. This is what keeps `alarm-scheduler.js`, `digest-scheduler.js`,
  and the token-authed `/digest?token=` page working with zero changes — they
  never read note body.
- One-time migration: re-encrypt existing plaintext `content` for the account
  once opted in. Rehearse on a `DB_PATH` copy first (per `CLAUDE.md`'s
  standing rule — `data/notes.db` is the only copy of real data); run inside a
  transaction; back up before touching the live file.
- Attachments (file bytes under `data/uploads/`) are **out of scope for this
  milestone** — encrypting them means the client can no longer hand the
  browser a plain `<img src="/uploads/...">` and needs to fetch+decrypt+
  object-URL everything through `resolveMediaUrl` instead (already a real
  code path per `CLAUDE.md`'s offline-assets section, but today it only
  activates offline). Treat as a separate, later milestone (3.6) rather than
  bundling it in.

### 3.5 Move content-dependent server logic to the client

Once `content` is ciphertext, these three server-side reads stop working and
need to move to the client, sourced from the already-decrypted local mirror:

- `agenda.js`'s open-tasks scan (`OPEN_TASK_RE` over `taskNotesStmt` rows) —
  becomes a client-side scan over `warmCache()`'s mirror, feeding the same 🔔
  agenda overlay section.
- `extractTags()` over `todoNotesStmt` rows, for by-tag grouping — same
  treatment.
- `GET /api/agenda`'s response shape stays the same either way (client
  merges its own open-tasks/tags into what the server still computes from
  plaintext reminders); this is an additive client-side merge, not a
  contract break.

### 3.6 (stretch, optional inside Phase 1) Attachment encryption

If wanted: encrypt file bytes client-side before upload, store ciphertext
under `data/uploads/` unchanged otherwise, decrypt via `resolveMediaUrl` (the
code path already exists for the offline case — see `CLAUDE.md`'s "Warm
cache" section — this would make it the *only* path, online or off). Bigger
surface than 3.4: touches the upload route, `PUT`/`DELETE /:id/attachment`,
inline image paste/drop, and every place that currently does a bare `<img
src>`/`<audio src>`. Recommend shipping 3.1–3.5 first and deciding on this
separately.

### 3.7 Narrow or retire server-side FTS5

Once 3.2 lands, `notes_fts` (added in `docs/plan/04-editor-search.md`) is
indexing plaintext `content` that's about to become ciphertext — an index
over ciphertext is useless. Decide at 3.4 time whether to drop the `content`
column from `notes_fts` (title-only server search, kept only as an
online-only fallback) or retire `GET /api/notes/search` entirely now that 3.2
covers it client-side, online and off.

## 4. Milestones

1. **[S] Route-logic extraction** (§3.1) — `notes.js`/`links.js`/`tabs.js`/
   `alarms.js` handlers become thin wrappers over plain `(db, userId,
   params)` functions. No behavior change; verify by diffing responses
   against the current handlers on a `DB_PATH` copy.
2. **[M] Client-side content search** (§3.2) — topbar search reads
   `warmCache()`'s mirror; keep the instant title-filter first paint, swap
   server-FTS-results step for a local-mirror scan.
3. **[S] Recovery-key ceremony + crypto helper module** (§3.3) — key
   generation/display UI, KDF, IndexedDB key storage, `users` schema columns.
   No data encrypted yet — this milestone is just the plumbing and the "save
   your key" UX, safe to ship and dark-launch behind a flag.
4. **[M] Encrypt `content` at rest** (§3.4) — write/read path through the
   milestone-1 seam, one-time migration of existing rows, rehearsed on a copy
   first.
5. **[M] Move open-tasks/tag-extraction to the client** (§3.5) — required
   before or alongside milestone 4 ships for real accounts, otherwise the 🔔
   agenda overlay silently loses its open-tasks section.
6. **[S] Narrow/retire server FTS5** (§3.7) — once milestone 2 is proven out.
7. **[L, optional/stretch]** Attachment encryption (§3.6) — separate
   go/no-go decision, not required for the rest of this domain.

Suggested order: 1 → 2 (independent, ship anytime) → 3 → 4 (with 5 landing in
the same release) → 7 → 6 last, since retiring search only makes sense once
its replacement (2) has run for a while.

## 5. Dependencies

- Independent of Domains 1–7 in `docs/plan/`; touches the same `notes`/`users`
  tables as Domain 2 (Data Safety & Portability) — coordinate schema changes
  if both are in flight.
- Milestone 1 (route extraction) is also the prerequisite Phase 2 (full
  offline, embedded client DB — not detailed in this file) would need; doing
  it now pays twice.
- **This domain targets `notes.ia-ai.se` (this checkout) only.**
  `test.ia-ai.se` "stays as-is" per `CLAUDE.md` — do not port this to
  `/srv/nico-server` as part of this work.
- `notes-android`: no code changes in that sub-project for Phase 1, but
  milestone 4 has a direct consequence for it — see Risks below. Do not
  revive the deleted `WebView` wrapper as part of this domain; nothing here
  changes the reasoning in `notes-android/CLAUDE.md` for why it was removed.

## 6. Risks & mitigations

- **Recovery-key loss is permanent data loss**, by design — there is no
  server-side reset. Mitigate with unambiguous setup-time UX (forced
  confirmation, maybe a printable/QR export), and make the feature opt-in so
  nobody is defaulted into a state they didn't choose.
- **The Android grid widget shows a 280-char content snippet today**
  (`server/routes/widget.js` `SNIPPET_LEN`) — it is a native `RemoteViews`
  reader of server JSON with no crypto capability. Once `content` is
  encrypted, that snippet has to be dropped from the widget feed (title-only)
  or the widget loses it entirely. Decide explicitly rather than letting it
  silently break; this is a `notes-android`-visible change even though no
  Android code changes.
- **Migrating live data**: `data/notes.db` is the only copy of real user data
  on one box (`CLAUDE.md`). Rehearse the re-encryption migration on a
  `Database(src).backup(dest)` copy under a different `DB_PATH`/`PORT` first;
  take a manual backup before running it for real; wrap in a transaction.
- **Content read in places not yet audited**: grep for `.content` reads in
  `server/` before starting milestone 4 — this plan found `agenda.js` and
  `widget.js`, but a future importer (Domain 3) or an admin/debug script could
  add another one later without anyone remembering the boundary exists.
- **FTS5 trigger drift**: if Domain 2's data-safety work ever rebuilds the
  `notes` table for FK reasons, the (possibly narrowed) `notes_fts` triggers
  need recreating in the same migration — same caution `docs/plan/04` already
  flags.

## 7. Open questions

1. PBKDF2 (WebCrypto built-in, zero new dependency) vs. vendored Argon2id
   (stronger KDF, another `public/vendor/` file to maintain) — which for
   3.3?
2. Ship attachment encryption (§3.6) in the same release as `content`
   encryption, or treat it as its own later decision?
3. Drop `notes_fts`'s `content` column (title-only server search stays as an
   online fallback) or retire `GET /api/notes/search` outright once §3.2
   ships?
4. Is encryption opt-in per account, indefinitely, or does it become the
   default/mandatory path with a forced one-time migration for existing
   accounts?
5. Recovery-key transfer between devices: manual retype only, or worth
   building a QR-code pairing flow now vs. deferring until Phase 2 needs
   device pairing anyway for op-log sync?
