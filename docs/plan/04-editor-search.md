# Domain 4 — Editor & Search

## 1. Goal

Lift activation and daily usefulness: make writing a note feel modern (markdown,
checkboxes, link-as-you-type) and make finding a note instant (real full-text
search instead of client-side title matching). This is a polish/retention lever,
not a differentiator — keep it strictly no-build.

## 2. Current state in code

- Fullscreen editor: `buildNoteEditor({ onRerender, afterDelete })` in
  `public/app.js:~713` (opened from the center cell). Title + content are plain
  `<textarea>`/contenteditable-ish fields with autosave to `PUT /api/notes/:id`
  (`server/routes/notes.js:131-156`). `content` is stored and shown as plain
  text.
- Read-only center cell: `makeCenterCell()` `~public/app.js:848` — renders
  `.center-content` as `textContent`.
- Links panel: `buildLinksPanel()` `public/app.js:662-707` — manual list with
  `✕` to unlink; add-link is via the picker modal (`openPicker`), which calls
  `POST /api/links` / `api.link`.
- Topbar search: `searchInput` handler `public/app.js:~1485` — filters
  `allNotesCache` (an in-memory list of `{id,title,…}`) by `title.includes(q)`,
  max 8, client-side only. `allNotesCache` is refreshed after most mutations.
- No markdown renderer anywhere. No `<script>` deps except Leaflet
  (`public/index.html:166`).
- SQLite: better-sqlite3 v11 — **FTS5 is compiled in** by default. No virtual
  tables today.
- `PRAGMA user_version` unused — available as a migration guard.

## 3. Proposed design

### 3.1 Markdown rendering (no build)

- Vendor **`marked`** (single UMD file, ~40 KB) into `public/vendor/marked.min.js`
  pinned to an exact version, loaded via a plain `<script>` in
  `public/index.html` before `app.js`. (Alternative: `markdown-it`, larger;
  `marked` is enough.) CDN is not used — the app self-hosts assets today, keep
  that.
- **Sanitize**: `marked` does not sanitize. Vendor **`DOMPurify`** (UMD) and run
  every rendered fragment through it before insertion. Restrict to a safe tag/
  attr allowlist; disallow raw HTML in `marked` options (`{ mangle:false,
  headerIds:false }`, and a custom renderer that drops `html` tokens).
- Render targets:
  - Center cell `.center-content`: render markdown read-only (`makeCenterCell`).
  - Fullscreen editor: keep a **plain textarea for editing** (mobile-friendly,
    no contenteditable pain), add a "preview" toggle that swaps in the rendered
    HTML. Live side-by-side only on wide screens (Domain 7).
- Links inside content: post-process rendered HTML to turn `[[Note Title]]` and
  `[[#123]]` into `<a data-note-id>` that call `goTo(id)`. Resolution: exact
  title match against `allNotesCache`, else render as a "create" affordance.

### 3.2 Task checkboxes

- GFM `- [ ]` / `- [x]` render as real `<input type=checkbox>` (enabled) in both
  center cell and preview.
- Toggling a checkbox rewrites the corresponding line in `content` and saves via
  the existing `PUT /api/notes/:id` (compute the Nth `[ ]`/`[x]` occurrence →
  flip → save). No schema change.
- A "tasks" surface later (Domain 5's "due today" is the natural home) can query
  notes whose `content` matches `- [ ] ` — cheap `LIKE` or a generated column.

### 3.3 Inline `[[` link autocomplete

- In the editor textarea, detect `[[` + query up to the caret. Show a floating
  menu (reuse `.picker-results` styles) listing `allNotesCache` matches + a
  "Create ‘query’" row.
- On pick: insert `[[Title]]` at the caret AND call `api.link(currentId,
  pickedId)` (server: `POST /api/links`, already `INSERT OR IGNORE`,
  `server/routes/links.js`). "Create" first `POST /api/notes` then link.
- Keep the existing picker modal for discovery/drag; this is the inline path.
- Refresh neighbours after linking (`loadNeighbors` + `render`), matching the
  existing pattern in `buildLinksPanel`/`openPicker`.

### 3.4 Inline images

- Paste / drag-drop into the editor → upload through
  `POST /api/notes/:id/attachments` (existing multer route, MIME allowlist,
  `server/routes/notes.js:342`). On success, insert
  `![](/uploads/<file>)` at the caret. The attachment is also created as a
  linked note today — decide whether inline images should skip the "attachment
  note" creation (add an `inline=1` flag to the route that stores the file and
  returns the path without creating a note row). Recommend the flag.

