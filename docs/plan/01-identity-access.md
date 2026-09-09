# Domain 1 — Identity & Access

## 1. Goal

Replace the forgeable `nico_uid` cookie with real authentication so accounts can
be trusted and, later, billed. Deliver passwordless email login plus Google/Apple
OAuth, server-side sessions, and a clean migration for the handful of existing
users — without changing the `req.userId` contract that every downstream route
depends on.

## 2. Current state in code

- `server/index.js:39-52` — `parseCookies` + the `/api` middleware that reads
  `nico_uid`, coerces it to an integer, and sets `req.userId`. **Anyone can send
  `Cookie: nico_uid=2` and act as user 2.**
- `server/routes/session.js` — the whole "auth" surface:
  - `POST /api/session` (`:48-64`): takes an email, `INSERT`s a `users` row if
    new, sets `nico_uid` = the raw id for 365 days. No verification, no secret.
  - `GET /api/session` (`:18-30`): returns `{ user, widgetToken }`.
  - `DELETE /api/session` (`:66-69`): clears the cookie.
  - widget-token rotate/revoke (`:34-46`).
- `server/db.js:88-93` — `users` table: `id`, `email UNIQUE`, `created_at`.
  `:104` adds `widget_token`. Seed-user + row-adoption logic at `:158-179`.
- `public/app.js` — `showLogin()` / `doLogin()` (~`:2239-2258`), `api.login` /
  `api.logout` / `api.getSession` in the `api` object (~`:216`), and the account
  overlay handlers at the end of the file (`accountBtn`, `accountSwitchBtn`, …).
- `public/index.html` — `#login-overlay` (~`:129`) and the new `#account-overlay`.
- No cookie-signing secret, no `cookie-parser`, no HTTPS assumption in code
  (nginx terminates TLS per `CLAUDE.md`).

## 3. Proposed design

### 3.1 Sessions table + opaque tokens

Idempotent migration in `server/db.js` (new `CREATE TABLE IF NOT EXISTS` +
`PRAGMA` guards, per the ground rules):

```
sessions(
  id            TEXT PRIMARY KEY,        -- 32 random bytes, base64url
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL,
  expires_at    TEXT NOT NULL,           -- sliding, e.g. now + 60d
  ua            TEXT,                    -- User-Agent, for the "sessions" list
  ip_hash       TEXT                     -- sha256(ip + salt), coarse
)
CREATE INDEX idx_sessions_user ON sessions(user_id, last_seen_at DESC);
```

- New cookie `nico_sess` = the opaque `sessions.id`. `httpOnly`, `secure`,
  `sameSite=lax`, `path=/`, `maxAge` = 60d.
- `server/index.js` `/api` middleware changes: look up `nico_sess` in `sessions`,
  check `expires_at > now`, set `req.userId = row.user_id`, bump `last_seen_at`
  (throttle writes to once/5 min). Keep the exact `req.userId` shape — **no
  route under `server/routes/` changes.**
- Transitional shim (one release only): if no `nico_sess` but a valid legacy
  `nico_uid` is present, mint a session, set the new cookie, clear `nico_uid`.
  Remove the shim after ~30 days (tracked as its own milestone).

### 3.2 Magic-link login

- `POST /api/auth/request-link` `{ email }` → always returns `202` (no account
  enumeration). Creates a `login_tokens` row and emails a link.

```
login_tokens(
  token_hash  TEXT PRIMARY KEY,   -- sha256 of the 32-byte secret in the URL
  email       TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,      -- now + 15 min
  consumed_at TEXT
)
```

- `GET /api/auth/callback?token=…` → validate (exists, unconsumed, unexpired),
  `consumed_at = now`, upsert the `users` row, set `email_verified_at`, create a
  session, redirect to `/`.
- Link opened on a different device is fine (token in URL, not tied to cookie).

### 3.3 OAuth (Google, then Apple)

- Library: **`arctic`** (v3, tiny, framework-agnostic OAuth2/OIDC helper) +
  Node's built-in `crypto`. Avoids `passport` and its plugin sprawl.
- Routes: `GET /api/auth/oauth/:provider/start` (sets a signed state cookie,
  redirects) and `GET /api/auth/oauth/:provider/callback` (exchanges code, reads
  verified email, upserts user, creates session).
- Account linking: match on verified email. If an email already exists, attach
  the provider identity to that user.

