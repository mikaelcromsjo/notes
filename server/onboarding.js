const db = require('./db');

const now = () => new Date().toISOString();

// A plain, pre-linked note graph handed to every brand-new account (called
// once from server/routes/auth.js's callback, new-user branch) — no dynamic
// behavior: nothing rewrites or watches for actions. Each note's own content
// already says what to do and ends with a [[wikilink]] to the next one; the
// user reads, does the thing (or doesn't — nothing checks), and taps the
// link themselves when ready.
const WELCOME_TITLE = '👋 Welcome';
const WELCOME_CONTENT = `Hey! This is a graph of notes — the middle card is always whatever you're looking at, surrounded by whatever's linked to it.

[[🚀 Take the tour]] — a hands-on walkthrough, one step at a time.
[[⏭️ Skip the intro]] — clear these practice notes and start blank.`;

// A real "app link" attachment (the same type the 🔗 App link picker style
// creates — server/routes/notes.js's POST /:id/attachments), not a markdown
// link buried in text: the card itself renders a tappable "🚀 Launch" button
// (buildAttachmentPreview in app.js). `/?ob=begin` is same-origin/relative so
// it's a same-tab navigation, landing back in handleDeepLink's `ob=begin`
// branch — see server/routes/onboarding.js POST /begin.
const CLEAR_DEMO_URI = '/?ob=begin';
const SKIP_TITLE = '⏭️ Skip the intro';
const SKIP_CONTENT = `No problem — you can always revisit the basics later.

Tap 🚀 Launch to clear the demo and start fresh.`;

// The tour chain — each note links only to the next (a straight line, not a
// hub), title/content fixed once at seed time. `next` names the note whose
// title the "when done" line points to; the last entry points at Clear the demo.
const CHAIN = [
  {
    title: '🚀 Take the tour',
    body: '📝 Tap this note to open it, then tap ➕ in the toolbar below — or tap an empty "+" cell around this note — to create your first real note.',
  },
  {
    title: '👆 Tap zones',
    body: "A card's top half opens it to read — rendered, tap a [[wikilink]] straight away, no keyboard. The bottom half opens it straight into editing.\n\nSame for any card, not just this one.",
  },
  {
    title: '🫳 Move it',
    body: "Try it: drag any neighbour card onto another to relink it — try the note you just made.",
  },
  {
    title: '⏳ Mark it waiting',
    body: "Tap the status button in this note's toolbar (○) — it turns into waiting-on-something.\n\nUse waiting for things stuck on someone or something else, not you — it only shows up in the in-app agenda (🔔), never pushed or emailed.",
  },
  {
    title: '◑ Flag a to-do',
    body: "Tap the status button again — waiting becomes a to-do.\n\nTo-dos are things you mean to act on — they show up both in the agenda's To-do section and the to-do bar under the top bar (turn it on in 👤 → Header rows if it's off).",
  },
  {
    title: '✅ Mark it done',
    body: "Once more — to-do becomes done.\n\nDone dims the note everywhere in the graph, a quiet visual signal it's finished — nothing is deleted, and tapping the status button once more clears it back to normal.",
  },
  {
    title: '⏰ Set an alarm',
    body: "Tap the alarm button on this note and save a reminder — any time works, you can change it later.\n\nIt shows up in the agenda (🔔) when due, and rings as a push notification even if the app isn't open.",
  },
  {
    title: '📌 Pin it',
    body: 'Tap pin — pinned notes always show up in the pin bar under the top bar, so you can jump back to them without hunting through the graph.',
  },
  {
    title: '🔔 Check the agenda',
    body: "Tap the bell up top — that's the agenda: everything due at a glance.",
  },
  {
    title: '🗺️ Check the map',
    body: 'Tap the map icon up top. Any note carrying a location shows up there.',
  },
  {
    title: '💡 Tips: attachments & wikilinks',
    body: `📎 **Attachments** — the ➕ picker can also add a photo, audio recording, file, contact, or app link (like the one at the end of this tour) — each becomes its own linked note.

🔗 **Wikilinks** — type [[Note title]] anywhere in a note to link to it inline, the way this tour has been getting you around.`,
  },
];

function seedSampleGraph(userId) {
  const insertNote = db.prepare(
    `INSERT INTO notes (title, content, created_at, updated_at, type, attachment_path, created_from_note_id, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertLink = db.prepare(
    'INSERT OR IGNORE INTO links (note_a, note_b, created_at, user_id) VALUES (?, ?, ?, ?)'
  );
  const link = (aId, bId, ts) => insertLink.run(Math.min(aId, bId), Math.max(aId, bId), ts, userId);

  db.transaction(() => {
    const base = now();
    let ts = new Date(Date.parse(base)).toISOString();
    const tick = () => (ts = new Date(Date.parse(ts) + 1000).toISOString());

    const welcomeInfo = insertNote.run(WELCOME_TITLE, WELCOME_CONTENT, ts, ts, 'text', null, null, userId);
    const welcomeId = welcomeInfo.lastInsertRowid;

    tick();
    const skipInfo = insertNote.run(SKIP_TITLE, SKIP_CONTENT, ts, ts, 'app', CLEAR_DEMO_URI, welcomeId, userId);
    link(welcomeId, skipInfo.lastInsertRowid, ts);

    let prevId = welcomeId;
    CHAIN.forEach((step, i) => {
      tick();
      const next = CHAIN[i + 1] ? CHAIN[i + 1].title : '🎉 Clear the demo';
      const content = `${step.body}\n\nWhen done, tap [[${next}]] to continue →`;
      const info = insertNote.run(step.title, content, ts, ts, 'text', null, prevId, userId);
      link(prevId, info.lastInsertRowid, ts);
      prevId = info.lastInsertRowid;
    });

    tick();
    const clearFd = insertNote.run(
      '🎉 Clear the demo',
      'Tap 🚀 Launch to clear the demo notes and start fresh.',
      ts, ts, 'app', CLEAR_DEMO_URI, prevId, userId
    );
    link(prevId, clearFd.lastInsertRowid, ts);
  })();
}

module.exports = { seedSampleGraph };
