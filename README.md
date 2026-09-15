# 🗒️ Notes

> Personal notes as a living map — link them together, tap to move between them, ranked by how you actually use them. Works offline, syncs everywhere.

[![Live Demo](https://img.shields.io/badge/demo-notes.ia--ai.se-4f6df5?style=for-the-badge)](https://notes.ia-ai.se)
[![ia-ai.se](https://img.shields.io/badge/ia--ai.se-website-4f6df5?style=for-the-badge)](https://ia-ai.se)
[![Contact](https://img.shields.io/badge/email-mikael.cromsjo%40gmail.com-4f6df5?style=for-the-badge)](mailto:mikael.cromsjo@gmail.com)

---

## What is this?

Notes are a **link graph**, not a folder tree or flat list. Every note sits at the center of a 3×3 grid of its nearest links — tap a neighbor to move the whole graph there. Neighbors are ranked by navigation history, not alphabetically, so the grid reflects how you actually think, not how you filed things.

- 🕸️ **Link-graph navigation** — `[[wikilinks]]`, ranked by what you visit most
- 📡 **Offline-first PWA** — full read/write/link with no connection, synced automatically once you're back
- 🔔 **Reminders & agenda** — see what's overdue, due today, or coming up this week
- ✉️ **Daily / weekly digest** — a push or email summary of what's due
- 🗺️ **Map view** for notes with a location
- 🔍 **Instant full-text search**

## Stack

Express · better-sqlite3 · vanilla JS (no bundler, no build step)

## Running it

```bash
npm install
PORT=8050 node server/index.js
```

Env vars: `PORT`, `HOST`, `DB_PATH` (sqlite file), `SEED_USER_EMAIL`, `PUBLIC_ORIGIN`, `VAPID_CONTACT`. See `CLAUDE.md` for full architecture notes.

---

<div align="center">

[ia-ai.se](https://ia-ai.se) · [mikael.cromsjo@gmail.com](mailto:mikael.cromsjo@gmail.com)

</div>