```
oauth_identities(
  provider     TEXT NOT NULL,     -- 'google' | 'apple'
  provider_uid TEXT NOT NULL,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (provider, provider_uid)
)
```

- Apple is fiddly (JWT client secret signed with a `.p8` key, form-post response
  mode). Ship Google first; Apple is its own `[M]` milestone and is required for
  App Store review of the wrapped app (Domain 7).

### 3.4 Email delivery

Provider: **Resend** (simplest API, generous free tier, good deliverability) or
**Postmark** (best deliverability, transactional-only ethos) — recommend
**Postmark** because magic links landing in spam is a direct conversion leak.
SES only if cost becomes a factor at scale. One module `server/mailer.js`
wrapping the HTTP API; keys via env (`MAIL_PROVIDER`, `MAIL_API_KEY`,
`MAIL_FROM`, already have `VAPID_CONTACT` as a pattern). Add SPF/DKIM DNS records
to the real domain (Domain 7 owns the domain).

### 3.5 Hardening

- Rate limiting: in-process token-bucket keyed by IP + email for
  `request-link`, by IP for OAuth start and callback. `express-rate-limit` with
  the default memory store is fine for one box; note it resets on restart.
- CSRF: all state-changing routes are `POST` with `sameSite=lax` cookies and a
  JSON content-type check (`app.js` already sends `application/json`). Add an
  `Origin`/`Referer` allowlist check on non-GET `/api` requests as defence in
  depth. OAuth callbacks use the signed `state` cookie.
- `GET /api/auth/sessions` (list) + `DELETE /api/auth/sessions/:id` +
  `DELETE /api/auth/sessions` (all-but-current = "log out everywhere").
- Login-token + session secrets: 32 bytes from `crypto.randomBytes`, stored
  hashed (`login_tokens`) or as the raw random id (`sessions` — the id itself is
  the secret, 256-bit, unguessable; acceptable, or hash it too for defence).

### 3.6 Frontend (`public/app.js`, `public/index.html`)

- `#login-overlay`: replace the single email field's submit with "Email me a
  link" (calls `request-link`, then shows "check your inbox"), plus "Continue
  with Google" / "Continue with Apple" buttons that navigate to the start URLs.
- `doLogin()` → `requestLink()`; drop the "instant login" behaviour.
- `api.login` removed; add `api.requestLink`. `api.logout` → `DELETE
  /api/session` (unchanged path, now deletes the session row).
- Account overlay: add a "Devices / sessions" list with revoke buttons, wired to
  `GET/DELETE /api/auth/sessions`. "Sign in as someone else" already calls
  `api.logout()` then reload — keep.
- `GET /api/session` response shape unchanged (`{ user, widgetToken }`) so the
  rest of the app is untouched.

## 4. Milestones

1. **[M] Sessions core.** ✅ DONE (2026-09-09). `sessions` table
   (`server/db.js`), `server/sessions.js` (create/resolve/destroy/list/sweep,
   opaque 32-byte base64url id, 60-day sliding expiry, throttled `last_seen`),
   cookie swap + legacy `nico_uid` upgrade shim in `server/index.js`,
   `POST /api/session` creates a session, `DELETE /api/session` destroys it.
   `COOKIE_INSECURE=1` escape hatch for local HTTP tests. Verified: legacy
   upgrade, forged-cookie rejection, login/logout lifecycle, 401 when
   unauthed. _Unblocks everything below._
