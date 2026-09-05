# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- Run: `npm start` (= `node server/index.js`). No build step, bundler, or transpiler.
- Install: `npm install`.
- No test suite and no lint config exist in this repo.
- Env vars: `PORT` (default `8040`), `HOST` (default `127.0.0.1`) — see `server/index.js`.

## Data safety

- **Not a git repo.** `data/notes.db` (WAL mode, `data/notes.db-wal`/`-shm`) is the *only* copy of real, live user data — never `rm`/reset it as a "clean slate" step. There is no seed/fixture data here; every note in it is real.
- The server is normally already running in the background as a bare `node server/index.js` process (no systemd/pm2). Check `ps aux | grep server/index.js` before starting a second instance — both would hold WAL locks on the same db file.

## Architecture

Express + better-sqlite3 backend (`server/`), no-build vanilla JS frontend (`public/`).

- `server/index.js` — app bootstrap: mounts the three routers under `/api/*`, serves `public/` statically, serves `data/uploads/` at `/uploads`.
- `server/db.js` — schema for `notes`, `links`, `tabs`, plus migrations. New columns are added via idempotent `PRAGMA table_info` + `ALTER TABLE` checks; follow that pattern for schema changes rather than editing `CREATE TABLE`.
- `server/routes/notes.js` — note CRUD, pin/unpin, `GET /:id/neighbors` (linked notes), and `POST /:id/attachments` (see below). Read `ATTACHMENT_TYPES` and the per-type branching there for exact upload/field requirements.
- `server/routes/links.js` — link/unlink two notes; pairs are always normalized to `note_a < note_b`.
- `server/routes/tabs.js` — tab bar persistence (open/move/activate/close), independent of the notes graph itself.

**Notes are a linked graph, not a tree.** Any note can link to any other via the `links` table; the frontend renders the graph as a 3x3 grid centered on one note at a time.

**Attachments are notes, not a separate schema.** An attachment (image, audio, contact, or app-link) is a regular row in `notes` with `type != 'text'`, linked to its parent via `links`, with `created_from_note_id` recording provenance and `attachment_path` holding the type-specific payload (uploaded file path under `/uploads`, a JSON blob, or a URI). See the column comments in `server/db.js` and the type-branching in `notes.js`'s `POST /:id/attachments` for exactly what each type expects/stores — don't assume, read that function.

**Frontend is a single IIFE** in `public/app.js`, no framework. Key entry points to read rather than behavior to memorize:
- `render()` — draws the 3x3 grid around `currentId`.
- `renderTabbar()` / `renderPinbar()` — tabs and pins are UI-only concerns layered on top of the graph, unrelated to note linking.
- `openPicker()` + the `pickerCreateBtn` click handler — the single entry point for creating any note (plain text or an attachment style); it always sets the link target to the current center note (`pendingLinkTarget`).
- `getLocation()` — best-effort, non-blocking GPS capture attached to notes on creation.
- `buildAttachmentPreview()` / `buildMetaLine()` — how a note's type-specific payload and provenance/GPS metadata are rendered when it's centered.

## Deployment

Reverse-proxied by nginx (`/etc/nginx/sites-available/test`, outside this repo) at `test.ia-ai.se` → `127.0.0.1:8040`. That config's `client_max_body_size` matters for photo/audio attachment uploads — check it before assuming an upload failure is an app bug.
