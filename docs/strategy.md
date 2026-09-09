# nico-server — Product & Commercial Strategy

_Written 2026-09-09. This is an engineer's strategic read from the codebase and
`CLAUDE.md`, not validated market research. Treat every number as a hypothesis to
test._

## 1. What the product actually is

A **mobile-first PWA that navigates a personal note graph as a 3×3 grid**: you
always see one centered note plus its eight most-relevant neighbours, and every
move is logged (`nav_events`) so the "relevance" ranking learns from real usage
(`server/routes/notes.js` — `SCORE_W` / `HALF_LIFE_DAYS`). On top of that:

- Per-note **alarms** with Web Push for closed-app delivery
  (`server/alarm-scheduler.js`, `server/webpush.js`).
- Read-only **home-screen widget feed** (token-authed, `server/routes/widget.js`).
- **Attachments** as notes (image / audio / contact / app-link).
- **Undo/redo history**, **colour coding**, **stats/insights**, **map overlay**.
- Installable PWA (`public/sw.js`, `public/manifest.webmanifest`).

Stack: Express + better-sqlite3, no build step, vanilla-JS IIFE frontend, single
box, single SQLite file, no tests, no lint.

## 2. The one distinctive thing

Everyone else's graph is a desktop hairball you never navigate. This one makes
**the graph the primary navigation surface, on a phone, and makes it adaptive**.
Combined with per-note reminders, it is the only tool that does all three of:

1. one note at a time (focus),
2. neighbours ranked by your real behaviour (adaptive recall),
3. notes that ring you (reminders).

That bundle defines a niche. "A notes app" is unsellable; this is not a notes
app — it is a **focus-and-recall surface for your own thinking**.

## 3. Positioning & ICP

Pick **one** primary ICP and lead with it:

| Option | Pitch | Why it can pay |
| --- | --- | --- |
| **A. Focus / executive-function** (ADHD, overloaded PMs/founders) | "Notes that show you one thing at a time and remind you." | Underserved, high willingness to pay, reminders are the hook. |
| **B. PKM mobile companion** (Obsidian/Logseq/Roam users who hate mobile) | "The capture-and-review layer for the graph you already keep." | Large, reachable audience; but they expect import + fidelity. |

**Recommendation:** lead with **A (focus + reminders)**, keep **B (companion)**
as the secondary message on the landing page. They share almost all the roadmap.

Tagline candidates: _"The notes app that resurfaces what matters — and reminds
you."_ / _"One thought at a time."_

## 4. Feature roadmap by tier

### Tier 0 — cannot charge money until these exist (trust & data safety)
- **Real authentication.** Today: unauthenticated `nico_uid` cookie holding a
  raw user id (`server/index.js`, `server/routes/session.js`). Anyone can set
  `nico_uid=2` and read another user's notes. Blocks every paid plan. → magic
  link + OAuth (Google/Apple), signed sessions, rate limiting, logout-all.
- **Off-box automated backups + documented restore.** `data/notes.db` is the
  only copy of real user data on one un-supervised box (`CLAUDE.md`). One disk
  failure = every customer's data gone. → Litestream/replica + nightly
  encrypted snapshot + tested restore runbook.
- **Per-user export** ("download everything" as Markdown + JSON zip) and
  **account delete** — also the GDPR baseline.
- **Legal/infra:** real domain, TLS, privacy policy, ToS, transactional email
  that reaches the inbox, status page.
- **Offline write queue + sync-conflict handling** in the PWA — it is a PWA;
  people will edit offline.

### Tier 1 — adoption drivers
- **Import**: Markdown folder, Obsidian vault, Apple Notes, Google Keep, Notion
  export. Without it, near-zero conversion of existing note-takers.
- **Fast capture**: PWA `share_target`, widget quick-add, email-to-note.
- **Better editor**: markdown, checkboxes, inline `[[link]]` autocomplete that
  creates graph edges as you type, inline images.
- **Full-text search**: SQLite FTS5.
- **Desktop/web layout**: same PWA, wider grid / side pane, keyboard nav.

### Tier 1 differentiators (why this and not Google Keep)
- **Reminders leveled up**: snooze, natural-language recurrence, a single
  "due today" view, optional location reminders. This is the wedge — invest here.
- **Adaptive graph made visible and trustworthy**: "on this day", "you haven't
  touched this cluster in 3 weeks", weekly review digest — delivered through the
  push channel that already exists.
- **Focus mode / single-card view** for the executive-function angle.

### Tier 2 — expansion revenue
- Public share links for a note or subgraph (SEO + virality).
- Shared spaces / real-time collaboration (team plan).
- End-to-end encryption tier (privacy upsell).
- Integrations: calendar two-way for alarms, Readwise, Zapier, API.
- AI: link suggestions, semantic search, ask-your-notes.

## 5. Packaging & pricing (starting hypothesis)

- **Free**: capped note count (e.g. 200) or no push/backup/import.
- **Pro**: ~$4–8/mo, or ~$40–60/yr. Unlimited notes, push, backups, import,
  digests.
- **Lifetime deal** for the first ~100 users — bootstraps cash + testimonials.
- **Team** (later): per-seat, shared spaces.
- Use a **merchant-of-record** (Paddle / Lemon Squeezy) to avoid global VAT/tax
  filing as a solo operator.

## 6. Go-to-sales checklist

1. One-sentence positioning + landing page whose hero is a 10-second GIF of grid
   navigation. This product lives or dies on "I get it in 5 seconds."
2. Payments: Stripe or Paddle/Lemon Squeezy; pricing page.
3. In-app plan gating, 14-day trial, dunning, receipts.
4. Onboarding: seeded sample graph, 60-second "how the grid works", import on
   first run.
5. Analytics: define one activation metric (e.g. "10 linked notes + returned on
   day 2"), self-host PostHog/Plausible, watch retention cohorts.
6. Closed beta: 20–50 hand-recruited users from **one** community (r/PKM, PKM
   Discords, ADHD-tool spaces). Weekly feedback, fix activation before spend.
7. App Store presence: wrap the PWA (Capacitor / PWABuilder) — many buyers will
   not pay for a pure web app and iOS PWA push/storage is second-class.
8. Launch surfaces: Show HN, Product Hunt, the one subreddit for the ICP,
   "Obsidian mobile companion" framing in PKM spaces.
9. Referral loop via public share links once they exist.

## 7. Honest risks

- Note apps are a graveyard: near-zero baseline willingness to pay, high churn.
  The graph must become a **habit within a week** or retention collapses.
- The two differentiators (always-available + reminders) are exactly what iOS
  PWA constraints undermine. Validate push reliability and storage eviction
  early.
- Solo-maintaining auth + sync + billing + backups is heavy; consider a
  backend-as-a-service to buy time.
- **Non-negotiable ordering:** auth + backups before any paid launch; import
  before expecting PKM users to convert.

## 8. Implementation plan

The work is split into seven domains under `docs/plan/`. See
`docs/plan/README.md` for the domain map, dependency graph and sequencing.
