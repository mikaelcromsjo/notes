# Implementation Plan — Domain Map

Companion to `../strategy.md`. The commercial roadmap is split into **seven
domains**. Each has its own plan file, drafted independently (one sub-agent per
domain).

> **These are plans, not code.** Seven agents editing one live tree in parallel
> — with `data/notes.db` the only copy of real user data and no test suite —
> would be reckless. Each domain file is a concrete, sequenced implementation
> spec. Actual build happens afterwards, one domain at a time, with review.

## Domains

| # | Domain | File | Owns |
| --- | --- | --- | --- |
| 1 | Identity & Access | `01-identity-access.md` | Real auth: magic link + OAuth, signed sessions, rate limiting, account management, migration off the `nico_uid` cookie. |
| 2 | Data Safety & Portability | `02-data-safety-portability.md` | Off-box backups, restore runbook, replication, per-user export (MD+JSON), account delete, offline write queue + sync-conflict handling. |
| 3 | Import & Capture | `03-import-capture.md` | Importers (Markdown/Obsidian/Keep/Notion), PWA `share_target`, widget quick-add, email-to-note. |
| 4 | Editor & Search | `04-editor-search.md` | Markdown rendering, checkboxes, inline `[[link]]` autocomplete that creates edges, inline images, SQLite FTS5 search. |
| 5 | Reminders & Resurfacing | `05-reminders-resurfacing.md` | Alarm snooze/natural-language recurrence, "due today" view, graph digests (on-this-day / stale cluster), weekly review push. **The wedge.** |
| 6 | Monetization & Plan Gating | `06-monetization.md` | Billing (Stripe or Paddle/Lemon Squeezy), plan model, in-app gating, trial, dunning, pricing page. |
| 7 | GTM & Growth | `07-gtm-growth.md` | Positioning copy, landing page, onboarding/sample graph, App Store wrapper (Capacitor/PWABuilder), self-hosted analytics + activation metric. |

## Dependency graph

```
1 Identity & Access ──┬──> 6 Monetization ──> 7 GTM (paid launch)
                      │
2 Data Safety ────────┴──> (trust gate for any paid launch)

3 Import & Capture ───────> 7 GTM (onboarding needs import)
4 Editor & Search ───────>  (independent; improves activation)
5 Reminders & Resurfacing > (independent; the retention driver)
```

- **1 and 2 are the trust gate.** Nothing is charged for until both ship.
- **6 depends on 1** (cannot gate plans without real accounts).
- **5 and 4 are independent** and can start immediately in parallel with 1/2 —
  they drive the activation/retention that makes the rest worth doing.
- **7 depends on 1, 2, 3, 6** for a real paid launch, but the landing page and
  analytics pieces can start now.

## Suggested sequencing

1. **Phase 1 (trust + habit, parallel):** Domain 1, Domain 2, Domain 5.
2. **Phase 2 (adoption):** Domain 3, Domain 4.
3. **Phase 3 (revenue):** Domain 6, then Domain 7 paid launch.

## Ground rules for every domain (from `CLAUDE.md`)

- Schema changes = idempotent `PRAGMA table_info` + `ALTER TABLE` in
  `server/db.js`. Never edit `CREATE TABLE` blocks.
- Restart the bare `node server/index.js` after any `server/**` change; `public/`
  is static.
- Never rm/reset `data/notes.db`. To test server logic, back up to a copy and run
  with `DB_PATH` on another `PORT`.
- Multi-user: every route scopes by `req.userId`. Keep it that way.
- No bundler / no test framework today — plans should say whether they introduce
  one and why.
