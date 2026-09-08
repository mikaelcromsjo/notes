# CLAUDE.md

Personal notes app: notes are a link graph, rendered as a 3x3 grid around one centered note. Express + better-sqlite3 (`server/`), no-build vanilla-JS IIFE (`public/`). No bundler, no tests, no lint.

## Run

- `npm start` (= `node server/index.js`). `npm install` for deps.
- Env: `PORT` (8040), `HOST` (127.0.0.1), `DB_PATH` (sqlite file, for testing on a copy), `SEED_USER_EMAIL`, `PUBLIC_ORIGIN` (widget-feed link base; else forwarded headers), `VAPID_CONTACT`.
- **Restart after any `server/` change** — code and `db.js` migrations only load on boot. `public/` is static, no restart.
- A PostToolUse hook in `.claude/settings.local.json` (gitignored, per-machine) auto-restarts the bare `node server/index.js` after any `server/**` edit, logging to `data/server.log`.
- A bare `node server/index.js` is usually already running (no systemd). Check `ps aux | grep server/index.js` before a 2nd instance — WAL lock clash.

## Gotchas

- `data/notes.db` is the **only copy of real user data**. Never rm/reset it. To test server logic, `Database(src).backup(dest)` and run with `DB_PATH` on another `PORT`.
- Multi-user, no auth: `nico_uid` cookie → `req.userId`; every route scopes by it. `data/` + `node_modules/` gitignored.
- Exception to the cookie gate: `/api/widget?token=` is token-authed, mounted **above** it in `index.js`. Token in `users.widget_token`, minted on `GET /api/session`, rotate/revoke via `POST`/`DELETE /api/session/widget-token`.
- Schema changes: idempotent `PRAGMA table_info` + `ALTER TABLE` in `db.js`, not `CREATE TABLE` edits.
- `GET /api/notes/:id/neighbors` returns `{ parent, neighbors }` (not an array). `neighbors` ranked by `nav_events` history (`SCORE_W`/`HALF_LIFE_DAYS` in `notes.js`); cold-start = link recency. `parent` = probable back-link.
- Attachments are notes with `type != 'text'`; payload in `attachment_path`. Read the `POST /:id/attachments` branching in `notes.js`. Upload ext comes from a MIME allowlist (`IMAGE_EXT`/`AUDIO_EXT`, no SVG), not the client filename; `/uploads` is served with `nosniff` + sandbox CSP.
- `POST /api/push/subscribe` rejects non-https endpoints and hosts resolving to loopback/link-local/RFC1918 IPs (SSRF guard in `webpush.js`, re-checked at send time). Push writes scoped by `user_id`.
- nginx (`test.ia-ai.se` → `:8040`) `client_max_body_size` caps upload size — check it before blaming the app.

## Layout

- `server/routes/`: `notes` `links` `tabs` (graph + UI state) · `session` (email login + widget token) · `nav` (logs each move) · `stats` (note-heat / clusters / insights, all derived from `nav_events`) · `alarms` (per-note wake-ups; dumb store — client computes fire times in the viewer's TZ since the box runs UTC, server persists `alarm_time`/`alarm_days`/`alarm_date`/`alarm_ack_at`/`alarm_next_at`) · `push` (Web Push subscribe, endpoint SSRF-validated; VAPID keys in `data/vapid.json`; send logic in `webpush.js`) · `widget` (read-only feed, token-authed) · `history` (undo/redo log; `history.js` records entries from other routes, `routes/history.js` reverses them).
- `server/alarm-scheduler.js`: 30s `setInterval` from `index.js`; when `alarm_next_at <= now` and not yet pushed, sends one Web Push and stamps `alarm_pushed_at`. The client rolls `alarm_next_at` forward (and clears `alarm_pushed_at`) on every poll while open — so alarms only stay armed for closed-app delivery if the app is opened between rings.
- `public/app.js`: `render()` draws the grid; `goTo()`/`jumpTo()` navigate + `logNav()`; centered note is **read-only**, click opens the fullscreen editor (`buildNoteEditor`); `attachCardDrag`→`rehomeCard` drags a card's link from center to another card (Android via Pointer Events); `🎨` colour toggle, `📊` insights.
- `public/style.css`: phone type scale lives only in the shared `@media (max-width:640px), (max-height:500px)` block — keep `font-size` out of the per-orientation blocks.
- `public/sw.js`: PWA install + push delivery only — no caching/fetch interception (code stays live); clears any legacy caches on activate.