### 3.5 Full-text search (FTS5)

Idempotent migration in `server/db.js`, guarded by `PRAGMA user_version`:

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  title, content,
  content='notes', content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);
-- backfill once:
INSERT INTO notes_fts(rowid, title, content)
  SELECT id, title, content FROM notes
  WHERE id NOT IN (SELECT rowid FROM notes_fts);
-- keep in sync:
CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid,title,content) VALUES (new.id,new.title,new.content);
END;
CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts,rowid,title,content) VALUES('delete',old.id,old.title,old.content);
END;
CREATE TRIGGER notes_au AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts,rowid,title,content) VALUES('delete',old.id,old.title,old.content);
  INSERT INTO notes_fts(rowid,title,content) VALUES (new.id,new.title,new.content);
END;
```

- New endpoint `GET /api/notes/search?q=&limit=` (in `server/routes/notes.js`):

```sql
SELECT n.id, n.title, snippet(notes_fts,1,'[',']','…',12) AS snippet
FROM notes_fts
JOIN notes n ON n.id = notes_fts.rowid
WHERE notes_fts MATCH ? AND n.user_id = ? AND n.status != 'deleted'
ORDER BY bm25(notes_fts, 5.0, 1.0)
LIMIT ?;
```

  Sanitize `q` into an FTS query (quote terms, append `*` to the last term for
  prefix search; reject bare FTS operators).
- `public/app.js` topbar handler: debounce ~150 ms, call the endpoint, render
  title + highlighted snippet. Keep the instant client-side title filter as the
  first paint, then replace with server results (progressive).
- `content=''` external-content table keeps the DB size increase modest.

## 4. Milestones

1. **[S] Vendor `marked` + `DOMPurify`; render markdown read-only.** ✅ DONE
   (2026-09-09). `public/vendor/marked.min.js` (12.0.2) +
   `public/vendor/purify.min.js` (3.0.11), loaded as plain `<script>`s.
   `md` / `mdToHtml` / `renderMarkdownInto` in `public/app.js`. Center cell
   renders markdown read-only; fullscreen editor gets a 👁 Preview / ✏️ Edit
   toggle. `.markdown-body` styles in `style.css`. Marked configured with a
   `wikilink` inline extension; DOMPurify `afterSanitizeAttributes` hook forces
   `target=_blank rel=noopener` on external links. **Needs a real-browser pass**
   (DOMPurify attr retention, layout).
2. **[S] Task checkboxes** render + toggle-writes-back. ✅ DONE (2026-09-09).
   `toggleTaskInSource()` flips the Nth `- [ ]`/`- [x]` line by document order;
   interactive in both the center cell and the editor preview; persists via
   `PUT /api/notes/:id`.
3. **[M] FTS5 migration + `GET /api/notes/search` + topbar wiring.** ✅ DONE
   (2026-09-09). External-content `notes_fts` + AI/AD/AU triggers in
   `server/db.js`; one-time `'rebuild'` guarded by `PRAGMA user_version`
   (a `WHERE NOT IN` backfill is a no-op on external-content tables — learned
   the hard way). `GET /api/notes/search?q=` in `server/routes/notes.js`
   (declared before `/:id`), sanitised terms, last-term prefix match,
   `bm25(notes_fts, 5.0, 1.0)` title-weighted, `snippet()` over content.
   Topbar: instant local title filter, then debounced server results with
   snippet. Verified: prefix match, title-rank, operator-injection safety,
   401 when unauthed.
4. **[M] Inline `[[` autocomplete** ✅ DONE (2026-09-09), **hardened
   2026-09-09** (twice). Commits only on an explicitly highlighted row (arrow
   keys / hover / click — a bare Enter just inserts a newline and dismisses),
   requires ≥1 query char, bails next to an existing `]]`, rows show `#id` to
   disambiguate same-titled notes, never offers the current note. The "➕
   Create …" row is back but guarded: it never appears for a title that already
   exists or equals the current note's own title; on select, `choose()`
   re-checks for an existing title match and links to it rather than creating a
   duplicate. `server/routes/links.js` now hard-rejects a self-link
   (`Number(a) === Number(b)`, or non-integer/≤0 ids).
