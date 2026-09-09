# Domain 5 — Reminders & Resurfacing

## 1. Goal

This is the retention wedge and the headline reason to pick this app over Google
Keep or Obsidian mobile. Turn the basic per-note alarm into a real reminder
system (snooze, natural recurrence, one "what's due" view) and use the graph +
navigation history to actively resurface notes the user would otherwise lose.

## 2. Current state in code

- Schema (`server/db.js:75-86`): `notes.alarm_time` (HH:MM, viewer TZ),
  `alarm_days` (CSV of JS `getDay()`), `alarm_date` (one-shot), `alarm_ack_at`,
  `alarm_next_at` (absolute UTC of next ring, computed client-side),
  `alarm_pushed_at`, `alarm_last_fired` (unused).
- `server/routes/alarms.js`: `GET /` (all armed alarms for the user),
  `PUT /:noteId`, `DELETE /:noteId`, `POST /:noteId/ack`,
  `POST /:noteId/schedule` (roll `alarm_next_at` forward). **The server never
  computes fire times** — the client does, because the box is UTC and "08:00"
  means the viewer's 08:00.
- `server/alarm-scheduler.js`: 30 s `setInterval`; when `alarm_next_at <= now`
  and not yet pushed, sends one Web Push via `server/webpush.js` `sendToUser`,
  stamps `alarm_pushed_at`.
- Client (`public/app.js`): `checkAlarms()` on load + every 30 s +
  `visibilitychange`; `mostRecentAlarmTrigger` / `nextAlarmOccurrence` compute
  times; alarm editor overlay (`#alarm-overlay`) with time input + day chips +
  one-time date; alarm popup overlay for ringing.
- `nav_events` (`server/db.js:96-109`, 90-day retention) + `server/routes/
  stats.js` already compute decayed visit "heat", label-propagation clusters,
  top notes/paths, and **orphans** (notes never in a nav event).
- `push_subscriptions` per user; `web-push` with VAPID keys in
  `data/vapid.json`; SSRF guard in `server/webpush.js`.
- One reminder per note only. No snooze. No cross-note "agenda". No digest.

## 3. Proposed design

### 3.1 Multiple reminders + snooze

- New table (keeps `notes` clean, allows many per note):

```
reminders(
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id       INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,      -- 'time' | 'location'
  time          TEXT,              -- HH:MM (viewer TZ), for kind='time'
  rule          TEXT,              -- RRULE-ish string, see 3.2; '' = one-shot
  date          TEXT,              -- YYYY-MM-DD one-shot
  lat REAL, lon REAL, radius_m INTEGER,  -- kind='location'
  tz            TEXT NOT NULL,     -- IANA zone captured at create time
  next_at       TEXT,              -- absolute UTC; client-computed as today
  ack_at        TEXT,
  pushed_at     TEXT,
  snooze_until  TEXT,              -- overrides next_at when set
  created_at    TEXT NOT NULL
)
CREATE INDEX idx_reminders_due ON reminders(next_at) WHERE next_at IS NOT NULL;
```

- Migration: keep the `notes.alarm_*` columns working; add a one-shot backfill
  that copies each armed `notes.alarm_*` into a `reminders` row
  (`user_version` guard). Route `server/routes/alarms.js` gains list/create/
  update/delete at the reminder grain; the old `/:noteId` shape stays as a
  compatibility wrapper for one release, then `public/app.js` moves to the new
  shape.
- **Snooze**: `POST /api/alarms/:id/snooze { minutes }` (or `until`). The push
  notification (`public/sw.js` `notificationclick`) gets "Snooze 10m / 1h /
  tonight" actions that call this. Scheduler treats `snooze_until` as the due
  time when present, clears it on fire.
- Store `tz` per reminder so the server can *sanity-check* client math and so a
  digest job (below) can compute correct local times without a live client.

### 3.2 Natural-language recurrence

- Client-side parser (small, vendored — e.g. adapt `chrono-node` for dates +
  a tiny custom layer for recurrence) turning "every weekday 8am", "every
  Monday and Thursday", "first of the month", "every 2 weeks" into a compact
  `rule` string (a constrained RRULE subset: `FREQ`, `BYDAY`, `INTERVAL`,
  `BYMONTHDAY`). The alarm editor gets a free-text field with a parsed preview
  ("→ Mon, Thu at 08:00; next: Thu 9 Sep").
- The client still computes `next_at` in the viewer's TZ (preserves the current
  architecture); `rule` is what it iterates. Server persists, validates the rule
  shape, never interprets it except in the digest fallback.
- Keep the day-chip UI as the simple path; NL is the power path.

### 3.3 "Due today / upcoming" agenda

- `GET /api/agenda` → for the user, all `reminders` with `next_at` within a
  window (overdue, today, next 7 days), joined to note title/status, grouped.
  Also include `- [ ]` open-task counts per note (Domain 4 convention) as a
  secondary list.
- `public/app.js`: a new agenda overlay (reuse `.overlay`/`.picker`), reachable
  from a topbar bell icon with an overdue count badge. Rows: snooze, mark done
  (`PUT /api/notes/:id/status`), open note. This is the screen users will open
  every morning — it is the habit hook.
- Widget feed (`server/routes/widget.js`) gains an "agenda" mode so the home
  screen shows what's due.

### 3.4 Resurfacing digests

- `digest_prefs` (or columns on `users`): `enabled`, `cadence`
  ('daily'|'weekly'|'off'), `hour` (local), `tz`, `last_sent_at`.
