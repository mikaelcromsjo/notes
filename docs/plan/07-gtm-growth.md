# Domain 7 — GTM & Growth

## 1. Goal

Everything needed to actually start selling that isn't core app logic: a landing
page that makes people "get it" in five seconds, an onboarding flow that gets a
new user to the activation moment, an App Store / Play Store presence, and enough
analytics to know whether any of it is working. Owns the production domain and
the launch itself.

## 2. Current state in code

- No landing page — `/` serves the app directly (`server/index.js:24`,
  `express.static('public')`). A logged-out visitor hits `#login-overlay`
  immediately (`public/app.js` `showLogin`).
- No analytics of any kind. `nav_events` is product data, not funnel data, and
  is user-scoped + 90-day-retained.
- PWA basics exist: `public/manifest.webmanifest`, `public/sw.js` (install +
  push, no offline), icons (192/512/maskable). No `screenshots`, no
  `share_target`, no `shortcuts` in the manifest.
- No `robots.txt`, no `sitemap.xml`, no OpenGraph/meta tags in
  `public/index.html`, no `<title>`/description tuned for search.
- Domain per `CLAUDE.md`: `test.ia-ai.se` behind nginx → `:8040`. No marketing
  domain.
- No `docs/` beyond this plan set; no press kit, no changelog.

## 3. Proposed design

### 3.1 Positioning (from `strategy.md §3`)

- Primary: **focus / executive-function** — "one thought at a time, and it
  reminds you." Secondary: **PKM mobile companion**.
- One-liner candidates: _"One thought at a time."_ / _"The notes app that
  resurfaces what matters — and reminds you."_
- Name/brand: decide a product name distinct from `nico-server`; secure the
  `.com` + a social handle. (Blocking task — everything below references it.)

### 3.2 Landing page

- Separate static site (own repo or `site/`), deployed to Netlify/Cloudflare
  Pages on the marketing domain; app stays on `app.<domain>`. Keeps marketing
  iteration off the app's restart cycle.
- Structure: hero (headline + 10-second silent autoplay screen-capture GIF/MP4
  of grid navigation + "Try it free") → 3 problem/solution blocks (focus,
  reminders, adaptive recall) → "for Obsidian/Keep users" companion block →
  short feature grid → pricing (pulls the same tiers as `docs/plan/
  06-monetization.md`) → FAQ (data export, privacy, no lock-in) → footer
  (privacy, terms, contact, changelog).
- Assets: record the grid-nav clip on a real phone; make a maskable social/OG
  image; write `<title>`, meta description, OG/Twitter tags, `robots.txt`,
  `sitemap.xml`.
- Add `screenshots` (with `form_factor`) to `manifest.webmanifest` so the PWA
  install prompt and store listings look real.

### 3.3 Onboarding (in `public/app.js`)

