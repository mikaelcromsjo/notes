(() => {
  const grid = document.getElementById('grid');
  const tabbar = document.getElementById('tabbar');
  const pinbar = document.getElementById('pinbar');
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  const newNoteBtn = document.getElementById('new-note-btn');

  const colorModeBtn = document.getElementById('color-mode-btn');
  const insightsBtn = document.getElementById('insights-btn');
  const insightsOverlay = document.getElementById('insights-overlay');
  const insightsClose = document.getElementById('insights-close');
  const insightsBody = document.getElementById('insights-body');
  const accountBtn = document.getElementById('account-btn');
  const loginOverlay = document.getElementById('login-overlay');
  const loginEmail = document.getElementById('login-email');
  const loginError = document.getElementById('login-error');
  const loginBtn = document.getElementById('login-btn');

  const pickerOverlay = document.getElementById('picker-overlay');
  const pickerSearch = document.getElementById('picker-search');
  const pickerResults = document.getElementById('picker-results');
  const pickerNewTitle = document.getElementById('picker-new-title');
  const pickerCreateBtn = document.getElementById('picker-create-btn');
  const pickerCancelBtn = document.getElementById('picker-cancel-btn');
  const pickerStyleRow = document.getElementById('picker-style-row');
  const pickerPhotoInput = document.getElementById('picker-photo-input');
  const pickerAudioRow = document.getElementById('picker-audio-row');
  const pickerRecordBtn = document.getElementById('picker-record-btn');
  const pickerRecordStatus = document.getElementById('picker-record-status');
  const pickerContactRow = document.getElementById('picker-contact-row');
  const pickerContactName = document.getElementById('picker-contact-name');
  const pickerContactPhone = document.getElementById('picker-contact-phone');
  const pickerContactEmail = document.getElementById('picker-contact-email');
  const pickerContactPickBtn = document.getElementById('picker-contact-pick-btn');
  const pickerAppUri = document.getElementById('picker-app-uri');
  const pickerConnectSection = document.getElementById('picker-connect-section');

  const noteOverlay = document.getElementById('note-overlay');
  const noteOverlayBody = document.getElementById('note-overlay-body');
  const noteOverlayClose = document.getElementById('note-overlay-close');

  const zoomOutBtn = document.getElementById('zoom-out-btn');
  const zoomInBtn = document.getElementById('zoom-in-btn');
  const zoomResetBtn = document.getElementById('zoom-reset-btn');
  const fullscreenBtn = document.getElementById('fullscreen-btn');
  const headerToggleBtn = document.getElementById('header-toggle-btn');
  const depthOutBtn = document.getElementById('depth-out-btn');
  const depthInBtn = document.getElementById('depth-in-btn');
  const depthResetBtn = document.getElementById('depth-reset-btn');

  let currentId = null;
  let currentNote = null;
  let neighbors = [];
  let parentNeighbor = null;
  let allNotesCache = [];
  let saveTimer = null;
  let currentUser = null;

  const TYPE_ICON = { image: '🖼️', audio: '🎤', contact: '👤', app: '🔗' };

  // --- Colour coding (toggleable) ---
  const COLOR_MODES = ['off', 'path', 'note', 'cluster'];
  const COLOR_LABEL = { off: 'off', path: 'path heat', note: 'note heat', cluster: 'clusters' };
  let colorMode = localStorage.getItem('nico-notes-color-mode') || 'off';
  if (!COLOR_MODES.includes(colorMode)) colorMode = 'off';
  let noteHeat = {};
  let clusters = {};
  let clusterHues = {};

  async function loadNeighbors(id) {
    const data = await api.getNeighbors(id);
    neighbors = (data && data.neighbors) || [];
    parentNeighbor = (data && data.parent) || null;
  }

  async function afterAttach() {
    allNotesCache = await api.listNotes();
    await loadNeighbors(currentId);
    await refreshColorData();
    renderPinbar();
    await render();
  }

  let tabs = [];
  let activeTabId = null;

  const GRID_DEPTH_MIN = 1;
  const GRID_DEPTH_MAX = 2;
  let gridDepth = Math.min(
    GRID_DEPTH_MAX,
    Math.max(GRID_DEPTH_MIN, Number(localStorage.getItem('nico-notes-grid-depth')) || 1)
  );

  // Best-effort current position: resolves to {lat, lon} if permission is
  // already granted (or granted promptly), null otherwise — never blocks
  // note creation waiting on a slow/denied prompt.
  function getLocation() {
    if (!navigator.geolocation) return Promise.resolve(null);
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 5000, maximumAge: 60000 }
      );
    });
  }

  const api = {
    listNotes: () => fetch('/api/notes').then((r) => r.json()),
    getNote: (id) => fetch(`/api/notes/${id}`).then((r) => (r.ok ? r.json() : null)),
    createNote: async (data) => {
      const loc = await getLocation();
      const body = loc ? { ...data, lat: loc.lat, lon: loc.lon } : data;
      return fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => r.json());
    },
    createAttachment: async (parentId, formData) => {
      const loc = await getLocation();
      if (loc) {
        formData.set('lat', String(loc.lat));
        formData.set('lon', String(loc.lon));
      }
      return fetch(`/api/notes/${parentId}/attachments`, {
        method: 'POST',
        body: formData,
      }).then((r) => r.json());
    },
    updateNote: (id, data) =>
      fetch(`/api/notes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    setStatus: (id, status) =>
      fetch(`/api/notes/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }).then((r) => r.json()),
    pinNote: (id) => fetch(`/api/notes/${id}/pin`, { method: 'PUT' }).then((r) => r.json()),
    unpinNote: (id) => fetch(`/api/notes/${id}/pin`, { method: 'DELETE' }).then((r) => r.json()),
    getNeighbors: (id) => fetch(`/api/notes/${id}/neighbors`).then((r) => r.json()),
    link: (a, b) =>
      fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ a, b }),
      }),
    unlink: (a, b) =>
      fetch('/api/links', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ a, b }),
      }),
    listTabs: () => fetch('/api/tabs').then((r) => r.json()),
    openTab: (noteId) =>
      fetch('/api/tabs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_id: noteId }),
      }).then((r) => r.json()),
    moveTab: (tabId, noteId) =>
      fetch(`/api/tabs/${tabId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_id: noteId }),
      }).then((r) => r.json()),
    activateTab: (tabId) => fetch(`/api/tabs/${tabId}/activate`, { method: 'PUT' }).then((r) => r.json()),
    closeTab: (tabId) => fetch(`/api/tabs/${tabId}`, { method: 'DELETE' }).then((r) => r.json()),
    logNav: (from, to, via) => {
      if (!to) return;
      fetch('/api/nav', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: from || null, to, via }),
      }).catch(() => {});
    },
    getSession: () => fetch('/api/session').then((r) => (r.ok ? r.json() : { user: null })).catch(() => ({ user: null })),
    login: (email) =>
      fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      }),
    logout: () => fetch('/api/session', { method: 'DELETE' }),
    getNoteHeat: () => fetch('/api/stats/note-heat').then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    getClusters: () => fetch('/api/stats/clusters').then((r) => (r.ok ? r.json() : { clusters: {} })).catch(() => ({ clusters: {} })),
    getInsights: () => fetch('/api/stats/insights').then((r) => (r.ok ? r.json() : null)).catch(() => null),
  };

  // Pull whatever the current colour mode needs (nothing for off/path).
  async function refreshColorData() {
    if (colorMode === 'note') {
      noteHeat = await api.getNoteHeat();
    } else if (colorMode === 'cluster') {
      const data = await api.getClusters();
      clusters = data.clusters || {};
      const ids = [...new Set(Object.values(clusters))];
      clusterHues = {};
      ids.forEach((cid, i) => {
        clusterHues[cid] = Math.round((360 * i) / Math.max(1, ids.length));
      });
    }
  }

  // Paint one grid cell for the active colour mode (no-op when off).
  function applyCellColor(cell, note) {
    cell.removeAttribute('data-tint');
    cell.style.removeProperty('--cell-tint');
    if (colorMode === 'off' || !note) return;

    let tint = null;
    if (colorMode === 'path') {
      const p = typeof note.p === 'number' ? note.p : 0;
      if (p > 0) tint = `color-mix(in srgb, var(--accent) ${Math.round(p * 55)}%, transparent)`;
    } else if (colorMode === 'note') {
      const h = noteHeat[note.id] || 0;
      if (h > 0) tint = `color-mix(in srgb, var(--pin) ${Math.round(h * 55)}%, transparent)`;
    } else if (colorMode === 'cluster') {
      const cid = clusters[note.id];
      if (cid != null) tint = `hsl(${clusterHues[cid] || 0} 70% 88% / 0.75)`;
    }

    if (tint) {
      cell.style.setProperty('--cell-tint', tint);
      cell.setAttribute('data-tint', '');
    }
  }

  function setHash(id) {
    history.replaceState(null, '', `#${id}`);
  }

  // Applies a fresh tabs list from the server: shows whichever tab is
  // flagged active, promotes a tab to active if none is flagged, or opens
  // a tab on the most recent note (or shows the empty state) if none exist.
  async function refreshFromTabs(tabsList) {
    tabs = tabsList;
    let active = tabs.find((t) => t.is_active);

    if (!active && tabs.length > 0) {
      const activated = await api.activateTab(tabs[0].id);
      return refreshFromTabs(activated);
    }

    if (active) {
      activeTabId = active.id;
      currentId = active.note_id;
      currentNote = await api.getNote(currentId);
      await loadNeighbors(currentId);
      await refreshColorData();
      setHash(currentId);
      renderTabbar();
      renderPinbar();
      await render();
      return;
    }

    activeTabId = null;
    currentId = null;
    currentNote = null;
    neighbors = [];
    parentNeighbor = null;
    renderTabbar();
    renderPinbar();

    if (allNotesCache.length > 0) {
      const opened = await api.openTab(allNotesCache[0].id);
      await refreshFromTabs(opened);
    } else {
      renderEmptyState();
    }
  }

  // Recenter the active tab on a note (neighbor clicks, hash navigation, fallbacks).
  async function goTo(id, via = 'neighbor') {
    const note = await api.getNote(id);
    if (!note) return;
    const from = currentId;
    currentId = note.id;
    currentNote = note;
    setHash(currentId);
    await loadNeighbors(currentId);
    await refreshColorData();
    if (activeTabId) {
      tabs = await api.moveTab(activeTabId, currentId);
    }
    renderTabbar();
    renderPinbar();
    await render();
    api.logNav(from, id, via);
  }

  // Used by "jump to note": switch to an existing tab already open on that
  // note instead of recentering the active tab onto it.
  async function jumpTo(id, via = 'search') {
    const existing = tabs.find((t) => t.note_id === id);
    if (existing && existing.id !== activeTabId) {
      const from = currentId;
      const activated = await api.activateTab(existing.id);
      await refreshFromTabs(activated);
      api.logNav(from, id, via);
      return;
    }
    await goTo(id, via);
  }

  async function init() {
    const sess = await api.getSession();
    if (!sess.user) {
      showLogin();
      return;
    }
    currentUser = sess.user;
    accountBtn.title = `Signed in as ${currentUser.email}`;
    allNotesCache = await api.listNotes();
    const tabsList = await api.listTabs();
    await refreshFromTabs(tabsList);
  }

  function renderEmptyState() {
    grid.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'empty-state';
    div.innerHTML = `<button id="first-note-btn">Create your first note</button>`;
    grid.appendChild(div);
    document.getElementById('first-note-btn').addEventListener('click', async () => {
      const title = prompt('Title for your first note:');
      if (!title || !title.trim()) return;
      const note = await api.createNote({ title: title.trim() });
      allNotesCache = await api.listNotes();
      const tabsList = await api.openTab(note.id);
      await refreshFromTabs(tabsList);
    });
  }

  // Renders the type-specific payload of an attachment note (image/audio/contact/app).
  function buildAttachmentPreview(note) {
    if (note.type === 'image' && note.attachment_path) {
      const img = document.createElement('img');
      img.className = 'center-attachment-image';
      img.src = note.attachment_path;
      img.alt = note.title;
      return img;
    }
    if (note.type === 'audio' && note.attachment_path) {
      const audio = document.createElement('audio');
      audio.className = 'center-attachment-audio';
      audio.controls = true;
      audio.src = note.attachment_path;
      return audio;
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

  // Small metadata line: when the note was created, where (GPS), and — if it
  // was spawned from another note (e.g. an attachment) — a link back to it.
  function buildMetaLine(note) {
    const line = document.createElement('div');
    line.className = 'center-meta';

    const parts = [];

    const time = document.createElement('span');
    time.textContent = `🕒 ${new Date(note.created_at).toLocaleString()}`;
    parts.push(time);

    if (note.lat != null && note.lon != null) {
      const gps = document.createElement('a');
      gps.href = `https://maps.google.com/?q=${note.lat},${note.lon}`;
      gps.target = '_blank';
      gps.rel = 'noopener';
      gps.textContent = `📍 ${note.lat.toFixed(5)}, ${note.lon.toFixed(5)}`;
      parts.push(gps);
    }

    if (note.created_from_note_id) {
      const source = allNotesCache.find((n) => n.id === note.created_from_note_id);
      const from = document.createElement('a');
      from.href = '#';
      from.textContent = `⤴ from ${source ? source.title : `note #${note.created_from_note_id}`}`;
      from.addEventListener('click', (e) => {
        e.preventDefault();
        goTo(note.created_from_note_id, 'from-link');
      });
      parts.push(from);
    }

    parts.forEach((p, i) => {
      if (i > 0) line.appendChild(document.createTextNode(' · '));
      line.appendChild(p);
    });

    return line;
  }

  // Builds the editable UI for the current center note — attachment preview,
  // title + content with autosave, meta line, and the pin / 🗑 delete / ✅ done
  // footer. Shared by the grid center cell and the fullscreen overlay.
  // `onRerender` runs after a pin/done toggle; `afterDelete` after a soft-delete.
  function buildNoteEditor({ onRerender, afterDelete }) {
    const frag = document.createDocumentFragment();

    const preview = buildAttachmentPreview(currentNote);
    if (preview) frag.appendChild(preview);

    const title = document.createElement('input');
    title.className = 'center-title';
    title.value = currentNote.title;
    title.placeholder = 'Title';

    const content = document.createElement('textarea');
    content.className = 'center-content';
    content.value = currentNote.content;
    content.placeholder = 'Write here…';

    const footer = document.createElement('div');
    footer.className = 'center-footer';
    const status = document.createElement('span');
    status.className = 'save-status';
    status.textContent = '';

    const actions = document.createElement('div');
    actions.className = 'footer-actions';

    const pinBtn = document.createElement('button');
    pinBtn.className = 'pin-btn' + (currentNote.pinned ? ' active' : '');
    pinBtn.textContent = '📌';
    pinBtn.title = currentNote.pinned ? 'Unpin note' : 'Pin note';
    pinBtn.setAttribute('aria-pressed', String(Boolean(currentNote.pinned)));

    const isDone = currentNote.status === 'done';

    const doneBtn = document.createElement('button');
    doneBtn.className = 'done-btn' + (isDone ? ' active' : '');
    doneBtn.textContent = '✅';
    doneBtn.title = isDone ? 'Mark not done' : 'Mark done';
    doneBtn.setAttribute('aria-pressed', String(isDone));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '🗑️';
    deleteBtn.disabled = Boolean(currentNote.pinned);
    deleteBtn.title = currentNote.pinned ? 'Unpin before deleting' : 'Delete note';

    actions.appendChild(pinBtn);
    actions.appendChild(deleteBtn);
    actions.appendChild(doneBtn);
    footer.appendChild(status);
    footer.appendChild(actions);

    function scheduleSave() {
      status.textContent = 'Saving…';
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        const updated = await api.updateNote(currentId, {
          title: title.value,
          content: content.value,
        });
        currentNote = updated;
        status.textContent = 'Saved';
        allNotesCache = await api.listNotes();
        renderPinbar();

        const tabEntry = tabs.find((t) => t.id === activeTabId);
        if (tabEntry) {
          tabEntry.title = updated.title;
          renderTabbar();
        }
      }, 500);
    }

    title.addEventListener('input', scheduleSave);
    content.addEventListener('input', scheduleSave);

    pinBtn.addEventListener('click', async () => {
      currentNote = currentNote.pinned
        ? await api.unpinNote(currentId)
        : await api.pinNote(currentId);
      allNotesCache = await api.listNotes();
      renderPinbar();
      await onRerender();
    });

    doneBtn.addEventListener('click', async () => {
      currentNote = await api.setStatus(currentId, isDone ? 'active' : 'done');
      allNotesCache = await api.listNotes();
      renderPinbar();
      await onRerender();
    });

    deleteBtn.addEventListener('click', async () => {
      if (currentNote.pinned) return;
      if (!confirm(`Delete "${currentNote.title}"?`)) return;
      await api.setStatus(currentId, 'deleted');
      allNotesCache = await api.listNotes();
      renderPinbar();
      await afterDelete();
    });

    frag.appendChild(title);
    frag.appendChild(content);
    frag.appendChild(buildMetaLine(currentNote));
    frag.appendChild(footer);
    return frag;
  }

  function makeCenterCell() {
    const cell = document.createElement('div');
    cell.className = 'cell center' + (currentNote.status === 'done' ? ' dimmed' : '');
    cell.style.gridColumn = '2';
    cell.style.gridRow = '2';

    applyCellColor(cell, currentNote);

    cell.appendChild(
      buildNoteEditor({
        onRerender: render,
        afterDelete: async () => {
          const tabsList = await api.listTabs();
          await refreshFromTabs(tabsList);
        },
      })
    );

    // Click on the cell chrome (not the inputs/buttons/links) opens this note fullscreen.
    cell.addEventListener('click', (e) => {
      if (e.target.closest('input, textarea, button, a')) return;
      openNoteFullscreen();
    });

    return cell;
  }

  // subNeighbors, when given, renders this cell as its own nested 3x3
  // (that neighbor as sub-center + up to 8 of its own neighbors).
  // isBack marks the "probable parent" slot.
  function makeNeighborCell(neighbor, subNeighbors, isBack) {
    const navVia = isBack ? 'parent' : 'neighbor';
    const cell = document.createElement('div');
    cell.className =
      'cell neighbor' +
      (subNeighbors ? ' nested' : '') +
      (isBack ? ' back' : '') +
      (neighbor.status === 'done' ? ' dimmed' : '');

    applyCellColor(cell, neighbor);

    const unlinkBtn = document.createElement('button');
    unlinkBtn.className = 'unlink-btn';
    unlinkBtn.textContent = '✕';
    unlinkBtn.title = 'Remove connection';
    unlinkBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await api.unlink(currentId, neighbor.id);
      await loadNeighbors(currentId);
      await render();
    });
    cell.appendChild(unlinkBtn);

    if (subNeighbors) {
      const miniGrid = document.createElement('div');
      miniGrid.className = 'mini-grid';
      const miniCells = new Array(9).fill(null);

      const miniCenter = document.createElement('div');
      miniCenter.className = 'mini-cell mini-center' + (neighbor.status === 'done' ? ' dimmed' : '');
      miniCenter.textContent = (isBack ? '↩ ' : '') + neighbor.title;
      miniCenter.title = neighbor.title;
      miniCenter.addEventListener('click', (e) => {
        e.stopPropagation();
        goTo(neighbor.id, navVia);
      });
      miniCells[4] = miniCenter;

      const slots = [0, 1, 2, 3, 5, 6, 7, 8];
      slots.forEach((slotIndex, i) => {
        const sub = subNeighbors[i];
        const miniCell = document.createElement('div');
        if (sub) {
          miniCell.className = 'mini-cell mini-neighbor' + (sub.status === 'done' ? ' dimmed' : '');
          const icon = TYPE_ICON[sub.type];
          miniCell.textContent = icon ? `${icon} ${sub.title}` : sub.title;
          miniCell.title = sub.title;
          miniCell.addEventListener('click', (e) => {
            e.stopPropagation();
            goTo(sub.id, 'neighbor');
          });
        } else {
          miniCell.className = 'mini-cell mini-empty';
        }
        miniCells[slotIndex] = miniCell;
      });

      miniCells.forEach((c) => miniGrid.appendChild(c));
      cell.appendChild(miniGrid);
    } else {
      const title = document.createElement('div');
      title.className = 'neighbor-title';
      const icon = TYPE_ICON[neighbor.type];
      const base = icon ? `${icon} ${neighbor.title}` : neighbor.title;
      title.textContent = (isBack ? '↩ ' : '') + base;
      cell.appendChild(title);
      cell.addEventListener('click', () => goTo(neighbor.id, navVia));
    }

    return cell;
  }

  // Fullscreen view of the current center note — the same editor as the grid
  // center cell (title/content, meta, pin/delete/done), just larger.
  function renderNoteFullscreen() {
    noteOverlayBody.innerHTML = '';
    const inner = document.createElement('div');
    inner.className = 'cell center' + (currentNote.status === 'done' ? ' dimmed' : '');
    inner.appendChild(
      buildNoteEditor({
        onRerender: async () => {
          await render();
          renderNoteFullscreen();
        },
        afterDelete: async () => {
          closeNoteFullscreen();
          const tabsList = await api.listTabs();
          await refreshFromTabs(tabsList);
        },
      })
    );
    noteOverlayBody.appendChild(inner);
  }

  async function openNoteFullscreen() {
    if (!currentId) return;
    currentNote = await api.getNote(currentId);
    if (!currentNote) return;
    renderNoteFullscreen();
    noteOverlay.classList.remove('hidden');
  }

  function closeNoteFullscreen() {
    clearTimeout(saveTimer);
    noteOverlay.classList.add('hidden');
    noteOverlayBody.innerHTML = '';
  }

  // Manual dismiss: also redraw the grid so edits made in the overlay show through.
  async function dismissNoteFullscreen() {
    closeNoteFullscreen();
    if (currentId) await render();
  }

  noteOverlayClose.addEventListener('click', dismissNoteFullscreen);
  noteOverlay.addEventListener('click', (e) => {
    if (e.target === noteOverlay) dismissNoteFullscreen();
  });

  let pendingLinkTarget = null; // currentId, fixed each time picker opens

  function makeEmptyCell() {
    const cell = document.createElement('div');
    cell.className = 'cell empty';
    cell.textContent = '+';
    cell.addEventListener('click', () => openPicker());
    return cell;
  }

  async function render() {
    const outerSlots = [0, 1, 2, 3, 5, 6, 7, 8];
    const BACK_SLOT = 1; // top-center: the probable-parent "back" cell

    const queue = neighbors.slice();
    const slotNote = {};
    for (const slot of outerSlots) {
      if (slot === BACK_SLOT && parentNeighbor) {
        slotNote[slot] = { note: parentNeighbor, isBack: true };
      } else {
        const next = queue.shift();
        if (next) slotNote[slot] = { note: next, isBack: false };
      }
    }

    let subById = {};
    if (gridDepth >= 2) {
      const forSub = Object.values(slotNote).map((s) => s.note);
      if (forSub.length > 0) {
        const results = await Promise.all(forSub.map((n) => api.getNeighbors(n.id)));
        forSub.forEach((n, i) => {
          const d = results[i] || {};
          subById[n.id] = [d.parent, ...(d.neighbors || [])]
            .filter(Boolean)
            .filter((sub) => sub.id !== currentId);
        });
      }
    }

    grid.innerHTML = '';
    const cells = new Array(9).fill(null);
    cells[4] = makeCenterCell();

    for (const slot of outerSlots) {
      const entry = slotNote[slot];
      cells[slot] = entry
        ? makeNeighborCell(entry.note, subById[entry.note.id], entry.isBack)
        : makeEmptyCell();
    }

    cells.forEach((cell) => grid.appendChild(cell));
  }

  // --- Tab bar ---
  function renderTabbar() {
    tabbar.innerHTML = '';

    tabs.forEach((tab) => {
      const chip = document.createElement('div');
      chip.className = 'tab' + (tab.id === activeTabId ? ' active' : '');

      const title = document.createElement('span');
      title.className = 'tab-title';
      title.textContent = tab.title;

      const closeBtn = document.createElement('button');
      closeBtn.className = 'tab-close';
      closeBtn.textContent = '✕';
      closeBtn.title = 'Close tab';
      closeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const tabsList = await api.closeTab(tab.id);
        await refreshFromTabs(tabsList);
      });

      chip.appendChild(title);
      chip.appendChild(closeBtn);
      chip.addEventListener('click', async () => {
        if (tab.id === activeTabId) return;
        const from = currentId;
        const tabsList = await api.activateTab(tab.id);
        await refreshFromTabs(tabsList);
        api.logNav(from, tab.note_id, 'tab');
      });

      tabbar.appendChild(chip);
    });

    const newTabBtn = document.createElement('button');
    newTabBtn.className = 'tab-new-btn';
    newTabBtn.textContent = '+';
    newTabBtn.title = 'Open a new tab on the current note';
    newTabBtn.addEventListener('click', async () => {
      if (!currentId) return;
      const tabsList = await api.openTab(currentId);
      await refreshFromTabs(tabsList);
    });
    tabbar.appendChild(newTabBtn);
  }

  // --- Pin bar: always-visible shortcuts to pinned notes ---
  function renderPinbar() {
    const pinned = allNotesCache.filter((n) => n.pinned);
    pinbar.innerHTML = '';
    pinbar.classList.toggle('hidden', pinned.length === 0);

    pinned.forEach((note) => {
      const chip = document.createElement('div');
      chip.className = 'tab' + (note.id === currentId ? ' active' : '');

      const title = document.createElement('span');
      title.className = 'tab-title';
      title.textContent = `📌 ${note.title}`;

      chip.appendChild(title);
      chip.addEventListener('click', () => jumpTo(note.id, 'pin'));
      pinbar.appendChild(chip);
    });
  }

  // --- Topbar search (jump to note) ---
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) {
      searchResults.classList.add('hidden');
      searchResults.innerHTML = '';
      return;
    }
    const matches = allNotesCache.filter((n) => n.title.toLowerCase().includes(q)).slice(0, 8);
    searchResults.innerHTML = '';
    matches.forEach((n) => {
      const div = document.createElement('div');
      div.className = 'result';
      div.textContent = n.title;
      div.addEventListener('click', () => {
        searchInput.value = '';
        searchResults.classList.add('hidden');
        jumpTo(n.id, 'search');
      });
      searchResults.appendChild(div);
    });
    searchResults.classList.toggle('hidden', matches.length === 0);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search')) {
      searchResults.classList.add('hidden');
    }
  });

  newNoteBtn.addEventListener('click', async () => {
    const title = prompt('Title for new note:');
    if (!title || !title.trim()) return;

    const data = { title: title.trim() };
    if (currentId) data.linkTo = currentId;
    const note = await api.createNote(data);
    allNotesCache = await api.listNotes();
    renderPinbar();

    if (currentId) {
      await loadNeighbors(currentId);
      await refreshColorData();
      await render();
    } else {
      const tabsList = await api.openTab(note.id);
      await refreshFromTabs(tabsList);
    }
  });

  // --- Picker (create a note — of any attachment style — or connect an
  // existing one to the current center, which is always the default target) ---
  const PICKER_TITLE_PLACEHOLDER = {
    text: 'New note title…',
    image: 'Caption (optional)…',
    audio: 'Caption (optional)…',
    contact: 'Override title (optional)…',
    app: 'Label…',
  };

  let pickerStyle = 'text';
  let pickerRecorder = null;
  let pickerRecordedBlob = null;

  function applyPickerStyleVisibility() {
    pickerPhotoInput.classList.toggle('hidden', pickerStyle !== 'image');
    pickerAudioRow.classList.toggle('hidden', pickerStyle !== 'audio');
    pickerContactRow.classList.toggle('hidden', pickerStyle !== 'contact');
    pickerAppUri.classList.toggle('hidden', pickerStyle !== 'app');
    pickerConnectSection.classList.toggle('hidden', pickerStyle !== 'text');
    pickerContactPickBtn.classList.toggle('hidden', !(navigator.contacts && navigator.contacts.select));
    pickerNewTitle.placeholder = PICKER_TITLE_PLACEHOLDER[pickerStyle];
  }

  pickerStyleRow.querySelectorAll('.picker-style-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      pickerStyle = btn.dataset.style;
      pickerStyleRow
        .querySelectorAll('.picker-style-btn')
        .forEach((b) => b.classList.toggle('active', b === btn));
      applyPickerStyleVisibility();
    });
  });

  pickerRecordBtn.addEventListener('click', async () => {
    if (pickerRecorder) {
      pickerRecorder.stop();
      return;
    }
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      alert('Audio recording is not supported in this browser.');
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      alert('Microphone permission was denied.');
      return;
    }
    const recorder = new MediaRecorder(stream);
    const chunks = [];
    recorder.addEventListener('dataavailable', (e) => chunks.push(e.data));
    recorder.addEventListener('stop', () => {
      stream.getTracks().forEach((t) => t.stop());
      pickerRecorder = null;
      pickerRecordBtn.textContent = '🎤 Start recording';
      pickerRecordedBlob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      pickerRecordStatus.textContent = 'Recording captured — tap again to re-record';
    });
    recorder.start();
    pickerRecorder = recorder;
    pickerRecordBtn.textContent = '⏹ Stop recording';
    pickerRecordStatus.textContent = 'Recording…';
  });

  pickerContactPickBtn.addEventListener('click', async () => {
    try {
      const [picked] = await navigator.contacts.select(['name', 'tel', 'email'], { multiple: false });
      if (!picked) return;
      pickerContactName.value = (picked.name && picked.name[0]) || '';
      pickerContactPhone.value = (picked.tel && picked.tel[0]) || '';
      pickerContactEmail.value = (picked.email && picked.email[0]) || '';
    } catch {
      // cancelled or unsupported
    }
  });

  function openPicker() {
    pendingLinkTarget = currentId;
    pickerSearch.value = '';
    pickerNewTitle.value = '';
    pickerResults.innerHTML = '';
    pickerPhotoInput.value = '';
    pickerAppUri.value = '';
    pickerContactName.value = '';
    pickerContactPhone.value = '';
    pickerContactEmail.value = '';
    pickerRecordedBlob = null;
    pickerRecordStatus.textContent = '';
    pickerRecordBtn.textContent = '🎤 Start recording';

    pickerStyle = 'text';
    pickerStyleRow
      .querySelectorAll('.picker-style-btn')
      .forEach((b) => b.classList.toggle('active', b.dataset.style === 'text'));
    applyPickerStyleVisibility();

    pickerOverlay.classList.remove('hidden');
    pickerNewTitle.focus();
    pickerNewTitle.select();
  }

  function closePicker() {
    pickerOverlay.classList.add('hidden');
    pendingLinkTarget = null;
    if (pickerRecorder) pickerRecorder.stop();
  }

  pickerCancelBtn.addEventListener('click', closePicker);
  pickerOverlay.addEventListener('click', (e) => {
    if (e.target === pickerOverlay) closePicker();
  });

  pickerSearch.addEventListener('input', () => {
    const q = pickerSearch.value.trim().toLowerCase();
    const linkedIds = new Set(neighbors.map((n) => n.id));
    let matches = allNotesCache.filter(
      (n) => n.id !== currentId && !linkedIds.has(n.id)
    );
    if (q) matches = matches.filter((n) => n.title.toLowerCase().includes(q));
    matches = matches.slice(0, 8);

    pickerResults.innerHTML = '';
    matches.forEach((n) => {
      const div = document.createElement('div');
      div.className = 'result';
      div.textContent = n.title;
      div.addEventListener('click', async () => {
        await api.link(pendingLinkTarget, n.id);
        await loadNeighbors(currentId);
        await refreshColorData();
        closePicker();
        await render();
      });
      pickerResults.appendChild(div);
    });
  });

  pickerCreateBtn.addEventListener('click', async () => {
    const title = pickerNewTitle.value.trim();

    if (pickerStyle === 'text') {
      if (!title) return;
      await api.createNote({ title, linkTo: pendingLinkTarget });
      closePicker();
      await afterAttach();
      return;
    }

    const formData = new FormData();
    if (pickerStyle === 'image') {
      const file = pickerPhotoInput.files[0];
      if (!file) return alert('Choose a photo first.');
      formData.set('type', 'image');
      formData.set('file', file);
    } else if (pickerStyle === 'audio') {
      if (!pickerRecordedBlob) return alert('Record something first.');
      formData.set('type', 'audio');
      formData.set('file', pickerRecordedBlob, 'recording.webm');
    } else if (pickerStyle === 'contact') {
      const name = pickerContactName.value.trim();
      if (!name) return alert('Contact name is required.');
      formData.set('type', 'contact');
      formData.set('contactName', name);
      formData.set('contactPhone', pickerContactPhone.value);
      formData.set('contactEmail', pickerContactEmail.value);
    } else if (pickerStyle === 'app') {
      const uri = pickerAppUri.value.trim();
      if (!uri) return alert('App link is required.');
      formData.set('type', 'app');
      formData.set('appUri', uri);
      formData.set('appLabel', title);
    }
    if (title) formData.set('title', title);

    await api.createAttachment(pendingLinkTarget, formData);
    closePicker();
    await afterAttach();
  });

  window.addEventListener('hashchange', () => {
    const hashId = Number(location.hash.replace('#', ''));
    if (hashId && hashId !== currentId) goTo(hashId, 'hash');
  });

  // --- Zoom controls (scales the note grid, not the header/tab bar) ---
  const ZOOM_MIN = 0.6;
  const ZOOM_MAX = 2;
  const ZOOM_STEP = 0.1;

  let zoom = Number(localStorage.getItem('nico-notes-zoom')) || 1;

  function applyZoom() {
    zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
    grid.style.zoom = zoom;
    zoomResetBtn.textContent = `${Math.round(zoom * 100)}%`;
    localStorage.setItem('nico-notes-zoom', String(zoom));
  }

  zoomInBtn.addEventListener('click', () => {
    zoom += ZOOM_STEP;
    applyZoom();
  });
  zoomOutBtn.addEventListener('click', () => {
    zoom -= ZOOM_STEP;
    applyZoom();
  });
  zoomResetBtn.addEventListener('click', () => {
    zoom = 1;
    applyZoom();
  });

  applyZoom();

  // --- Grid depth controls (expands each neighbor cell into its own 3x3) ---
  depthResetBtn.textContent = String(gridDepth);

  async function applyGridDepth() {
    depthResetBtn.textContent = String(gridDepth);
    localStorage.setItem('nico-notes-grid-depth', String(gridDepth));
    await render();
  }

  depthInBtn.addEventListener('click', async () => {
    if (gridDepth >= GRID_DEPTH_MAX) return;
    gridDepth += 1;
    await applyGridDepth();
  });
  depthOutBtn.addEventListener('click', async () => {
    if (gridDepth <= GRID_DEPTH_MIN) return;
    gridDepth -= 1;
    await applyGridDepth();
  });
  depthResetBtn.addEventListener('click', async () => {
    if (gridDepth === GRID_DEPTH_MIN) return;
    gridDepth = GRID_DEPTH_MIN;
    await applyGridDepth();
  });

  // --- Fullscreen toggle ---
  if (document.fullscreenEnabled) {
    fullscreenBtn.addEventListener('click', () => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    });
    document.addEventListener('fullscreenchange', () => {
      const isFullscreen = Boolean(document.fullscreenElement);
      fullscreenBtn.classList.toggle('active', isFullscreen);
      fullscreenBtn.setAttribute('aria-pressed', String(isFullscreen));
    });
  } else {
    fullscreenBtn.style.display = 'none';
  }

  // --- Header hide/show toggle ---
  let headerHidden = localStorage.getItem('nico-notes-header-hidden') === '1';

  function applyHeaderVisibility() {
    document.body.classList.toggle('header-hidden', headerHidden);
    headerToggleBtn.textContent = headerHidden ? '▼' : '▲';
    const label = headerHidden ? 'Show header' : 'Hide header';
    headerToggleBtn.title = label;
    headerToggleBtn.setAttribute('aria-label', label);
    headerToggleBtn.setAttribute('aria-pressed', String(headerHidden));
    localStorage.setItem('nico-notes-header-hidden', headerHidden ? '1' : '0');
  }

  headerToggleBtn.addEventListener('click', () => {
    headerHidden = !headerHidden;
    applyHeaderVisibility();
  });

  applyHeaderVisibility();

  // --- Colour coding toggle ---
  function applyColorModeButton() {
    colorModeBtn.title = `Colour coding: ${COLOR_LABEL[colorMode]}`;
    colorModeBtn.classList.toggle('active', colorMode !== 'off');
    localStorage.setItem('nico-notes-color-mode', colorMode);
  }

  colorModeBtn.addEventListener('click', async () => {
    const i = COLOR_MODES.indexOf(colorMode);
    colorMode = COLOR_MODES[(i + 1) % COLOR_MODES.length];
    applyColorModeButton();
    await refreshColorData();
    renderPinbar();
    if (currentId) await render();
  });

  applyColorModeButton();

  // --- Insights overlay ---
  function insightsList(items, render) {
    if (!items || items.length === 0) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = 'Nothing yet.';
      return p;
    }
    const ol = document.createElement('ol');
    items.forEach((item) => {
      const li = document.createElement('li');
      render(li, item);
      ol.appendChild(li);
    });
    return ol;
  }

  function jumpFromInsights(id) {
    insightsOverlay.classList.add('hidden');
    jumpTo(id, 'search');
  }

  async function openInsights() {
    insightsBody.innerHTML = 'Loading…';
    insightsOverlay.classList.remove('hidden');
    const data = await api.getInsights();
    if (!data) {
      insightsBody.textContent = 'Could not load insights.';
      return;
    }
    insightsBody.innerHTML = '';

    const total = document.createElement('p');
    total.className = 'muted';
    total.textContent = `${data.totalEvents} navigation events on record (last 90 days).`;
    insightsBody.appendChild(total);

    const h1 = document.createElement('h3');
    h1.textContent = 'Most visited';
    insightsBody.appendChild(h1);
    insightsBody.appendChild(
      insightsList(data.topNotes, (li, n) => {
        const a = document.createElement('span');
        a.className = 'linkish';
        a.textContent = n.title;
        a.addEventListener('click', () => jumpFromInsights(n.id));
        li.appendChild(a);
        li.appendChild(document.createTextNode(` — ${n.visits} visits`));
      })
    );

    const h2 = document.createElement('h3');
    h2.textContent = 'Strongest paths';
    insightsBody.appendChild(h2);
    insightsBody.appendChild(
      insightsList(data.topPaths, (li, p) => {
        const from = document.createElement('span');
        from.className = 'linkish';
        from.textContent = p.from_title;
        from.addEventListener('click', () => jumpFromInsights(p.from_id));
        const to = document.createElement('span');
        to.className = 'linkish';
        to.textContent = p.to_title;
        to.addEventListener('click', () => jumpFromInsights(p.to_id));
        li.appendChild(from);
        li.appendChild(document.createTextNode(' → '));
        li.appendChild(to);
        li.appendChild(document.createTextNode(` (${p.count}×)`));
      })
    );

    const h3 = document.createElement('h3');
    h3.textContent = 'Never walked';
    insightsBody.appendChild(h3);
    insightsBody.appendChild(
      insightsList(data.orphans, (li, n) => {
        const a = document.createElement('span');
        a.className = 'linkish';
        a.textContent = n.title;
        a.addEventListener('click', () => jumpFromInsights(n.id));
        li.appendChild(a);
      })
    );
  }

  insightsBtn.addEventListener('click', openInsights);
  insightsClose.addEventListener('click', () => insightsOverlay.classList.add('hidden'));
  insightsOverlay.addEventListener('click', (e) => {
    if (e.target === insightsOverlay) insightsOverlay.classList.add('hidden');
  });

  // --- Login / account (email identity only) ---
  function showLogin() {
    loginError.textContent = '';
    loginOverlay.classList.remove('hidden');
    loginEmail.focus();
  }

  async function doLogin() {
    const email = loginEmail.value.trim();
    const r = await api.login(email);
    if (!r.ok) {
      loginError.textContent = 'Enter a valid email address.';
      return;
    }
    location.reload();
  }

  loginBtn.addEventListener('click', doLogin);
  loginEmail.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
  });

  accountBtn.addEventListener('click', async () => {
    if (!currentUser) {
      showLogin();
      return;
    }
    if (confirm(`Signed in as ${currentUser.email}.\nSwitch to a different user?`)) {
      await api.logout();
      location.reload();
    }
  });

  init();
})();