- New `server/digest-scheduler.js` (same `setInterval` pattern as
  `alarm-scheduler.js`, hourly tick). For each user whose local `hour` matches
  and who is due, build a digest from existing signals:
  - **On this day** — notes with `created_at` on this month/day in prior years.
  - **Stale cluster** — a label-propagation cluster (`stats.js` logic) with no
    `nav_events` in N days; surface its top note.
  - **Orphans** — reuse the `orphans` query in `server/routes/stats.js:` (notes
    never navigated); pick 1–3 oldest.
  - **Loose ends** — notes with open `- [ ]` tasks and no recent visit.
  - **Cooled-off favourite** — previously high decayed-heat note now cold.
- Delivery: Web Push (deep link to the note) and/or email (Domain 1 provider),
  per `digest_prefs`. Push payload reuses the `sendToUser` shape; `sw.js`
  handles a `type:'digest'` click → open `/#<noteId>` or an agenda view.
- `GET /api/insights` already returns most of the raw material for an in-app
  "Review" tab — add a `/api/review` endpoint that returns the same digest
  bundle for on-demand viewing, so the feature is usable without notifications.

### 3.5 Location reminders (optional, later)

- `kind='location'` reminders. Client registers a coarse geofence
  (`navigator.geolocation.watchPosition` while the PWA is open; a real
  background geofence needs the wrapped app from Domain 7). On enter/exit radius
  of `(lat,lon)`, fire locally + `POST .../ack`. Reuse `notes.lat/lon` when the
  note itself is geotagged ("remind me when I'm near here").

## 4. Milestones

1. **[M] `reminders` table + backfill + route rework**; `public/app.js` moves to
   the reminder grain. Old `/:noteId` shim kept one release. ✅ DONE (2026-09-09) —
   no `/:noteId` shim (id semantics flip from note→reminder can't be served both
   ways from one path; single-user beta, static assets, immediate reload). Routes
   now `GET /` · `POST /` (`noteId` in body) · `PUT`/`DELETE /:id` ·
   `POST /:id/ack|snooze|schedule`. `notes.alarm_*` backfilled under
   `user_version < 2`, no longer written. `tz` captured on save.
2. **[S] Snooze**: endpoint + push-notification actions + scheduler handling.
   ✅ PARTIAL (2026-09-09) — `POST /api/alarms/:id/snooze {until}` +
   `snooze_until` overriding `next_at` in the scheduler + a "Snooze…" `<select>`
   on the ring popup: 10 min / 1 h / 3 h / Tonight (20:00) / Tomorrow / 1·2·3
   weeks / 1·2·3 months, all computed in the viewer's TZ. Still TODO: `sw.js`
   notification action buttons so a background push can be snoozed without
   opening the app.
3. **[M] Natural-language recurrence** parser + editor field + `rule` iteration.
4. **[M] Agenda**: `GET /api/agenda`, the overlay, topbar bell + badge, widget
   agenda mode.
5. **[L] Digests**: `digest_prefs`, `digest-scheduler.js`, digest builder from
   `stats.js` signals, push + email delivery, `/api/review` + in-app Review tab,
   settings UI.
6. **[S] Location reminders** (in-app / foreground only) — full background
   geofence deferred to the Domain 7 wrapper.

## 5. Dependencies

- **Independent of the trust gate** — can start in parallel with Domains 1/2.
- **Domain 1** — digest *email* needs the mail provider; digest *push* does not.
- **Domain 4** — "loose ends" / task counts consume the `- [ ]` checkbox
  convention.
- **Domain 6** — digests and multiple-reminders are natural Pro-tier gates;
  expose an entitlement check.
- **Domain 7** — background geofencing and reliable background push on iOS need
  the wrapped app; App Store review will look for a clear reminder-permission
  rationale.
- External: none beyond existing VAPID + (optional) mail provider.

## 6. Risks & mitigations

- **UTC box vs. viewer TZ** — the current design deliberately computes fire
  times client-side. Keep that; store `tz` per reminder only as a fallback for
  the server-side digest job, and unit-test the digest's TZ math hard.
- **Digest becomes spam → churn** — default cadence weekly, one clear unsub link
  / toggle, cap items, respect quiet hours, never send an empty digest, track
  open/click and back off automatically.
- **Web Push unreliability on iOS PWA** — the agenda screen and `/api/review`
  make the feature useful even when a push never arrives; the wrapper (Domain 7)
  improves delivery.
- **Backfill / migration** touching every armed alarm — `user_version` guard,
  rehearse on a `DB_PATH` copy, manual backup first (Domain 2).
- **Scheduler duplication** if a second process starts — the existing
  `alarm_pushed_at < alarm_next_at` guard pattern must be mirrored for
  `reminders` and for `digest_prefs.last_sent_at` (compare-and-set).
- **NL parser wrong-but-confident** — always show the parsed preview and the
  concrete next fire time before save; never store an unparsed rule.

## 7. Open questions for the founder

1. Is recurrence-by-natural-language a launch feature or a fast-follow? (Day
   chips already cover the common case.)
2. Digest channel priority: push, email, or in-app "Review" tab first?
3. Which resurfacing signals feel most valuable — "on this day", stale clusters,
   orphans, loose ends? (Pick 2 for v1.)
4. Should reminders detach from notes entirely (a bare "remind me to…" that
   creates a note), matching the executive-function positioning?
5. Location reminders — worth doing before the app-store wrapper exists, given
   background geofencing won't work in the PWA?
6. Free vs. Pro line: is >1 reminder per note, or recurrence, or digests the
   gate?
