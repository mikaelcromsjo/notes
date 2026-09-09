# Domain 2 — Data Safety & Portability

## 1. Goal

Make user data safe enough to charge for: no single point of data loss, a
restore that has actually been rehearsed, and a one-click "download everything"
so users never feel locked in. Add an offline write path so the PWA stops losing
edits made without signal.

## 2. Current state in code

- `server/db.js:4` — one SQLite file at `DB_PATH` or `data/notes.db`. WAL mode
  (`:5`). `CLAUDE.md`: "the **only copy of real user data**", one box, no
  systemd, a per-machine restart hook.
- `data/` contents (observed): `notes.db`, `notes.db-shm`, a 4 MB `notes.db-wal`,
  `uploads/`, `vapid.json`. `data/` is gitignored.
- FKs: `db.pragma('foreign_keys = ON')` (`server/db.js:6`). `nav_events`,
  `push_subscriptions`, `history` are `ON DELETE CASCADE` on `user_id`
  (`server/db.js:99,124,140`). **`notes`, `links`, `tabs` got `user_id` added
  later (`:152-156`) as `REFERENCES users(id)` with NO cascade** — deleting a
  user leaves their notes/links/tabs orphaned. This must be fixed for account
  delete.
- Uploads: `server/index.js:20-21` creates `data/uploads`; files written by the
  attachment branch in `server/routes/notes.js` (MIME allowlist). Not covered by
  any backup.
- Export: none. There is no route that dumps a user's data.
- Account delete: none. `DELETE /api/session` only clears the cookie.
- Offline: `public/sw.js` — "PWA install + push delivery only — no
  caching/fetch interception". Every write in `public/app.js` `api.*` is a bare
  `fetch`; offline = silent failure / thrown promise.

## 3. Proposed design

### 3.1 Backups (off-box, automated)

**Recommendation: Litestream.** It streams the SQLite WAL to object storage
(S3/B2/R2) continuously, gives point-in-time restore to within seconds, needs no
app changes, and is a single static binary. LiteFS is overkill (it is for
multi-node replication); a cron `.backup()` loses up-to-24h and stalls on a hot
WAL.

- Run `litestream replicate` as a sidecar process (systemd unit, or a
  `Procfile`/`pm2`/`supervisor` entry — the box has no systemd today, so this
  milestone includes standing up a process supervisor).
- Target: Cloudflare R2 or Backblaze B2 (cheap egress). Bucket versioning on.
  Litestream config `config.yml` with `retention: 168h`, `snapshot-interval:
  6h`.
- **Uploads** are not in SQLite. Two options: (a) `rclone sync data/uploads
  <bucket>/uploads` on a 15-min cron with `--backup-dir` for deletes, or (b)
  move uploads into object storage entirely and serve via redirect (larger
  change — defer). Start with (a).
- `vapid.json` and any `.env` → into a password manager / secrets store, plus an
  encrypted copy in the bucket. Not in git.
- Encryption: R2/B2 server-side encryption on; for defence add
  `litestream`'s age encryption or a KMS. At minimum, restrict bucket keys to
  write-only for the replicate credential and keep a separate read credential
  offline.

### 3.2 Restore runbook (`docs/ops/restore.md`, written as part of this domain)

1. Provision a fresh box, install Node + Litestream + rclone.
2. `litestream restore -o data/notes.db <bucket-url>`.
3. `rclone copy <bucket>/uploads data/uploads`.
4. Restore `vapid.json` from the secrets store.
5. `npm ci && npm start`; smoke-test `GET /` and one authenticated `GET
   /api/notes`.
6. Repoint DNS / nginx upstream.

**This milestone is not done until the runbook has been executed end-to-end on a
throwaway box and the timing recorded.**

### 3.3 Monitoring

- A 60-second cron hits a new `GET /healthz` (returns `{ ok, noteCount,
  lastBackupAgeSeconds }`). `lastBackupAgeSeconds` read from Litestream's
  generation timestamp (or a marker row the app writes every minute and expects
  to see in the replica).
- Alert (email via the Domain 1 mailer, or a free uptime service like
  healthchecks.io) when: process down, `lastBackupAgeSeconds > 900`, disk >85%,
  or WAL file > 64 MB (checkpoint stuck).
- Weekly automated restore-verify: a scheduled job restores the latest replica
  to a scratch path and runs `PRAGMA integrity_check`.

### 3.4 Per-user export

- `GET /api/account/export` → streams a `.zip` (use `archiver`), scoped by
  `req.userId`:
  - `notes/<id>-<slug>.md` — front-matter (`title`, `created_at`, `updated_at`,
    `type`, `lat`/`lon`, `status`, `alarm_*`) + `content`. For attachment notes,
    embed a relative link to the file.
  - `attachments/<file>` — copied from `data/uploads`.
  - `links.json` — `[{a,b,created_at}]`.
  - `graph.json` — full machine-readable dump of every owned row across `notes`,
    `links`, `tabs`, `nav_events` (last 90d as stored), `history` — for
    re-import / debugging.
  - `README.txt` — format description.
- Rate-limit to a few per hour per user. For very large accounts, generate
  async: insert an `export_jobs` row, build in a worker tick, email a
  time-limited download link (reuses Domain 1 token pattern).
