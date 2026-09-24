# CLAUDE.md

Native Android wrapper for the notes PWA one level up (`/srv/notes`, server repo,
port 8050, notes.ia-ai.se) — a sub-project in the same git repo, not a separate
checkout. Package `se.iaai.notes`, plain framework APIs only — **no
AndroidX/Jetpack deps** (kept out on purpose, see `app/build.gradle`).

## What it is

- `MainActivity`: a `WebView` pointed at `base_url` (`app/src/main/res/values/strings.xml`,
  currently `https://notes.ia-ai.se`) — cookies persist, the PWA's own service
  worker registers itself normally. Wires up bits a bare WebView can't do alone:
  `<input type=file>` chooser, mic/geolocation permission bridging, `<a download>`
  → `DownloadManager`. App Links (`autoVerify`, `public/.well-known/assetlinks.json`
  on the server) route a tap on any `notes.ia-ai.se` link straight into this
  activity instead of a browser.
- Two home-screen widgets, both read-only feeds off `GET /api/widget?token=...`
  (`server/routes/widget.js` in `/srv/notes`), refreshed every 30 min
  (`updatePeriodMillis` in `app/src/main/res/xml/*_widget_info.xml`) plus a nudge
  from `MainActivity.onPause` and (grid) on every tap-to-recenter:
  - `GridWidgetProvider` — 3x3 mirror of the app's grid; tapping the centre opens
    that note for real editing, tapping a neighbour re-centers the widget in
    place (stored per-widget-id in `SharedPreferences["notes_widget_prefs"]`).
  - `AgendaWidgetProvider` — overdue/today reminder counts + next couple of
    items (`?mode=agenda&tz=`), tap opens the next due item.
  - Both: on a network exception, retry with backoff (`MAX_NETWORK_RETRIES`/
    `RETRY_DELAYS_MS`, currently 2 tries at 3s/8s) before giving up and showing
    "Couldn't reach server" — added because the 30-min system update cycle
    otherwise leaves a transient wifi/DNS blip stuck until the next tick. A 401
    triggers one token-resync-and-retry first (`WidgetTokenSync`), separate
    from and prior to the network-retry counter.
- `WidgetTheme`: approximates the account's live app theme (server's
  `theme.colors`/`theme.font`, i.e. `public/themes.js`'s `effectiveColors`) onto
  the two RemoteViews widgets — flat colours carry over exactly, fonts collapse
  to Android's three built-in families, no gradients/images.
- `WidgetTokenSync`: gets `widget_token` the same way the web app's account
  overlay does (`GET /api/session`'s `widgetToken` field), reading the session
  cookie straight out of `CookieManager` — no manual copy/paste needed in the
  normal case.
- `SettingsActivity`: manual fallback only (paste/sync the token by hand) —
  reached via a long-press-launcher-icon shortcut, needed if third-party-cookie
  restrictions ever block the automatic sync, or after "Reset URL" server-side.
- `ReminderPollReceiver` + `BootReceiver`: self-rescheduling `AlarmManager` poll
  (`POLL_INTERVAL_MS`, 20 min, `setAndAllowWhileIdle`) of the same agenda feed,
  raising a real system notification for anything newly due. Exists because Web
  Push (`server/webpush.js`) generally can't wake a *closed* WebView-wrapped app
  — without this, background reminder delivery silently wouldn't happen here at
  all. `BootReceiver` re-arms it after a reboot (alarms don't survive one).

## Build / run

- `./gradlew assembleDebug` (or `installDebug` with a device/emulator attached).
  Java 17, `compileSdk 34`, `minSdk 26`.
- To point a build at a different backend (e.g. `test.ia-ai.se` / port 8040),
  change `base_url` in `strings.xml` — it's baked in at build time, not runtime
  configurable beyond `SettingsActivity`'s token (which is backend-specific too:
  a token minted by one server won't authenticate against the other).

## Gotchas

- Widget token, theme cache, and grid re-center state all live in plain
  `SharedPreferences` (`notes_widget_prefs` / `SettingsActivity.PREFS`) — no
  encryption, no backup exclusion beyond `android:allowBackup` default.
- `RemoteViews` can't run arbitrary code — any change to what a widget shows
  needs a matching layout variant per font family (`widget_grid.xml` /
  `_mono.xml` / `_serif.xml`, same for agenda) picked by `WidgetTheme.gridLayout()`
  / `agendaLayout()`.
- The grid widget's re-center-on-tap only updates that one widget instance's own
  stored center — it never touches the server's `tabs` table, so it can't drift
  the web app's own active note (see `server/routes/widget.js`'s `?center=` param).
