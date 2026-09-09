# Domain 3 — Import & Capture

## 1. Goal

Kill the two biggest onboarding leaks: the cost of leaving another notes app
(no import today) and the friction of getting a thought into this one from
outside the PWA (no share target, no quick-add). Both feed directly into the
Domain 7 activation metric.

## 2. Current state in code

- Note creation: `POST /api/notes` (`server/routes/notes.js:83-121`) — takes
  `title`, optional `content`, `linkTo`, `lat`/`lon`; creates the note, optional
  link, `history.record('create'…)`.
- Attachments: `POST /api/notes/:id/attachments` (`:342`), `multer` disk storage,
  MIME allowlist `IMAGE_EXT`/`AUDIO_EXT` (`:19-36`), 50 MB cap, files in
  `data/uploads/`. `type` ∈ `text|image|audio|contact|app`; payload in
  `attachment_path` (`server/db.js:56-58`).
- Links: `POST /api/links` `{a,b}` with `note_a < note_b`, `UNIQUE`,
  `INSERT OR IGNORE` (`server/routes/links.js:11-33`).
- Graph is **flat** — no folders, no tags, no hierarchy columns.
- `public/manifest.webmanifest` — no `share_target`, no `shortcuts`.
- `public/sw.js` — no `fetch` handler, so a `share_target` POST cannot be
  intercepted in the SW; must post to a real route.
- No batch/import endpoint, no job/queue table.

## 3. Proposed design

### 3.1 Import pipeline

A single normalized internal representation, one endpoint, per-format parsers.

- `POST /api/import` — `multipart/form-data`: `format` +
  `file` (a `.zip` or a single `.md`/`.json`). Returns `{ jobId }`.
- `import_jobs` table (idempotent migration in `server/db.js`):

```
import_jobs(
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  format     TEXT NOT NULL,
  status     TEXT NOT NULL,          -- 'pending'|'running'|'done'|'error'
  totals     TEXT NOT NULL DEFAULT '{}',  -- JSON {notes, links, attachments, skipped}
  error      TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
)
```

- `GET /api/import/:jobId` → progress for the client to poll.
- Runner: process the job in a `setImmediate`/worker tick loop (same in-process
  model as `alarm-scheduler.js`); chunk inserts in transactions of ~200. No
  external queue for v1 (one box).

**Normalized record:**
`{ sourceId, title, markdown, createdAt?, updatedAt?, tags[], folderPath[],
outboundLinks: [sourceId|title], attachments: [{filename, bytes|path, mime}] }`

**Mapping rules (all formats):**

| Concept | Maps to |
| --- | --- |
| A source note/page | one `notes` row, `type='text'`, `content` = markdown (kept as-is; rendering is Domain 4) |
| Wiki/backlink `[[X]]` | a `links` edge to the note resolved from `X` (by source id, then by exact title); unresolved → create a stub note titled `X` (flagged) or drop, per a request option |
| Folder path | one hub note per folder (`title` = folder name), child notes linked to it; nested folders link hub→hub |
| Tag `#x` / label | one hub note per tag (`title` = `#x`), tagged notes linked to it |
| Embedded image / file | download/copy into `data/uploads` via the existing MIME allowlist; create an `image`/`audio` attachment note linked to the parent, or inline-link if type not allowed |
| `created_at`/`updated_at` | preserved into the columns (extend `POST` path or insert directly in the runner) |

**Dedupe / re-import:** store `import_source(user_id, format, source_key,
note_id)` mapping. On re-import of the same `source_key`, update the existing
note's `content`/`title` (and record a `history` entry) rather than duplicating;
never delete notes the user may have edited.

**Per-format parsers:**