- Surface in the account overlay: "Export all my data".

### 3.5 Account delete

1. Migration in `server/db.js`: rebuild `notes`/`links`/`tabs` FKs to
   `ON DELETE CASCADE`. SQLite can't `ALTER` a constraint — do the
   12-step table rebuild (`PRAGMA foreign_keys=OFF`; `CREATE notes_new … ON
   DELETE CASCADE`; `INSERT INTO notes_new SELECT …`; drop; rename; recreate
   indexes; `foreign_keys=ON`) inside a transaction, guarded by a
   `PRAGMA user_version` bump so it runs once.
2. `DELETE /api/account` → require re-auth (fresh magic link or OAuth within N
   minutes), then `DELETE FROM users WHERE id = ?` (cascades), then delete
   `data/uploads` files owned by those notes, then destroy sessions, clear
   cookie.
3. Soft-delete grace: set `users.deleted_at`, exclude everywhere, purge for real
   after 14 days via the retention sweep already in `server/db.js:181-186`.

### 3.6 Offline write queue + sync

- **Scope tightly:** queue only `notes` create/update (title/content) and
  `links` create/delete. Alarms, attachments, nav, tabs stay online-only v1.
- `public/app.js`: wrap the mutating `api.*` calls. On network failure, append
  an op to an IndexedDB `outbox` store (`{id, kind, payload, baseUpdatedAt,
  clientTs}`) and optimistically update local state. `public/sw.js` gains a
  `sync` event (Background Sync API where available) + a flush on
  `visibilitychange`/`online`.
- Server: add `PATCH /api/notes/:id` semantics for conflict detection — accept
  `baseUpdatedAt`; if `notes.updated_at` has moved on, do a **field-level
  three-way merge** for text (last-writer-wins per field is acceptable v1, but
  keep the loser: write the discarded version into `history` with action
  `conflict` so it is recoverable and visible in the existing undo UI).
- Links are add/remove of a unique row — naturally idempotent
  (`INSERT OR IGNORE` already at `server/routes/links.js:33`); replaying is safe.
- Add a monotonic `notes.rev INTEGER` column (idempotent migration) bumped on
  every write, so the client can cheaply detect "server changed since my base".
- Out of scope v1: real-time multi-device convergence (that is a CRDT project;
  note it for a future "collaboration" domain).

## 4. Milestones

1. **[S] FK cascade migration** for `notes`/`links`/`tabs` (table rebuild,
   `user_version` guard). Prereq for delete; also just correct.
2. **[M] Litestream to R2/B2** + process supervisor + `rclone` uploads sync.
3. **[M] Restore runbook written and rehearsed** on a throwaway box; record RTO.
4. **[S] `/healthz` + monitoring/alerts** (healthchecks.io + mailer).
5. **[M] `GET /api/account/export`** (sync zip first; async job if needed) + UI.
6. **[M] `DELETE /api/account`** with re-auth + soft-delete grace + upload purge.
7. **[L] Offline outbox + conflict handling** for notes/links (`rev` column,
   `PATCH` merge, `sw.js` flush, IndexedDB outbox).
8. **[S] Weekly automated restore-verify + `integrity_check`.**

## 5. Dependencies

- **Milestones 1–4 are the trust gate: no paid launch (Domain 6/7) before they
  ship.**
- Re-auth for delete (milestone 6) needs **Domain 1** sessions + mailer.
- Export front-matter should match whatever **Domain 3** chooses as its Markdown
  import format, so export ↔ import round-trips. Align the two.
- `history` "conflict"/"undo" reuse depends on `server/routes/history.js` shape —
  no change expected, just new `action` values.
- External: R2 or B2 bucket + credentials; a small always-on process for
  Litestream; healthchecks.io (free).

## 6. Risks & mitigations

- **Table-rebuild migration on the live DB.** Rehearse on a `DB_PATH` copy;
  wrap in a transaction; `PRAGMA integrity_check` + row-count assertions before
  and after; take a manual Litestream snapshot immediately before deploying.
- **Litestream misconfigured = silent no-backup.** Milestone 4's
  `lastBackupAgeSeconds` alert is the backstop; verify with milestone 3's real
  restore before trusting it.
- **Offline merge data loss.** Never discard silently — losers go to `history`
  as recoverable entries; keep v1 scope to notes text + links only.
- **Export zip OOM / long request** for big accounts — stream with `archiver`,
  and switch to the async job path above a size threshold.
- **Upload/DB backup skew** (DB references a file the uploads sync hasn't copied
  yet) — on restore, tolerate missing attachment files (render a "missing"
  placeholder, already partly handled in `buildAttachmentPreview`).

## 7. Open questions for the founder

1. Object storage preference — Cloudflare R2, Backblaze B2, or AWS S3?
2. Is there budget/appetite for a second always-on machine (hot standby), or is
   "restore within ~30 min from replica" the acceptable RTO?
3. Acceptable RPO — Litestream gives seconds; is that the bar, or is 6h fine?
4. Should uploads move fully into object storage now (bigger change, cleaner
   ops) or stay on local disk with an `rclone` mirror?
5. For offline conflicts, is last-writer-wins-per-field + recoverable history
   acceptable for v1, or is stricter merisdiction needed?
6. GDPR: who is the data controller of record, and is an EU data region
   required?
