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
  // A preview link (?preview=<token>) is the same page over one note and
  // everything under it instead of a whole space — the token alone names
  // it, so there's no id. See server/routes/shares.js's /preview/:token.
  const previewToken = params.get('preview') || '';
  function feedUrl(suffix = '') {
    if (previewToken) {
      return new URL(`/api/shares/preview/${encodeURIComponent(previewToken)}${suffix}`, location.origin);
    }
    const url = new URL(`/api/shares/${shareId}/viewer${suffix}`, location.origin);
    url.searchParams.set('token', token);
    return url;
  }

  const statusEl = document.getElementById('space-status');
  const gridEl = document.getElementById('space-grid');
  const titleEl = document.getElementById('space-title');
  const noteOverlay = document.getElementById('note-overlay');
  const noteOverlayBody = document.getElementById('note-overlay-body');
  const noteOverlayCloseBtn = document.getElementById('note-overlay-close');

  // Same 3x3 layout as public/app.js's render(): center is slot 4, the
  // "probable parent" back-link takes the top-center slot when there is one,
  // the neighbours fill the other outer slots in order.
  const BACK_SLOT = 1;
  const OUTER_SLOTS = [0, 1, 2, 3, 5, 6, 7, 8];

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
  function buildAttachmentPreview(note, { compact = false } = {}) {
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
      // Grid cards get the call button only, like the app's compact preview.
      if (compact) return box.childElementCount ? box : null;
      if (contact.email) {
        const mail = document.createElement('a');
        mail.href = `mailto:${contact.email}`;
        mail.textContent = `✉️ ${contact.email}`;
        box.appendChild(mail);
      }
      const vcard = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${contact.name || note.title}`,
        contact.phone ? `TEL:${contact.phone}` : '',
        contact.email ? `EMAIL:${contact.email}` : '',
        'END:VCARD',
      ].filter(Boolean).join('\n');
      const vcardLink = document.createElement('a');
      vcardLink.href = `data:text/vcard;charset=utf-8,${encodeURIComponent(vcard)}`;
      vcardLink.download = `${(contact.name || note.title || 'contact').replace(/[^\w.-]+/g, '_')}.vcf`;
      vcardLink.textContent = '📇 Open in Contacts';
      box.appendChild(vcardLink);
      return box;
    }
    if (note.type === 'app' && note.attachment_path) {
      const box = document.createElement('div');
      box.className = 'center-attachment-link';
      const link = document.createElement('a');
      link.className = 'center-attachment-app';
      link.href = note.attachment_path;
      link.textContent = '🔗 Open';
      const url = document.createElement('span');
      url.className = 'center-attachment-link-url';
      url.textContent = note.attachment_path;
      box.append(link, url);
      return box;
    }
    return null;
  }

  // Stands in for a note's text when it's encrypted (`encrypted` in the
  // feed): only its owner's devices hold the key, so a link can't show it —
  // same idea as the app's own "🔒 Locked" on a device without the key.
  function encryptedNotice(short) {
    const el = document.createElement('div');
    el.className = 'encrypted-notice';
    el.textContent = short ? '🔒 Encrypted' : "🔒 This note's text is encrypted and isn't shown in a preview.";
    return el;
  }

  // Lower-right icon row, same as public/app.js's buildCardInfoIcons minus
  // what's per-account (pins, reminders).
  const STATUS_INFO_ICON = { waiting: '⏳', todo: '📋', done: '✅' };
  function buildCardInfoIcons(note) {
    const parts = [];
    if (TYPE_ICON[note.type]) parts.push([TYPE_ICON[note.type], note.type]);
    if (note.mail) parts.push(['✉️', 'from email']);
    if (STATUS_INFO_ICON[note.status]) parts.push([STATUS_INFO_ICON[note.status], note.status]);
    if (!parts.length) return null;
    const row = document.createElement('div');
    row.className = 'card-info-icons';
    row.textContent = parts.map((p) => p[0]).join('');
    row.title = parts.map((p) => p[1]).join(' · ');
    return row;
  }

  // The "✉️ sender · date" line of a mailed-in note (app.js's buildMailInfo,
  // read-only form).
  function buildMailInfo(note) {
    let info = null;
    try {
      info = typeof note.mail === 'string' ? JSON.parse(note.mail) : note.mail;
    } catch {}
    if (!info || typeof info.from !== 'string' || !info.from) return null;
    const row = document.createElement('div');
    row.className = 'mail-info';
    const name = info.from.replace(/<[^>]*>/, '').replace(/^["'\s]+|["'\s]+$/g, '') || info.from;
    const when = /^\d{4}-\d\d-\d\dT/.test(info.date || '')
      ? new Date(info.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
      : info.date || '';
    const text = document.createElement('span');
    text.className = 'mail-info-text';
    text.textContent = `✉️ ${name}${when ? ` · ${when}` : ''}`;
    row.appendChild(text);
    return row;
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
      const res = await fetch(feedUrl('/index'));
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

  function openNotePreview(data) {
    const note = data.center;
    noteOverlayBody.innerHTML = '';
    const inner = document.createElement('div');
    inner.className = 'cell center' + (note.status === 'done' ? ' dimmed' : '');

    const title = document.createElement('div');
    title.className = 'preview-title';
    title.textContent = note.title || 'Untitled';
    inner.appendChild(title);

    const mailRow = buildMailInfo(note);
    if (mailRow) inner.appendChild(mailRow);

    if (note.type && note.type !== 'text') {
      const preview = buildAttachmentPreview(note);
      if (preview) inner.appendChild(preview);
    }

    if (note.content && note.content.trim()) {
      const content = document.createElement('div');
      content.className = 'preview-content';
      renderMarkdownInto(content, note.content, note.id);
      inner.appendChild(content);
    } else if (note.encrypted) {
      inner.appendChild(encryptedNotice(false));
    }

    // Every linked note, like the app editor's Links list — the only way to
    // reach the ones the 3x3 grid has no room for.
    const links = data.links || [];
    if (links.length) {
      const panel = document.createElement('div');
      panel.className = 'center-links';
      const heading = document.createElement('div');
      heading.className = 'center-links-heading';
      heading.textContent = `Links (${links.length})`;
      panel.appendChild(heading);
      const list = document.createElement('div');
      list.className = 'center-links-list';
      for (const link of links) {
        const row = document.createElement('div');
        row.className = 'center-links-row' + (link.status === 'done' ? ' dimmed' : '');
        const name = document.createElement('button');
        name.className = 'center-links-name';
        const icon = TYPE_ICON[link.type];
        name.textContent = icon ? `${icon} ${link.title || 'Untitled'}` : link.title || 'Untitled';
        name.addEventListener('click', () => {
          closeNotePreview();
          load(link.id);
        });
        row.appendChild(name);
        list.appendChild(row);
      }
      panel.appendChild(list);
      inner.appendChild(panel);
    }

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
      (isParent ? ' back' : '') +
      (note.status === 'done' ? ' dimmed' : '');
    const title = document.createElement('div');
    title.className = 'neighbor-title';
    title.textContent = (isParent ? '↩ ' : '') + (note.title || 'Untitled');
    cell.appendChild(title);
    // Same card as public/app.js's makeNeighborCell in its "neighbour text"
    // view: the attachment, the note's text, the info icons.
    const preview = buildAttachmentPreview(note, { compact: true });
    if (preview) cell.appendChild(preview);
    if (note.content && note.content.trim()) {
      const text = document.createElement('div');
      text.className = 'neighbor-content';
      renderMarkdownInto(text, note.content, note.id);
      cell.appendChild(text);
    } else if (note.encrypted) {
      cell.appendChild(encryptedNotice(true));
    }
    const info = buildCardInfoIcons(note);
    if (info) {
      const corner = document.createElement('div');
      corner.className = 'card-corner';
      corner.appendChild(info);
      cell.appendChild(corner);
    }
    cell.addEventListener('click', (e) => {
      // The attachment's own link/player takes the tap.
      if (e.target.closest('a, audio, input, label')) return;
      load(note.id);
    });
    return cell;
  }

  function makeEmptyCell() {
    const cell = document.createElement('div');
    cell.className = 'cell empty';
    return cell;
  }

  function makeCenterCell(data) {
    const note = data.center;
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
    const mailRow = buildMailInfo(note);
    if (mailRow) cell.appendChild(mailRow);

    if (note.type && note.type !== 'text') {
      const preview = buildAttachmentPreview(note, { compact: true });
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
    } else if (note.encrypted) {
      cell.appendChild(encryptedNotice(true));
    }

    // The grid cell is clipped to card height — tap it (outside a wikilink/
    // attachment control, which handle their own click) to read the note in
    // full, same as the main app's own top-half-of-center-card tap.
    // Lower-right corner: info icons, then "+N" for the links the grid has
    // no room for (they're listed in the fullscreen view).
    const corner = document.createElement('div');
    corner.className = 'card-corner';
    const info = buildCardInfoIcons(note);
    if (info) corner.appendChild(info);
    const hidden = (data.linkCount || 0) - OUTER_SLOTS.length;
    if (hidden > 0) {
      const badge = document.createElement('div');
      badge.className = 'center-link-badge';
      badge.textContent = `+${hidden}`;
      badge.title = `${data.linkCount} links — open the note to see them all`;
      corner.appendChild(badge);
    }
    if (corner.children.length) cell.appendChild(corner);

    cell.style.cursor = 'pointer';
    cell.addEventListener('click', (e) => {
      if (e.target.closest('a, audio, input, label')) return;
      openNotePreview(data);
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
        gridEl.appendChild(makeCenterCell(data));
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
    const url = feedUrl();
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

  if (!previewToken && (!shareId || !token)) {
    showStatus('This link is missing its share id or token.');
  } else {
    const initialCenter = params.get('center') ? Number(params.get('center')) : null;
    load(initialCenter);
    loadNoteIndex(); // background; [[wikilinks]] resolve once it lands, inert until then
  }
})();