5. **[S] `[[Note]]` / `[[#id]]` links in rendered content** ✅ DONE
   (2026-09-09). `wikilink` marked extension resolves against `allNotesCache`
   (exact title or `#id`); resolved → `jumpTo(id)`, unresolved →
   `.wikilink.missing`. **Fixes 2026-09-09:** (a) `wikiResolve` excludes the
   note being rendered (`mdRenderContextId`) so `[[Adress]]` in a note titled
   "Adress" resolves to a *different* same-titled note, never itself; (b) a
   resolved link now closes the fullscreen editor before navigating (was
   navigating behind it); (c) clicking a *missing* link (`onCreateWiki` →
   `createLinkedNote`) offers "Create note "X" and link it here?" then jumps
   there. Verified the click→navigate / click→create wiring end-to-end with
   jsdom (DOMPurify keeps `class`/`data-note-id`/`href`).
6. **[S] Inline image paste/drop** with the `inline=1` attachment flag. ✅ DONE
   (2026-09-09). `POST /api/notes/:id/attachments` gained an `inline` branch
   (above the `type` validation): stores the file through the same
   `IMAGE_EXT`/`fileFilter`/50 MB path but creates **no** attachment note, **no**
   link, **no** history entry — returns `{ path: "/uploads/<file>" }`. Rejects
   non-image / missing file with 400. `buildNoteEditor` in `public/app.js` wires
   `paste` + `drop` on the editor textarea → `insertInlineImage()` drops a
   `![](uploading…#<t>)` placeholder at the caret, uploads, then swaps in
   `![](<path>)` (or clears the placeholder + toasts on failure); `dragover`
   preventDefault only when `Files` are present. Server-verified on a DB copy;
   **needs a real-browser pass** (clipboard image paste, drag from desktop).

## 5. Dependencies

- Independent of Domains 1/2/6 — can start immediately, in parallel with the
  trust-gate work.
- **Domain 3**: imported notes are raw markdown; milestone 1 is what makes them
  render correctly. Agree the `[[wikilink]]` syntax so import + editor + search
  all treat links the same.
- **Domain 5**: "due today" view can consume the checkbox convention from
  milestone 2.
- **Domain 7**: side-by-side live preview is a wide-screen affordance owned
  there; this domain ships the mobile preview toggle.
- External: none (self-hosted vendored libs).

## 6. Risks & mitigations

- **XSS via rendered markdown** — DOMPurify on every fragment, disable raw HTML
  in `marked`, allowlist attributes, `Content-Security-Policy` already strict for
  `/uploads`; add a page-level CSP that forbids inline event handlers.
- **FTS5 migration on a live DB with a hot 4 MB WAL** — run inside a transaction,
  `user_version` guard so it is one-shot, take a manual backup first (Domain 2),
  rehearse on a `DB_PATH` copy. Backfill is a single `INSERT … SELECT`; for a
  large corpus, chunk it.
- **Trigger drift** if a future migration rebuilds `notes` (Domain 2's FK
  rebuild) — document that `notes_fts` triggers must be recreated after any
  `notes` table rebuild; add them to the same migration block.
- **No-build markdown lib size on mobile** — `marked` + `DOMPurify` ≈ 60 KB
  gzipped, acceptable; lazy-load only when the first editor/preview opens if it
  matters.
- **Checkbox line-rewrite ambiguity** (duplicate identical lines) — match by
  ordinal index of `[ ]`/`[x]` tokens, not by text; re-render from server
  response.

## 7. Open questions for the founder

1. `marked` (small, plain) vs. `markdown-it` (plugins, larger) — preference?
2. Should the editor stay a plain textarea (recommended for mobile) or become a
   live rich editor (CodeMirror 6 / Milkdown — both need a build step)?
3. Inline images: create a linked attachment note (current behaviour) or a
   pure inline file with no node in the graph?
4. Search scope v1: title + content only, or also match on linked-note titles /
   tags?
5. Is fuzzy/typo-tolerant search wanted (needs trigram tokenizer or a spellfix
   table), or is prefix + bm25 enough?