| Format | Input | Parser notes |
| --- | --- | --- |
| **Markdown folder/zip** | `.zip` of `.md` + assets | walk tree; front-matter via `gray-matter`; `[[wikilink]]` + `[md](./rel.md)` → edges; images by relative path |
| **Obsidian vault** | `.zip` | superset of the above; honour `[[a\|alias]]`, `![[embed]]`, `#tags`; ignore `.obsidian/` |
| **Google Keep (Takeout)** | `.zip` of per-note `.json` | `title`, `textContent`/`listContent` (checkboxes → `- [ ]`), `labels` → tag hubs, `attachments` → files, `isArchived`/`isTrashed` → `status` |
| **Apple Notes** | exported `.zip`/folder of `.txt`/`.html` (via a Shortcut or third-party exporter) | HTML→markdown with `turndown`; first line = title; no native links |
| **Notion export** | `.zip` of `.md` + `.csv` | strip the ` <hash>` suffixes Notion appends to filenames/titles; `.csv` databases → a hub note + one child per row; relative `.md` links → edges |

Libraries (small, no bundler concern — server-side): `yauzl` or `adm-zip`,
`gray-matter`, `turndown`, `marked` only if needed for link extraction.

### 3.2 Capture surfaces

**a) PWA Share Target** — `public/manifest.webmanifest`:

```json
"share_target": {
  "action": "/share",
  "method": "POST",
  "enctype": "multipart/form-data",
  "params": { "title": "title", "text": "text", "url": "url", "files": [
    { "name": "media", "accept": ["image/*", "audio/*"] } ] }
}
```

- New route `POST /share` (server, above the SPA static handler): accept the
  shared payload, create a note (`title` from `title` or first line of `text`;
  `content` = `text` + `url`), attach any file via the existing attachment code,
  then `302` to `/#<newId>` so the PWA opens on it. Cookie-authed; if logged
  out, stash in a signed cookie and redirect through login.
- Optional "link to current note": remember the last centered note id
  (localStorage / a `last_note` cookie) and offer to link on the landing screen.

**b) Quick-add** — `public/manifest.webmanifest` `"shortcuts"` entry ("New
note") deep-linking to `/?compose=1`, which opens the existing picker modal
(`openPicker()` in `public/app.js`) on load. Plus a widget "＋" that opens the
same. Cheap, high value.

**c) Email-to-note** — per-user inbound address
`note+<token>@in.<domain>`. Use the Domain 1 mail provider's inbound webhook
(Postmark inbound, or Resend/SES→SNS). `POST /api/inbound/email` (verify
provider signature): resolve `token` → user, subject = title, text/HTML body →
markdown, attachments → files. `users.inbox_token` column (idempotent
migration), shown + rotatable in the account overlay next to the widget token
(same pattern as `server/routes/session.js:34-46`).

### 3.3 Frontend