2. **[M] Magic-link login.** ✅ DONE (2026-09-09). `login_tokens` table
   (sha256 of a 32-byte secret, 15-min TTL, single-use via compare-and-set),
   `POST /api/auth/request-link` (uniform 202, no enumeration) +
   `GET /api/auth/callback` (consume → upsert user → session → redirect),
   `server/mailer.js` (nodemailer → **Gmail SMTP**, creds in gitignored
   `data/mail.json`, reused from `/srv/ai_bot`; env-var overrides; logs the link
   when unconfigured). `POST /api/session` legacy email login now returns 410.
   `#login-overlay` reworked to "Email me a link" + inbox confirmation +
   `?login=invalid` handling. Verified: real Gmail send (250 OK), token
   consume + reuse-rejection, minted session authenticates.
   _Note:_ swap to Postmark/Resend later for deliverability (Gmail SMTP has send
   limits ~500/day and SPF/DKIM is `ia-ai.se`'s, not the product domain).
3. **[S] Rate limiting + Origin check + email verification stamp.** Rate
   limiting DONE (in-memory per-IP + per-email buckets in `routes/auth.js`).
   Origin/Referer allowlist check + `users.email_verified_at` stamp still TODO.
4. **[M] Google OAuth.** `arctic`, `oauth_identities`, start/callback routes, UI
   buttons.
5. **[S] Session management UI.** `GET/DELETE /api/auth/sessions` + account
   overlay list. ✅ DONE (2026-09-09).

   **What shipped:** three routes in `server/routes/auth.js` (mounted above the
   cookie gate; each guards on `req.userId` from `resolveSession`):
   `GET /api/auth/sessions` → `{ sessions: [{ sid, current, created_at,
   last_seen_at, expires_at, ua }] }` where `sid` = `sha256(session id).slice(0,16)`
   (the raw id is the auth secret and is never sent to the client);
   `DELETE /api/auth/sessions/:sid` revokes the one whose hash-prefix matches
   among the caller's own sessions (clears the cookie too if it was the current
   one); `DELETE /api/auth/sessions` = "log out everywhere else" via the existing
   `sessions.destroyOthers(userId, keepToken)`. No new deps / schema — reuses
   `sessions.list` / `.destroy` / `.destroyOthers`. Frontend: **Settings →
   Account → "Signed-in devices"** — `renderSessions()` lists each row as
   `deviceLabel(ua)` ("Chrome on Android" etc., from a small UA regex) + "active
   N min ago" (`relTime`), a "— this device" marker on the current one and a
   per-row "Sign out" button on the others, plus a "Sign out all other devices"
   button (confirm dialog). `api.listSessions/revokeSession/revokeOtherSessions`
   added; list re-renders after each action; revoking the current device isn't
   offered in the UI. `.session-list/.session-row/...` styles in `style.css`.
   Verified on a DB copy: list shape + `current` flag, single revoke removes just
   that row, revoke-others leaves exactly the caller's session (still valid for
   `GET /api/notes`), unauth → 401.
6. **[M] Apple OAuth.** `.p8` client-secret signing, form-post callback. Needed
   before Domain 7's iOS listing.
7. **[S] Remove the `nico_uid` shim** (~30 days after milestone 1).

## 5. Dependencies

- **Provides the foundation for Domain 6 (Monetization)** — plan gating needs a
  real account and a stable `user_id`.
- **Shares the email provider with Domain 3** (email-to-note) and Domain 5
  (digest emails) — pick it here.
- **Domain 7** owns the production domain + DNS (SPF/DKIM) and the OAuth consent
  screen branding; coordinate on the callback URLs.
- External: Postmark (or Resend) account; Google Cloud OAuth client; Apple
  Developer account + Services ID + key.

## 6. Risks & mitigations

- **Locking out the existing seed user / breaking the live session.** The
  `nico_uid` shim makes the cutover seamless; test on a `DB_PATH` copy at another
  `PORT` first, and keep the shim until analytics show ~zero legacy cookies.
- **Magic links in spam.** Postmark + correct DNS; monitor the Postmark bounce
  webhook; offer OAuth as the primary path in the UI.
- **In-memory rate-limit + session `last_seen` writes on every request.**
  Throttle `last_seen` writes; accept that rate-limit counters reset on restart
  (one box, infrequent restarts).
- **Apple OAuth review churn.** Budget a separate milestone; do not block launch
  of web on it.
- **Session fixation / token leakage in URLs.** Login tokens are single-use and
  15-min; rotate the session id on privilege change; `Referrer-Policy:
  same-origin` header so the `?token=` callback URL is not leaked onward.

## 7. Open questions for the founder

1. Is a username/password path ever needed, or is magic-link + OAuth acceptable
   forever? (Recommend: no passwords.)
2. Postmark vs. Resend — any existing account or preference?
3. Production domain + is DNS already controlled? (Blocks email + OAuth.)
4. Google-only at launch, or is Apple sign-in required for the first paid
   release? (Apple review needs it once the wrapped iOS app exists.)
5. Session lifetime: 60-day sliding acceptable, or shorter for a paid product?
6. Do we need multi-device "approve this login" or is a link/OAuth enough?