- **Sample graph on signup**: server seeds ~12 interlinked notes (a "How this
  works" hub + a few realistic personal notes + one with a reminder) for a
  brand-new user, so the grid is never empty. A `?fresh=1` or first-session flag
  triggers a one-time coach overlay: 4 cards — "this is your centre note",
  "these 8 are related notes, ranked by how you move", "drag a card to relink",
  "set a reminder on any note". Dismissable, re-openable from `?` menu.
- **First-run checklist** (reuses `.overlay`/`.picker`): create a note, link two
  notes, set a reminder, install the app, import (deep-links Domain 3). Ties
  directly to the activation metric.
- **Import prompt** on first run (Domain 3) — "Bring your notes from Obsidian /
  Keep / Notion".
- Empty-state and `renderEmptyState()` already exist — hook the sample-graph
  seeding + coach marks there and in `init()`.

### 3.4 App Store / Play Store presence

- **Android**: Trusted Web Activity via **Bubblewrap / PWABuilder** → a thin
  APK/AAB wrapping `app.<domain>`. Play listing. Cheapest, near-zero
  maintenance; Web Push + install already work.
- **iOS**: **Capacitor** wrapper (not just a PWA link — Apple rejects trivial
  web wrappers; add native value: real local notifications, share extension,
  widgets, background reminder scheduling). This is the path that fixes the
  strategy.md risk that iOS PWA push/geofencing/storage-eviction undermine the
  reminder differentiator.
  - Native bridges to add: `@capacitor/push-notifications` +
    `@capacitor/local-notifications` (reliable reminders — feeds Domain 5),
    `@capacitor/share` target, App Store "Sign in with Apple" (needs Domain 1
    milestone 6), a Home-Screen widget (reuses the widget feed in
    `server/routes/widget.js`).
  - Storage: move critical client state off `localStorage`/IndexedDB-only into
    the native store where eviction matters, or rely on server sync (Domain 2).
- Store assets: screenshots per device class, preview video, descriptions,
  privacy nutrition labels (declare: email, usage data; no tracking).
- Note: introduces a build step + native toolchains for the *wrapper only* — the
  web app stays no-build. Document this boundary.

### 3.5 Analytics & activation

- **Self-host PostHog** (single-container, EU option) or **Plausible** if only
  page-level metrics are needed. PostHog recommended — need funnels + cohort
  retention + session-level events, and it can stay first-party (privacy
  talking point).
- **Activation metric**: _a new user creates ≥10 notes with ≥5 links AND returns
  on day 2+._ Secondary: _sets ≥1 reminder in week 1._
- Events to instrument in `public/app.js` (thin wrapper, respects DNT, no PII
  beyond a hashed user id):
  `signup`, `onboarding_card_viewed/completed`, `note_created`, `link_created`,
  `reminder_set`, `import_started/completed`, `search_used`, `app_installed`,
  `push_enabled`, `upgrade_viewed`, `checkout_started`, `subscription_active`.
- Server-side: a nightly job rolls up cohort activation/retention into a small
  `metrics_daily` table for a private dashboard; don't rely solely on
  client events (ad-blockers).
- Wire funnel: visit → signup → activation → trial → paid, with drop-off alerts.

### 3.6 Launch

- **Pre-launch**: 20–50 hand-recruited beta users from ONE community (r/PKM, a
  PKM Discord, or an ADHD-tools space). Weekly feedback calls; fix activation
  before spending attention.
- **Launch surfaces**: Show HN ("Show HN: a phone-first notes app you navigate
  as a graph"), Product Hunt (with the GIF), the one subreddit for the ICP,
  "Obsidian mobile companion" framing in PKM spaces, a short Twitter/Bluesky
  thread with the clip.
- **Assets ready before launch**: landing page, 60-sec demo video, pricing,
  privacy policy + ToS, support email + a simple help doc, changelog page,
  status page (from Domain 2's `/healthz`).
- **Referral loop**: once public share links exist (Tier 2), every shared note
  is a landing-page funnel; add "Made with <product>" footer on public pages.
- **Content SEO** (slow burn): "Obsidian mobile alternative", "graph notes app",
  "notes app with reminders", "ADHD note taking" — a handful of honest
  comparison posts.

## 4. Milestones

1. **[S] Name + domains + social handles + privacy policy / ToS** (templated).
   Blocking.
2. **[M] Landing page** live on the marketing domain (hero clip, pricing, FAQ,
   OG tags, robots/sitemap). App moves to `app.<domain>`.
3. **[S] Analytics**: self-host PostHog, client event wrapper, the funnel,
   activation dashboard.
4. **[M] Onboarding**: sample-graph seeding + coach marks + first-run checklist
   + import prompt.
5. **[S] Manifest polish**: `screenshots`, `shortcuts`, description/`<title>`,
   OG image.
6. **[M] Android TWA** via PWABuilder + Play listing.
7. **[L] iOS Capacitor wrapper** with local notifications + share extension +
   Sign in with Apple + widget; App Store listing.
8. **[S] Launch kit**: demo video, help doc, changelog, status page, press
   blurb.
9. **[S] Closed beta** cohort + feedback loop.
10. **[S] Public launch** (HN / PH / communities).

## 5. Dependencies

- **Domain 1** — Sign in with Apple (milestone 6 there) is required for the iOS
  store build; OAuth consent screens need the real domain from milestone 1 here.
- **Domain 2** — status page consumes `/healthz`; the "your data is safe /
  exportable" landing-page claims must be true first; storage-eviction fix
  pairs with the wrapper.
- **Domain 3** — onboarding import prompt + Android share target.
- **Domain 5** — the iOS wrapper's local-notification bridge is what makes
  reminders reliable; digest/agenda screens are demo material.
- **Domain 6** — pricing copy, checkout entry points, and the funnel's paid
  stages.
- External: marketing-domain DNS, Netlify/CF Pages, PostHog host, Apple
  Developer + Google Play accounts, a screen-recording of the app.

## 6. Risks & mitigations

- **Apple rejects a thin web wrapper** — Capacitor build must add genuine native
  value (notifications, share extension, widget); budget 2–3 review round-trips.
- **"I don't get it" bounce** — the landing page lives or dies on the hero clip;
  A/B the headline; get 5 strangers to narrate their first 60 seconds.
- **Analytics blocked by ad-blockers** — self-hosted + first-party domain +
  server-side rollups as the source of truth.
- **Marketing iteration coupled to app deploys** — separate static site,
  separate domain, from day one.
- **Launching before activation works** — beta cohort + activation dashboard
  gate the public launch; don't spend the HN/PH shot early.
- **Wrapper introduces a build toolchain** — quarantine it to `ios/` `android/`;
  the web app stays no-build; document the boundary in `CLAUDE.md`.
- **Privacy-label / GDPR claims** — keep them accurate; coordinate with Domain
  2's controller-of-record answer.

## 7. Open questions for the founder

1. Product name — decided? Any domains/handles already held?
2. Primary ICP for launch messaging: executive-function/ADHD, or PKM-companion?
   (Pick one for the hero.)
3. Both app stores at launch, or web + Android first and iOS as a fast-follow?
4. Budget/time for the iOS Capacitor wrapper (the biggest single item here)?
5. PostHog (product analytics, heavier) vs. Plausible (page metrics, trivial) —
   how deep does the funnel analysis need to go at launch?
6. Willing to do 20–50 beta feedback calls, or prefer async-only feedback?
7. Which one community is the beachhead?