- `public/app.js`: on load, parse `?compose=1` / `?share=…` and open the picker
  or a confirmation card. Add an "Import" entry to the account overlay → a small
  screen with a format dropdown, file input, an options toggle ("create stub
  notes for unresolved links", "import archived/trashed"), and a progress bar
  polling `GET /api/import/:jobId`.
- Show a post-import summary ("312 notes, 540 links, 47 images, 3 skipped") with
  a link to jump into the biggest hub note.

## 4. Milestones

1. **[M] Import core**: `import_jobs` + `import_source`, `POST /api/import` +
   status route, in-process runner, normalized-record model, the mapping rules,
   Import UI + progress. ✅ DONE (2026-09-09).
2. **[M] Markdown/Obsidian parser** (the two highest-value formats; share most
   code). ✅ DONE (2026-09-09).

   **What shipped (M1+M2 together — M1 isn't testable without a parser):**
   - Migration (`server/db.js`): `import_jobs(id TEXT pk, user_id, format,
     status pending|running|done|error, totals JSON, error, created_at,
     finished_at)` + `import_source(user_id, format, source_key, note_id,
     PRIMARY KEY(user_id,format,source_key))`.
   - `server/importer.js` — `parseFrontMatter` (minimal YAML: title/tags/
     aliases/dates), `buildRecord` (one `.md` → normalized record), `parseArchive`
     (adm-zip; skips `.obsidian/ .trash/ .git/ __MACOSX/` + dotfiles), `ingest`
     (2 passes, 200-row txn chunks, `await setImmediate` between), `runJob`.
   - `server/routes/import.js` — `POST /api/import` (multer memory, 30 MB cap,
     `format` ∈ `markdown|obsidian`, `.zip` or single `.md`) → `202 {jobId}` +
     `setImmediate(runJob)`; `GET /api/import` (last 20), `GET /api/import/:jobId`.
     Mounted below the cookie gate in `index.js`.
   - New dep **`adm-zip`** (`^0.5.18`, pure JS, sync API — fits no-build).
   - Mapping: source `.md` → one `text` note; `source_key` = the file's posix
     relative path. Folder path → nested **hub notes** (title = last segment),
     child links to its folder hub, folder hub → parent folder hub. Front-matter
     + inline `#tags` → **`#tag` hub notes**, tagged note links to each. `[[wiki]]`
     resolves by title (existing notes win over imported); `[x](./rel.md)`
     resolves by `source_key`; unresolved → **dropped + reported** in
     `totals.unresolved` (capped 100) / `unresolvedCount`. Embedded images
     (`![](rel)` / Obsidian `![[img.png]]`, ext allowlist mirrors
     `routes/notes.js`, no SVG) copied into `data/uploads/` and the markdown
     rewritten to `![](/uploads/…)` inline — **no attachment note** (matches the
     Domain-4 M6 inline-image convention); non-image embeds left as text, counted
     `skipped`.
   - **Re-import**: `import_source` → `UPDATE` title/content in place, never
     insert-dup, never delete. Verified: 2nd run of the same zip = `notes:0,
     updated:3, links:0, hubs:0`, note count unchanged.
   - Front-matter `created`/`updated` (`YYYY-MM-DD` or ISO) preserved into
     `notes.created_at`/`updated_at`.
   - UI: account overlay (`👤`) "import" section — format `<select>`, file input,
     Import button, status line polling `GET /api/import/:jobId` every 1.5 s →
     `"Imported 3 notes, 8 links, 6 hubs, 2 images, 1 dead link."`; refreshes
     `allNotesCache` + pin bar on done.
   - **No `history` entries** for import (bulk op, not a graph move) — a bad
     import is recovered by editing the source and re-importing.
   - **Server-verified** on a DB copy (fixture Obsidian vault); **needs a
     real-browser pass** (upload a real vault export, check the graph + rendered
     images).

   **Known limits / follow-ups:** re-import re-copies embedded images to fresh
   `/uploads/` files each run (orphans the old ones); no total-uncompressed-size
   cap on the zip (30 MB compressed only); `#tags` scanned outside code fences
   only (regex, not a full parser); no `history`/undo for a whole import.
3. **[S] Google Keep Takeout parser.**
4. **[S] Notion export parser.**
5. **[S] Apple Notes parser** (HTML→markdown; document the export Shortcut for
   users).
6. **[S] Share Target**: manifest + `POST /share` + open-on-return. ✅ DONE (2026-09-09).
7. **[S] Quick-add**: manifest `shortcuts` + `?compose=1` handling + widget "＋". ✅ DONE (2026-09-09).

   **What shipped (M6+M7 together):**
   - `public/manifest.webmanifest`: `share_target` (`action:/share`, POST,
     `multipart/form-data`, params `title`/`text`/`url` + `files.media`
     `image/*`+`audio/*`) and a `shortcuts` entry "New note" → `/?compose=1`.
   - `server/upload-config.js` (new) — the `IMAGE_EXT`/`AUDIO_EXT` MIME→ext
     allowlist + a `diskUpload()` multer factory, extracted verbatim from
     `routes/notes.js` (which now imports it) so the share target and the
     attachment route can't drift apart.
   - `server/index.js`: the cookie→`req.userId` middleware is now a named
     `resolveSession` mounted on `['/api','/share']` (share target is a
     top-level OS POST, not an `/api` call). New `app.use('/share', shareRouter)`
     sits **outside** the `/api` 401 gate.
   - `server/routes/share.js` (new) — `POST /share`. `title` = shared title →
     first non-blank line of `text` → "Shared link"/"Shared note"; `content` =
     `text` + `url` joined. Logged in → one `notes` row (`type` text, or
     `image`/`audio` with `attachment_path` when a `media` file passes the
     allowlist; disallowed/oversized file is dropped, note still created),
     `history.record('create', …, 'Shared "…"')`, `303 → /#<id>`. Logged out
     (rare: 60-day sliding PWA session) → stash `{title,content}` in a
     JS-readable `nico_share` cookie (10 min, ≤6 KB, file dropped) and `303 → /`.
   - `public/app.js` `handleDeepLink()` (runs from `init()` after tabs load):
     also handles `?compose=1` → `openPicker()` and the `nico_share` cookie →
     `createSharedNote()` (`api.createNote{title,content}` + open its tab +
     toast), clearing the cookie / stripping the param either way.
   - `server/routes/widget.js`: every feed response (graph, `mode=agenda`, empty)
     gains `compose_url: <origin>/?compose=1` for a widget "＋" button.
   - **Server-verified on a DB copy** (text / first-line-title / image /
     logged-out-stash / disallowed-file paths all give the right note + redirect;
     `compose_url` present); **needs a real-device pass** — Android share sheet
     into the installed PWA, and the launcher "New note" long-press shortcut.

   **Known limits / follow-ups:** iOS PWAs have no Web Share Target (the Domain 7
   wrapper restores it); a file shared while logged out is dropped (text kept);
   `?compose=1` only opens the picker on a cold load, not if the PWA is already
   foregrounded (search-param change fires no event); the shared note is not
   auto-linked to the last centered note (plan's optional "link to current").
8. **[M] Email-to-note**: `inbox_token`, inbound webhook route, account-overlay
   UI. _Needs Domain 1's provider._

## 5. Dependencies

- **Domain 1** — email-to-note needs the chosen mail provider + its inbound
  webhook; share target's logged-out path reuses the login redirect.
- **Domain 2** — the Markdown export format must round-trip with milestone 2's
  importer; agree front-matter keys jointly. Import bulk-writes should respect
  Domain 2's future `rev` column.
- **Domain 4** — imported `content` is raw markdown; it only looks right once
  Domain 4 renders markdown. Import is still useful before then (plain text).
- **Domain 7** — onboarding flow should offer import on first run.
- External: zip/markdown libs; Postmark inbound (or equivalent).

## 6. Risks & mitigations

- **Huge imports** (10k+ notes) blocking the event loop / exhausting memory —
  stream the zip, transaction in chunks, yield between chunks, cap per-job note
  count with a clear error; run as a background job from the start.
- **Malformed / partial exports** — parse defensively, collect per-item errors
  into `import_jobs.totals.skipped` with reasons, never abort the whole job on
  one bad file.
- **Dedupe correctness on re-import** — key on a stable `source_key`, only ever
  update/insert (never delete), and record every change in `history` so it is
  reversible.
- **Attachment abuse via import/share/email** — funnel every binary through the
  existing `IMAGE_EXT`/`AUDIO_EXT` allowlist and size cap in
  `server/routes/notes.js`; reject the rest with a noted skip.
- **Stub-note explosion** from unresolved `[[links]]` — make it opt-in; default
  to dropping unresolved links but listing them in the summary.
- **Share Target support gaps** (iOS PWA share target is weak/absent) — the
  wrapped app in Domain 7 restores it; ship the Web Share Target for Android now.

## 7. Open questions for the founder

1. Which formats matter most for the target ICP — Obsidian? Keep? Apple Notes?
   (Drives milestone order.)
2. Folders/tags → hub notes: good fit for the graph model, or should they become
   a real `tags` feature instead?
3. Default for unresolved `[[links]]` on import: create stub notes, or drop and
   report?
4. Is email-to-note worth the inbound-webhook complexity for v1, or defer?
5. Should re-import be a first-class "sync from Obsidian" loop later, or is
   one-shot import enough?
