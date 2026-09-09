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
- Multi-user: opaque `nico_sess` cookie → `sessions` row → `req.userId`/`req.sessionId` (see `server/sessions.js`); every route scopes by `req.userId`. Session created on email login (`POST /api/session`), destroyed on `DELETE /api/session`. The legacy raw-id `nico_uid` cookie is auto-upgraded to a session by the `/api` middleware in `index.js` (migration shim — remove after users have migrated). `COOKIE_INSECURE=1` drops the `Secure` flag for local HTTP testing. `data/` + `node_modules/` gitignored.
- Exception to the cookie gate: `/api/widget?token=` is token-authed, mounted **above** it in `index.js`. Token in `users.widget_token`, minted on `GET /api/session`, rotate/revoke via `POST`/`DELETE /api/session/widget-token`.
- Schema changes: idempotent `PRAGMA table_info` + `ALTER TABLE` in `db.js`, not `CREATE TABLE` edits.
- `GET /api/notes/:id/neighbors` returns `{ parent, neighbors }` (not an array). `neighbors` ranked by `nav_events` history (`SCORE_W`/`HALF_LIFE_DAYS` in `notes.js`); cold-start = link recency. `parent` = probable back-link.
- Attachments are notes with `type != 'text'`; payload in `attachment_path`. Read the `POST /:id/attachments` branching in `notes.js`. Upload ext comes from a MIME allowlist (`IMAGE_EXT`/`AUDIO_EXT`, no SVG), not the client filename; `/uploads` is served with `nosniff` + sandbox CSP.
- `POST /api/push/subscribe` rejects non-https endpoints and hosts resolving to loopback/link-local/RFC1918 IPs (SSRF guard in `webpush.js`, re-checked at send time). Push writes scoped by `user_id`.
- nginx (`test.ia-ai.se` → `:8040`) `client_max_body_size` caps upload size — check it before blaming the app.

## Layout

- `server/routes/`: `notes` `links` `tabs` (graph + UI state) · `session` (session/user lookup + widget token; legacy `POST` login now 410) · `auth` (passwordless magic link: `POST /api/auth/request-link` → `GET /api/auth/callback`; `login_tokens` table; `server/mailer.js` = nodemailer→Gmail SMTP, creds in gitignored `data/mail.json`, logs link if unconfigured) · `nav` (logs each move) · `stats` (note-heat / clusters / insights, all derived from `nav_events`) · `alarms` (per-note wake-ups; dumb store — client computes fire times in the viewer's TZ since the box runs UTC, server persists `alarm_time`/`alarm_days`/`alarm_date`/`alarm_ack_at`/`alarm_next_at`) · `push` (Web Push subscribe, endpoint SSRF-validated; VAPID keys in `data/vapid.json`; send logic in `webpush.js`) · `widget` (read-only feed, token-authed) · `history` (undo/redo log; `history.js` records entries from other routes, `routes/history.js` reverses them).
- `server/alarm-scheduler.js`: 30s `setInterval` from `index.js`; when `alarm_next_at <= now` and not yet pushed, sends one Web Push and stamps `alarm_pushed_at`. The client rolls `alarm_next_at` forward (and clears `alarm_pushed_at`) on every poll while open — so alarms only stay armed for closed-app delivery if the app is opened between rings.
- `public/app.js`: `render()` draws the grid; `goTo()`/`jumpTo()` navigate + `logNav()`; centered note is **read-only**, click opens the fullscreen editor (`buildNoteEditor`); `attachCardDrag`→`rehomeCard` drags a card's link from center to another card (Android via Pointer Events); `🎨` colour toggle, `📊` insights.
- Markdown: `content` is GFM markdown, rendered via vendored `public/vendor/marked.min.js` + `purify.min.js` (`renderMarkdownInto`); `[[Title]]`/`[[#id]]` wikilinks resolve against `allNotesCache` (a marked inline extension) and navigate on click; task checkboxes toggle and write back through `toggleTaskInSource` + `PUT /api/notes/:id`. Editor has a Preview toggle; the textarea has `[[` autocomplete (`attachWikiAutocomplete`) that also creates the graph link.
- Search: `GET /api/notes/search?q=` over FTS5 (`notes_fts` external-content table + triggers in `db.js`, one-time `'rebuild'` gated by `PRAGMA user_version`). Topbar does an instant local title filter then swaps in debounced server results.
- `public/style.css`: phone type scale lives only in the shared `@media (max-width:640px), (max-height:500px)` block — keep `font-size` out of the per-orientation blocks.
- `public/sw.js`: PWA install + push delivery only — no caching/fetch interception (code stays live); clears any legacy caches on activate.
