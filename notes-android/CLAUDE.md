# CLAUDE.md

Native Android companion for the notes PWA one level up (`/srv/notes`, server repo,
port 8050, notes.ia-ai.se) — a sub-project in the same git repo, not a separate
checkout. Package `se.iaai.notes`, plain framework APIs only — **no
AndroidX/Jetpack deps**.

## Why this exists at all — and why it's *only* widgets

The actual app is used by installing the PWA itself ("Add to Home Screen" on
notes.ia-ai.se in Chrome) — that gets the full app, working offline, real Web
Push notifications, and works on iOS too. This project used to also be a
`WebView` wrapper around that same PWA (`MainActivity`, now deleted), but a
`WebView` wrapper can't do anything a real installed PWA doesn't already do
better: Chrome already launches the camera correctly for `capture` file
inputs, already bridges mic/geolocation permissions, already handles
downloads — a hand-rolled `WebView` just reimplements all of that, worse, as
maintenance burden. Worse still, a *closed* `WebView`-wrapped app generally
can't receive Web Push the way an installed PWA can, which was the whole
reason this project used to also carry a battery-draining `AlarmManager` poll
+ local-notification workaround (`ReminderPollReceiver`, now deleted).

The one thing a PWA genuinely cannot do on Android is put a **live home-screen
App Widget** on the launcher — that's an OS capability gated to real installed
apps. So that's all this project is now: two `AppWidgetProvider`s and just
enough of a settings screen to hold the token they poll with. No login, no
WebView, no note content ever rendered here.

## What it is

- `SettingsActivity` — the app's **only** screen (also the launcher activity).
  Paste the "Home-screen widget feed" URL from the web app's own Account →
  Integrate section (or just the bare token) and hit Save; it's stored in
  `SharedPreferences["notes_widget_prefs"]["widget_token"]` and both widgets are
  nudged to refresh immediately. An "Open the app" button just fires an
  `ACTION_VIEW` at `base_url` — whatever's installed for that (the PWA,
  hopefully) opens it. There is no other way into an account here; if the
  token's ever invalid the widgets themselves link back to this screen.
- `GridWidgetProvider` — 3x3 mirror of the app's own grid, from
  `GET /api/widget?token=...(&center=...)` (`server/routes/widget.js`).
  Tapping the centre opens that note via `ACTION_VIEW` (installed PWA or
  browser — this app has nothing of its own to show it in); tapping a
  neighbour just re-centers the widget locally (stored per-widget-id in
  `SharedPreferences`), no navigation.
- `AgendaWidgetProvider` — overdue/today reminder counts + next couple of
  items (`?mode=agenda&tz=`), tap opens the next due item the same way.
  Refresh cadence for both: the system's own 30-min `updatePeriodMillis`
  (`app/src/main/res/xml/*_widget_info.xml`) — no in-widget refresh button.
- Both widgets: on a network exception, retry with backoff
  (`MAX_NETWORK_RETRIES`/`RETRY_DELAYS_MS`, 2 tries at 3s/8s) before giving up
  and showing "Couldn't reach server" — a transient wifi/DNS blip otherwise sat
  broken until the next 30-min tick. A 401 (bad/rotated/missing token) just
  shows "Tap to reconnect" straight to `SettingsActivity` — there's no cookie
  or session to silently resync from any more, unlike the old `WebView` build.
- `WidgetTheme` — approximates the account's live app theme (server's
  `theme.colors`/`theme.font`, i.e. `public/themes.js`'s `effectiveColors`) onto
  the two `RemoteViews` widgets — flat colours carry over exactly, fonts
  collapse to Android's three built-in families, no gradients/images.
- `UpdateChecker` — not on the Play Store, so no store auto-updates it either;
  this is that mechanism instead. `maybeCheck()` (rate-limited to ~daily,
  piggybacked on both widgets' `onUpdate` *and* on `SettingsActivity.onCreate`,
  so it doesn't need a wake-up of its own) compares the installed
  `versionCode` against `{base_url}/downloads/notes-version.json`; a newer one
  posts a one-time notification and shows a banner + "Download and install"
  button in `SettingsActivity`, which downloads via `DownloadManager` (no
  storage permission needed — its default destination is its own managed
  area) and hands the result straight to the system package installer.
  Checking/downloading/notifying are all fully automatic; the final install
  is not and cannot be — Android requires one explicit tap on the installer's
  own confirmation to install an APK from outside the Play Store, regardless
  of what permissions the app holds. **A device on the old (pre-`UpdateChecker`)
  build has to be reinstalled manually once** — it has no code to notice this
  feature exists until then.

## Build / run

- `./gradlew assembleDebug` (or `installDebug` with a device/emulator
  attached). Java 17, `compileSdk 34`, `minSdk 26`.
- To point a build at a different backend (e.g. `test.ia-ai.se` / port 8040),
  change `base_url` in `strings.xml` — it's baked in at build time. A token
  minted by one server won't authenticate against the other either, so
  Settings needs a fresh paste after switching.
- **This machine already has a toolchain**: JDK 17 at `/home/devuser/android-tools/jdk17`,
  Android SDK at `/home/devuser/android-tools/sdk`, Gradle cached in `~/.gradle`.
  `local.properties` (gitignored) needs `sdk.dir=/home/devuser/android-tools/sdk`.
  To rebuild and redeploy the download link:
  ```
  JAVA_HOME=/home/devuser/android-tools/jdk17 PATH="$JAVA_HOME/bin:$PATH" ./gradlew assembleDebug
  cp app/build/outputs/apk/debug/app-debug.apk /srv/notes/public/downloads/notes.apk
  ```
  No `release` signing config exists — `assembleDebug`'s output, signed with
  `~/.android/debug.keystore`, *is* what's shipped at `/downloads/notes.apk`
  (fine for direct-APK, non-Play-Store distribution). That debug key's
  fingerprint is what the old `assetlinks.json` used to pin, back when this
  app still claimed App Links. `public/downloads/` is gitignored — nothing to
  commit after a rebuild, just redeploy the file.
- **Bump `versionCode`/`versionName` in `app/build.gradle` on every release
  meant for existing installs to auto-update to** (see `UpdateChecker` above),
  and regenerate `public/downloads/notes-version.json` to match — it's
  gitignored the same as `notes.apk`, so this is a manual step every time:
  ```
  echo '{"versionCode": <N>, "versionName": "<X.Y>"}' > /srv/notes/public/downloads/notes-version.json
  ```
  Forgetting this doesn't break anything — installed devices just won't see
  the new release until it's published.

## Gotchas

- Widget token, theme cache, and grid re-center state all live in plain
  `SharedPreferences` (`notes_widget_prefs`) — no encryption, no backup
  exclusion beyond the default `android:allowBackup`.
- `RemoteViews` can't run arbitrary code — any change to what a widget shows
  needs a matching layout variant per font family (`widget_grid.xml` /
  `_mono.xml` / `_serif.xml`, same for agenda) picked by `WidgetTheme.gridLayout()`
  / `agendaLayout()`.
- The grid widget's re-center-on-tap only updates that one widget instance's own
  stored center — it never touches the server's `tabs` table, so it can't drift
  the web app's own active note (see `server/routes/widget.js`'s `?center=` param).
