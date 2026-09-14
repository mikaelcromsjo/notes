// GTD context tags are just `@word` mentions in a note's own text — no
// column, nothing to keep in sync (see server/routes/notes.js's /tags route
// and public/app.js's tag-insert modal for the write side of this). Shared
// so the suggestion list and the agenda's by-tag grouping never drift apart.
//
// Word-boundary before the `@` rules out things like an email address
// ("me@phone.com") without needing a list of exceptions.
const TAG_RE = /(?:^|\s)@([a-zA-Z][\w-]*)/g;

// Every distinct tag mentioned in `text` (lowercased, de-duped, insertion
// order — i.e. first-seen order in the text).
function extractTags(text) {
  if (!text) return [];
  const out = new Set();
  for (const m of text.matchAll(TAG_RE)) out.add(m[1].toLowerCase());
  return [...out];
}

module.exports = { TAG_RE, extractTags };
