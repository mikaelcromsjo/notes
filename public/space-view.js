// Standalone read-only viewer for a shared note space (server/routes/shares.js's
// token-authed `/api/shares/:id/viewer` routes). No build step, no account,
// no session — a bare opaque `?token=` is the only credential, same trust
// model as the widget/digest feeds. Deliberately a separate tiny page rather
// than a "read-only mode" bolted onto public/app.js: there's no write path
// here at all (no editor, no ➕, no tabs, no offline), so "what's disabled"
// is answered by "the write endpoints don't exist on this page," not by
// conditionally hiding buttons that could otherwise be clicked.
(() => {
  const params = new URLSearchParams(location.search);
  const shareId = Number(params.get('id'));
  const token = params.get('token') || '';

  const statusEl = document.getElementById('space-status');
  const gridEl = document.getElementById('space-grid');
  const titleEl = document.getElementById('space-title');
  const noteOverlay = document.getElementById('note-overlay');
  const noteOverlayBody = document.getElementById('note-overlay-body');
  const noteOverlayCloseBtn = document.getElementById('note-overlay-close');

  // Same 3x3 layout convention as public/app.js's render(): center is slot 4,
  // the "probable parent" back-link takes the top-center slot, everything
  // else fills the remaining outer slots in order.
  const BACK_SLOT = 1;
  const OUTER_SLOTS = [0, 2, 3, 5, 6, 7, 8];

  function snippet(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  }

  const TYPE_ICON = { image: '🖼️', audio: '🎤', file: '📎', contact: '👤', app: '🔗' };

  // Per-type attachment payload, same rendering rules as public/app.js's
  // buildAttachmentPreview, simplified for this standalone page: it's always
  // online (no offline mirror here at all) and /uploads is served with no
  // auth of its own (server/index.js) — so attachment_path is already a
  // directly fetchable URL, no resolveMediaUrl/lightbox indirection needed.
  // Returns null for a type/shape this page doesn't know how to show.
  function buildAttachmentPreview(note) {
    if (note.type === 'image' && note.attachment_path) {
      const link = document.createElement('a');
      link.className = 'center-attachment-image-link';
      link.href = note.attachment_path;
      link.target = '_blank';
      link.rel = 'noopener';
      link.title = 'Open full size';
      const img = document.createElement('img');
      img.className = 'center-attachment-image';
      img.src = note.attachment_path;
      img.alt = note.title || 'Photo';
      link.appendChild(img);
      return link;
    }
    if (note.type === 'audio' && note.attachment_path) {
      const audio = document.createElement('audio');
      audio.className = 'center-attachment-audio';
      audio.controls = true;
      audio.src = note.attachment_path;
      return audio;
    }
    if (note.type === 'file' && note.attachment_path) {
      const link = document.createElement('a');
      link.className = 'center-attachment-file center-attachment-download';
      link.href = note.attachment_path;
      link.textContent = `📎 ${note.title || 'Download file'}`;
      return link;
    }
    if (note.type === 'contact' && note.attachment_path) {
      let contact;
      try {
        contact = JSON.parse(note.attachment_path);
      } catch {
        return null;
      }
      const box = document.createElement('div');
      box.className = 'center-attachment-contact';
      if (contact.phone) {
        const tel = document.createElement('a');
        tel.href = `tel:${contact.phone}`;
        tel.textContent = `📞 ${contact.phone}`;
        box.appendChild(tel);
      }
      if (contact.email) {
        const mail = document.createElement('a');
        mail.href = `mailto:${contact.email}`;
        mail.textContent = `✉️ ${contact.email}`;
        box.appendChild(mail);
      }
      return box.childElementCount ? box : null;
    }
    if (note.type === 'app' && note.attachment_path) {
      const link = document.createElement('a');
      link.className = 'center-attachment-app';
      link.href = note.attachment_path;
      link.textContent = '🚀 Launch';
      return link;
    }
    return null;
  }

  // id+title of every note in the space (GET /:id/viewer/index — a separate,
  // minimal token-authed route: no content, just enough to resolve a
  // [[wikilink]] target to a note id, same purpose as public/app.js's own
  // allNotesCache serves its markdown rendering). Fetched once, best-effort:
  // a fresh note this page hasn't heard about yet just renders as an
  // unresolved (but harmless — see wikiResolve below) link, same as any
  // other "stale local index" case elsewhere in this app.
  let noteIndex = [];
  // The most recent grid payload, kept so loadNoteIndex can repaint once it
  // lands — it's fetched in the background alongside the very first load(),
  // so the first paint can beat it there and render every [[wikilink]] as
  // unresolved even though the note it points to does exist.
  let lastData = null;
  async function loadNoteIndex() {
    try {
      const url = new URL(`/api/shares/${shareId}/viewer/index`, location.origin);
      url.searchParams.set('token', token);
      const res = await fetch(url);
      noteIndex = res.ok ? await res.json() : [];
    } catch {
      noteIndex = [];
    }
    if (lastData) render(lastData);
  }

  // --- Markdown rendering (vendored marked + DOMPurify — same libraries and
  // wikilink convention as public/app.js's own md/renderMarkdownInto, cut
  // down for this read-only page: no onCreateWiki (there's no account to
  // create a note for), and every checkbox renders permanently disabled —
  // there's no write path on this page at all. ---
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // Set while a note's own markdown is being rendered, so [[Title]] never
  // resolves a note to itself (common when several notes share a title).
  let mdRenderContextId = null;

  function wikiResolve(target) {
    if (!target) return null;
    const hashId = /^#(\d+)$/.exec(target.trim());
    if (hashId) return noteIndex.find((n) => n.id === Number(hashId[1])) || null;
    const t = target.trim().toLowerCase();
    return (
      noteIndex.find(
        (n) => n.id !== mdRenderContextId && (n.title || '').trim().toLowerCase() === t
      ) || null
    );
  }

  const mdReady = typeof window.marked !== 'undefined' && typeof window.DOMPurify !== 'undefined';
  if (mdReady) {
    window.marked.use({
      gfm: true,
      breaks: true,
      extensions: [
        {
          name: 'wikilink',
          level: 'inline',
          start(src) {
            const i = src.indexOf('[[');
            return i < 0 ? undefined : i;
          },
          tokenizer(src) {
            const m = /^\[\[([^\][\n]+?)\]\]/.exec(src);
            if (m) return { type: 'wikilink', raw: m[0], target: m[1].trim() };
            return undefined;
          },
          renderer(token) {
            const hit = wikiResolve(token.target);
            if (hit) {
              return `<a class="wikilink" data-note-id="${hit.id}" href="#">${escapeHtml(
                hit.title || token.target
              )}</a>`;
            }
            return `<a class="wikilink missing" href="#">${escapeHtml(token.target)}</a>`;
          },
        },
      ],
    });
    window.DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A' && /^https?:/i.test(node.getAttribute('href') || '')) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    });
  }

  function mdToHtml(text) {
    if (!mdReady) return null;
    return window.DOMPurify.sanitize(window.marked.parse(text || ''), { ADD_ATTR: ['target'] });
  }

  // Render markdown into `el`; wire [[wikilinks]] to navigate the grid
  // (closing this overlay first, same as the main app) and leave every
  // checkbox visibly present but inert.
  function renderMarkdownInto(el, text, selfId) {
    mdRenderContextId = selfId == null ? null : selfId;
    let html;
    try {
      html = mdToHtml(text);
    } finally {
      mdRenderContextId = null;
    }
    if (html == null) {
      el.textContent = text || '';
      return;
    }
    el.innerHTML = html;
    el.classList.add('markdown-body');

    el.querySelectorAll('a.wikilink').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const id = Number(a.dataset.noteId);
        if (!id) return; // an unresolved [[link]] — nothing to navigate to
        closeNotePreview();
        load(id);
      });
    });
    el.querySelectorAll('input[type="checkbox"]').forEach((box) => {
      box.disabled = true;
    });
  }

  // --- Fullscreen read-only preview: tapping the centered note opens its
  // full content (not the grid cell's truncated snippet), same "preview
  // mode" the main app's editor defaults to — just with no way to switch
  // into editing at all, since none of these write endpoints exist here. ---
  function closeNotePreview() {
    noteOverlay.classList.add('hidden');
    noteOverlayBody.innerHTML = '';
  }

  function openNotePreview(note) {
    noteOverlayBody.innerHTML = '';
    const inner = document.createElement('div');
    inner.className = 'cell center' + (note.status === 'done' ? ' dimmed' : '');

    const title = document.createElement('div');
    title.className = 'preview-title';
    title.textContent = note.title || 'Untitled';
    inner.appendChild(title);

    if (note.type && note.type !== 'text') {
      const preview = buildAttachmentPreview(note);
      if (preview) inner.appendChild(preview);
    }

    const content = document.createElement('div');
    const hasContent = Boolean(note.content && note.content.trim());
    content.className = 'preview-content' + (hasContent ? '' : ' placeholder');
    if (hasContent) {
      renderMarkdownInto(content, note.content, note.id);
    } else {
      content.textContent = note.type && note.type !== 'text' ? '' : '(Empty note)';
    }
    inner.appendChild(content);

    noteOverlayBody.appendChild(inner);
    noteOverlay.classList.remove('hidden');
  }

  noteOverlayCloseBtn.addEventListener('click', closeNotePreview);
  noteOverlay.addEventListener('click', (e) => {
    if (e.target === noteOverlay) closeNotePreview();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !noteOverlay.classList.contains('hidden')) closeNotePreview();
  });

  function showStatus(msg) {
    statusEl.textContent = msg;
    statusEl.style.display = '';
    gridEl.style.display = 'none';
  }

  function setUrl(centerId) {
    const url = new URL(location.href);
    url.searchParams.set('center', centerId);
    history.replaceState(null, '', url.pathname + url.search);
  }

  function makeCell(note, isParent) {
    const cell = document.createElement('div');
    cell.className =
      'cell neighbor' +
      (isParent ? ' is-parent' : '') +
      (note.status === 'done' ? ' dimmed' : '');
    const title = document.createElement('div');
    title.className = 'neighbor-title';
    const icon = TYPE_ICON[note.type];
    const base = icon ? `${icon} ${note.title || 'Untitled'}` : note.title || 'Untitled';
    title.textContent = (isParent ? '⤴ ' : '') + base;
    cell.appendChild(title);
    // A small thumbnail for an image neighbor, same as public/app.js's own
    // compact neighbor preview — every other type just gets the icon above.
    if (note.type === 'image' && note.attachment_path) {
      const img = document.createElement('img');
      img.className = 'center-attachment-image';
      img.src = note.attachment_path;
      img.alt = '';
      cell.appendChild(img);
    }
    cell.addEventListener('click', () => load(note.id));
    return cell;
  }

  function makeEmptyCell() {
    const cell = document.createElement('div');
    cell.className = 'cell empty';
    return cell;
  }

  function makeCenterCell(note) {
    const cell = document.createElement('div');
    cell.className = 'cell center' + (note.status === 'done' ? ' dimmed' : '');
    // .center-title/.center-content(.readonly) — the same classes and same
    // clipped/ellipsis grid-cell treatment public/app.js's own read-only
    // center cell uses (style.css scopes them under .cell.center); NOT
    // .neighbor-title, which only ever targets .cell.neighbor and so never
    // matched here at all.
    const title = document.createElement('div');
    title.className = 'center-title readonly';
    title.textContent = note.title || 'Untitled';
    cell.appendChild(title);

    if (note.type && note.type !== 'text') {
      const preview = buildAttachmentPreview(note);
      if (preview) {
        cell.appendChild(preview);
      } else {
        const fallback = document.createElement('div');
        fallback.className = 'center-content readonly placeholder';
        fallback.textContent = `(${note.type} attachment)`;
        cell.appendChild(fallback);
      }
    }
    // Real preview mode, not a truncated plain-text snippet: rendered
    // markdown with clickable [[wikilinks]] (task checkboxes stay visible
    // but inert — see renderMarkdownInto), same as the main app's own
    // always-read-only grid center cell. The cell's own `overflow: hidden`
    // (.cell in style.css) clips it to the card, no separate truncation
    // needed. An attachment note can still carry its own freeform caption,
    // shown below the media either way.
    const hasContent = Boolean(note.content && note.content.trim());
    if (hasContent) {
      const content = document.createElement('div');
      content.className = 'center-content readonly';
      renderMarkdownInto(content, note.content, note.id);
      cell.appendChild(content);
    } else if (!note.type || note.type === 'text') {
      const empty = document.createElement('div');
      empty.className = 'center-content readonly placeholder';
      empty.textContent = 'Empty note';
      cell.appendChild(empty);
    }

    // The grid cell is clipped to card height — tap it (outside a wikilink/
    // attachment control, which handle their own click) to read the note in
    // full, same as the main app's own top-half-of-center-card tap.
    cell.style.cursor = 'pointer';
    cell.addEventListener('click', (e) => {
      if (e.target.closest('a, audio, input, label')) return;
      openNotePreview(note);
    });
    return cell;
  }

  function render(data) {
    lastData = data;
    if (!data.center) {
      showStatus('This shared space has no notes yet.');
      return;
    }
    statusEl.style.display = 'none';
    gridEl.style.display = '';
    gridEl.innerHTML = '';
    titleEl.textContent = data.center.title || 'Shared space';

    const slots = new Array(9).fill(null);
    if (data.parent) slots[BACK_SLOT] = { note: data.parent, isParent: true };
    let i = 0;
    for (const slotIdx of OUTER_SLOTS) {
      if (slots[slotIdx]) continue;
      const n = data.neighbors[i++];
      if (n) slots[slotIdx] = { note: n, isParent: false };
    }

    for (let idx = 0; idx < 9; idx++) {
      if (idx === 4) {
        gridEl.appendChild(makeCenterCell(data.center));
        continue;
      }
      const slot = slots[idx];
      gridEl.appendChild(slot ? makeCell(slot.note, slot.isParent) : makeEmptyCell());
    }
  }

  // "Invalid or expired" is a claim about the *token* — it must only ever
  // be shown for an actual 404 from the server. A network failure (offline,
  // a DNS hiccup, the server mid-restart for a deploy) or a 5xx is a
  // completely different, transient situation that says nothing about
  // whether the link is good, so it gets its own honest message and a
  // couple of automatic retries instead of being lumped in with "this link
  // is dead" — conflating the two was telling people a perfectly good link
  // was broken.
  async function load(centerId, attempt = 0) {
    showStatus('Loading…');
    if (centerId) setUrl(centerId);
    const url = new URL(`/api/shares/${shareId}/viewer`, location.origin);
    url.searchParams.set('token', token);
    if (centerId) url.searchParams.set('center', centerId);

    let res;
    try {
      res = await fetch(url);
    } catch {
      if (attempt < 2) {
        showStatus('Connection trouble — retrying…');
        setTimeout(() => load(centerId, attempt + 1), 1000);
        return;
      }
      showStatus('Could not reach the server. Check your connection and reload.');
      return;
    }

    if (res.status === 404) {
      showStatus('This link is invalid or has expired.');
      return;
    }
    if (!res.ok) {
      if (attempt < 2) {
        showStatus('Server trouble — retrying…');
        setTimeout(() => load(centerId, attempt + 1), 1000);
        return;
      }
      showStatus('Something went wrong loading this space. Try reloading.');
      return;
    }

    let data;
    try {
      data = await res.json();
    } catch {
      showStatus('Something went wrong loading this space. Try reloading.');
      return;
    }
    render(data);
  }

  if (!shareId || !token) {
    showStatus('This link is missing its share id or token.');
  } else {
    const initialCenter = params.get('center') ? Number(params.get('center')) : null;
    load(initialCenter);
    loadNoteIndex(); // background; [[wikilinks]] resolve once it lands, inert until then
  }
})();
