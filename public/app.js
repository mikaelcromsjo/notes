(() => {
  const grid = document.getElementById('grid');
  const tabbar = document.getElementById('tabbar');
  const pinbar = document.getElementById('pinbar');
  const latestbar = document.getElementById('latestbar');
  const todobar = document.getElementById('todobar');
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  const newNoteBtn = document.getElementById('new-note-btn');

  const colorModeBtn = document.getElementById('color-mode-btn');
  const imageOverlay = document.getElementById('image-overlay');
  const imageOverlayClose = document.getElementById('image-overlay-close');
  const imageOverlayImg = document.getElementById('image-overlay-img');
  const mapBtn = document.getElementById('map-btn');
  const insightsBtn = document.getElementById('insights-btn');
  const insightsOverlay = document.getElementById('insights-overlay');
  const insightsClose = document.getElementById('insights-close');
  const insightsBody = document.getElementById('insights-body');
  const historyBtn = document.getElementById('history-btn');
  const historyOverlay = document.getElementById('history-overlay');
  const historyClose = document.getElementById('history-close');
  const historyBody = document.getElementById('history-body');
  const agendaBtn = document.getElementById('agenda-btn');
  const agendaBadge = document.getElementById('agenda-badge');
  const agendaOverlay = document.getElementById('agenda-overlay');
  const agendaClose = document.getElementById('agenda-close');
  const agendaBody = document.getElementById('agenda-body');
  const accountBtn = document.getElementById('account-btn');
  const loginOverlay = document.getElementById('login-overlay');
  const loginEmail = document.getElementById('login-email');
  const loginError = document.getElementById('login-error');
  const loginBtn = document.getElementById('login-btn');

  const pickerOverlay = document.getElementById('picker-overlay');
  const pickerHeading = document.getElementById('picker-heading');
  const pickerNewTitle = document.getElementById('picker-new-title');
  const pickerCreateBtn = document.getElementById('picker-create-btn');
  const pickerCancelBtn = document.getElementById('picker-cancel-btn');
  const pickerCurrentAttachment = document.getElementById('picker-current-attachment');
  const pickerCurrentAttachmentLabel = document.getElementById('picker-current-attachment-label');
  const pickerRemoveAttachmentBtn = document.getElementById('picker-remove-attachment-btn');
  const pickerStyleRow = document.getElementById('picker-style-row');
  const pickerPhotoRow = document.getElementById('picker-photo-row');
  const pickerPhotoInput = document.getElementById('picker-photo-input');
  const pickerCameraInput = document.getElementById('picker-camera-input');
  const pickerCameraBtn = document.getElementById('picker-camera-btn');
  const pickerGalleryBtn = document.getElementById('picker-gallery-btn');
  const pickerPhotoStatus = document.getElementById('picker-photo-status');
  const pickerFileRow = document.getElementById('picker-file-row');
  const pickerFileInput = document.getElementById('picker-file-input');
  const pickerFileBtn = document.getElementById('picker-file-btn');
  const pickerFileStatus = document.getElementById('picker-file-status');
  const pickerAudioRow = document.getElementById('picker-audio-row');
  const pickerRecordBtn = document.getElementById('picker-record-btn');
  const pickerRecordStatus = document.getElementById('picker-record-status');
  const pickerContactRow = document.getElementById('picker-contact-row');
  const pickerContactName = document.getElementById('picker-contact-name');
  const pickerContactPhone = document.getElementById('picker-contact-phone');
  const pickerContactEmail = document.getElementById('picker-contact-email');
  const pickerContactPickBtn = document.getElementById('picker-contact-pick-btn');
  const pickerAppUri = document.getElementById('picker-app-uri');

  // Separate modal: only links the current note to an existing one (see
  // openLinkModal). #picker-overlay above only ever creates.
  const linkOverlay = document.getElementById('link-overlay');
  const linkSearch = document.getElementById('link-search');
  const linkResults = document.getElementById('link-results');
  const linkCancelBtn = document.getElementById('link-cancel-btn');

  const noteOverlay = document.getElementById('note-overlay');
  const noteOverlayBody = document.getElementById('note-overlay-body');
  const noteOverlayClose = document.getElementById('note-overlay-close');

  const alarmbar = document.getElementById('alarmbar');
  const alarmOverlay = document.getElementById('alarm-overlay');
  const alarmTimeInput = document.getElementById('alarm-time-input');
  const alarmDaysRow = document.getElementById('alarm-days-row');
  const alarmDateWrap = document.getElementById('alarm-date-wrap');
  const alarmDateInput = document.getElementById('alarm-date-input');
  const alarmKindRow = document.getElementById('alarm-kind-row');
  const alarmTimeFields = document.getElementById('alarm-time-fields');
  const alarmPlaceFields = document.getElementById('alarm-place-fields');
  const alarmRadiusInput = document.getElementById('alarm-radius-input');
  const alarmLocReadout = document.getElementById('alarm-loc-readout');
  const alarmLocCurrentBtn = document.getElementById('alarm-loc-current');
  const alarmLocPickBtn = document.getElementById('alarm-loc-pick');
  const mapPickBanner = document.getElementById('map-pick-banner');
  const alarmSaveBtn = document.getElementById('alarm-save-btn');
  const alarmRemoveBtn = document.getElementById('alarm-remove-btn');
  const alarmCancelBtn = document.getElementById('alarm-cancel-btn');
  const alarmPopupOverlay = document.getElementById('alarm-popup-overlay');
  const alarmPopupList = document.getElementById('alarm-popup-list');

  const zoomOutBtn = document.getElementById('zoom-out-btn');
  const zoomInBtn = document.getElementById('zoom-in-btn');
  const zoomResetBtn = document.getElementById('zoom-reset-btn');
  const fullscreenBtn = document.getElementById('fullscreen-btn');
  const headerToggleBtn = document.getElementById('header-toggle-btn');
  const depthCycleBtn = document.getElementById('depth-cycle-btn');

  const accountOverlay = document.getElementById('account-overlay');
  const accountEmail = document.getElementById('account-email');
  const accountWidgetUrl = document.getElementById('account-widget-url');
  const accountCopyBtn = document.getElementById('account-copy-btn');
  const accountResetWidgetBtn = document.getElementById('account-reset-widget-btn');
  const accountSwitchBtn = document.getElementById('account-switch-btn');
  const accountDeleteBtn = document.getElementById('account-delete-btn');
  const exportBtn = document.getElementById('export-btn');
  const restoreBtn = document.getElementById('restore-btn');
  const restoreFile = document.getElementById('restore-file');
  const restoreStatus = document.getElementById('restore-status');
  const sessionList = document.getElementById('session-list');
  const sessionRevokeOthersBtn = document.getElementById('session-revoke-others-btn');
  const accountCloseBtn = document.getElementById('account-close-btn');
  const importFormat = document.getElementById('import-format');
  const importFile = document.getElementById('import-file');
  const importRunBtn = document.getElementById('import-run-btn');
  const importStatus = document.getElementById('import-status');
  const digestCadence = document.getElementById('digest-cadence');
  const digestHour = document.getElementById('digest-hour');
  const digestChannel = document.getElementById('digest-channel');
  const digestStatus = document.getElementById('digest-status');
  const digestTestBtn = document.getElementById('digest-test-btn');
  const settingsNav = document.getElementById('settings-nav');

  // --- Header-row visibility (per device, like zoom / colour mode). A row is
  // shown only when its toggle is on AND it has something to display. ---
  const BAR_PREF_KEY = {
    tabs: 'nico-notes-bar-tabs',
    pins: 'nico-notes-bar-pins',
    latest: 'nico-notes-bar-latest',
    todos: 'nico-notes-bar-todos',
    alarms: 'nico-notes-bar-alarms',
  };
  const barPrefs = Object.fromEntries(
    Object.entries(BAR_PREF_KEY).map(([k, key]) => {
      let v = '1';
      try {
        v = localStorage.getItem(key) ?? '1';
      } catch {
        /* private mode — default on */
      }
      return [k, v !== '0'];
    })
  );

  function setBarPref(key, on) {
    barPrefs[key] = on;
    try {
      localStorage.setItem(BAR_PREF_KEY[key], on ? '1' : '0');
    } catch {
      /* ignore */
    }
    renderTabbar();
    renderPinbar();
    renderLatestbar();
    renderAlarmbar();
  }

  // --- In-app replacements for native alert()/confirm() ---
  function toast(msg) {
    let host = document.getElementById('toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toast-host';
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 200);
    }, 2600);
  }

  function confirmDialog(message, { confirmLabel = 'OK', danger = false } = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'overlay';
      const box = document.createElement('div');
      box.className = 'picker';
      const p = document.createElement('p');
      p.className = 'confirm-message';
      p.textContent = message;
      const actions = document.createElement('div');
      actions.className = 'picker-actions';
      const ok = document.createElement('button');
      ok.textContent = confirmLabel;
      if (danger) ok.className = 'danger';
      const cancel = document.createElement('button');
      cancel.className = 'secondary';
      cancel.textContent = 'Cancel';
      actions.append(ok, cancel);
      box.append(p, actions);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      const done = (val) => {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
        resolve(val);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') done(false);
        if (e.key === 'Enter') done(true);
      };
      ok.addEventListener('click', () => done(true));
      cancel.addEventListener('click', () => done(false));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) done(false);
      });
      document.addEventListener('keydown', onKey);
      ok.focus();
    });
  }

  // --- Offline support. The service worker serves the shell; this layer mirrors
  // note/link data into IndexedDB on every successful read and serves it back
  // when a fetch fails (phase 1), and queues writes made offline in an `outbox`
  // that drains, in order, once the connection returns (phase 2). ---
  const store = window.NicoStore && window.NicoStore.available ? window.NicoStore : null;

  // Counts surfaced by the pill; kept current by refreshPending().
  let pendingCount = 0;
  let failedCount = 0;
  let syncing = false;

  const net = {
    _pill: null,
    get online() {
      return navigator.onLine;
    },
    pill() {
      if (!this._pill) {
        const el = document.createElement('button');
        el.id = 'net-pill';
        el.type = 'button';
        el.className = 'net-pill hidden';
        el.addEventListener('click', () => {
          if (pendingCount || failedCount) openSyncPanel();
        });
        const host = document.querySelector('.header-controls') || document.querySelector('.topbar');
        if (host) host.insertBefore(el, host.firstChild);
        this._pill = el;
      }
      return this._pill;
    },
    render() {
      const el = this.pill();
      let text = '';
      let cls = 'net-pill';
      if (!this.online) {
        text = pendingCount ? `⚡ Offline · ${pendingCount} unsynced` : '⚡ Offline';
        cls += ' net-pill--offline';
      } else if (syncing) {
        text = '↻ Syncing…';
        cls += ' net-pill--syncing';
      } else if (failedCount) {
        text = `⚠ ${failedCount} need${failedCount === 1 ? 's' : ''} attention`;
        cls += ' net-pill--failed';
      } else if (pendingCount) {
        text = `${pendingCount} unsynced`;
        cls += ' net-pill--syncing';
      } else {
        el.className = 'net-pill hidden';
        el.textContent = '';
        return;
      }
      el.className = cls + ((pendingCount || failedCount) ? ' net-pill--clickable' : '');
      el.textContent = text;
    },
  };

  // Note rows arrive in two shapes: the list (GET /api/notes, no `content`) and
  // the full row (GET /api/notes/:id). Merge so a list refresh never drops the
  // `content` a prior full read cached.
  const cache = {
    async mergeNotes(rows) {
      if (!store) return;
      try {
        // One transaction (read → clear → write) so a concurrent flush write
        // can't be wiped by the clear.
        await store.tx('notes', 'readwrite', async (t) => {
          const os = t.objectStore('notes');
          const existing = new Map(
            (await store.reqAsPromise(os.getAll())).map((n) => [n.id, n])
          );
          const listed = new Set(rows.map((r) => r.id));
          os.clear();
          for (const r of rows) {
            const prev = existing.get(r.id);
            // A note with an unsynced local edit stays fully local until its
            // outbox entry lands; otherwise merge (list rows carry no `content`,
            // so the spread keeps a cached body) and track the conflict base.
            os.put(prev && prev._dirty ? prev : { ...prev, ...r, _serverUpdatedAt: r.updated_at });
          }
          // Keep local-only tmp: rows the server list can't know about yet.
          for (const n of existing.values()) {
            if (!listed.has(n.id) && typeof n.id === 'string') os.put(n);
          }
        });
      } catch {
        /* storage unavailable — run online-only */
      }
    },
    // Bulk warm-cache merge (phase 5): folds { id, content, attachment_path,
    // updated_at } — the fields the list payload omits — for every note into
    // the mirror in one transaction. Same merge rule as mergeNotes: a note
    // with an unsynced local edit is left alone until its outbox entry lands.
    async mergeFullNotes(rows) {
      if (!store) return;
      try {
        await store.tx('notes', 'readwrite', async (t) => {
          const os = t.objectStore('notes');
          for (const r of rows) {
            const prev = await store.reqAsPromise(os.get(r.id));
            if (prev && prev._dirty) continue;
            if (
              prev &&
              prev.content === r.content &&
              prev.attachment_path === r.attachment_path &&
              prev._serverUpdatedAt === r.updated_at
            ) {
              continue;
            }
            os.put({
              ...prev,
              id: r.id,
              content: r.content,
              attachment_path: r.attachment_path,
              updated_at: r.updated_at,
              _serverUpdatedAt: r.updated_at,
            });
          }
        });
      } catch {
        /* storage unavailable — run online-only, same as mergeNotes */
      }
    },
    // A note straight from the server (full row): authoritative, so it clears
    // the local-edit flag unless the outbox still holds an entry for it.
    async putNote(note, { fromServer = true } = {}) {
      if (!store || !note || note.id == null) return;
      try {
        const prev = await store.get('notes', note.id);
        const next = { ...prev, ...note };
        if (fromServer) {
          next._serverUpdatedAt = note.updated_at;
          next._dirty = outbox.hasPendingFor(note.id);
        }
        await store.put('notes', next);
      } catch {
        /* ignore */
      }
    },
    async cachedList() {
      if (!store) return [];
      try {
        return (await store.getAll('notes')).filter((n) => n.status !== 'deleted');
      } catch {
        return [];
      }
    },
    async cachedNote(id) {
      if (!store) return null;
      try {
        const key = typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : id;
        return (await store.get('notes', key)) || null;
      } catch {
        return null;
      }
    },
    async putLinks(rows) {
      if (!store) return;
      try {
        await store.tx('links', 'readwrite', async (t) => {
          const os = t.objectStore('links');
          // Keep any local-only link (a tmp: endpoint, or one added offline and
          // not yet synced) the server list doesn't know about yet.
          const local = (await store.reqAsPromise(os.getAll())).filter((l) => l._dirty);
          const seen = new Set();
          os.clear();
          for (const r of rows) {
            const key = linkKey(r.a, r.b);
            seen.add(key);
            os.put({ key, a: r.a, b: r.b, created_at: r.created_at });
          }
          for (const l of local) if (!seen.has(l.key)) os.put(l);
        });
      } catch {
        /* ignore */
      }
    },
    async cachedLinks() {
      if (!store) return [];
      try {
        return await store.getAll('links');
      } catch {
        return [];
      }
    },
    // Rebuild the { parent, neighbors, links, linkCount } shape loadNeighbors
    // wants, from the local link + note mirror. No nav_events offline, so the
    // ranking degrades to link-recency (exactly the server's cold-start order)
    // and `parent` falls back to recorded provenance, then to the oldest link
    // (same hierarchy heuristic as the server — see notes.js /neighbors).
    async localNeighbors(id) {
      const nid = typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : id;
      const [links, notesArr] = [await this.cachedLinks(), await this.cachedList()];
      const byId = new Map(notesArr.map((n) => [n.id, n]));
      const rows = links
        .filter((l) => !l._deleted && (l.a === nid || l.b === nid))
        .map((l) => ({ other: l.a === nid ? l.b : l.a, at: l.created_at }))
        .sort((x, y) => String(y.at).localeCompare(String(x.at)))
        .map(({ other, at }) => {
          const n = byId.get(other);
          if (!n || n.status === 'deleted') return null;
          return {
            id: n.id,
            title: n.title,
            type: n.type,
            status: n.status,
            created_from_note_id: n.created_from_note_id,
            note_created_at: n.created_at,
            linked_at: at,
          };
        })
        .filter(Boolean);

      const center = byId.get(nid);
      let parent = null;
      if (center && center.created_from_note_id) {
        const fallback = rows.find((r) => r.id === center.created_from_note_id) || null;
        // 'done' notes sink everywhere else — never surface one as the back-link.
        parent = fallback && fallback.status !== 'done' ? fallback : null;
      }
      // Structural fallback: no recorded provenance. First, drop any
      // candidate that's provably this note's child rather than its parent:
      // created_from_note_id says so explicitly, or its own created_at
      // exactly matches the link's created_at — born at the moment this link
      // was made, same shape as created_from_note_id, just on notes old
      // enough to predate that column being recorded.
      if (!parent) {
        const candidates = rows.filter(
          (r) => r.created_from_note_id !== nid && r.note_created_at !== r.linked_at
        );
        // `rows` (and so `candidates`) is newest-link-first, so the last
        // non-done entry is the oldest surviving link. But if a done note had
        // to be skipped to get there, the true oldest link got archived and
        // the next survivor is often just an incidental note, not a real
        // parent — prefer the most-linked survivor instead (mirrors the
        // server's /neighbors logic).
        let skippedDone = false;
        let oldestSurvivor = null;
        for (let i = candidates.length - 1; i >= 0; i--) {
          if (candidates[i].status === 'done') {
            skippedDone = true;
            continue;
          }
          oldestSurvivor = candidates[i];
          break;
        }
        if (oldestSurvivor && skippedDone) {
          const degree = new Map();
          for (const l of links) {
            if (l._deleted) continue;
            degree.set(l.a, (degree.get(l.a) || 0) + 1);
            degree.set(l.b, (degree.get(l.b) || 0) + 1);
          }
          const orderIndex = new Map(rows.map((r, i) => [r.id, i])); // 0 = newest
          const survivors = candidates.filter((r) => r.status !== 'done');
          survivors.sort((a, b) => {
            const da = degree.get(a.id) || 0;
            const dbDeg = degree.get(b.id) || 0;
            if (da !== dbDeg) return dbDeg - da;
            return orderIndex.get(b.id) - orderIndex.get(a.id); // larger index = older = first
          });
          parent = survivors[0];
        } else {
          parent = oldestSurvivor;
        }
      }
      const parentId = parent ? parent.id : null;
      const ordered = rows.filter((r) => r.id !== parentId);
      // 'done' neighbours sink, same as the server.
      ordered.sort((a, b) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0));
      const neighbors = ordered.slice(0, parent ? 7 : 8);
      return { parent, neighbors, links: rows, linkCount: rows.length };
    },
    // Bulk version of localNeighbors' parent inference, run once for the
    // whole cached graph so features that need "children of X" (the
    // subtree-scoped to-do bar) don't recompute per note. Same rules as the
    // server's buildHierarchy (server/hierarchy.js). Caveat: a note never
    // individually opened may be missing created_from_note_id/created_at in
    // the mirror (the notes list endpoint doesn't carry them), so its child
    // detection degrades to plain oldest-link — the same best-effort trade
    // every offline path here already makes.
    async buildLocalHierarchy() {
      const [links, notesArr] = [await this.cachedLinks(), await this.cachedList()];
      const byId = new Map(notesArr.map((n) => [n.id, n]));

      const neighborsOf = new Map(notesArr.map((n) => [n.id, []]));
      const degree = new Map();
      for (const l of links) {
        if (l._deleted) continue;
        degree.set(l.a, (degree.get(l.a) || 0) + 1);
        degree.set(l.b, (degree.get(l.b) || 0) + 1);
        if (neighborsOf.has(l.a) && neighborsOf.has(l.b)) {
          neighborsOf.get(l.a).push({ id: l.b, linked_at: l.created_at });
          neighborsOf.get(l.b).push({ id: l.a, linked_at: l.created_at });
        }
      }

      const parentOf = new Map();
      for (const n of notesArr) {
        const rows = neighborsOf
          .get(n.id)
          .slice()
          .sort((a, b) => String(b.linked_at).localeCompare(String(a.linked_at))) // newest first
          .map(({ id, linked_at }) => {
            const other = byId.get(id);
            return other ? { ...other, linked_at } : null;
          })
          .filter(Boolean);

        let parent = null;
        if (n.created_from_note_id) {
          const fb = rows.find((r) => r.id === n.created_from_note_id);
          if (fb && fb.status !== 'done') parent = fb.id;
        }
        if (parent == null) {
          const candidates = rows.filter(
            (r) => r.created_from_note_id !== n.id && r.created_at !== r.linked_at
          );
          let skippedDone = false;
          let oldestSurvivor = null;
          for (let i = candidates.length - 1; i >= 0; i--) {
            if (candidates[i].status === 'done') {
              skippedDone = true;
              continue;
            }
            oldestSurvivor = candidates[i];
            break;
          }
          if (oldestSurvivor && skippedDone) {
            const survivors = candidates.filter((r) => r.status !== 'done');
            survivors.sort((a, b) => {
              const da = degree.get(a.id) || 0;
              const dbDeg = degree.get(b.id) || 0;
              if (da !== dbDeg) return dbDeg - da;
              return a.linked_at < b.linked_at ? -1 : a.linked_at > b.linked_at ? 1 : 0;
            });
            parent = survivors[0] ? survivors[0].id : null;
          } else {
            parent = oldestSurvivor ? oldestSurvivor.id : null;
          }
        }
        parentOf.set(n.id, parent);
      }

      // Break any cycle the per-note heuristic produced (most visibly the
      // graph's own root, which nothing marks as deliberately parentless) by
      // cutting the parent pointer out of whichever cycle member has the
      // highest degree — mirrors the server's buildHierarchy exactly.
      const state = new Map();
      for (const n of notesArr) {
        if (state.get(n.id) === 2) continue;
        const path = [];
        let cur = n.id;
        while (cur != null && !state.has(cur)) {
          state.set(cur, 1);
          path.push(cur);
          cur = parentOf.get(cur);
        }
        if (cur != null && state.get(cur) === 1) {
          const cycle = path.slice(path.indexOf(cur));
          let root = cycle[0];
          for (const id of cycle) if ((degree.get(id) || 0) > (degree.get(root) || 0)) root = id;
          parentOf.set(root, null);
        }
        for (const id of path) state.set(id, 2);
      }

      const childrenOf = new Map();
      for (const [id, p] of parentOf) {
        if (p == null) continue;
        if (!childrenOf.has(p)) childrenOf.set(p, []);
        childrenOf.get(p).push(id);
      }
      return { byId, parentOf, childrenOf, degree };
    },
    // Every descendant id of rootId, any depth (BFS, cycle-safe) — excludes
    // rootId itself. Mirrors the server's hierarchy.js subtreeIds.
    _walkSubtreeIds(childrenOf, rootId) {
      const out = [];
      const seen = new Set([rootId]);
      const queue = [...(childrenOf.get(rootId) || [])];
      for (const id of queue) seen.add(id);
      while (queue.length) {
        const id = queue.shift();
        out.push(id);
        for (const c of childrenOf.get(id) || []) {
          if (!seen.has(c)) {
            seen.add(c);
            queue.push(c);
          }
        }
      }
      return out;
    },
    // Every 'todo'-flagged note anywhere under rootId in the inferred
    // hierarchy, any depth.
    async localSubtreeTodos(rootId) {
      const nid = typeof rootId === 'string' && /^\d+$/.test(rootId) ? Number(rootId) : rootId;
      const { byId, childrenOf } = await this.buildLocalHierarchy();
      return this._walkSubtreeIds(childrenOf, nid)
        .map((id) => byId.get(id))
        .filter((n) => n && n.status === 'todo')
        .map((n) => ({ id: n.id, title: n.title }));
    },
    // Every note id anywhere under rootId, any depth — generic version of
    // localSubtreeTodos, for scoping other per-note lists (the alarm bar).
    async localSubtreeIds(rootId) {
      const nid = typeof rootId === 'string' && /^\d+$/.test(rootId) ? Number(rootId) : rootId;
      const { childrenOf } = await this.buildLocalHierarchy();
      return this._walkSubtreeIds(childrenOf, nid);
    },
    // The most globally significant root: among every parentless note, the
    // one anchoring the largest subtree. Mirrors the server's hierarchy.js
    // probableRoot (see there for why degree alone is the wrong proxy).
    async localProbableRoot() {
      const { byId, parentOf, childrenOf } = await this.buildLocalHierarchy();
      let best = null;
      let bestSize = -1;
      for (const [id, p] of parentOf) {
        if (p != null) continue;
        const size = this._walkSubtreeIds(childrenOf, id).length;
        if (size > bestSize) {
          best = id;
          bestSize = size;
        }
      }
      return best == null ? null : byId.get(best);
    },
    localSearch(q) {
      const ql = String(q || '').toLowerCase().trim();
      if (!ql) return [];
      return allNotesCache
        .filter(
          (n) =>
            (n.title || '').toLowerCase().includes(ql) ||
            (n.content || '').toLowerCase().includes(ql)
        )
        .slice(0, 12)
        .map((n) => ({ id: n.id, title: n.title, type: n.type, snippet: '' }));
    },

    // --- Cached neighbour responses (phase 4): the last server-ranked
    // { parent, neighbors, links, linkCount } per centred note, so the grid keeps
    // its exact arrangement + path-heat offline instead of a link-recency guess.
    nkey(id) {
      return typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : id;
    },
    async putNeighbors(id, data) {
      if (!store || id == null || isTmp(id)) return;
      if (!data || !Array.isArray(data.neighbors)) return; // don't cache an error body
      try {
        await store.put('neighbors', { id: this.nkey(id), data, at: Date.now() });
      } catch {
        /* ignore */
      }
    },
    async getNeighborsBlob(id) {
      if (!store || isTmp(id)) return null;
      try {
        const row = await store.get('neighbors', this.nkey(id));
        return row ? row.data : null;
      } catch {
        return null;
      }
    },
    // Drop cached entries for notes that no longer exist / were deleted since the
    // blob was stored (locally or on another device).
    filterNeighborBlob(data) {
      if (!data) return data;
      const live = new Set(
        allNotesCache.filter((n) => n.status !== 'deleted').map((n) => n.id)
      );
      const keep = (n) => n && live.has(n.id);
      const neighbors = (data.neighbors || []).filter(keep);
      const links = (data.links || []).filter(keep);
      return {
        ...data,
        parent: keep(data.parent) ? data.parent : null,
        neighbors,
        links,
        linkCount: links.length,
      };
    },
    // Keep both endpoints' cached blobs consistent with a link change made
    // offline, so the grid doesn't show a stale / missing neighbour.
    async patchNeighborLink(a, b, { removed = false } = {}) {
      if (!store) return;
      for (const [center, other] of [[a, b], [b, a]]) {
        let row;
        try {
          row = await store.get('neighbors', this.nkey(center));
        } catch {
          row = null;
        }
        if (!row) continue;
        const d = row.data;
        const present =
          (d.neighbors || []).some((n) => n.id === other) ||
          (d.parent && d.parent.id === other);
        if (removed) {
          d.neighbors = (d.neighbors || []).filter((n) => n.id !== other);
          d.links = (d.links || []).filter((n) => n.id !== other);
          if (d.parent && d.parent.id === other) d.parent = null;
        } else if (!present) {
          const o = allNotesCache.find((n) => n.id === other);
          const entry = {
            id: other,
            title: o ? o.title : String(other),
            type: o ? o.type : 'text',
            status: o ? o.status : 'active',
            p: 0,
            score: 0,
          };
          d.neighbors = [entry, ...(d.neighbors || [])].slice(0, 8);
          d.links = [entry, ...(d.links || [])];
        } else {
          continue;
        }
        d.linkCount = (d.links || []).length;
        try {
          await store.put('neighbors', row);
        } catch {
          /* ignore */
        }
      }
    },
  };

  window.addEventListener('online', () => reconnect());
  window.addEventListener('offline', () => net.render());

  // Back online: drain whatever queued while away, then pull authoritative
  // state (which also picks up edits made on other devices).
  async function reconnect() {
    net.render();
    await flushOutbox();
    if (!syncing) await resyncFromServer();
    if (currentUser) checkAlarms({ popup: false });
    syncThemePrefs();
    warmCache();
  }

  // --- Warm cache (phase 5): note text is cheap even at thousands of notes,
  // so pull it all in the background on every online app-open/reconnect
  // instead of only ever caching a note once it's been individually opened.
  // Attachment *files* are a different budget — see warmAttachmentCache.
  // Never awaited by a caller that needs to render now; failures just mean
  // the next run (next open / next reconnect) tries again.
  async function warmCache() {
    if (!store || !navigator.onLine || !currentUser) return;
    try {
      const rows = await fetch('/api/notes/full').then((r) => (r.ok ? r.json() : null));
      if (rows) await cache.mergeFullNotes(rows);
    } catch {
      /* offline mid-flight — next warm cache run retries */
    }
    await warmAttachmentCache();
    await warmThemeImages();
  }

  // Detected once at load: how durable this origin's IndexedDB actually is.
  // An installed Android PWA gets Chrome's automatic persistent-storage grant
  // and a real quota that's a large slice of free disk, so it's safe to keep
  // far more than a bare browser tab (which can vanish on uninstall / manual
  // clear, no separate "app" to preserve) or iOS Safari (which purges unused
  // site data after 7 days unless the app is added to the home screen).
  const STANDALONE =
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    navigator.standalone === true;
  const IS_ANDROID = /Android/i.test(navigator.userAgent);
  const IS_IOS = /iP(hone|ad|od)/i.test(navigator.userAgent);
  const ASSET_CACHE_BASELINE = IS_ANDROID
    ? STANDALONE
      ? 500 * 1024 * 1024
      : 150 * 1024 * 1024
    : IS_IOS
    ? STANDALONE
      ? 200 * 1024 * 1024
      : 50 * 1024 * 1024
    : 500 * 1024 * 1024; // desktop: rarely storage-constrained

  // The environment baseline above, clamped to what the browser actually
  // reports as free (never plan to use more than half of current headroom,
  // so a nearly-full phone degrades instead of hitting QuotaExceededError).
  async function assetCacheBudget() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().catch(() => {});
      }
      const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
      const quota = (est && est.quota) || 0;
      const usage = (est && est.usage) || 0;
      const headroom = quota ? Math.max(0, quota * 0.5 - usage) : 0;
      return headroom ? Math.min(ASSET_CACHE_BASELINE, headroom) : ASSET_CACHE_BASELINE;
    } catch {
      return ASSET_CACHE_BASELINE;
    }
  }

  // Downloads the most-recently-updated attachments up to the size budget,
  // newest first, and evicts anything that no longer fits or no longer
  // exists. `meta['assetIndex']` tracks {size, updatedAt} per cached path
  // without touching the blob-carrying `assets` store, so the budget/eviction
  // math never has to load the blobs themselves into memory.
  async function warmAttachmentCache() {
    if (!store) return;
    let manifest;
    try {
      manifest = await fetch('/api/notes/attachments-manifest').then((r) => (r.ok ? r.json() : null));
    } catch {
      return;
    }
    if (!Array.isArray(manifest)) return;

    const budget = await assetCacheBudget();
    const index = (await store.meta('assetIndex', {})) || {};
    const live = new Set(manifest.map((m) => m.attachment_path));

    for (const p of Object.keys(index)) {
      if (!live.has(p)) {
        delete index[p];
        await store.del('assets', p).catch(() => {});
      }
    }

    let total = 0;
    for (const m of manifest) {
      const size = m.attachment_size || 0;
      const cached = index[m.attachment_path];
      if (total + size > budget) {
        // Past the budget line — drop it if an earlier, looser run cached it.
        if (cached) {
          delete index[m.attachment_path];
          await store.del('assets', m.attachment_path).catch(() => {});
        }
        continue;
      }
      total += size;
      if (cached && cached.updatedAt === m.updated_at) continue; // already current
      try {
        const blob = await fetch(m.attachment_path).then((r) => (r.ok ? r.blob() : null));
        if (!blob) continue;
        await store.put('assets', { path: m.attachment_path, blob, noteId: m.id });
        index[m.attachment_path] = { size, updatedAt: m.updated_at, noteId: m.id };
      } catch {
        /* network dropped mid-download — next warm cache run retries */
      }
    }
    await store.setMeta('assetIndex', index);
  }

  async function resyncFromServer() {
    if (!net.online || !currentUser) return;
    try {
      allNotesCache = await api.listNotes();
      await syncLinks();
      renderPinbar();
      if (currentId != null) {
        await loadNeighbors(currentId);
        await refreshColorData();
        await render();
      }
    } catch {
      /* transient — the next online event or reload will catch up */
    }
  }

  async function syncLinks() {
    if (!net.online) return;
    try {
      const rows = await fetch('/api/links').then((r) => (r.ok ? r.json() : null));
      if (rows) await cache.putLinks(rows);
    } catch {
      /* offline — keep the mirror we have */
    }
  }

  // ---------------------------------------------------------------------------
  // Write queue (phase 2). A mutation made while offline (or one whose request
  // drops mid-flight) is applied optimistically to the IndexedDB mirror and
  // appended to the `outbox` store; flushOutbox() replays entries in order once
  // the connection is back. Offline-created notes get a `tmp:<id>` id that is
  // rewritten to the real server id on create-sync (remapId).
  // ---------------------------------------------------------------------------

  function genId() {
    return (crypto.randomUUID && crypto.randomUUID()) ||
      `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
  }
  const isTmp = (v) => typeof v === 'string' && v.startsWith('tmp:');
  const anyTmp = (...ids) => ids.some(isTmp);

  // Canonical local link key: numeric pairs keep the server's a<b ordering;
  // anything involving a tmp id sorts lexically. Consistent either way.
  function linkKey(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return a < b ? `${a}:${b}` : `${b}:${a}`;
    return [String(a), String(b)].sort().join(':');
  }

  function httpErr(status, msg) {
    const e = new Error(msg || `HTTP ${status}`);
    e.httpStatus = status;
    return e;
  }
  async function reqJson(url, method, body) {
    const opts = { method };
    if (body !== undefined) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(url, opts);
    } catch {
      throw httpErr(0, 'offline'); // network failure — retryable
    }
    if (!res.ok) throw httpErr(res.status, `HTTP ${res.status}`);
    if (res.status === 204) return null;
    return res.json().catch(() => null);
  }
  const postJson = (u, b) => reqJson(u, 'POST', b);
  const putJson = (u, b) => reqJson(u, 'PUT', b);

  // tmp -> real id map, persisted so a reload mid-sync still resolves.
  const idmapMem = new Map();
  async function loadIdmap() {
    if (!store) return;
    const m = await store.meta('idmap', {});
    for (const [k, v] of Object.entries(m || {})) idmapMem.set(k, v);
  }
  const idResolve = (id) => (idmapMem.has(id) ? idmapMem.get(id) : id);

  const outbox = {
    hasPendingFor(id) {
      return pendingRefs.has(id);
    },
  };
  const pendingRefs = new Set();

  async function refreshPending() {
    pendingRefs.clear();
    let all = [];
    if (store) {
      try {
        all = await store.getAll('outbox');
      } catch {
        /* ignore */
      }
    }
    pendingCount = all.filter((e) => e.status !== 'failed').length;
    failedCount = all.filter((e) => e.status === 'failed').length;
    for (const e of all) for (const r of e.refs || []) pendingRefs.add(r);
    net.render();
  }

  // Append a mutation, coalescing with a compatible pending entry where that is
  // safe (repeated edits to one note, a link then its unlink, …) so the queue
  // stays short and produces the minimum number of requests.
  async function enqueue(kind, payload, refs = []) {
    if (!store) return;
    const pend = (await store.getAll('outbox')).filter((e) => e.status !== 'failed');
    const find = (fn) => pend.find(fn);

    if (kind === 'note.update') {
      const create = find((e) => e.kind === 'note.create' && e.payload.tmpId === payload.id);
      if (create) {
        if (payload.title !== undefined) create.payload.title = payload.title;
        if (payload.content !== undefined) create.payload.content = payload.content;
        await store.put('outbox', create);
        return refreshPending();
      }
      const up = find((e) => e.kind === 'note.update' && e.payload.id === payload.id);
      if (up) {
        if (payload.title !== undefined) up.payload.title = payload.title;
        if (payload.content !== undefined) up.payload.content = payload.content;
        up.payload.clientUpdatedAt = payload.clientUpdatedAt; // keep the earliest baseUpdatedAt
        await store.put('outbox', up);
        return refreshPending();
      }
    } else if (kind === 'note.status') {
      const prev = find((e) => e.kind === 'note.status' && e.payload.id === payload.id);
      if (prev) {
        prev.payload.status = payload.status;
        await store.put('outbox', prev);
        return refreshPending();
      }
    } else if (kind === 'note.theme') {
      const prev = find((e) => e.kind === 'note.theme' && e.payload.id === payload.id);
      if (prev) {
        prev.payload.theme = payload.theme;
        prev.payload.children = payload.children;
        await store.put('outbox', prev);
        return refreshPending();
      }
    } else if (kind === 'note.pin' || kind === 'note.unpin') {
      const opp = kind === 'note.pin' ? 'note.unpin' : 'note.pin';
      const cancel = find((e) => e.kind === opp && e.payload.id === payload.id);
      if (cancel) {
        await store.del('outbox', cancel.seq);
        return refreshPending();
      }
      if (find((e) => e.kind === kind && e.payload.id === payload.id)) return refreshPending();
    } else if (kind === 'link' || kind === 'unlink') {
      const samePair = (e) => {
        const p = e.payload;
        return (p.a === payload.a && p.b === payload.b) || (p.a === payload.b && p.b === payload.a);
      };
      const opp = kind === 'link' ? 'unlink' : 'link';
      const cancel = find(
        (e) => e.kind === opp && samePair(e) && !e.payload.rehomeFrom && !payload.rehomeFrom
      );
      if (cancel) {
        await store.del('outbox', cancel.seq);
        return refreshPending();
      }
      if (!payload.rehomeFrom && find((e) => e.kind === kind && samePair(e))) return refreshPending();
    } else if (kind === 'reminder.update') {
      const create = find((e) => e.kind === 'reminder.create' && e.payload.tmpId === payload.id);
      if (create) {
        create.payload.body = { ...create.payload.body, ...payload.body };
        await store.put('outbox', create);
        return refreshPending();
      }
      const up = find((e) => e.kind === 'reminder.update' && e.payload.id === payload.id);
      if (up) {
        up.payload.body = payload.body;
        await store.put('outbox', up);
        return refreshPending();
      }
    } else if (
      kind === 'reminder.ack' ||
      kind === 'reminder.snooze' ||
      kind === 'reminder.arrive'
    ) {
      const prev = find((e) => e.kind === kind && e.payload.id === payload.id);
      if (prev) {
        prev.payload = payload;
        await store.put('outbox', prev);
        return refreshPending();
      }
    } else if (kind === 'reminder.delete') {
      // Drop every queued op for this reminder; only send a delete if it was a
      // real (already-synced) reminder.
      const wasLocalOnly = Boolean(
        find((e) => e.kind === 'reminder.create' && e.payload.tmpId === payload.id)
      );
      for (const d of pend) {
        if (
          d.kind &&
          d.kind.startsWith('reminder.') &&
          (d.payload.id === payload.id || d.payload.tmpId === payload.id)
        ) {
          await store.del('outbox', d.seq);
        }
      }
      if (wasLocalOnly) return refreshPending();
    }

    await store.put('outbox', {
      kind,
      payload,
      refs,
      createdAt: new Date().toISOString(),
      tries: 0,
      lastError: null,
      status: 'pending',
    });
    return refreshPending();
  }

  let flushScheduled = false;
  async function flushOutbox() {
    if (syncing || !navigator.onLine || !store || !currentUser) return;
    syncing = true;
    net.render();
    let drainedAny = false;
    try {
      for (;;) {
        const next = (await store.getAll('outbox'))
          .filter((e) => e.status !== 'failed')
          .sort((a, b) => a.seq - b.seq)[0];
        if (!next) break;
        try {
          await sendEntry(next);
          await store.del('outbox', next.seq);
          drainedAny = true;
        } catch (err) {
          const st = err && err.httpStatus;
          next.tries = (next.tries || 0) + 1;
          next.lastError = (err && err.message) || 'sync failed';
          if (next.kind === 'nav' || next.kind === 'reminder.arrive') {
            await store.del('outbox', next.seq); // best-effort signal — don't surface
            continue;
          }
          if (
            (next.kind === 'link' ||
              next.kind === 'unlink' ||
              next.kind === 'reminder.delete') &&
            (st === 404 || st === 409)
          ) {
            await store.del('outbox', next.seq); // converges / already gone — done
            continue;
          }
          if (st && st >= 400 && st < 500 && st !== 408 && st !== 429) {
            next.status = 'failed';
            await store.put('outbox', next);
            continue; // keep draining the rest
          }
          await store.put('outbox', next); // network / 5xx — stop, retry later
          break;
        }
      }
    } finally {
      syncing = false;
      await refreshPending();
      await reconcileDirty();
    }
    if (drainedAny && navigator.onLine) await resyncFromServer();
  }

  // A note's `_dirty` flag must exactly track "has a pending outbox entry". The
  // per-write helpers set it; this clears it once the queue no longer holds
  // anything for that note (putNote can't do it alone — the entry is still in
  // the store when its own response is being cached).
  async function reconcileDirty() {
    if (!store) return;
    try {
      for (const n of await store.getAll('notes')) {
        const want = pendingRefs.has(n.id);
        if (Boolean(n._dirty) !== want) {
          n._dirty = want;
          await store.put('notes', n);
        }
      }
    } catch {
      /* ignore */
    }
  }

  function scheduleFlush() {
    if (flushScheduled) return;
    flushScheduled = true;
    setTimeout(() => {
      flushScheduled = false;
      flushOutbox();
    }, 400);
  }

  async function sendEntry(e) {
    const p = e.payload;

    if (e.kind === 'note.create') {
      const body = { title: p.title, content: p.content || '' };
      const linkTo = p.linkTo != null ? idResolve(p.linkTo) : null;
      if (linkTo != null && !isTmp(linkTo)) body.linkTo = linkTo;
      if (p.lat != null) body.lat = p.lat;
      if (p.lon != null) body.lon = p.lon;
      const note = await postJson('/api/notes', body);
      await remapId(p.tmpId, note.id);
      await cache.putNote(note);
      return;
    }

    if (e.kind === 'note.update') {
      const id = idResolve(p.id);
      if (isTmp(id)) throw httpErr(0, 'note not synced yet');
      const note = await putJson(`/api/notes/${id}`, {
        title: p.title,
        content: p.content,
        baseUpdatedAt: p.baseUpdatedAt || null,
        clientUpdatedAt: p.clientUpdatedAt || null,
      });
      if (note && note.conflict) await handleConflict(note, p);
      if (note) delete note.conflict;
      await cache.putNote(note);
      return;
    }

    if (e.kind === 'note.status') {
      const id = idResolve(p.id);
      if (isTmp(id)) throw httpErr(0, 'note not synced yet');
      await cache.putNote(await putJson(`/api/notes/${id}/status`, { status: p.status }));
      return;
    }

    if (e.kind === 'note.theme') {
      const id = idResolve(p.id);
      if (isTmp(id)) throw httpErr(0, 'note not synced yet');
      await cache.putNote(await putJson(`/api/notes/${id}/theme`, { theme: p.theme, children: p.children }));
      return;
    }

    if (e.kind === 'note.pin' || e.kind === 'note.unpin') {
      const id = idResolve(p.id);
      if (isTmp(id)) throw httpErr(0, 'note not synced yet');
      const note = await reqJson(`/api/notes/${id}/pin`, e.kind === 'note.pin' ? 'PUT' : 'DELETE');
      await cache.putNote(note);
      return;
    }

    if (e.kind === 'link' || e.kind === 'unlink') {
      const a = idResolve(p.a);
      const b = idResolve(p.b);
      if (anyTmp(a, b)) throw httpErr(0, 'note not synced yet');
      const rf = p.rehomeFrom != null ? idResolve(p.rehomeFrom) : undefined;
      const rehoming = e.kind === 'link' && rf != null && !isTmp(rf) && rf !== b;
      await reqJson(
        '/api/links',
        e.kind === 'link' ? 'POST' : 'DELETE',
        rehoming ? { a, b, rehomeFrom: rf } : { a, b }
      );
      await mirrorLink(a, b, { removed: e.kind === 'unlink' });
      if (rehoming) await mirrorLink(rf, b, { removed: true });
      return;
    }

    if (e.kind === 'attachment.create') {
      const parentId = p.parentId != null ? idResolve(p.parentId) : null;
      if (isTmp(parentId)) throw httpErr(0, 'parent not synced yet');
      const fd = new FormData();
      for (const [k, v] of Object.entries(p.fields || {})) fd.set(k, v);
      if (p.blobKey) {
        const rec = await store.get('blobs', p.blobKey);
        if (!rec || !rec.blob) throw httpErr(0, 'upload data lost');
        fd.set('file', rec.blob, rec.name || 'upload');
      }
      const url = parentId != null ? `/api/notes/${parentId}/attachments` : '/api/notes/attachments';
      let res;
      try {
        res = await fetch(url, { method: 'POST', body: fd });
      } catch {
        throw httpErr(0, 'offline');
      }
      if (!res.ok) throw httpErr(res.status, `HTTP ${res.status}`);
      const note = await res.json().catch(() => null);
      if (p.tmpId && note && note.id != null) {
        await remapId(p.tmpId, note.id);
        await cache.putNote(note);
      }
      if (p.blobKey) await store.del('blobs', p.blobKey).catch(() => {});
      return;
    }

    if (e.kind === 'nav') {
      const to = idResolve(p.to);
      if (isTmp(to)) return; // target never synced — drop
      const from = p.from != null ? idResolve(p.from) : null;
      await postJson('/api/nav', { from: isTmp(from) ? null : from, to, via: p.via });
      return;
    }

    if (e.kind === 'reminder.create') {
      const noteId = idResolve(p.noteId);
      if (isTmp(noteId)) throw httpErr(0, 'note not synced yet');
      const row = await postJson('/api/alarms', { ...p.body, noteId });
      await remapReminderId(p.tmpId, row.id);
      await mirrorUpsertAlarm(row);
      return;
    }
    if (e.kind === 'reminder.update') {
      const id = ridResolve(p.id);
      if (isTmp(id)) throw httpErr(0, 'reminder not synced yet');
      await mirrorUpsertAlarm(await putJson(`/api/alarms/${id}`, p.body));
      return;
    }
    if (e.kind === 'reminder.delete') {
      const id = ridResolve(p.id);
      if (isTmp(id)) return; // never reached the server
      await reqJson(`/api/alarms/${id}`, 'DELETE');
      return;
    }
    if (e.kind === 'reminder.ack') {
      const id = ridResolve(p.id);
      if (isTmp(id)) throw httpErr(0, 'reminder not synced yet');
      await postJson(`/api/alarms/${id}/ack`, { at: p.at, nextAt: p.nextAt || null });
      return;
    }
    if (e.kind === 'reminder.snooze') {
      const id = ridResolve(p.id);
      if (isTmp(id)) throw httpErr(0, 'reminder not synced yet');
      await postJson(`/api/alarms/${id}/snooze`, { until: p.until });
      return;
    }
    if (e.kind === 'reminder.arrive') {
      const id = ridResolve(p.id);
      if (isTmp(id)) return;
      await postJson(`/api/alarms/${id}/arrive`, {});
      return;
    }
  }

  // Rewrite a freshly-synced note's tmp id to its real server id everywhere it
  // could still be referenced: the IndexedDB mirror, the rest of the outbox, and
  // the in-memory view state.
  async function remapId(tmp, real) {
    if (tmp == null || tmp === real) return;
    idmapMem.set(tmp, real);
    if (store) {
      await store.setMeta('idmap', Object.fromEntries(idmapMem)).catch(() => {});
      await store.del('notes', tmp).catch(() => {});
      for (const l of await store.getAll('links')) {
        if (l.a === tmp || l.b === tmp) {
          await store.del('links', l.key);
          const a = l.a === tmp ? real : l.a;
          const b = l.b === tmp ? real : l.b;
          await store.put('links', { ...l, key: linkKey(a, b), a, b });
        }
      }
      for (const entry of await store.getAll('outbox')) {
        let touched = false;
        for (const f of ['id', 'a', 'b', 'to', 'from', 'linkTo', 'parentId', 'rehomeFrom', 'noteId']) {
          if (entry.payload && entry.payload[f] === tmp) {
            entry.payload[f] = real;
            touched = true;
          }
        }
        if (Array.isArray(entry.refs)) {
          const i = entry.refs.indexOf(tmp);
          if (i >= 0) {
            entry.refs[i] = real;
            touched = true;
          }
        }
        if (touched) await store.put('outbox', entry);
      }
      // Rewrite the tmp id inside any cached neighbour blob it was patched into.
      for (const row of await store.getAll('neighbors')) {
        const d = row.data || {};
        let touched = false;
        const fix = (n) => {
          if (n && n.id === tmp) {
            n.id = real;
            touched = true;
          }
          return n;
        };
        (d.neighbors || []).forEach(fix);
        (d.links || []).forEach(fix);
        fix(d.parent);
        if (touched) await store.put('neighbors', row);
      }
    }

    for (const n of allNotesCache) {
      if (n.id === tmp) n.id = real;
      if (n.created_from_note_id === tmp) n.created_from_note_id = real;
    }
    if (currentId === tmp) currentId = real;
    if (currentNote && currentNote.id === tmp) currentNote.id = real;
    for (const t of tabs) if (t.note_id === tmp) t.note_id = real;
    for (const nb of neighbors) if (nb && nb.id === tmp) nb.id = real;
    if (parentNeighbor && parentNeighbor.id === tmp) parentNeighbor.id = real;
    for (const l of allLinks) if (l && l.id === tmp) l.id = real;
    if (location.hash === `#${tmp}`) history.replaceState(null, '', `#${real}`);
  }

  // Keep the local link mirror in step with a link change the server accepted
  // (from the outbox or straight through online), so offline rendering later is
  // correct without waiting for the next full syncLinks().
  async function mirrorLink(a, b, { removed = false } = {}) {
    if (!store) return;
    const key = linkKey(a, b);
    if (removed) {
      await store.del('links', key).catch(() => {});
      return;
    }
    const prev = await store.get('links', key);
    await store.put('links', {
      key,
      a,
      b,
      created_at: (prev && prev.created_at) || new Date().toISOString(),
    });
  }

  // The server won a field the user had edited offline: keep the user's version
  // as a new linked "conflicted copy" note rather than dropping it.
  async function handleConflict(serverNote, payload) {
    if (payload.content === undefined || serverNote.content === payload.content) {
      toast(`"${serverNote.title}" also changed on another device.`);
      return;
    }
    await queueCreateNote({
      title: `${serverNote.title} (conflicted copy)`,
      content: payload.content,
      linkTo: serverNote.id,
    });
    toast(`"${serverNote.title}" changed elsewhere — your version was kept as a conflicted copy.`);
  }

  // --- Optimistic local writers, shared by the offline api.* paths ---

  function patchListCache(id, fields) {
    const i = allNotesCache.findIndex((n) => n.id === id);
    if (i >= 0) allNotesCache[i] = { ...allNotesCache[i], ...fields };
  }

  async function putLocalLink(a, b, ts, deleted) {
    if (!store) return;
    const key = linkKey(a, b);
    if (deleted) {
      await store.del('links', key).catch(() => {});
      return;
    }
    await store.put('links', { key, a, b, created_at: ts || new Date().toISOString(), _dirty: true });
  }

  async function queueCreateNote(body) {
    const tmpId = `tmp:${genId()}`;
    const ts = new Date().toISOString();
    const note = {
      id: tmpId,
      title: (body.title || '').trim(),
      content: body.content || '',
      type: 'text',
      status: 'active',
      pinned: 0,
      created_at: ts,
      updated_at: ts,
      created_from_note_id: body.linkTo != null ? body.linkTo : null,
      lat: body.lat != null ? body.lat : null,
      lon: body.lon != null ? body.lon : null,
      _dirty: true,
      _localUpdatedAt: ts,
    };
    if (store) await store.put('notes', note);
    allNotesCache.push({
      id: tmpId,
      title: note.title,
      updated_at: ts,
      pinned: 0,
      type: 'text',
      status: 'active',
      lat: note.lat,
      lon: note.lon,
    });
    if (body.linkTo != null) await putLocalLink(body.linkTo, tmpId, ts);
    await enqueue(
      'note.create',
      {
        tmpId,
        title: note.title,
        content: note.content,
        linkTo: body.linkTo != null ? body.linkTo : null,
        lat: note.lat,
        lon: note.lon,
      },
      [tmpId, body.linkTo].filter((v) => v != null)
    );
    scheduleFlush();
    return note;
  }

  async function queueUpdateNote(id, data, prev) {
    const ts = new Date().toISOString();
    const note = {
      ...prev,
      id,
      title: data.title !== undefined ? data.title.trim() : prev.title,
      content: data.content !== undefined ? data.content : prev.content,
      updated_at: ts,
      _dirty: true,
      _localUpdatedAt: ts,
    };
    if (store) await store.put('notes', note);
    patchListCache(id, { title: note.title, updated_at: ts });
    await enqueue(
      'note.update',
      {
        id,
        title: data.title,
        content: data.content,
        baseUpdatedAt: prev._serverUpdatedAt || prev.updated_at || null,
        clientUpdatedAt: ts,
      },
      [id]
    );
    scheduleFlush();
    return note;
  }

  async function queueAttachment(parentId, formData) {
    const fields = {};
    let blob = null;
    let blobName = 'upload';
    for (const [k, v] of formData.entries()) {
      if (v instanceof Blob) {
        blob = v;
        blobName = (v && v.name) || 'upload';
      } else {
        fields[k] = v;
      }
    }
    const type = fields.type || 'text';
    const ts = new Date().toISOString();
    const tmpId = `tmp:${genId()}`;
    let blobKey = null;
    if (blob && store) {
      blobKey = `blob:${genId()}`;
      await store.put('blobs', { key: blobKey, blob, name: blobName });
    }
    const title =
      (fields.title && fields.title.trim()) ||
      (type === 'image'
        ? 'Photo'
        : type === 'audio'
          ? 'Recording'
          : type === 'file'
            ? blobName || 'File'
            : fields.contactName || fields.appLabel || fields.appUri || 'Attachment');
    const note = {
      id: tmpId,
      title,
      content: fields.content || '',
      type,
      status: 'active',
      pinned: 0,
      created_at: ts,
      updated_at: ts,
      created_from_note_id: parentId,
      lat: fields.lat != null ? Number(fields.lat) : null,
      lon: fields.lon != null ? Number(fields.lon) : null,
      attachment_path:
        type === 'contact'
          ? JSON.stringify({
              name: fields.contactName || '',
              phone: fields.contactPhone || '',
              email: fields.contactEmail || '',
            })
          : type === 'app'
            ? fields.appUri || ''
            : blobKey
              ? `blob-pending:${blobKey}`
              : null,
      _dirty: true,
    };
    if (store) await store.put('notes', note);
    allNotesCache.push({
      id: tmpId,
      title,
      updated_at: ts,
      pinned: 0,
      type,
      status: 'active',
      lat: note.lat,
      lon: note.lon,
    });
    if (parentId != null) await putLocalLink(parentId, tmpId, ts);
    await enqueue(
      'attachment.create',
      { parentId, tmpId, fields, blobKey },
      [tmpId, parentId].filter((v) => v != null)
    );
    scheduleFlush();
    return note;
  }

  // --- Reminders (phase 3) --------------------------------------------------
  // The client already treats reminders as one flat array; mirror it whole in
  // meta['alarms'] rather than adding an object store.

  const ridmapMem = new Map(); // rtmp: -> real reminder id
  async function loadRidmap() {
    if (!store) return;
    const m = await store.meta('ridmap', {});
    for (const [k, v] of Object.entries(m || {})) ridmapMem.set(k, v);
  }
  const ridResolve = (id) => (ridmapMem.has(id) ? ridmapMem.get(id) : id);

  async function alarmMirrorArr() {
    return store ? await store.meta('alarms', []) : [];
  }
  async function mirrorUpsertAlarm(row) {
    if (!store || !row || row.id == null) return;
    const arr = await alarmMirrorArr();
    const i = arr.findIndex((a) => a.id === row.id);
    if (i >= 0) arr[i] = row;
    else arr.push(row);
    await store.setMeta('alarms', arr);
  }
  async function mirrorRemoveAlarm(id) {
    if (!store) return;
    await store.setMeta('alarms', (await alarmMirrorArr()).filter((a) => a.id !== id));
  }
  async function mirrorPatchAlarm(id, patch) {
    if (!store) return;
    const arr = await alarmMirrorArr();
    const i = arr.findIndex((a) => a.id === id);
    if (i >= 0) {
      arr[i] = { ...arr[i], ...patch };
      await store.setMeta('alarms', arr);
    }
  }

  // An update body -> the alarm-shaped fields it changes (matches the server's
  // serialize()). Both PUT branches reset ack/next/snooze, so mirror that.
  function alarmUpdateToPatch(b) {
    if (b && b.kind === 'location') {
      return {
        kind: 'location', time: '', days: [], date: null,
        lat: b.lat, lon: b.lon, radiusM: b.radiusM || 250,
        tz: b.tz || null, nextAt: null, snoozeUntil: null,
      };
    }
    return {
      kind: 'time', time: b.time, days: b.days || [], date: b.date || null,
      lat: null, lon: null, radiusM: null, tz: b.tz || null,
      ackAt: b.ackAt || new Date().toISOString(),
      nextAt: b.nextAt || null, snoozeUntil: null,
    };
  }

  function synthAlarm(p) {
    const b = p.body || {};
    const note = allNotesCache.find((n) => n.id === p.noteId);
    const loc = b.kind === 'location';
    return {
      id: p.tmpId,
      noteId: p.noteId,
      title: (note && note.title) || 'Reminder',
      kind: loc ? 'location' : 'time',
      time: loc ? '' : b.time,
      days: loc ? [] : b.days || [],
      date: loc ? null : b.date || null,
      lat: loc ? b.lat : null,
      lon: loc ? b.lon : null,
      radiusM: loc ? b.radiusM || 250 : null,
      tz: b.tz || null,
      ackAt: b.ackAt || new Date().toISOString(),
      nextAt: b.nextAt || null,
      snoozeUntil: null,
    };
  }

  function mergeAlarmOp(a, kind, p) {
    if (kind === 'reminder.update') return { ...a, ...alarmUpdateToPatch(p.body) };
    if (kind === 'reminder.ack') {
      return { ...a, ackAt: p.at, nextAt: p.nextAt || null, snoozeUntil: null };
    }
    if (kind === 'reminder.snooze') return { ...a, snoozeUntil: p.until, ackAt: p.at || a.ackAt };
    if (kind === 'reminder.arrive') return { ...a, nextAt: p.at || new Date().toISOString() };
    return a;
  }

  // Overlay any queued reminder ops onto a row array so what the UI shows always
  // matches what the user did offline, even if a stale server list slips in.
  async function applyLocalAlarmOps(rows) {
    if (!store) return rows;
    let out = Array.isArray(rows) ? rows.slice() : [];
    let q = [];
    try {
      q = (await store.getAll('outbox')).filter((e) => e.kind && e.kind.startsWith('reminder.'));
    } catch {
      return out;
    }
    for (const e of q.sort((x, y) => x.seq - y.seq)) {
      const p = e.payload;
      if (e.kind === 'reminder.create') {
        if (!out.some((a) => a.id === p.tmpId)) out.push(synthAlarm(p));
      } else if (e.kind === 'reminder.delete') {
        out = out.filter((a) => a.id !== p.id);
      } else {
        const i = out.findIndex((a) => a.id === p.id);
        if (i >= 0) out[i] = mergeAlarmOp(out[i], e.kind, p);
      }
    }
    return out;
  }

  async function remapReminderId(tmp, real) {
    if (tmp == null || tmp === real) return;
    ridmapMem.set(tmp, real);
    if (store) {
      await store.setMeta('ridmap', Object.fromEntries(ridmapMem)).catch(() => {});
      const arr = await alarmMirrorArr();
      let changed = false;
      for (const a of arr) if (a.id === tmp) { a.id = real; changed = true; }
      if (changed) await store.setMeta('alarms', arr);
      for (const entry of await store.getAll('outbox')) {
        if (!entry.kind || !entry.kind.startsWith('reminder.')) continue;
        let touched = false;
        for (const f of ['id', 'tmpId']) {
          if (entry.payload && entry.payload[f] === tmp) {
            entry.payload[f] = real;
            touched = true;
          }
        }
        if (Array.isArray(entry.refs)) {
          const i = entry.refs.indexOf(tmp);
          if (i >= 0) {
            entry.refs[i] = real;
            touched = true;
          }
        }
        if (touched) await store.put('outbox', entry);
      }
    }
    for (const a of alarms) if (a && a.id === tmp) a.id = real;
  }

  let currentId = null;
  let currentNote = null;
  let neighbors = [];
  let parentNeighbor = null;
  let allLinks = [];
  let linkCount = 0;
  const LINK_LIST_THRESHOLD = 8;
  let allNotesCache = [];
  let saveTimer = null;
  let currentUser = null;
  let widgetToken = null;

  const TYPE_ICON = { image: '🖼️', audio: '🎤', file: '📎', contact: '👤', app: '🔗' };

  // --- Markdown rendering (vendored marked + DOMPurify, no build step) ---
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // Set while a note's own markdown is being rendered, so [[Title]] never
  // resolves a note to itself (common when several notes share a title).
  let mdRenderContextId = null;

  // Resolve a [[wikilink]] target ("Some Title" or "#123") to a cached note.
  function wikiResolve(target) {
    if (!target) return null;
    const hashId = /^#(\d+)$/.exec(target.trim());
    if (hashId) return allNotesCache.find((n) => n.id === Number(hashId[1])) || null;
    const t = target.trim().toLowerCase();
    return (
      allNotesCache.find(
        (n) => n.id !== mdRenderContextId && (n.title || '').trim().toLowerCase() === t
      ) || null
    );
  }

  const md = (() => {
    const ready =
      typeof window.marked !== 'undefined' && typeof window.DOMPurify !== 'undefined';
    if (ready) {
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
                return `<a class="wikilink" data-note-id="${hit.id}" href="#${hit.id}">${escapeHtml(
                  hit.title || token.target
                )}</a>`;
              }
              return `<a class="wikilink missing" data-wiki="${escapeHtml(
                token.target
              )}" href="#">${escapeHtml(token.target)}</a>`;
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
    return { ready };
  })();

  function mdToHtml(text) {
    if (!md.ready) return null;
    return window.DOMPurify.sanitize(window.marked.parse(text || ''), { ADD_ATTR: ['target'] });
  }

  // Which note's content is being rendered — passed by renderMarkdownInto so
  // wikiResolve can exclude it. Cleared immediately after the sync parse.
  function mdToHtmlFor(text, selfId) {
    mdRenderContextId = selfId == null ? null : selfId;
    try {
      return mdToHtml(text);
    } finally {
      mdRenderContextId = null;
    }
  }

  // Flip the Nth GFM task checkbox (0-based, document order) in `src`.
  function toggleTaskInSource(src, n) {
    let i = -1;
    return (src || '')
      .split('\n')
      .map((line) => {
        const m = /^(\s*(?:[-*+]|\d+\.)\s+)\[([ xX])\](.*)$/.exec(line);
        if (!m) return line;
        i += 1;
        if (i !== n) return line;
        return `${m[1]}[${m[2].toLowerCase() === 'x' ? ' ' : 'x'}]${m[3]}`;
      })
      .join('\n');
  }

  // Render markdown into `el`; wire [[wikilinks]] and (optionally) task checkboxes.
  // opts.onToggleTask(idx) — called when a checkbox is toggled (else read-only).
  // opts.onCreateWiki(name) — called when a missing [[link]] is clicked.
  function renderMarkdownInto(el, text, opts = {}) {
    const html = mdToHtmlFor(text, opts.selfId);
    if (html == null) {
      el.textContent = text || '';
      return;
    }
    el.innerHTML = html;
    el.classList.add('markdown-body');

    el.querySelectorAll('a.wikilink').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = Number(a.dataset.noteId);
        if (id) {
          // Close the fullscreen editor first, else navigation happens behind it.
          if (!noteOverlay.classList.contains('hidden')) closeNoteFullscreen();
          jumpTo(id, 'wikilink');
        } else if (opts.onCreateWiki) {
          opts.onCreateWiki(a.dataset.wiki || a.textContent || '');
        }
      });
    });

    el.querySelectorAll('input[type="checkbox"]').forEach((box, idx) => {
      box.disabled = !opts.onToggleTask;
      if (!opts.onToggleTask) return;
      box.addEventListener('click', (e) => e.stopPropagation());
      box.addEventListener('change', () => opts.onToggleTask(idx));
    });
  }

  // Clicking a [[link]] whose target doesn't exist: offer to create it, link it
  // to the note we're on, and jump there. Never duplicates this note or links
  // it to itself; if a note with that title already exists, links to it instead.
  async function createLinkedNote(name) {
    const title = (name || '').trim();
    if (!title || !currentId) return;
    const key = title.toLowerCase();

    if (currentNote && (currentNote.title || '').trim().toLowerCase() === key) {
      toast('That link points to this note.');
      return;
    }

    const existing = allNotesCache.find(
      (n) => (n.title || '').trim().toLowerCase() === key
    );
    if (existing && existing.id !== currentId) {
      await api.link(currentId, existing.id);
      allNotesCache = await api.listNotes();
      await loadNeighbors(currentId);
      await refreshColorData();
      if (!noteOverlay.classList.contains('hidden')) closeNoteFullscreen();
      jumpTo(existing.id, 'wikilink');
      return;
    }

    if (!(await confirmDialog(`Create note "${title}" and link it here?`, { confirmLabel: 'Create' }))) {
      return;
    }
    const created = await api.createNote({ title, linkTo: currentId });
    allNotesCache = await api.listNotes();
    if (!noteOverlay.classList.contains('hidden')) closeNoteFullscreen();
    jumpTo(created.id, 'wikilink-new');
  }

  // Small anchored dropdown for a button with more than one action — currently
  // just the note editor's ➕. Closes on an outside click, Escape, or picking an
  // item; only one instance is ever open.
  let openActionMenuEl = null;
  function closeActionMenu() {
    if (!openActionMenuEl) return;
    openActionMenuEl.remove();
    openActionMenuEl = null;
    document.removeEventListener('mousedown', onActionMenuOutside, true);
    document.removeEventListener('keydown', onActionMenuKey, true);
  }
  function onActionMenuOutside(e) {
    if (openActionMenuEl && !openActionMenuEl.contains(e.target)) closeActionMenu();
  }
  function onActionMenuKey(e) {
    if (e.key === 'Escape') closeActionMenu();
  }
  function openActionMenu(anchor, items) {
    closeActionMenu();
    const menu = document.createElement('div');
    menu.className = 'action-menu';
    items.forEach(({ label, onClick, active }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'action-menu-item' + (active ? ' active' : '');
      btn.textContent = label;
      btn.addEventListener('click', () => {
        closeActionMenu();
        onClick();
      });
      menu.appendChild(btn);
    });
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.min(r.bottom + 4, window.innerHeight - menu.offsetHeight - 8)}px`;
    openActionMenuEl = menu;
    // Deferred so the click that opened the menu doesn't immediately close it
    // via the same outside-mousedown listener (capture phase fires before this
    // handler is even attached, but the listener add is itself post-microtask
    // relative to the click that's still bubbling).
    setTimeout(() => document.addEventListener('mousedown', onActionMenuOutside, true), 0);
    document.addEventListener('keydown', onActionMenuKey, true);
  }

  // Inline "[[" autocomplete for a <textarea>: type "[[" then at least one
  // character, then pick a note — or a "Create …" row for a brand-new one — to
  // insert [[Title]] and make the graph link. Safety rules: never auto-commits
  // on a bare Enter (only an arrow-key/hover-highlighted row or a click), never
  // offers the current note, never creates a note that would duplicate the
  // current one's title or an existing note's title (links to it instead), and
  // never links a note to itself.
  function attachWikiAutocomplete(textarea, { getCurrentId, onLinked }) {
    let menu = null;
    let items = [];
    let active = -1; // -1 = nothing highlighted; only arrow keys / hover set it
    let span = null; // { start, end } of the query text between [[ and the caret

    const close = () => {
      if (menu) menu.remove();
      menu = null;
      items = [];
      active = -1;
      span = null;
    };

    function queryAtCaret() {
      const pos = textarea.selectionStart;
      if (pos !== textarea.selectionEnd) return null;
      const before = textarea.value.slice(0, pos);
      const open = before.lastIndexOf('[[');
      if (open === -1) return null;
      const between = before.slice(open + 2);
      // Bail if we're not inside an open, single-line, not-yet-closed [[ .
      if (/[\][\n]/.test(between) || between.length < 1) return null;
      // Bail if the caret sits just before a "]]" — that's an existing link.
      if (/^\s*\]/.test(textarea.value.slice(pos))) return null;
      return { q: between, start: open + 2, end: pos };
    }

    function buildItems(q) {
      const raw = q.trim();
      const ql = raw.toLowerCase();
      const cur = getCurrentId();
      const curTitle = (currentNote && currentNote.title ? currentNote.title : '')
        .trim()
        .toLowerCase();
      const list = allNotesCache
        .filter((n) => n.id !== cur && (n.title || '').toLowerCase().includes(ql))
        .slice(0, 8)
        .map((n) => ({ kind: 'note', id: n.id, title: n.title }));
      // "Create" only for a genuinely new title that isn't this note's own.
      const exists = allNotesCache.some(
        (n) => (n.title || '').trim().toLowerCase() === ql
      );
      if (raw && !exists && ql !== curTitle) {
        list.push({ kind: 'create', title: raw });
      }
      return list;
    }

    function render() {
      if (!menu) {
        menu = document.createElement('div');
        menu.className = 'wiki-menu';
        document.body.appendChild(menu);
      }
      const r = textarea.getBoundingClientRect();
      menu.style.left = `${r.left}px`;
      menu.style.top = `${Math.min(r.bottom + 2, window.innerHeight - 200)}px`;
      menu.style.width = `${r.width}px`;
      menu.innerHTML = '';
      items.forEach((it, i) => {
        const row = document.createElement('div');
        row.className =
          'wiki-item' + (i === active ? ' active' : '') + (it.kind === 'create' ? ' create' : '');
        const name = document.createElement('span');
        const hint = document.createElement('span');
        hint.className = 'wiki-item-id';
        if (it.kind === 'create') {
          name.textContent = `➕ Create “${it.title}”`;
          hint.textContent = 'new';
        } else {
          name.textContent = it.title || 'Untitled';
          hint.textContent = `#${it.id}`;
        }
        row.append(name, hint);
        row.addEventListener('mouseenter', () => {
          active = i;
          menu.querySelectorAll('.wiki-item').forEach((el, j) =>
            el.classList.toggle('active', j === i)
          );
        });
        row.addEventListener('mousedown', (e) => {
          e.preventDefault();
          choose(i);
        });
        menu.appendChild(row);
      });
    }

    async function choose(i) {
      const it = items[i];
      if (!it || !span) return close();
      const cur = getCurrentId();
      let targetId;
      let targetTitle;

      if (it.kind === 'create') {
        const name = it.title.trim();
        const existing = allNotesCache.find(
          (n) => (n.title || '').trim().toLowerCase() === name.toLowerCase()
        );
        if (existing && existing.id === cur) return close(); // that's this note
        if (existing) {
          targetId = existing.id;
          targetTitle = existing.title;
          await api.link(cur, targetId);
        } else {
          const created = await api.createNote({ title: name, linkTo: cur });
          allNotesCache = await api.listNotes();
          targetId = created.id;
          targetTitle = created.title;
        }
      } else {
        if (it.id === cur) return close();
        targetId = it.id;
        targetTitle = it.title;
        await api.link(cur, targetId);
      }

      const v = textarea.value;
      const insert = `[[${targetTitle}]]`;
      textarea.value = v.slice(0, span.start - 2) + insert + v.slice(span.end);
      const caret = span.start - 2 + insert.length;
      close();
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
      textarea.dispatchEvent(new Event('input'));
      if (onLinked) await onLinked();
    }

    function update() {
      const cq = queryAtCaret();
      if (!cq) return close();
      span = { start: cq.start, end: cq.end };
      items = buildItems(cq.q);
      if (!items.length) return close();
      if (active >= items.length) active = items.length - 1;
      render();
    }

    textarea.addEventListener('input', update);
    textarea.addEventListener('click', update);
    textarea.addEventListener('keydown', (e) => {
      if (!menu) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        active = active + 1 >= items.length ? 0 : active + 1;
        render();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        active = active <= 0 ? items.length - 1 : active - 1;
        render();
      } else if ((e.key === 'Enter' || e.key === 'Tab') && active >= 0) {
        // Only commit when a row is actually highlighted — a bare Enter keeps
        // its normal "new line" behaviour and just dismisses the menu.
        e.preventDefault();
        choose(active);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Enter') {
        close();
      }
    });
    textarea.addEventListener('blur', () => setTimeout(close, 150));
  }

  // --- Colour coding (toggleable) ---
  const COLOR_MODES = ['off', 'path', 'note'];
  const COLOR_LABEL = { off: 'off', path: 'path heat', note: 'note heat' };
  let colorMode = localStorage.getItem('nico-notes-color-mode') || 'off';
  if (!COLOR_MODES.includes(colorMode)) colorMode = 'off';
  let noteHeat = {};

  async function loadNeighbors(id) {
    const data = await api.getNeighbors(id);
    neighbors = (data && data.neighbors) || [];
    parentNeighbor = (data && data.parent) || null;
    allLinks = (data && data.links) || [];
    linkCount = (data && data.linkCount) || 0;
    // Fold in not-yet-synced local neighbours (offline-created notes/attachments
    // linked to this one) that a server response can't know about yet.
    if (store && pendingCount > 0 && !isTmp(id)) {
      const known = new Set(neighbors.map((n) => n.id));
      if (parentNeighbor) known.add(parentNeighbor.id);
      const local = await cache.localNeighbors(id);
      const extra = (local.neighbors || []).filter((n) => isTmp(n.id) && !known.has(n.id));
      if (extra.length) {
        neighbors = neighbors.concat(extra);
        allLinks = allLinks.concat(extra);
        linkCount += extra.length;
      }
    }
  }

  async function afterAttach() {
    allNotesCache = await api.listNotes();
    await loadNeighbors(currentId);
    await refreshColorData();
    renderPinbar();
    await render();
    if (!noteOverlay.classList.contains('hidden')) renderNoteFullscreen();
  }

  let tabs = [];
  let activeTabId = null;

  // --- Alarms ---
  let alarms = [];
  let triggeredAlarmIds = new Set();
  const alarmDismissed = new Set(); // "✕" on the popup — clears when it next rings, or on reload
  const alarmNotified = new Set(); // fired a Notification this cycle already
  let alarmEditNote = null;

  const ALARM_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const ALARM_DAY_NUM = [1, 2, 3, 4, 5, 6, 0]; // JS getDay() for each chip

  // Most recent scheduled datetime at or before `ref`, in the viewer's local
  // timezone, or null if none applies. Mirrors the (now removed) server logic —
  // computed here so "07:00" means 07:00 where the user is, not on the server.
  function mostRecentAlarmTrigger(a, ref) {
    if (!a.time || !/^\d{2}:\d{2}$/.test(a.time)) return null;
    const [h, m] = a.time.split(':').map(Number);

    if (a.days && a.days.length) {
      for (let back = 0; back < 8; back += 1) {
        const d = new Date(ref);
        d.setDate(d.getDate() - back);
        d.setHours(h, m, 0, 0);
        if (d > ref) continue;
        if (a.days.includes(d.getDay())) return d;
      }
      return null;
    }

    if (a.date && /^\d{4}-\d{2}-\d{2}$/.test(a.date)) {
      const d = new Date(`${a.date}T${a.time}:00`);
      return d <= ref ? d : null;
    }
    return null;
  }

  function alarmTriggered(a, ref) {
    if (a.snoozeUntil) {
      const s = new Date(a.snoozeUntil);
      if (s > ref) return false; // snoozed into the future — stays quiet
      return !a.ackAt || new Date(a.ackAt) < s; // snooze elapsed — ring until acked
    }
    // A location reminder has no clock — it "fires" the moment the geofence
    // watch POSTs /arrive, which stamps nextAt. Ring until acked.
    const t =
      a.kind === 'location'
        ? a.nextAt
          ? new Date(a.nextAt)
          : null
        : mostRecentAlarmTrigger(a, ref);
    if (!t || t > ref) return false;
    return !a.ackAt || new Date(a.ackAt) < t;
  }

  // "Remind me later" snoozes, computed in the viewer's timezone. `tonight`
  // means 20:00 today, or tomorrow if it's already past.
  const SNOOZE_OPTIONS = [
    { label: '10 minutes', minutes: 10 },
    { label: '1 hour', hours: 1 },
    { label: '3 hours', hours: 3 },
    { label: 'Tonight', tonight: true },
    { label: 'Tomorrow', days: 1 },
    { label: '1 week', weeks: 1 },
    { label: '2 weeks', weeks: 2 },
    { label: '3 weeks', weeks: 3 },
    { label: '1 month', months: 1 },
    { label: '2 months', months: 2 },
    { label: '3 months', months: 3 },
  ];

  function snoozeUntilIso(
    { minutes = 0, hours = 0, days = 0, weeks = 0, months = 0, tonight = false },
    ref = new Date()
  ) {
    const d = new Date(ref);
    if (tonight) {
      d.setHours(20, 0, 0, 0);
      if (d <= ref) d.setDate(d.getDate() + 1);
      return d.toISOString();
    }
    if (minutes) d.setMinutes(d.getMinutes() + minutes);
    if (hours) d.setHours(d.getHours() + hours);
    if (days) d.setDate(d.getDate() + days);
    if (weeks) d.setDate(d.getDate() + weeks * 7);
    if (months) d.setMonth(d.getMonth() + months);
    return d.toISOString();
  }

  // Next scheduled datetime strictly after `ref`, in the viewer's timezone, or
  // null (a one-time alarm whose date/time has already passed). Sent to the
  // server as an absolute instant so the push scheduler knows when to ring.
  function nextAlarmOccurrence(a, ref) {
    if (!a.time || !/^\d{2}:\d{2}$/.test(a.time)) return null;
    const [h, m] = a.time.split(':').map(Number);

    if (a.days && a.days.length) {
      for (let fwd = 0; fwd < 8; fwd += 1) {
        const d = new Date(ref);
        d.setDate(d.getDate() + fwd);
        d.setHours(h, m, 0, 0);
        if (d <= ref) continue;
        if (a.days.includes(d.getDay())) return d;
      }
      return null;
    }

    if (a.date && /^\d{4}-\d{2}-\d{2}$/.test(a.date)) {
      const d = new Date(`${a.date}T${a.time}:00`);
      return d > ref ? d : null;
    }
    return null;
  }

  const isoOrNull = (d) => (d ? d.toISOString() : null);

  function alarmWhenText(a) {
    if (a.kind === 'location') return `📍 On arrival · ${a.radiusM || 250} m`;
    if (a.days && a.days.length) {
      if (a.days.length === 7) return `Every day · ${a.time}`;
      const labels = ALARM_DAY_NUM.map((num, i) => (a.days.includes(num) ? ALARM_DAYS[i] : null)).filter(
        Boolean
      );
      return `${labels.join(' ')} · ${a.time}`;
    }
    if (a.date) return `${a.date} · ${a.time}`;
    return a.time || '';
  }

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

  // --- Location reminders: a foreground geofence. While the app is open and at
  // least one kind='location' reminder exists, watch the viewer's position; on
  // an outside->inside crossing of a reminder's radius, POST /arrive so the
  // normal triggered/push path fires. Background geofencing needs the native
  // wrapper (Domain 7) — this only runs with the tab alive.
  let geoWatchId = null;
  const geoInside = new Map(); // reminderId -> was inside on the last fix
  const geoArrivedAt = new Map(); // reminderId -> ms of last /arrive (jitter guard)
  const GEO_REARM_MS = 10 * 60 * 1000;

  function haversineM(a, b) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function onGeoPosition(pos) {
    const here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    const slack = Math.min(pos.coords.accuracy || 0, 100);
    for (const a of alarms) {
      if (a.kind !== 'location' || !Number.isFinite(a.lat) || !Number.isFinite(a.lon)) continue;
      const inside = haversineM(here, { lat: a.lat, lon: a.lon }) <= (a.radiusM || 250) + slack;
      const was = geoInside.get(a.id);
      geoInside.set(a.id, inside);
      if (!inside || was) continue; // fire on the outside/unknown -> inside edge only
      if (Date.now() - (geoArrivedAt.get(a.id) || 0) < GEO_REARM_MS) continue;
      geoArrivedAt.set(a.id, Date.now());
      api.arriveAlarm(a.id).then((r) => {
        if (r && r.armed) checkAlarms();
      });
    }
  }

  function syncGeofenceWatch() {
    const want = alarms.some(
      (a) => a.kind === 'location' && Number.isFinite(a.lat) && Number.isFinite(a.lon)
    );
    if (want && geoWatchId == null && navigator.geolocation) {
      geoWatchId = navigator.geolocation.watchPosition(onGeoPosition, () => {}, {
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 27000,
      });
    } else if (!want && geoWatchId != null) {
      navigator.geolocation.clearWatch(geoWatchId);
      geoWatchId = null;
      geoInside.clear();
    }
  }

  // Read whatever we have locally for a note (full row, else the list row).
  async function localNoteFor(id) {
    return (await cache.cachedNote(id)) || allNotesCache.find((n) => n.id === id) || {};
  }

  // GET /api/stats/<path>, caching the body in meta['<metaKey>'] and returning
  // the cached copy (or `fallback`) when offline.
  async function cachedStat(path, metaKey, fallback) {
    try {
      const r = await fetch(`/api/stats/${path}`);
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      if (store) store.setMeta(metaKey, j).catch(() => {});
      return j;
    } catch {
      const hit = store ? await store.meta(metaKey, null) : null;
      return hit != null ? hit : fallback;
    }
  }

  async function togglePin(id, pin) {
    if (navigator.onLine && !isTmp(id)) {
      try {
        const note = await reqJson(`/api/notes/${id}/pin`, pin ? 'PUT' : 'DELETE');
        await cache.putNote(note);
        return note;
      } catch (err) {
        if (err.httpStatus) throw err;
      }
    }
    const prev = await localNoteFor(id);
    const note = { ...prev, id, pinned: pin ? 1 : 0, _dirty: true };
    if (store) await store.put('notes', note);
    patchListCache(id, { pinned: pin ? 1 : 0 });
    await enqueue(pin ? 'note.pin' : 'note.unpin', { id }, [id]);
    scheduleFlush();
    return note;
  }

  const api = {
    // Read: refresh the IndexedDB mirror when the network answers, fall back to
    // it when it doesn't.
    listNotes: async () => {
      try {
        const rows = await fetch('/api/notes').then((r) => r.json());
        await cache.mergeNotes(rows);
        return rows;
      } catch {
        return cache.cachedList();
      }
    },
    searchNotes: (q) => {
      if (!navigator.onLine) return Promise.resolve(cache.localSearch(q));
      return fetch(`/api/notes/search?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => cache.localSearch(q));
    },
    // Every open ('todo') note anywhere below `id` in the inferred hierarchy —
    // powers the to-do bar's "under here" scoping.
    getSubtreeTodos: async (id) => {
      if (id == null || isTmp(id)) return [];
      if (navigator.onLine) {
        try {
          const r = await fetch(`/api/notes/${id}/subtree-todos`);
          if (r.ok) return (await r.json()).todos || [];
        } catch {
          /* fall through to local */
        }
      }
      return cache.localSubtreeTodos(id);
    },
    // Every note id anywhere below `id` in the inferred hierarchy — powers
    // the alarm bar's "under here" scoping, same idea as getSubtreeTodos.
    getSubtreeIds: async (id) => {
      if (id == null || isTmp(id)) return [];
      if (navigator.onLine) {
        try {
          const r = await fetch(`/api/notes/${id}/subtree-ids`);
          if (r.ok) return (await r.json()).ids || [];
        } catch {
          /* fall through to local */
        }
      }
      return cache.localSubtreeIds(id);
    },
    // The graph's most globally significant root — used as the landing note
    // when there's no better context to resume (e.g. the last tab just closed).
    getProbableRoot: async () => {
      if (navigator.onLine) {
        try {
          const r = await fetch('/api/notes/probable-root');
          if (r.ok) return (await r.json()).note || null;
        } catch {
          /* fall through to local */
        }
      }
      return cache.localProbableRoot();
    },
    // Context tags already in use somewhere (`@word` in a note's title or
    // content), most-used first, plus a few common GTD defaults — for the
    // tag-insert menu, not a source of truth (the note text is that).
    // No offline mirror: typing `@word` directly works with no connection
    // either way, this is only a reuse convenience.
    getTags: async () => {
      try {
        const r = await fetch('/api/notes/tags');
        if (r.ok) return (await r.json()).tags || [];
      } catch {
        /* offline or failed — the menu just shows the empty-state message */
      }
      return [];
    },
    rotateWidgetToken: () =>
      fetch('/api/session/widget-token', { method: 'POST' }).then((r) => r.json()),
    getNote: async (id) => {
      try {
        const n = await fetch(`/api/notes/${id}`).then((r) => (r.ok ? r.json() : null));
        if (n) await cache.putNote(n);
        return n || (await cache.cachedNote(id));
      } catch {
        return cache.cachedNote(id);
      }
    },
    // Writes: online, hit the server and mirror the result; on a genuine HTTP
    // error, surface it; on a network drop (or when already offline), apply the
    // change locally and queue it (see the write-queue section above).
    createNote: async (data) => {
      const loc = await getLocation();
      const body = loc ? { ...data, lat: loc.lat, lon: loc.lon } : data;
      if (navigator.onLine) {
        try {
          const note = await postJson('/api/notes', body);
          await cache.putNote(note);
          return note;
        } catch (err) {
          if (err.httpStatus) throw err;
        }
      }
      return queueCreateNote(body);
    },
    createAttachment: async (parentId, formData) => {
      const loc = await getLocation();
      if (loc) {
        formData.set('lat', String(loc.lat));
        formData.set('lon', String(loc.lon));
      }
      const inline = formData.get('inline') === '1' || formData.get('inline') === 'true';
      // No parentId = a standalone attachment note (header/PWA-shortcut "new
      // note"), which has no note to link to or nest the URL under.
      const url = parentId != null ? `/api/notes/${parentId}/attachments` : '/api/notes/attachments';
      if (navigator.onLine && !anyTmp(parentId)) {
        try {
          const res = await fetch(url, {
            method: 'POST',
            body: formData,
          });
          if (!res.ok) throw httpErr(res.status, `HTTP ${res.status}`);
          const note = await res.json();
          if (note && note.id != null) await cache.putNote(note);
          return note;
        } catch (err) {
          if (err.httpStatus) throw err;
        }
      }
      if (inline) {
        // An inline image is referenced by a /uploads URL that only exists once
        // uploaded — there's nothing meaningful to store offline.
        toast('Photos in the text need a connection.');
        throw httpErr(0, 'offline');
      }
      return queueAttachment(parentId, formData);
    },
    // Replace or add *this* note's own attachment (its title/content/links stay
    // put — only type + file change). Unlike createAttachment, needs a live
    // connection: there's no meaningful offline queue for "replace the file a
    // note already has" (nothing to show until the upload actually lands, and
    // a second offline edit before that would have no real file to diff against).
    setNoteAttachment: async (id, formData) => {
      if (!navigator.onLine || isTmp(id)) {
        toast('Changing an attachment needs a connection.');
        throw httpErr(0, 'offline');
      }
      let res;
      try {
        res = await fetch(`/api/notes/${id}/attachment`, { method: 'PUT', body: formData });
      } catch {
        throw httpErr(0, 'offline');
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw httpErr(res.status, j.error || `HTTP ${res.status}`);
      }
      const note = await res.json();
      await cache.putNote(note);
      patchListCache(id, { type: note.type });
      return note;
    },
    removeNoteAttachment: async (id) => {
      if (!navigator.onLine || isTmp(id)) {
        toast('Removing an attachment needs a connection.');
        throw httpErr(0, 'offline');
      }
      const note = await reqJson(`/api/notes/${id}/attachment`, 'DELETE');
      await cache.putNote(note);
      patchListCache(id, { type: note.type });
      return note;
    },
    updateNote: async (id, data) => {
      const prev = await localNoteFor(id);
      if (navigator.onLine && !isTmp(id)) {
        try {
          const note = await putJson(`/api/notes/${id}`, {
            title: data.title,
            content: data.content,
            baseUpdatedAt: prev._serverUpdatedAt || prev.updated_at || null,
            clientUpdatedAt: new Date().toISOString(),
          });
          if (note && note.conflict) await handleConflict(note, data);
          if (note) delete note.conflict;
          await cache.putNote(note);
          return note;
        } catch (err) {
          if (err.httpStatus) throw err;
        }
      }
      return queueUpdateNote(id, data, prev);
    },
    setStatus: async (id, status) => {
      if (navigator.onLine && !isTmp(id)) {
        try {
          const note = await putJson(`/api/notes/${id}/status`, { status });
          await cache.putNote(note);
          return note;
        } catch (err) {
          if (err.httpStatus) throw err;
        }
      }
      const prev = await localNoteFor(id);
      const note = { ...prev, id, status, updated_at: new Date().toISOString(), _dirty: true };
      if (store) await store.put('notes', note);
      patchListCache(id, { status });
      await enqueue('note.status', { id, status }, [id]);
      scheduleFlush();
      return note;
    },
    pinNote: (id) => togglePin(id, true),
    unpinNote: (id) => togglePin(id, false),
    // Per-note theme: `theme` is a style object (or null to clear), `children`
    // lets it cascade to sub notes. Cosmetic — offline it's optimistic + outbox
    // like status, but never touches updated_at.
    setNoteTheme: async (id, theme, children) => {
      const clean = theme && Object.keys(theme).length ? theme : null;
      if (navigator.onLine && !isTmp(id)) {
        try {
          const note = await putJson(`/api/notes/${id}/theme`, { theme: clean, children: Boolean(children) });
          await cache.putNote(note);
          patchListCache(id, { theme: note.theme, theme_children: note.theme_children });
          return note;
        } catch (err) {
          if (err.httpStatus) throw err;
        }
      }
      const fields = {
        theme: clean ? JSON.stringify(clean) : null,
        theme_children: clean && children ? 1 : 0,
      };
      const prev = await localNoteFor(id);
      const note = { ...prev, id, ...fields, _dirty: true };
      if (store) await store.put('notes', note);
      patchListCache(id, fields);
      await enqueue('note.theme', { id, theme: clean, children: Boolean(children) }, [id]);
      scheduleFlush();
      return note;
    },
    // The inferred hierarchy as { childId: parentId }, for resolving a note's
    // theme through its ancestors. Mirrored into meta so it works offline (as of
    // the last online visit).
    getHierarchyParents: async () => {
      try {
        const r = await fetch('/api/notes/hierarchy-parents');
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        if (store) store.setMeta('hierarchyParents', j).catch(() => {});
        return j.parents || {};
      } catch {
        const hit = store ? await store.meta('hierarchyParents', null) : null;
        return (hit && hit.parents) || {};
      }
    },
    getThemePrefs: () => fetch('/api/theme').then((r) => (r.ok ? r.json() : null)),
    saveThemePrefs: (prefs) => putJson('/api/theme', prefs),
    // One background image → { path }; needs the network (a file can't be queued
    // as a theme reference before it exists server-side).
    uploadThemeImage: async (blob) => {
      const fd = new FormData();
      fd.append('file', blob, 'background.jpg');
      const r = await fetch('/api/theme/image', { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `upload failed (${r.status})`);
      return j;
    },
    getNeighbors: async (id) => {
      if (isTmp(id)) return cache.localNeighbors(id);
      try {
        const d = await fetch(`/api/notes/${id}/neighbors`).then((r) => r.json());
        await cache.putNeighbors(id, d);
        return d;
      } catch {
        // Offline: the last server-ranked arrangement if we have it (keeps the
        // grid coherent), else a link-recency recompute.
        const blob = await cache.getNeighborsBlob(id);
        return blob ? cache.filterNeighborBlob(blob) : cache.localNeighbors(id);
      }
    },
    link: async (a, b, rehomeFrom) => {
      const rehoming = rehomeFrom != null && rehomeFrom !== b;
      if (navigator.onLine && !anyTmp(a, b, rehomeFrom)) {
        try {
          const r = await reqJson('/api/links', 'POST', rehoming ? { a, b, rehomeFrom } : { a, b });
          await mirrorLink(a, b);
          await cache.patchNeighborLink(a, b);
          if (rehoming) {
            await mirrorLink(rehomeFrom, b, { removed: true });
            await cache.patchNeighborLink(rehomeFrom, b, { removed: true });
            // A move is stronger evidence than link chronology — mirror the
            // server's provenance stamp so the offline hierarchy fallback
            // reflects it too (see server/routes/links.js's rehome handler).
            await cache.putNote({ id: b, created_from_note_id: a }, { fromServer: false });
          }
          return r;
        } catch (err) {
          if (err.httpStatus) throw err;
        }
      }
      const ts = new Date().toISOString();
      await putLocalLink(a, b, ts);
      await cache.patchNeighborLink(a, b);
      if (rehoming) {
        await putLocalLink(rehomeFrom, b, ts, true);
        await cache.patchNeighborLink(rehomeFrom, b, { removed: true });
        await cache.putNote({ id: b, created_from_note_id: a }, { fromServer: false });
      }
      await enqueue(
        'link',
        rehoming ? { a, b, rehomeFrom } : { a, b },
        [a, b, rehomeFrom].filter((v) => v != null)
      );
      scheduleFlush();
      return { a, b };
    },
    unlink: async (a, b) => {
      if (navigator.onLine && !anyTmp(a, b)) {
        try {
          const r = await reqJson('/api/links', 'DELETE', { a, b });
          await mirrorLink(a, b, { removed: true });
          await cache.patchNeighborLink(a, b, { removed: true });
          return r;
        } catch (err) {
          if (err.httpStatus) throw err;
        }
      }
      await putLocalLink(a, b, null, true);
      await cache.patchNeighborLink(a, b, { removed: true });
      await enqueue('unlink', { a, b }, [a, b]);
      scheduleFlush();
      return null;
    },
    listTabs: async () => {
      try {
        const t = await fetch('/api/tabs').then((r) => r.json());
        if (store) store.setMeta('tabs', t).catch(() => {});
        return t;
      } catch {
        return store ? store.meta('tabs', []) : [];
      }
    },
    // Tab state is online-best-effort (see CLAUDE.md): offline, these are soft
    // no-ops that hand back the tabs we already have so navigation still works;
    // the server reconciles on the next successful listTabs().
    openTab: (noteId) => {
      if (!navigator.onLine) return Promise.resolve(tabs);
      return fetch('/api/tabs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_id: noteId }),
      }).then((r) => r.json());
    },
    moveTab: (tabId, noteId) => {
      if (!navigator.onLine) return Promise.resolve(tabs);
      return fetch(`/api/tabs/${tabId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_id: noteId }),
      }).then((r) => r.json());
    },
    activateTab: (tabId) => {
      if (!navigator.onLine) return Promise.resolve(tabs);
      return fetch(`/api/tabs/${tabId}/activate`, { method: 'PUT' }).then((r) => r.json());
    },
    closeTab: (tabId) => {
      if (!navigator.onLine) return Promise.resolve(tabs);
      return fetch(`/api/tabs/${tabId}`, { method: 'DELETE' }).then((r) => r.json());
    },
    logNav: (from, to, via) => {
      if (!to) return;
      const queue = () => {
        if (store) enqueue('nav', { from: from || null, to, via }, [to, from].filter((v) => v != null));
      };
      if (!navigator.onLine) return queue();
      fetch('/api/nav', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: from || null, to, via }),
      }).catch(queue);
    },
    getSession: async () => {
      try {
        const s = await fetch('/api/session').then((r) => (r.ok ? r.json() : { user: null }));
        if (s && s.user && store) store.setMeta('session', s).catch(() => {});
        return s;
      } catch {
        // Offline: boot from the last session we saw so the app opens to the
        // grid instead of the login screen.
        const cached = store ? await store.meta('session', null) : null;
        return cached && cached.user ? { ...cached, offline: true } : { user: null };
      }
    },
    requestLoginLink: (email) =>
      fetch('/api/auth/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      }),
    logout: () => fetch('/api/session', { method: 'DELETE' }),
    listSessions: () => fetch('/api/auth/sessions').then((r) => (r.ok ? r.json() : { sessions: [] })).catch(() => ({ sessions: [] })),
    revokeSession: (sid) => fetch(`/api/auth/sessions/${sid}`, { method: 'DELETE' }),
    revokeOtherSessions: () => fetch('/api/auth/sessions', { method: 'DELETE' }),
    // Stats blobs are cached so the grid's colour modes keep their tints offline
    // (rather than falling back to no colour) — updated on every online fetch.
    getNoteHeat: () => cachedStat('note-heat', 'statNoteHeat', {}),
    getInsights: () => cachedStat('insights', 'statInsights', null),
    getHistory: () => fetch('/api/history').then((r) => (r.ok ? r.json() : [])).catch(() => []),
    undoHistory: (id) =>
      fetch(`/api/history/${id}/undo`, { method: 'POST' })
        .then((r) => r.json().then((j) => ({ ok: r.ok, ...j })))
        .catch(() => ({ ok: false, error: 'network error' })),
    redoHistory: (id) =>
      fetch(`/api/history/${id}/redo`, { method: 'POST' })
        .then((r) => r.json().then((j) => ({ ok: r.ok, ...j })))
        .catch(() => ({ ok: false, error: 'network error' })),
    // Reminders (phase 3). The whole list is mirrored in meta['alarms'];
    // mutations follow the same online / HTTP-error / queue pattern as notes,
    // with reminder tmp ids prefixed `rtmp:` and their own id map.
    listAlarms: async () => {
      try {
        const rows = await fetch('/api/alarms').then((r) => (r.ok ? r.json() : []));
        const merged = await applyLocalAlarmOps(rows);
        if (store) store.setMeta('alarms', merged).catch(() => {});
        return merged;
      } catch {
        return applyLocalAlarmOps(store ? await store.meta('alarms', []) : []);
      }
    },
    createAlarm: async (data) => {
      const { noteId, ...body } = data;
      if (navigator.onLine && !isTmp(noteId)) {
        try {
          const row = await postJson('/api/alarms', data);
          await mirrorUpsertAlarm(row);
          return row;
        } catch (err) {
          if (err.httpStatus) throw err;
        }
      }
      const tmpId = `rtmp:${genId()}`;
      const payload = { tmpId, noteId, body };
      const synth = synthAlarm(payload);
      await mirrorUpsertAlarm(synth);
      await enqueue('reminder.create', payload, [tmpId, noteId].filter((v) => v != null));
      scheduleFlush();
      return synth;
    },
    updateAlarm: async (id, data) => {
      if (navigator.onLine && !isTmp(id)) {
        try {
          const row = await putJson(`/api/alarms/${id}`, data);
          await mirrorUpsertAlarm(row);
          return row;
        } catch (err) {
          if (err.httpStatus) throw err;
        }
      }
      const patch = alarmUpdateToPatch(data);
      await mirrorPatchAlarm(id, patch);
      await enqueue('reminder.update', { id, body: data }, [id]);
      scheduleFlush();
      return { id, ...patch };
    },
    removeAlarm: async (id) => {
      if (navigator.onLine && !isTmp(id)) {
        try {
          const r = await reqJson(`/api/alarms/${id}`, 'DELETE');
          await mirrorRemoveAlarm(id);
          return r;
        } catch (err) {
          if (err.httpStatus) throw err;
        }
      }
      await mirrorRemoveAlarm(id);
      await enqueue('reminder.delete', { id }, [id]);
      scheduleFlush();
      return null;
    },
    ackAlarm: async (id, nextAt) => {
      const at = new Date().toISOString();
      const patch = { ackAt: at, nextAt: nextAt || null, snoozeUntil: null };
      if (navigator.onLine && !isTmp(id)) {
        try {
          const r = await reqJson(`/api/alarms/${id}/ack`, 'POST', { at, nextAt: nextAt || null });
          await mirrorPatchAlarm(id, patch);
          return r;
        } catch (err) {
          if (err.httpStatus) throw err;
        }
      }
      await mirrorPatchAlarm(id, patch);
      await enqueue('reminder.ack', { id, at, nextAt: nextAt || null }, [id]);
      scheduleFlush();
      return { ok: true };
    },
    snoozeAlarm: async (id, until) => {
      const at = new Date().toISOString();
      if (navigator.onLine && !isTmp(id)) {
        try {
          const r = await reqJson(`/api/alarms/${id}/snooze`, 'POST', { until });
          await mirrorPatchAlarm(id, { snoozeUntil: until, ackAt: at });
          return r;
        } catch (err) {
          if (err.httpStatus) throw err;
        }
      }
      await mirrorPatchAlarm(id, { snoozeUntil: until, ackAt: at });
      await enqueue('reminder.snooze', { id, until, at }, [id]);
      scheduleFlush();
      return { ok: true };
    },
    // Rolling next_at forward is only useful while online (it arms the server
    // push scheduler); offline it's a no-op and checkAlarms skips it.
    scheduleAlarm: (id, nextAt) => {
      if (!navigator.onLine || isTmp(id)) return Promise.resolve();
      return fetch(`/api/alarms/${id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextAt: nextAt || null }),
      }).catch(() => {});
    },
    arriveAlarm: async (id) => {
      if (navigator.onLine && !isTmp(id)) {
        return fetch(`/api/alarms/${id}/arrive`, { method: 'POST' })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
      }
      if (isTmp(id)) return null;
      const at = new Date().toISOString();
      await mirrorPatchAlarm(id, { nextAt: at });
      await enqueue('reminder.arrive', { id, at }, [id]);
      scheduleFlush();
      return { ok: true, armed: true };
    },
    // Server-computed extras (to-do notes, open tasks, waiting-for) — mirror the
    // last successful response so the agenda overlay still shows them offline,
    // same pattern as listTabs/listAlarms rather than going blank.
    agenda: async () => {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      try {
        const r = await fetch(`/api/agenda${tz ? `?tz=${encodeURIComponent(tz)}` : ''}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (store) store.setMeta('agenda', data).catch(() => {});
        return data;
      } catch {
        return store ? store.meta('agenda', null) : null;
      }
    },
    getDigestPrefs: () =>
      fetch('/api/digest/prefs').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    saveDigestPrefs: (p) =>
      fetch('/api/digest/prefs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      })
        .then((r) => r.json())
        .catch(() => null),
    sendTestDigest: (cadence) =>
      fetch('/api/digest/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cadence, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || '' }),
      })
        .then((r) => r.json().then((j) => ({ ok: r.ok, ...j })))
        .catch(() => ({ ok: false, error: 'network error' })),
    onboardingBegin: () =>
      fetch('/api/onboarding/begin', { method: 'POST' }).then((r) => r.ok).catch(() => false),
    getPushKey: () => fetch('/api/push/key').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    subscribePush: (sub) =>
      fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub),
      }).catch(() => {}),
  };

  // Pull whatever the current colour mode needs (nothing for off/path).
  async function refreshColorData() {
    if (colorMode === 'note') {
      noteHeat = await api.getNoteHeat();
    }
  }

  // The translucent tint for a note under the active colour mode, or null.
  function tintFor(note) {
    if (colorMode === 'off' || !note) return null;
    if (colorMode === 'path') {
      const p = typeof note.p === 'number' ? note.p : 0;
      if (p > 0) return `color-mix(in srgb, var(--accent) ${Math.round(p * 55)}%, transparent)`;
    } else if (colorMode === 'note') {
      const h = noteHeat[note.id] || 0;
      if (h > 0) return `color-mix(in srgb, var(--pin) ${Math.round(h * 55)}%, transparent)`;
    }
    return null;
  }

  // Paint one grid cell (outer or mini) for the active colour mode (no-op when off).
  function applyCellColor(cell, note) {
    cell.removeAttribute('data-tint');
    cell.style.removeProperty('--cell-tint');
    const tint = tintFor(note);
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
    tabs = Array.isArray(tabsList) ? tabsList : [];
    let active = tabs.find((t) => t.is_active);

    // No tab flagged active: promote the first. Offline, api.activateTab is a
    // no-op that returns `tabs` unchanged, so pick locally instead of recursing.
    if (!active && tabs.length > 0) {
      if (net.online) {
        const activated = await api.activateTab(tabs[0].id);
        if (Array.isArray(activated) && activated.some((t) => t.is_active)) {
          return refreshFromTabs(activated);
        }
      }
      active = tabs[0];
    }

    if (active) {
      activeTabId = active.id;
      currentId = active.note_id;
      currentNote =
        (await api.getNote(currentId)) ||
        allNotesCache.find((n) => n.id === currentId) ||
        null;
      if (!currentNote) {
        // Offline and this note was never cached — fall back to something we have.
        if (allNotesCache.length > 0) {
          currentId = allNotesCache[0].id;
          currentNote = (await api.getNote(currentId)) || allNotesCache[0];
        } else {
          activeTabId = null;
          currentId = null;
          renderTabbar();
          renderPinbar();
          renderEmptyState();
          return;
        }
      }
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

    if (allNotesCache.length === 0) {
      renderEmptyState();
      return;
    }
    // No tabs left (e.g. you just closed the last one) — land on the graph's
    // probable root rather than an arbitrary note, with the most-recently-
    // updated one as a fallback if that lookup comes up empty.
    const root = await api.getProbableRoot();
    const landingId =
      root && allNotesCache.some((n) => n.id === root.id) ? root.id : allNotesCache[0].id;
    if (net.online) {
      const opened = await api.openTab(landingId);
      if (Array.isArray(opened) && opened.length > tabs.length) {
        await refreshFromTabs(opened);
        return;
      }
    }
    // Offline (or the open didn't take): centre the landing note without a
    // server tab row.
    tabs = [{ id: 'local', note_id: landingId, is_active: 1 }];
    await refreshFromTabs(tabs);
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

  // --- Sync panel: opened from the topbar pill when something is queued or
  // stuck. Lists outbox entries; failed ones get Retry / Discard. ---
  function describeEntry(e) {
    const p = e.payload || {};
    switch (e.kind) {
      case 'note.create':
        return `New note “${p.title || 'Untitled'}”`;
      case 'note.update':
        return 'Note edit';
      case 'note.status':
        return `Set status “${p.status}”`;
      case 'note.theme':
        return 'Note theme';
      case 'note.pin':
        return 'Pin note';
      case 'note.unpin':
        return 'Unpin note';
      case 'link':
        return p.rehomeFrom != null ? 'Move a link' : 'Link two notes';
      case 'unlink':
        return 'Unlink two notes';
      case 'attachment.create':
        return `Upload ${(p.fields && p.fields.type) || 'attachment'}`;
      case 'nav':
        return 'Navigation';
      case 'reminder.create':
        return 'New reminder';
      case 'reminder.update':
        return 'Reminder change';
      case 'reminder.delete':
        return 'Delete reminder';
      case 'reminder.ack':
        return 'Reminder “OK”';
      case 'reminder.snooze':
        return 'Snooze reminder';
      case 'reminder.arrive':
        return 'Reminder arrival';
      default:
        return e.kind;
    }
  }

  async function discardEntry(e) {
    if (!store) return;
    await store.del('outbox', e.seq);
    // Discarding a create also drops everything queued that depends on its
    // tmp id (edits, links, reminders on it).
    const tmp = (e.kind === 'note.create' || e.kind === 'reminder.create') && e.payload.tmpId;
    if (tmp) {
      for (const dep of await store.getAll('outbox')) {
        if ((dep.refs || []).includes(tmp)) await store.del('outbox', dep.seq);
      }
    }
    if (e.kind === 'note.create' && e.payload.tmpId) {
      await store.del('notes', tmp).catch(() => {});
      for (const l of await store.getAll('links')) {
        if (l.a === tmp || l.b === tmp) await store.del('links', l.key);
      }
      allNotesCache = allNotesCache.filter((n) => n.id !== tmp);
      if (currentId === tmp) {
        currentId = null;
        currentNote = null;
        await refreshFromTabs(tabs);
      } else {
        renderPinbar();
      }
    } else if ((e.kind === 'note.update' || e.kind === 'note.status') && navigator.onLine) {
      // Drop the local change and take the server's version back.
      const fresh = await api.getNote(idResolve(e.payload.id));
      if (fresh && currentId === fresh.id) {
        currentNote = fresh;
        await render();
      }
    } else if (e.kind === 'reminder.create' && e.payload.tmpId) {
      await mirrorRemoveAlarm(e.payload.tmpId);
      alarms = alarms.filter((a) => a.id !== e.payload.tmpId);
      renderAlarmbar();
    } else if (e.kind && e.kind.startsWith('reminder.') && navigator.onLine) {
      await checkAlarms({ popup: false }); // re-pull the true reminder state
    }
    await refreshPending();
    await reconcileDirty();
  }

  async function openSyncPanel() {
    if (!store) return;
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    const box = document.createElement('div');
    box.className = 'picker sync-panel';
    overlay.appendChild(box);
    const close = () => overlay.remove();
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) close();
    });

    async function paint() {
      // 'nav' entries are just background nav-history pings — not interesting
      // for the user to review, retry, or discard, so keep them out of the list.
      const all = (await store.getAll('outbox'))
        .filter((e) => e.kind !== 'nav')
        .sort((a, b) => a.seq - b.seq);
      box.innerHTML = '';
      const h = document.createElement('h2');
      const failed = all.filter((e) => e.status === 'failed');
      h.textContent = all.length
        ? `Sync — ${all.length} queued${failed.length ? `, ${failed.length} stuck` : ''}`
        : 'Sync — all caught up';
      box.appendChild(h);

      if (!navigator.onLine) {
        const p = document.createElement('p');
        p.className = 'sync-hint';
        p.textContent = 'Offline — these send when you reconnect.';
        box.appendChild(p);
      }

      const list = document.createElement('div');
      list.className = 'sync-list';
      for (const e of all) {
        const row = document.createElement('div');
        row.className = 'sync-row' + (e.status === 'failed' ? ' failed' : '');
        const label = document.createElement('span');
        label.className = 'sync-row-label';
        label.textContent = describeEntry(e);
        row.appendChild(label);
        if (e.status === 'failed') {
          const why = document.createElement('span');
          why.className = 'sync-row-why';
          why.textContent = e.lastError || 'failed';
          row.appendChild(why);
          const retry = document.createElement('button');
          retry.textContent = 'Retry';
          retry.addEventListener('click', async () => {
            e.status = 'pending';
            e.lastError = null;
            await store.put('outbox', e);
            await refreshPending();
            flushOutbox().then(paint);
            paint();
          });
          const drop = document.createElement('button');
          drop.className = 'secondary';
          drop.textContent = 'Discard';
          drop.addEventListener('click', async () => {
            await discardEntry(e);
            paint();
          });
          row.append(retry, drop);
        }
        list.appendChild(row);
      }
      box.appendChild(list);

      const actions = document.createElement('div');
      actions.className = 'picker-actions';
      if (failed.length) {
        const retryAll = document.createElement('button');
        retryAll.textContent = 'Retry all';
        retryAll.addEventListener('click', async () => {
          for (const e of failed) {
            e.status = 'pending';
            e.lastError = null;
            await store.put('outbox', e);
          }
          await refreshPending();
          flushOutbox().then(paint);
          paint();
        });
        actions.appendChild(retryAll);
      }
      const done = document.createElement('button');
      done.className = 'secondary';
      done.textContent = 'Close';
      done.addEventListener('click', close);
      actions.appendChild(done);
      box.appendChild(actions);
    }

    document.body.appendChild(overlay);
    await paint();
  }

  // A persistent bottom bar with a Reload button — unlike toast(), it doesn't
  // auto-dismiss, for messages the user must act on.
  function showReloadBar(message) {
    let host = document.getElementById('toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toast-host';
      document.body.appendChild(host);
    }
    const bar = document.createElement('div');
    bar.className = 'toast update-toast';
    const label = document.createElement('span');
    label.textContent = message;
    const btn = document.createElement('button');
    btn.textContent = 'Reload';
    btn.addEventListener('click', () => location.reload());
    bar.append(label, btn);
    host.appendChild(bar);
    requestAnimationFrame(() => bar.classList.add('show'));
  }

  // The service worker precaches the shell, so an already-open tab keeps running
  // the previous app.js/style.css after a deploy until it's reloaded. When a new
  // worker takes control, offer a reload rather than forcing one.
  let workerUpdatePrompted = false;
  function listenForWorkerUpdate() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (!e.data || e.data.type !== 'sw-activated' || workerUpdatePrompted) return;
      workerUpdatePrompted = true;
      showReloadBar('A new version is ready.');
    });
  }

  // "Check for updates" (Settings → Account). Two things can be stale: sw.js
  // itself (a new worker installs → skipWaiting → 'sw-activated' → the toast
  // above), and shell files whose bytes changed without touching sw.js — those
  // otherwise only land on the *second* load via stale-while-revalidate. So also
  // revalidate the cached text assets against the server and swap in any that
  // differ. Images/fonts are skipped: they change rarely and cost the most to diff.
  const updateBtn = document.getElementById('update-check-btn');
  const updateStatus = document.getElementById('update-status');
  const SHELL_DIFFABLE = /\.(js|css|html|webmanifest)$/;

  function sameBytes(a, b) {
    if (a.byteLength !== b.byteLength) return false;
    const x = new Uint8Array(a);
    const y = new Uint8Array(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }

  async function shellCacheName() {
    const names = window.caches ? (await caches.keys()).filter((k) => k.startsWith('nico-shell-')) : [];
    return names.sort().pop() || null;
  }

  // → 'unsupported' | 'offline' | 'updating' | 'update-ready' | 'current'
  async function checkForUpdate() {
    if (!('serviceWorker' in navigator) || !window.caches) return 'unsupported';
    if (!navigator.onLine) return 'offline';
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return 'unsupported';
    await reg.update().catch(() => {});
    // A changed sw.js is now installing; its activation raises the reload toast.
    if (reg.installing || reg.waiting) return 'updating';

    const name = await shellCacheName();
    if (!name) return 'current';
    const cache = await caches.open(name);
    let changed = false;
    for (const req of await cache.keys()) {
      const path = new URL(req.url).pathname;
      if (path === '/' || !SHELL_DIFFABLE.test(path)) continue;
      // `__update` makes sw.js skip its stale-while-revalidate and hit the network.
      const fresh = await fetch(`${req.url}?__update=${Date.now()}`, { cache: 'no-cache' }).catch(() => null);
      const old = await cache.match(req);
      if (!fresh || !fresh.ok || !old) continue;
      const [a, b] = await Promise.all([old.arrayBuffer(), fresh.clone().arrayBuffer()]);
      if (!sameBytes(a, b)) {
        await cache.put(req, fresh);
        changed = true;
      }
    }
    return changed ? 'update-ready' : 'current';
  }

  async function runUpdateCheck() {
    updateBtn.disabled = true;
    updateStatus.textContent = 'Checking for updates…';
    let result;
    try {
      result = await checkForUpdate();
    } catch {
      updateStatus.textContent = "Couldn't check for updates. Try again in a moment.";
      updateBtn.disabled = false;
      return;
    }
    if (result === 'update-ready' || result === 'updating') {
      updateStatus.textContent = 'A new version was found — reload to use it.';
      if (!workerUpdatePrompted) {
        workerUpdatePrompted = true;
        showReloadBar('A new version is ready.');
      }
    } else if (result === 'offline') {
      updateStatus.textContent = "You're offline — connect and try again.";
    } else if (result === 'unsupported') {
      updateStatus.textContent = "This browser can't check in the background. Reload the page to get the latest version.";
    } else {
      const name = await shellCacheName();
      updateStatus.textContent = `You're up to date${name ? ` (${name.replace('nico-shell-', '')})` : ''}.`;
    }
    updateBtn.disabled = false;
  }
  updateBtn.addEventListener('click', runUpdateCheck);

  // --- Themes (model + sanitizer shared with the server: public/themes.js) ---
  // Two layers of style, same shape: the account's *app theme* (a built-in or a
  // user-made one, synced via /api/theme) and each note's own theme
  // (notes.theme, optionally cascading to sub notes in the inferred hierarchy).
  // A note's effective style = app theme ← ancestors that cascade (root first) ←
  // its own, merged field by field. The centered note's style repaints the whole
  // screen; every card is drawn in its own note's style (inline CSS vars on the
  // cell, only when they differ from the screen's).
  const Themes = window.NicoThemes;
  const themeBtn = document.getElementById('theme-btn');
  const themeOverlay = document.getElementById('theme-overlay');
  const themeBody = document.getElementById('theme-body');
  const themeTabs = document.getElementById('theme-tabs');
  const themeMeta = document.querySelector('meta[name="theme-color"]');

  let themePrefs = { active: 'light', custom: [] };
  let themePrefsDirty = false;
  let themeSyncing = false;
  let themeSaveTimer = null;
  let themeParents = {}; // childId → parentId, only fetched while a note cascades
  let themeScreenKey = '';
  let themeScope = 'app';
  const themeParseMemo = new Map();
  const themeUrlMap = new Map(); // upload path → object URL, offline only

  const themePrefsKey = () => `nico-theme-prefs-${currentUser ? currentUser.id : 0}`;

  function loadThemePrefsLocal() {
    try {
      const j = JSON.parse(localStorage.getItem(themePrefsKey()) || 'null');
      if (j && j.prefs) {
        themePrefs = { active: j.prefs.active || 'light', custom: j.prefs.custom || [] };
        themePrefsDirty = Boolean(j.dirty);
      }
    } catch {
      /* storage blocked or corrupt — start from the default theme */
    }
  }

  function saveThemePrefsLocal() {
    try {
      localStorage.setItem(themePrefsKey(), JSON.stringify({ prefs: themePrefs, dirty: themePrefsDirty }));
    } catch {
      /* storage blocked — the server copy still syncs */
    }
  }

  // Local edits win until they've reached the server (dirty); otherwise adopt
  // whatever the server has, which is how a theme chosen on another device lands.
  async function syncThemePrefs() {
    if (!navigator.onLine || !currentUser || themeSyncing) return;
    themeSyncing = true;
    let editedInFlight = false;
    try {
      if (themePrefsDirty) {
        const sent = JSON.stringify(themePrefs);
        await api.saveThemePrefs(themePrefs);
        if (JSON.stringify(themePrefs) === sent) {
          themePrefsDirty = false;
          saveThemePrefsLocal();
        } else {
          editedInFlight = true;
        }
      } else {
        const srv = await api.getThemePrefs();
        if (srv && JSON.stringify(srv) !== JSON.stringify(themePrefs)) {
          themePrefs = srv;
          saveThemePrefsLocal();
          restyleAll();
        }
      }
    } catch {
      /* offline or server error — stays dirty, retried on reconnect */
    } finally {
      themeSyncing = false;
    }
    if (editedInFlight) commitThemePrefs();
  }

  function commitThemePrefs() {
    themePrefsDirty = true;
    saveThemePrefsLocal();
    clearTimeout(themeSaveTimer);
    themeSaveTimer = setTimeout(syncThemePrefs, 600);
  }

  function activeAppStyle() {
    const a = themePrefs.active;
    if (Themes.PRESETS[a]) return Themes.PRESETS[a].style;
    const custom = themePrefs.custom.find((t) => t.id === a);
    return (custom && custom.style) || {};
  }

  function parseNoteTheme(json) {
    if (!json) return null;
    let s = themeParseMemo.get(json);
    if (s === undefined) {
      try {
        s = Themes.sanitizeStyle(JSON.parse(json));
      } catch {
        s = null;
      }
      themeParseMemo.set(json, s);
    }
    return s;
  }

  const themeNoteRow = (id) =>
    allNotesCache.find((n) => n.id === id) || (currentNote && currentNote.id === id ? currentNote : null);

  async function refreshThemeContext() {
    themeParents = allNotesCache.some((n) => n.theme && n.theme_children)
      ? await api.getHierarchyParents()
      : {};
  }

  // Effective style for a note. skipOwn = what it *inherits*, before its own
  // overrides (the theme editor shows those values as the "unset" defaults).
  function styleFor(noteId, { skipOwn = false } = {}) {
    let style = activeAppStyle();
    if (noteId == null) return style;
    const chain = [];
    const seen = new Set([noteId]);
    for (let cur = themeParents[String(noteId)]; cur != null && !seen.has(cur); cur = themeParents[String(cur)]) {
      seen.add(cur);
      chain.push(cur);
    }
    for (const id of chain.reverse()) {
      const n = themeNoteRow(id);
      if (n && n.theme_children) style = Themes.mergeStyles(style, parseNoteTheme(n.theme));
    }
    if (skipOwn) return style;
    const own = themeNoteRow(noteId);
    return Themes.mergeStyles(style, parseNoteTheme(own && own.theme));
  }

  // The nearest ancestor whose theme cascades down to this note, for the modal.
  function themeInheritSource(noteId) {
    const seen = new Set([noteId]);
    for (let cur = themeParents[String(noteId)]; cur != null && !seen.has(cur); cur = themeParents[String(cur)]) {
      seen.add(cur);
      const n = themeNoteRow(cur);
      if (n && n.theme_children && parseNoteTheme(n.theme)) return n;
    }
    return null;
  }

  // Uploaded images are shown straight from the network online; offline they come
  // out of the `assets` store as object URLs (warmThemeImages puts them there).
  const themeUrl = (p) => (navigator.onLine ? p : themeUrlMap.get(p) || null);

  function themeImagePaths() {
    const out = new Set();
    const add = (s) => {
      for (const k of ['bg', 'card']) {
        if (s && s[k] && typeof s[k].img === 'string' && s[k].img.startsWith('/uploads/')) out.add(s[k].img);
      }
    };
    themePrefs.custom.forEach((t) => add(t.style));
    allNotesCache.forEach((n) => add(parseNoteTheme(n.theme)));
    return out;
  }

  async function prepareOfflineThemeImages() {
    if (navigator.onLine || !store) return;
    for (const p of themeImagePaths()) {
      if (themeUrlMap.has(p)) continue;
      const rec = await store.get('assets', p).catch(() => null);
      if (rec && rec.blob) themeUrlMap.set(p, URL.createObjectURL(rec.blob));
    }
  }

  async function warmThemeImages() {
    if (!store || !navigator.onLine) return;
    for (const p of themeImagePaths()) {
      try {
        if (await store.get('assets', p)) continue;
        const blob = await fetch(p).then((r) => (r.ok ? r.blob() : null));
        if (blob) await store.put('assets', { path: p, blob, themeImg: true });
      } catch {
        /* dropped mid-download — next warm cache run retries */
      }
    }
  }

  // Two scopes. The *app theme* styles the chrome (header, bars, dialogs) on
  // <html>. The centered note's resolved style (app ← ancestors ← own) styles only
  // the note surfaces — the grid's cards, the note editor and the page background —
  // as inline vars on those elements, so a note theme never changes the header.
  const themeBgEl = document.querySelector('.theme-bg');
  const themeNoteScopes = [grid, noteOverlay, themeBgEl];

  function applyScreenTheme() {
    const appVars = Themes.cssVars(activeAppStyle(), themeUrl);
    const noteVars = Themes.cssVars(styleFor(currentId), themeUrl);
    const root = document.documentElement;
    Themes.applyVars(root, appVars);
    themeScreenKey = JSON.stringify(noteVars);
    const sameAsApp = themeScreenKey === JSON.stringify(appVars);
    for (const el of themeNoteScopes) {
      if (sameAsApp) for (const k of Object.keys(noteVars)) el.style.removeProperty(k);
      else Themes.applyVars(el, noteVars);
    }
    // The fixed background layer shows whenever the note area's backdrop differs
    // from a plain app-coloured page: an image, or just a different colour.
    root.classList.toggle('has-bg', noteVars['--bg-img'] !== 'none' || noteVars['--bg'] !== appVars['--bg']);
    if (themeMeta) themeMeta.setAttribute('content', appVars['--surface']);
    if (navigator.onLine) {
      try {
        // Boot pre-paints the app-level look only; the note scope lands at first render.
        localStorage.setItem(
          Themes.BOOT_KEY,
          JSON.stringify({ vars: appVars, hasBg: appVars['--bg-img'] !== 'none' })
        );
      } catch {
        /* storage blocked — boot just won't pre-paint */
      }
    }
  }

  // A card inherits the screen's vars unless its own note's style differs.
  function applyCellTheme(cell, noteId) {
    cell._themeNoteId = noteId;
    const vars = Themes.cssVars(styleFor(noteId), themeUrl);
    if (JSON.stringify(vars) === themeScreenKey) {
      for (const k of Object.keys(vars)) cell.style.removeProperty(k);
    } else {
      Themes.applyVars(cell, vars);
    }
    cell.classList.toggle('has-card-img', vars['--card-img'] !== 'none');
  }

  function restyleAll() {
    applyScreenTheme();
    for (const cell of grid.querySelectorAll('.cell')) {
      if (cell._themeNoteId !== undefined) applyCellTheme(cell, cell._themeNoteId);
    }
  }

  // --- Theme modal ---
  const tmk = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  // Copy of `style` with one field set (or removed when value is undefined).
  function withField(style, key, sub, value) {
    const next = JSON.parse(JSON.stringify(style || {}));
    if (sub === null) {
      if (value === undefined) delete next[key];
      else next[key] = value;
    } else {
      next[key] = next[key] || {};
      if (value === undefined) delete next[key][sub];
      else next[key][sub] = value;
      if (!Object.keys(next[key]).length) delete next[key];
    }
    return next;
  }

  // Backgrounds are downsized before upload: a 12 MP photo is wasted on a page
  // background, and this keeps the offline cache small.
  async function downscaleImage(file, maxSide) {
    let bmp;
    try {
      bmp = await createImageBitmap(file);
    } catch {
      throw new Error("Couldn't read that image.");
    }
    const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * s));
    c.height = Math.max(1, Math.round(bmp.height * s));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    return new Promise((res, rej) =>
      c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't process that image."))), 'image/jpeg', 0.82)
    );
  }

  // The shared style editor. `style` is the sparse own style being edited, `base`
  // what it inherits from (defaults for the app theme). onChange gets each new
  // style; continuous inputs don't redraw (that would drop a slider mid-drag),
  // discrete ones do.
  function buildStyleEditor(style, base, onChange) {
    const wrap = tmk('div', 'theme-editor');
    let cur = style || {};
    const update = (next, redraw) => {
      cur = next;
      onChange(cur);
      if (redraw) draw();
    };

    const merged = () => Themes.mergeStyles(base, cur);

    function draw() {
      wrap.textContent = '';

      // Colours — grouped (Core / Tabs & status) so a 12-colour palette still
      // reads as two short lists rather than one long one.
      const eff = Themes.effectiveColors(merged());
      for (const [groupLabel, keys] of Themes.COLOR_GROUPS) {
        const colors = tmk('div', 'theme-section');
        colors.appendChild(tmk('h3', null, groupLabel === 'Core' ? 'Colours' : groupLabel));
        for (const k of keys) {
          const set = cur.colors && cur.colors[k];
          const row = tmk('div', 'theme-row' + (set ? '' : ' unset'));
          row.appendChild(tmk('label', null, Themes.COLOR_LABELS[k]));
          const input = tmk('input');
          input.type = 'color';
          input.value = set || eff[k];
          const reset = tmk('button', 'theme-mini-btn', 'Reset');
          reset.type = 'button';
          reset.classList.toggle('hidden', !set);
          input.addEventListener('input', () => {
            row.classList.remove('unset');
            reset.classList.remove('hidden');
            update(withField(cur, 'colors', k, input.value), false);
          });
          reset.addEventListener('click', () => update(withField(cur, 'colors', k, undefined), true));
          row.append(input, reset);
          colors.appendChild(row);
        }
        wrap.appendChild(colors);
      }

      // Font
      const font = tmk('div', 'theme-section');
      font.appendChild(tmk('h3', null, 'Font'));
      const frow = tmk('div', 'theme-row');
      const sel = tmk('select');
      sel.appendChild(new Option('Default', ''));
      for (const [key, f] of Object.entries(Themes.FONTS)) sel.appendChild(new Option(f.label, key));
      sel.value = cur.font || '';
      const sample = tmk('p', 'theme-font-sample', 'The quick brown fox jumps over the lazy dog — 0123456789');
      const paintSample = () => {
        sample.style.fontFamily = (Themes.FONTS[merged().font] || Themes.FONTS.system).stack;
      };
      paintSample();
      sel.addEventListener('change', () => {
        update(withField(cur, 'font', null, sel.value || undefined), false);
        paintSample();
      });
      frow.appendChild(sel);
      font.append(frow, sample);
      wrap.appendChild(font);

      wrap.appendChild(buildImageSection('bg', 'Page background'));
      wrap.appendChild(buildImageSection('card', 'Note card background'));

      // Card effects: transparency (stored as opacity %, shown as transparency %
      // since 0 = solid is the natural starting point) and glow.
      const glow = tmk('div', 'theme-section');
      glow.appendChild(tmk('h3', null, 'Note cards'));
      const trow = tmk('div', 'theme-row');
      const tr = tmk('input');
      tr.type = 'range';
      tr.min = '0';
      tr.max = '100';
      const alpha = cur.cardAlpha != null ? cur.cardAlpha : merged().cardAlpha != null ? merged().cardAlpha : 100;
      tr.value = String(100 - alpha);
      const tv = tmk('span', 'theme-val', `${tr.value}%`);
      tr.addEventListener('input', () => {
        tv.textContent = `${tr.value}%`;
        update(withField(cur, 'cardAlpha', null, 100 - Number(tr.value)), false);
      });
      trow.append(tmk('label', null, 'Transparency'), tr, tv);
      glow.appendChild(trow);
      const frow2 = tmk('div', 'theme-row');
      const fx = tmk('select');
      for (const [v, label] of [
        ['auto', 'Auto — only over busy backgrounds'],
        ['shadow', 'Always: shadow'],
        ['outline', 'Always: outline'],
        ['off', 'Off'],
      ]) {
        fx.appendChild(new Option(label, v));
      }
      fx.value = cur.textFx || merged().textFx || 'auto';
      fx.addEventListener('change', () => update(withField(cur, 'textFx', null, fx.value), false));
      frow2.append(tmk('label', null, 'Text contrast'), fx);
      glow.appendChild(frow2);
      const grow = tmk('div', 'theme-row');
      const gr = tmk('input');
      gr.type = 'range';
      gr.min = '0';
      gr.max = '100';
      gr.value = String(cur.glow != null ? cur.glow : merged().glow || 0);
      const gv = tmk('span', 'theme-val', `${gr.value}%`);
      gr.addEventListener('input', () => {
        gv.textContent = `${gr.value}%`;
        update(withField(cur, 'glow', null, Number(gr.value)), false);
      });
      grow.append(tmk('label', null, 'Card glow'), gr, gv);
      glow.appendChild(grow);
      wrap.appendChild(glow);
    }

    function buildImageSection(kind, title) {
      const sec = tmk('div', 'theme-section');
      sec.appendChild(tmk('h3', null, title));
      const im = cur[kind] || {};
      const gal = tmk('div', 'theme-imgs');
      const thumbs = [];
      const pick = (img) => update(withField(cur, kind, 'img', img), true);

      const mkThumb = (label, img, css) => {
        const b = tmk('button', 'theme-img' + (im.img === img ? ' active' : ''), css ? '' : label);
        b.type = 'button';
        b.title = label;
        if (css) {
          b.style.backgroundImage = css;
          thumbs.push(b);
        }
        b.addEventListener('click', () => pick(img));
        return b;
      };
      gal.appendChild(mkThumb('Default', undefined, null));
      gal.appendChild(mkThumb('None', 'none', null));
      for (const [key, p] of Object.entries(Themes.IMAGES)) {
        gal.appendChild(mkThumb(p.label, `preset:${key}`, p.css));
      }
      if (im.img && im.img.startsWith('/uploads/')) {
        const url = themeUrl(im.img);
        gal.appendChild(mkThumb('Your image', im.img, url ? `url("${url}")` : null));
      }
      const up = tmk('button', 'theme-img', '＋ Upload');
      up.type = 'button';
      const file = tmk('input');
      file.type = 'file';
      file.accept = 'image/jpeg,image/png,image/webp,image/gif';
      file.className = 'hidden';
      const msg = tmk('p', 'theme-msg');
      up.addEventListener('click', () => file.click());
      file.addEventListener('change', async () => {
        const f = file.files[0];
        file.value = '';
        if (!f) return;
        msg.textContent = 'Uploading…';
        try {
          if (!navigator.onLine) throw new Error('Uploading an image needs a connection.');
          const blob = await downscaleImage(f, 1600);
          const { path } = await api.uploadThemeImage(blob);
          if (store) store.put('assets', { path, blob, themeImg: true }).catch(() => {});
          pick(path);
        } catch (e) {
          msg.textContent = e.message || 'Upload failed.';
        }
      });
      gal.appendChild(up);
      sec.append(gal, file, msg);

      // Hue + dim only make sense with an image in play (own or inherited).
      const eff = merged()[kind] || {};
      if (eff.img && eff.img !== 'none') {
        const hrow = tmk('div', 'theme-row');
        const hue = tmk('input', 'theme-hue-range');
        hue.type = 'range';
        hue.min = '0';
        hue.max = '359';
        hue.value = String(im.hue != null ? im.hue : eff.hue || 0);
        const hv = tmk('span', 'theme-val', `${hue.value}°`);
        const paintThumbs = () => thumbs.forEach((t) => (t.style.filter = `hue-rotate(${hue.value}deg)`));
        paintThumbs();
        hue.addEventListener('input', () => {
          hv.textContent = `${hue.value}°`;
          paintThumbs();
          update(withField(cur, kind, 'hue', Number(hue.value)), false);
        });
        hrow.append(tmk('label', null, 'Colour shift'), hue, hv);

        const drow = tmk('div', 'theme-row');
        const dim = tmk('input');
        dim.type = 'range';
        dim.min = '0';
        dim.max = '90';
        dim.value = String(im.dim != null ? im.dim : eff.dim || 0);
        const dv = tmk('span', 'theme-val', `${dim.value}%`);
        dim.addEventListener('input', () => {
          dv.textContent = `${dim.value}%`;
          update(withField(cur, kind, 'dim', Number(dim.value)), false);
        });
        drow.append(tmk('label', null, 'Fade to colour'), dim, dv);
        sec.append(hrow, drow);
      }
      return sec;
    }

    draw();
    return wrap;
  }

  function themeSwatch(label, style, active, onPick, onDelete) {
    const b = tmk('button', 'theme-swatch' + (active ? ' active' : ''));
    b.type = 'button';
    const c = Themes.effectiveColors(style);
    const vars = Themes.cssVars(style, themeUrl);
    const prev = tmk('div', 'theme-swatch-prev');
    prev.style.backgroundColor = c.bg;
    if (vars['--bg-img'] !== 'none') prev.style.backgroundImage = vars['--bg-img'];
    for (const col of [c.surface, c.text, c.accent]) {
      const d = tmk('span', 'theme-swatch-dot');
      d.style.background = col;
      prev.appendChild(d);
    }
    b.append(prev, tmk('span', 'theme-swatch-label', label));
    b.addEventListener('click', onPick);
    if (onDelete) {
      const x = tmk('span', 'theme-swatch-del', '✕');
      x.title = 'Delete theme';
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        onDelete();
      });
      b.appendChild(x);
    }
    return b;
  }

  function newThemeId() {
    return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  }

  function buildAppPanel() {
    const frag = document.createDocumentFragment();

    const gallerySec = tmk('div', 'theme-section');
    const nameSec = tmk('div', 'theme-section');
    const editorSec = tmk('div', 'theme-section');

    const drawGallery = () => {
      gallerySec.textContent = '';
      gallerySec.appendChild(tmk('h3', null, 'Theme'));
      const gal = tmk('div', 'theme-gallery');
      const choose = (id) => {
        themePrefs.active = id;
        commitThemePrefs();
        restyleAll();
        renderThemeModal();
      };
      for (const [id, p] of Object.entries(Themes.PRESETS)) {
        gal.appendChild(themeSwatch(p.label, p.style, themePrefs.active === id, () => choose(id)));
      }
      for (const t of themePrefs.custom) {
        gal.appendChild(
          themeSwatch(t.name, t.style, themePrefs.active === t.id, () => choose(t.id), () => {
            if (!confirm(`Delete the theme “${t.name}”?`)) return;
            themePrefs.custom = themePrefs.custom.filter((x) => x.id !== t.id);
            if (themePrefs.active === t.id) themePrefs.active = 'light';
            commitThemePrefs();
            restyleAll();
            renderThemeModal();
          })
        );
      }
      gallerySec.appendChild(gal);
    };

    const drawName = () => {
      nameSec.textContent = '';
      const custom = themePrefs.custom.find((t) => t.id === themePrefs.active);
      if (custom) {
        const row = tmk('div', 'theme-row');
        const input = tmk('input');
        input.type = 'text';
        input.maxLength = 40;
        input.value = custom.name;
        input.addEventListener('input', () => {
          custom.name = input.value.trim() || 'My theme';
          commitThemePrefs();
        });
        input.addEventListener('change', drawGallery);
        row.append(tmk('label', null, 'Theme name'), input);
        nameSec.appendChild(row);
      } else {
        nameSec.appendChild(
          tmk('p', 'theme-info', 'Built-in theme. Change anything below to save it as your own theme.')
        );
      }
    };

    const onChange = (next) => {
      let t = themePrefs.custom.find((c) => c.id === themePrefs.active);
      if (!t) {
        // Editing a built-in forks it. The editor already holds the built-in's
        // values, so the copy starts identical.
        t = { id: newThemeId(), name: `My ${Themes.PRESETS[themePrefs.active].label}`, style: {} };
        themePrefs.custom.push(t);
        themePrefs.active = t.id;
        drawName();
      }
      t.style = next;
      drawGallery(); // keeps the swatch preview in step with the edit
      commitThemePrefs();
      restyleAll();
    };

    drawGallery();
    drawName();
    editorSec.appendChild(buildStyleEditor(activeAppStyle(), {}, onChange));
    frag.append(gallerySec, nameSec, editorSec);
    return frag;
  }

  const noteThemeTimers = new Map();
  function saveNoteThemeSoon(id, style, children) {
    const fields = {
      theme: style && Object.keys(style).length ? JSON.stringify(style) : null,
    };
    fields.theme_children = fields.theme && children ? 1 : 0;
    patchListCache(id, fields); // live preview reads the list cache
    if (fields.theme_children || children) {
      refreshThemeContext().then(restyleAll);
    } else {
      restyleAll();
    }
    clearTimeout(noteThemeTimers.get(id));
    noteThemeTimers.set(
      id,
      setTimeout(() => {
        noteThemeTimers.delete(id);
        api.setNoteTheme(id, style, children).catch(() => toast("Couldn't save the note theme."));
      }, 500)
    );
  }

  function buildNotePanel() {
    const frag = document.createDocumentFragment();
    const id = currentId;
    const row = id != null ? themeNoteRow(id) : null;
    if (!row) {
      frag.appendChild(tmk('p', 'theme-info', 'Open a note first — its theme is set here.'));
      return frag;
    }
    let own = parseNoteTheme(row.theme) || {};
    let children = Boolean(row.theme_children);

    const head = tmk('div', 'theme-section');
    head.appendChild(tmk('h3', null, `Theme for “${row.title}”`));
    const src = themeInheritSource(id);
    head.appendChild(
      tmk(
        'p',
        'theme-info',
        (src
          ? `Inherits from “${src.title}” (its theme applies to sub notes), then your app theme. `
          : 'Starts from your app theme. ') +
          'Anything you set here overrides it for this note; anything you leave alone is inherited. It restyles this note’s cards, the editor and the page background — the header and bars keep your app theme.'
      )
    );

    const startSec = tmk('div', 'theme-row');
    const start = tmk('select');
    start.appendChild(new Option('Start from a theme…', ''));
    for (const [pid, p] of Object.entries(Themes.PRESETS)) start.appendChild(new Option(p.label, pid));
    for (const t of themePrefs.custom) start.appendChild(new Option(t.name, t.id));
    start.addEventListener('change', () => {
      if (!start.value) return;
      const p = Themes.PRESETS[start.value] || themePrefs.custom.find((t) => t.id === start.value);
      own = JSON.parse(JSON.stringify((p && p.style) || {}));
      saveNoteThemeSoon(id, own, children);
      renderThemeModal();
    });
    startSec.append(tmk('label', null, 'Copy a theme'), start);
    head.appendChild(startSec);

    const cascade = tmk('label', 'theme-check');
    const box = tmk('input');
    box.type = 'checkbox';
    box.checked = children;
    box.addEventListener('change', () => {
      children = box.checked;
      saveNoteThemeSoon(id, own, children);
    });
    cascade.append(box, document.createTextNode('Also apply to sub notes (they can override any part)'));
    head.appendChild(cascade);

    const editorSec = tmk('div', 'theme-section');
    editorSec.appendChild(
      buildStyleEditor(own, styleFor(id, { skipOwn: true }), (next) => {
        own = next;
        saveNoteThemeSoon(id, own, children);
      })
    );

    const clear = tmk('button', 'secondary danger', 'Clear this note’s theme');
    clear.type = 'button';
    clear.addEventListener('click', () => {
      own = {};
      children = false;
      saveNoteThemeSoon(id, own, children);
      renderThemeModal();
    });

    frag.append(head, editorSec, clear);
    return frag;
  }

  function renderThemeModal() {
    for (const b of themeTabs.querySelectorAll('.theme-tab')) {
      b.classList.toggle('active', b.dataset.scope === themeScope);
    }
    themeBody.textContent = '';
    themeBody.appendChild(themeScope === 'app' ? buildAppPanel() : buildNotePanel());
  }

  async function openThemeModal() {
    await refreshThemeContext();
    themeOverlay.classList.remove('hidden');
    renderThemeModal();
  }
  const closeThemeModal = () => themeOverlay.classList.add('hidden');

  themeBtn.addEventListener('click', openThemeModal);
  document.getElementById('theme-close-btn').addEventListener('click', closeThemeModal);
  themeOverlay.addEventListener('click', (e) => {
    if (e.target === themeOverlay) closeThemeModal();
  });
  themeTabs.addEventListener('click', (e) => {
    const b = e.target.closest('.theme-tab');
    if (!b) return;
    themeScope = b.dataset.scope;
    renderThemeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !themeOverlay.classList.contains('hidden')) closeThemeModal();
  });

  async function init() {
    net.render();
    listenForWorkerUpdate();
    const sess = await api.getSession();
    if (!sess.user) {
      showLogin();
      return;
    }
    currentUser = sess.user;
    widgetToken = sess.widgetToken || null;
    accountBtn.title = `Signed in as ${currentUser.email}`;
    loadThemePrefsLocal();
    applyScreenTheme();
    syncThemePrefs(); // background; the cached prefs already painted the first frame
    // A cold load landing on `#123` (a widget tap, the agenda, a shared or
    // magic-link URL — anything that opens a fresh tab/instance rather than
    // reusing an already-running one) only ever fires 'hashchange' on a
    // *later* change, never for the hash already present at load — so without
    // the check below, a fresh instance always showed whatever tab the server
    // last had active instead of the note that was actually tapped. Captured
    // here, before refreshFromTabs below has a chance to overwrite it first
    // (it ends by calling setHash() for whatever tab it restores).
    const deepLinkHashId = hashNoteId();
    try {
      await loadIdmap();
      await loadRidmap();
      await refreshPending();
      await reconcileDirty();
      allNotesCache = await api.listNotes();
      await syncLinks();
      const tabsList = await api.listTabs();
      await refreshFromTabs(tabsList);
      if (deepLinkHashId && deepLinkHashId !== currentId) await goTo(deepLinkHashId, 'hash');
      await checkAlarms();
      warmCache(); // background; never blocks first render
    } catch (err) {
      // Any unhandled throw in this chain (most likely an offline edge case)
      // used to leave the page stuck on the bare shell forever, nothing ever
      // rendered and no error surfaced. Log it and hand the user a way out —
      // the recurring timers below still get scheduled, so a retriable failure
      // (network) can also self-heal without a reload.
      console.error('init: failed partway through boot', err);
      showReloadBar("Couldn't finish loading — reload to try again.");
    }
    ensurePushSubscription();
    flushOutbox();
    setInterval(() => checkAlarms(), 30000);
    setInterval(() => flushOutbox(), 30000);
    // Re-check the moment the app is foregrounded again — a backgrounded PWA's
    // timers are throttled, so an alarm that came due while away rings now.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        checkAlarms();
        flushOutbox();
      }
    });
    handleDeepLink();
  }

  // Deep links into a fresh load:
  //   /?d=agenda | /?d=insights  — from a digest notification / its web page
  //   /?compose=1                — the manifest "New note" shortcut / widget ＋
  //   a `nico_share` cookie      — text handed over by POST /share while logged
  //                                out (see server/routes/share.js)
  // Consume whatever we act on so a reload is clean.
  function handleDeepLink() {
    const params = new URLSearchParams(location.search);
    const d = params.get('d');
    const handledD = d === 'agenda' || d === 'insights';
    const wantsCompose = params.get('compose') === '1';
    const isFresh = params.get('fresh') === '1';
    const wantsBegin = params.get('ob') === 'begin';
    const shared = consumePendingShare();

    if (!handledD && !wantsCompose && !isFresh && !wantsBegin && !shared) return;

    const url = new URL(location.href);
    if (handledD) url.searchParams.delete('d');
    if (wantsCompose) url.searchParams.delete('compose');
    if (isFresh) url.searchParams.delete('fresh');
    if (wantsBegin) url.searchParams.delete('ob');
    history.replaceState(null, '', url.pathname + url.search + url.hash);

    if (d === 'agenda') openAgenda();
    else if (d === 'insights') openInsights();

    if (shared) createSharedNote(shared);
    else if (wantsCompose) openPicker({ standalone: true });
    else if (isFresh) openNoteFullscreen('preview');
    else if (wantsBegin) {
      // A link clicked inside a note's own content (Skip-the-intro or the
      // tour's closing state) — see server/onboarding.js. Reload rather than
      // hand-patch every client cache, same call the restore flow makes
      // after replacing all account data wholesale.
      api.onboardingBegin().finally(() => location.reload());
    }
  }

  // Read + clear the `nico_share` cookie left by a logged-out POST /share.
  function consumePendingShare() {
    const m = document.cookie.match(/(?:^|;\s*)nico_share=([^;]*)/);
    if (!m) return null;
    document.cookie = 'nico_share=; Max-Age=0; path=/';
    try {
      const data = JSON.parse(decodeURIComponent(m[1]));
      if (data && (data.title || data.content)) return data;
    } catch {
      /* malformed stash — ignore */
    }
    return null;
  }

  async function createSharedNote({ title, content }) {
    try {
      const note = await api.createNote({
        title: (title || 'Shared note').slice(0, 200),
        content: content || '',
      });
      allNotesCache = await api.listNotes();
      renderPinbar();
      await refreshFromTabs(await api.openTab(note.id));
      toast('Saved shared note.');
    } catch {
      toast('Could not save the shared note.');
    }
  }

  function renderEmptyState() {
    grid.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'empty-state';
    div.innerHTML = `<button id="first-note-btn">Create your first note</button>`;
    grid.appendChild(div);
    document.getElementById('first-note-btn').addEventListener('click', () => openPicker());
  }

  // An attachment note created offline stores its file in the `blobs` store and
  // carries a "blob-pending:<key>" path until it uploads. Resolve it to a URL
  // usable as-is (a same-origin path, or an object URL for the in-memory blob).
  // Offline (and not blob-pending), skip the network and go straight to
  // whatever warmAttachmentCache() has already downloaded into `assets` —
  // null if this file was never opened before and fell outside the cache
  // budget, which callers turn into a "not available offline" notice.
  function resolveMediaUrl(path) {
    const m = /^blob-pending:(.+)$/.exec(path || '');
    if (m) {
      if (!store) return Promise.resolve(null);
      return store
        .get('blobs', m[1])
        .then((rec) => (rec && rec.blob ? URL.createObjectURL(rec.blob) : null))
        .catch(() => null);
    }
    if (!path) return Promise.resolve(null);
    if (navigator.onLine) return Promise.resolve(path);
    if (!store) return Promise.resolve(null);
    return store
      .get('assets', path)
      .then((rec) => (rec && rec.blob ? URL.createObjectURL(rec.blob) : null))
      .catch(() => null);
  }

  function setMediaSrc(el, path, onMissing) {
    resolveMediaUrl(path).then((url) => {
      if (url) el.src = url;
      else if (onMissing) onMissing();
    });
  }

  // Small muted "can't show this offline" stand-in for a missing image/audio/
  // download — same treatment everywhere a resolveMediaUrl() comes back null.
  function mediaUnavailableNotice(label) {
    const span = document.createElement('span');
    span.className = 'center-attachment-unavailable';
    span.textContent = label || '📵 Not available offline';
    return span;
  }

  // Suggested filename for a downloaded attachment: the note's title, sanitized,
  // with the uploaded file's real extension appended (from the stored path —
  // never the client-supplied name, see upload-config.js) unless it's already there.
  function attachmentFilename(note) {
    const ext = (/\.[A-Za-z0-9]{1,8}$/.exec(note.attachment_path || '') || [''])[0];
    const base = (note.title || 'attachment').replace(/[^\w.\- ]+/g, '_').trim() || 'attachment';
    return ext && !base.toLowerCase().endsWith(ext.toLowerCase()) ? base + ext : base;
  }

  // A small "⬇ Download" link, forcing save-as instead of navigating — resolves
  // blob-pending (not-yet-synced offline) attachments the same as the preview.
  // `label` overrides the default "⬇ Download" text (the file type shows its name).
  function buildDownloadLink(note, label) {
    const link = document.createElement('a');
    link.className = 'center-attachment-file center-attachment-download';
    link.textContent = label || '⬇ Download';
    link.download = attachmentFilename(note);
    link.href = '#';
    resolveMediaUrl(note.attachment_path).then((url) => {
      if (url) {
        link.href = url;
        return;
      }
      link.removeAttribute('href');
      link.removeAttribute('download');
      link.classList.add('center-attachment-unavailable');
      link.textContent = `${label || '⬇ Download'} — not available offline`;
      link.addEventListener('click', (e) => e.preventDefault());
    });
    return link;
  }

  // Renders the type-specific payload of an attachment note (image/audio/contact/app).
  // `compact` (the grid center cell) caps it at one button — tap-to-view/play
  // stays, but "extra" actions like Download drop out; the fullscreen editor
  // passes nothing and gets the full set.
  function buildAttachmentPreview(note, { compact = false } = {}) {
    if (note.type === 'image' && note.attachment_path) {
      // Wrap the image in a link (`display: contents` in CSS, so the <img>
      // stays the actual flex item — see style.css) so a click opens the
      // full-size original in the in-app lightbox (not `target="_blank"`,
      // which in a standalone/installed PWA can open a bare window with no
      // way back — see openImageLightbox). The href still resolves, so
      // middle-click / long-press / "open in new tab" keep working normally.
      const frag = document.createDocumentFragment();
      const viewLink = document.createElement('a');
      viewLink.className = 'center-attachment-image-link';
      viewLink.title = 'Open full size';
      viewLink.href = '#';
      const img = document.createElement('img');
      img.className = 'center-attachment-image';
      img.alt = note.title;
      viewLink.appendChild(img);
      frag.appendChild(viewLink);
      let resolvedUrl = null;
      resolveMediaUrl(note.attachment_path).then((url) => {
        if (url) {
          img.src = url;
          viewLink.href = url;
          resolvedUrl = url;
        } else {
          viewLink.replaceWith(mediaUnavailableNotice('🖼 Not available offline'));
        }
      });
      viewLink.addEventListener('click', (e) => {
        if (!resolvedUrl) return;
        e.preventDefault();
        openImageLightbox(resolvedUrl, note.title);
      });
      if (!compact) frag.appendChild(buildDownloadLink(note));
      return frag;
    }
    if (note.type === 'audio' && note.attachment_path) {
      const frag = document.createDocumentFragment();
      const audio = document.createElement('audio');
      audio.className = 'center-attachment-audio';
      audio.controls = true;
      setMediaSrc(audio, note.attachment_path, () =>
        audio.replaceWith(mediaUnavailableNotice('🔊 Not available offline'))
      );
      frag.appendChild(audio);
      if (!compact) frag.appendChild(buildDownloadLink(note));
      return frag;
    }
    if (note.type === 'file' && note.attachment_path) {
      return buildDownloadLink(note, `📎 ${note.title || 'Download file'}`);
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
      // Compact (grid) view: the call button above already covers the one
      // thing worth a tap at a glance — email and vcard-import are fullscreen-only.
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

  // Scrollable list of every note linked to the current one, each row a
  // click-to-open title plus an ✕ to sever that connection. Only shown in the
  // fullscreen view, and only once the grid can no longer surface every link
  // (see LINK_LIST_THRESHOLD).
  function buildLinksPanel() {
    const panel = document.createElement('div');
    panel.className = 'center-links';

    const heading = document.createElement('div');
    heading.className = 'center-links-heading';
    heading.textContent = `Links (${allLinks.length})`;
    panel.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'center-links-list';

    allLinks.forEach((link) => {
      const row = document.createElement('div');
      row.className = 'center-links-row' + (link.status === 'done' ? ' dimmed' : '');

      const name = document.createElement('button');
      name.className = 'center-links-name';
      const icon = TYPE_ICON[link.type];
      name.textContent = icon ? `${icon} ${link.title}` : link.title;
      name.title = link.title;
      name.addEventListener('click', () => {
        closeNoteFullscreen();
        goTo(link.id, 'link-list');
      });

      const x = document.createElement('button');
      x.className = 'center-links-x';
      x.textContent = '✕';
      x.title = 'Remove connection';
      x.addEventListener('click', async () => {
        await api.unlink(currentId, link.id);
        await loadNeighbors(currentId);
        await refreshColorData();
        await render();
        renderNoteFullscreen();
      });

      row.appendChild(name);
      row.appendChild(x);
      list.appendChild(row);
    });

    panel.appendChild(list);
    return panel;
  }

  // Builds the editable UI for the fullscreen note view — attachment preview,
  // title + content with autosave, the meta line, and the pin / 🗑 delete / ✅
  // done footer. (The grid center cell renders a read-only version, not this.)
  // `onRerender` runs after a pin/done toggle; `afterDelete` after a soft-delete.
  function buildNoteEditor({ onRerender, afterDelete, startPreview }) {
    const frag = document.createDocumentFragment();

    const preview = buildAttachmentPreview(currentNote);
    if (preview) frag.appendChild(preview);

    const title = document.createElement('input');
    title.className = 'center-title';
    title.value = currentNote.title;
    title.placeholder = 'Title';

    const status = document.createElement('span');
    status.className = 'save-status';
    status.textContent = '';

    // Offline and this note's full row was never cached (never opened before,
    // or created on another device since this one last synced): `content` is
    // simply absent, not empty. Editing blind would autosave that absence
    // over the real text once back online, so the title and text area go
    // read-only instead of showing a blank/garbled editor — pin/status/delete
    // below stay live since none of them touch content.
    const contentCached = currentNote.content != null;
    title.readOnly = !contentCached;

    const content = document.createElement('textarea');
    content.className = 'center-content' + (contentCached ? '' : ' offline-unavailable');
    content.value = contentCached
      ? currentNote.content
      : 'Not available offline — open this note once online to load and edit it.';
    content.placeholder = 'Write here…';
    content.readOnly = !contentCached;

    function scheduleSave() {
      status.textContent = 'Saving…';
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        const updated = await api.updateNote(currentId, {
          title: title.value,
          content: content.value,
        });
        currentNote = updated;
        status.textContent = '';
        toast('Saved');
        allNotesCache = await api.listNotes();
        renderPinbar();

        const tabEntry = tabs.find((t) => t.id === activeTabId);
        if (tabEntry) {
          tabEntry.title = updated.title;
          renderTabbar();
        }
      }, 500);
    }

    // Everything below wires up actual editing — skipped entirely when the
    // text isn't cached, so there's no live listener that could autosave the
    // placeholder over real content once back online.
    if (contentCached) {
      title.addEventListener('input', scheduleSave);
      content.addEventListener('input', scheduleSave);

      attachWikiAutocomplete(content, {
        getCurrentId: () => currentId,
        onLinked: async () => {
          await loadNeighbors(currentId);
          await refreshColorData();
        },
      });

      // Inline images: paste or drop an image into the editor → upload it (no
      // graph node) and drop a `![](…)` at the caret. A placeholder marks the
      // spot while the upload is in flight.
      async function insertInlineImage(file) {
        if (!file || !file.type.startsWith('image/')) return;
        const tag = `![](uploading…#${Date.now().toString(36)})`;
        const pos = content.selectionStart;
        content.value = content.value.slice(0, pos) + tag + content.value.slice(content.selectionEnd);
        content.dispatchEvent(new Event('input'));
        try {
          const fd = new FormData();
          fd.set('inline', '1');
          fd.set('file', file, file.name || 'pasted.png');
          const res = await fetch(`/api/notes/${currentId}/attachments`, { method: 'POST', body: fd });
          const data = res.ok ? await res.json() : null;
          if (!data || !data.path) throw new Error('upload failed');
          content.value = content.value.replace(tag, `![](${data.path})`);
        } catch (e) {
          content.value = content.value.replace(tag, '');
          toast('Image upload failed.');
        }
        content.dispatchEvent(new Event('input'));
      }

      content.addEventListener('paste', (e) => {
        const item = [...(e.clipboardData?.items || [])].find(
          (it) => it.kind === 'file' && it.type.startsWith('image/')
        );
        if (!item) return;
        e.preventDefault();
        insertInlineImage(item.getAsFile());
      });
      content.addEventListener('dragover', (e) => {
        if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault();
      });
      content.addEventListener('drop', (e) => {
        const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/'));
        if (!file) return;
        e.preventDefault();
        insertInlineImage(file);
      });
    }

    // Markdown preview toggle. Checkboxes stay interactive in preview mode.
    const previewBtn = document.createElement('button');
    previewBtn.type = 'button';
    previewBtn.className = 'md-preview-toggle secondary';
    previewBtn.textContent = '👁 Preview';

    const previewDiv = document.createElement('div');
    previewDiv.className = 'center-content markdown-body preview';
    previewDiv.hidden = true;

    let previewing = false;
    const paintPreview = () =>
      renderMarkdownInto(previewDiv, content.value, {
        selfId: currentId,
        onCreateWiki: createLinkedNote,
        onToggleTask: (idx) => {
          content.value = toggleTaskInSource(content.value, idx);
          paintPreview();
          scheduleSave();
        },
      });
    previewBtn.addEventListener('click', () => {
      previewing = !previewing;
      previewActive = previewing;
      if (previewing) paintPreview();
      previewDiv.hidden = !previewing;
      content.hidden = previewing;
      previewBtn.textContent = previewing ? '✏️ Edit' : '👁 Preview';
    });
    if (startPreview) {
      previewing = true;
      paintPreview();
      previewDiv.hidden = false;
      content.hidden = true;
      previewBtn.textContent = '✏️ Edit';
    }

    frag.appendChild(title);
    frag.appendChild(previewBtn);
    frag.appendChild(content);
    frag.appendChild(previewDiv);

    if (linkCount > LINK_LIST_THRESHOLD) frag.appendChild(buildLinksPanel());

    // Center-cell status button — notes.status is one of four states: active
    // (no marker/"Normal") → waiting (blocked on something else, a GTD
    // "waiting for" — link it to whoever/whatever like any other note) → todo
    // (an open thing to do) → done. 'waiting' and 'todo' both surface in the
    // in-app agenda; only 'todo' (not 'waiting' — it isn't actionable yet) is
    // pushed/emailed by the digest. Only 'done' dims. A click opens a list of
    // all four (openActionMenu, same as the ➕ button) rather than stepping
    // through them one at a time.
    const STATUS_ORDER = ['active', 'waiting', 'todo', 'done'];
    const statusFace = {
      active: { icon: '○', label: 'Normal', cls: '' },
      waiting: { icon: '⏳', label: 'Waiting', cls: ' waiting' },
      todo: { icon: '◑', label: 'To-do', cls: ' todo' },
      done: { icon: '✅', label: 'Done', cls: ' active' },
    };
    const curStatus = statusFace[currentNote.status] ? currentNote.status : 'active';

    const footer = document.createElement('div');
    footer.className = 'center-footer';

    const actions = document.createElement('div');
    actions.className = 'footer-actions';

    const pinBtn = document.createElement('button');
    pinBtn.className = 'pin-btn' + (currentNote.pinned ? ' active' : '');
    pinBtn.textContent = '📌';
    pinBtn.title = currentNote.pinned ? 'Unpin note' : 'Pin note';
    pinBtn.setAttribute('aria-pressed', String(Boolean(currentNote.pinned)));

    const doneBtn = document.createElement('button');
    doneBtn.className = 'done-btn' + statusFace[curStatus].cls;
    doneBtn.textContent = statusFace[curStatus].icon;
    doneBtn.title = `Status: ${statusFace[curStatus].label} — tap to change`;
    doneBtn.setAttribute('aria-pressed', String(curStatus === 'done'));

    const alarmBtn = document.createElement('button');
    const hasAlarm = alarms.some((a) => a.noteId === currentId);
    alarmBtn.className = 'alarm-btn' + (hasAlarm ? ' active' : '');
    alarmBtn.textContent = '⏰';
    alarmBtn.title = hasAlarm ? 'Edit alarm' : 'Set alarm';
    alarmBtn.addEventListener('click', () => openAlarmEditor(currentNote));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '🗑️';
    deleteBtn.disabled = Boolean(currentNote.pinned);
    deleteBtn.title = currentNote.pinned ? 'Unpin before deleting' : 'Delete note';

    const addBtn = document.createElement('button');
    addBtn.className = 'add-link-btn';
    addBtn.textContent = '➕';
    addBtn.title = 'Create, attach, or connect';
    addBtn.addEventListener('click', () =>
      openActionMenu(addBtn, [
        { label: '📝 Create a note', onClick: () => openPicker() },
        { label: '📎 Add / remove attachment', onClick: () => openPicker({ mode: 'attach' }) },
        { label: '🔗 Connect to note', onClick: () => openLinkModal() },
      ])
    );

    // GTD context tags: no stored field — a tag is just an `@word` in the
    // note's own text (see server/agenda.js-style content scanning), so
    // there's nothing to keep in sync and the vocabulary is whatever you've
    // ever typed. This button is a convenience for reusing one instead of
    // typing it from scratch (and a nudge against spelling drift); typing
    // `@anything` directly works exactly the same with no button at all.
    const tagBtn = document.createElement('button');
    tagBtn.className = 'tag-btn';
    tagBtn.textContent = '🏷️';
    tagBtn.title = 'Add a context tag (e.g. @phone)';
    tagBtn.disabled = !contentCached;

    function insertTag(tag) {
      const pos = content.selectionStart;
      const before = content.value.slice(0, pos);
      const needsSpace = pos > 0 && !/\s$/.test(before);
      const insert = `${needsSpace ? ' ' : ''}@${tag} `;
      content.value = before + insert + content.value.slice(content.selectionEnd);
      const newPos = pos + insert.length;
      content.dispatchEvent(new Event('input'));
      content.focus();
      content.setSelectionRange(newPos, newPos);
    }

    async function openTagModal() {
      const overlay = document.createElement('div');
      overlay.className = 'overlay';
      const box = document.createElement('div');
      box.className = 'picker tag-modal';
      overlay.appendChild(box);
      const close = () => {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') close();
      };
      document.addEventListener('keydown', onKey);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });

      const h = document.createElement('h2');
      h.textContent = 'Add a tag';
      box.appendChild(h);

      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'New tag — e.g. phone';
      input.autocomplete = 'off';
      box.appendChild(input);

      const results = document.createElement('div');
      results.className = 'picker-results';
      box.appendChild(results);

      // Same normalization either way in: a picked existing tag is already
      // clean, but free-typed text (leading @, stray spaces) gets tidied up
      // so it stays a single `@word` token in the note text.
      function commit(raw) {
        const tag = raw.trim().replace(/^@+/, '').trim().replace(/\s+/g, '-');
        if (!tag) return;
        insertTag(tag);
        close();
      }

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit(input.value);
        }
      });

      const addBtn = document.createElement('button');
      addBtn.textContent = 'Add';
      addBtn.addEventListener('click', () => commit(input.value));

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'secondary';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', close);

      const actionsRow = document.createElement('div');
      actionsRow.className = 'picker-actions';
      actionsRow.appendChild(addBtn);
      actionsRow.appendChild(cancelBtn);
      box.appendChild(actionsRow);

      document.body.appendChild(overlay);
      input.focus();

      const tags = await api.getTags();
      results.innerHTML = '';
      if (!tags.length) {
        const p = document.createElement('p');
        p.className = 'picker-hint';
        p.textContent = 'No tags yet — type one above.';
        results.appendChild(p);
        return;
      }
      const label = document.createElement('p');
      label.className = 'picker-hint';
      label.textContent = 'Or pick one already in use:';
      results.appendChild(label);
      tags.forEach((t) => {
        const div = document.createElement('div');
        div.className = 'result';
        div.textContent = `@${t}`;
        div.addEventListener('click', () => commit(t));
        results.appendChild(div);
      });
    }

    tagBtn.addEventListener('click', () => openTagModal());

    actions.appendChild(addBtn);
    actions.appendChild(tagBtn);
    actions.appendChild(pinBtn);
    actions.appendChild(alarmBtn);
    actions.appendChild(deleteBtn);
    actions.appendChild(doneBtn);
    footer.appendChild(status);
    footer.appendChild(actions);

    pinBtn.addEventListener('click', async () => {
      currentNote = currentNote.pinned
        ? await api.unpinNote(currentId)
        : await api.pinNote(currentId);
      allNotesCache = await api.listNotes();
      renderPinbar();
      await onRerender();
    });

    doneBtn.addEventListener('click', () => {
      openActionMenu(
        doneBtn,
        STATUS_ORDER.map((s) => ({
          label: `${statusFace[s].icon} ${statusFace[s].label}`,
          active: s === curStatus,
          onClick: async () => {
            if (s === curStatus) return;
            currentNote = await api.setStatus(currentId, s);
            allNotesCache = await api.listNotes();
            renderPinbar();
            await onRerender();
          },
        }))
      );
    });

    deleteBtn.addEventListener('click', async () => {
      if (currentNote.pinned) return;
      if (!(await confirmDialog(`Delete "${currentNote.title}"?`, { confirmLabel: 'Delete', danger: true }))) return;
      await api.setStatus(currentId, 'deleted');
      allNotesCache = await api.listNotes();
      renderPinbar();
      await afterDelete();
    });

    frag.appendChild(buildMetaLine(currentNote));
    frag.appendChild(footer);
    return frag;
  }

  // The grid center cell is a read-only preview — attachment, title, text.
  // A click anywhere opens the fullscreen editor, focused on whichever of
  // title / text was clicked. Attachment links stay live.
  function makeCenterCell() {
    const cell = document.createElement('div');
    cell.className =
      'cell center' +
      (currentNote.status === 'done' ? ' dimmed' : '') +
      (triggeredAlarmIds.has(currentNote.id) ? ' alarm-triggered' : '');
    cell.style.gridColumn = '2';
    cell.style.gridRow = '2';

    applyCellColor(cell, currentNote);
    applyCellTheme(cell, currentNote.id);

    const preview = buildAttachmentPreview(currentNote, { compact: true });

    const title = document.createElement('div');
    title.className = 'center-title readonly';
    title.textContent = currentNote.title || 'Untitled';

    const content = document.createElement('div');
    const hasContent = Boolean(currentNote.content && currentNote.content.trim());
    content.className = 'center-content readonly' + (hasContent ? '' : ' placeholder');
    if (hasContent) {
      const paint = () =>
        renderMarkdownInto(content, currentNote.content, {
          selfId: currentNote.id,
          onCreateWiki: createLinkedNote,
          onToggleTask: async (idx) => {
            currentNote = await api.updateNote(currentId, {
              title: currentNote.title,
              content: toggleTaskInSource(currentNote.content, idx),
            });
            allNotesCache = await api.listNotes();
            paint();
          },
        });
      paint();
    } else if (currentNote.content == null) {
      // Not truly empty — this note's full row was just never cached, so
      // there's nothing to show. Distinct from the "Write here…" invitation
      // below, which would otherwise wrongly suggest an empty note.
      content.textContent = 'Not available offline';
    } else {
      content.textContent = 'Write here…';
    }

    cell.appendChild(title);
    if (preview) cell.appendChild(preview);
    cell.appendChild(content);

    if (linkCount > LINK_LIST_THRESHOLD) {
      const badge = document.createElement('div');
      badge.className = 'center-link-badge';
      badge.textContent = `+${linkCount - LINK_LIST_THRESHOLD}`;
      badge.title = `${linkCount} links — open the note to manage them`;
      cell.appendChild(badge);
    }

    cell.addEventListener('click', (e) => {
      if (e.target.closest('a, audio, input, label')) return;
      // Top half of the card → open read-only/rendered (peek at it, click
      // wikilinks); bottom half → open straight into the editable textarea.
      const rect = cell.getBoundingClientRect();
      const mode = e.clientY - rect.top < rect.height / 2 ? 'preview' : 'edit';
      openNoteFullscreen(mode);
    });

    return cell;
  }

  // --- Drag a neighbor card onto another card to re-home its connection:
  // it unlinks from the centered note and links to the drop-target note.
  // Pointer Events so the same path works for mouse and Android touch. ---
  const DRAG_THRESHOLD = 8;

  function makeDragGhost(cell, grabX, grabY) {
    const r = cell.getBoundingClientRect();
    const ghost = cell.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.classList.remove('dragging', 'drop-target');
    // Set layout inline: stylesheet `.cell.neighbor` rules outrank `.drag-ghost`
    // and would otherwise pin it `position: relative` at the end of <body>.
    ghost.style.cssText +=
      `;position:fixed;margin:0;z-index:60;pointer-events:none;` +
      `width:${r.width}px;height:${r.height}px;`;
    // Offset so the card holds its grab point under the pointer.
    ghost._ox = Math.min(Math.max(grabX - r.left, 0), r.width);
    ghost._oy = Math.min(Math.max(grabY - r.top, 0), r.height);
    document.body.appendChild(ghost);
    return ghost;
  }

  function moveGhost(ghost, x, y) {
    if (!ghost) return;
    ghost.style.left = `${x - ghost._ox}px`;
    ghost.style.top = `${y - ghost._oy}px`;
  }

  function dropTargetAt(x, y, sourceCell) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const cell = el.closest('.cell.neighbor');
    if (!cell || cell === sourceCell || !cell.dataset.noteId) return null;
    return cell;
  }

  async function rehomeCard(cardId, fromId, toId) {
    if (!toId || cardId === toId || fromId === toId) return;
    // The server links (toId ↔ cardId), drops (fromId ↔ cardId), and logs the
    // pair as one undoable "moved" entry — all in one transaction.
    await api.link(toId, cardId, fromId);
    await loadNeighbors(currentId);
    await refreshColorData();
    await render();
  }

  function attachCardDrag(cell, note) {
    cell.dataset.noteId = String(note.id);

    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let dragging = false;
    let ghost = null;
    let hovered = null;

    const clearHover = () => {
      if (hovered) hovered.classList.remove('drop-target');
      hovered = null;
    };

    cell.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary || (e.button != null && e.button > 0)) return;
      if (e.target.closest('.unlink-btn')) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      dragging = false;
    });

    cell.addEventListener('pointermove', (e) => {
      if (pointerId == null || e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!dragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        dragging = true;
        try { cell.setPointerCapture(pointerId); } catch {}
        cell.classList.add('dragging');
        ghost = makeDragGhost(cell, startX, startY);
      }

      e.preventDefault();
      moveGhost(ghost, e.clientX, e.clientY);
      const target = dropTargetAt(e.clientX, e.clientY, cell);
      if (target !== hovered) {
        clearHover();
        if (target) target.classList.add('drop-target');
        hovered = target;
      }
    });

    const finish = (e, cancelled) => {
      if (pointerId == null || (e.pointerId != null && e.pointerId !== pointerId)) return;
      const wasDragging = dragging;
      const target = hovered;

      try {
        if (cell.hasPointerCapture(pointerId)) cell.releasePointerCapture(pointerId);
      } catch {}
      pointerId = null;
      dragging = false;
      cell.classList.remove('dragging');
      if (ghost) { ghost.remove(); ghost = null; }
      clearHover();

      if (!wasDragging) return;

      // Swallow the click this drag would otherwise synthesize.
      const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      document.addEventListener('click', swallow, true);
      setTimeout(() => document.removeEventListener('click', swallow, true), 60);

      if (cancelled || !target) return;
      rehomeCard(note.id, currentId, Number(target.dataset.noteId));
    };

    cell.addEventListener('pointerup', (e) => finish(e, false));
    cell.addEventListener('pointercancel', (e) => finish(e, true));
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
      (neighbor.status === 'done' ? ' dimmed' : '') +
      (triggeredAlarmIds.has(neighbor.id) ? ' alarm-triggered' : '');

    applyCellColor(cell, neighbor);
    applyCellTheme(cell, neighbor.id);
    attachCardDrag(cell, neighbor);

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
      applyCellColor(miniCenter, neighbor);
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
          applyCellColor(miniCell, sub);
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

      const preview = buildAttachmentPreview(neighbor, { compact: true });
      if (preview) cell.appendChild(preview);

      cell.addEventListener('click', async (e) => {
        // Let the attachment's own link/player take the tap (view/download/
        // play) instead of navigating the grid to this note.
        if (e.target.closest('a, audio, input, label')) return;
        // Top half: just center it, same as before (the center cell is
        // already a read-only preview — opening fullscreen too is
        // redundant). Bottom half: center it and go straight into editing.
        const rect = cell.getBoundingClientRect();
        const wantsEdit = e.clientY - rect.top >= rect.height / 2;
        await goTo(neighbor.id, navVia);
        if (wantsEdit) await openNoteFullscreen('edit');
      });
    }

    return cell;
  }

  // Preview is the default and persists across re-renders of the *same*
  // open note (pin/status/delete etc. all rebuild the editor via onRerender
  // with no mode argument) — an action button must never flip you out of
  // whatever mode you're already in. Only an explicit mode — a fresh open,
  // or the user's own Preview/Edit toggle — changes it.
  let previewActive = true;

  // Fullscreen editor for the current center note (title/content, meta,
  // pin/delete/done). mode: 'preview' opens rendered/read-only (clickable
  // wikilinks, no keyboard); 'edit' opens straight into the textarea, cursor
  // at the end; omitted (a rerender after pin/status/delete) reuses whatever
  // previewActive already is, with no focus change.
  function renderNoteFullscreen(mode) {
    if (mode === 'preview' || mode === 'edit') previewActive = mode === 'preview';
    noteOverlayBody.innerHTML = '';
    const inner = document.createElement('div');
    inner.className = 'cell center' + (currentNote.status === 'done' ? ' dimmed' : '');
    inner.appendChild(
      buildNoteEditor({
        startPreview: previewActive,
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

    if (mode === 'edit') {
      const el = inner.querySelector('.center-content');
      if (el) {
        el.focus();
        const end = el.value.length;
        try { el.setSelectionRange(end, end); } catch {}
      }
    }
  }

  async function openNoteFullscreen(mode) {
    if (!currentId) return;
    currentNote = await api.getNote(currentId);
    if (!currentNote) return;
    renderNoteFullscreen(mode);
    noteOverlay.classList.remove('hidden');
  }

  function closeNoteFullscreen() {
    clearTimeout(saveTimer);
    noteOverlay.classList.add('hidden');
    noteOverlayBody.innerHTML = '';
    previewActive = true;
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

  let pendingLinkTarget = null; // currentId, fixed each time the create modal opens

  function makeEmptyCell() {
    const cell = document.createElement('div');
    cell.className = 'cell empty';
    cell.textContent = '+';
    // Same two options as the note editor's ➕ (minus "add/remove attachment" —
    // there's no note here yet to attach to): fill this slot with a new note,
    // or connect an existing one into it.
    cell.addEventListener('click', () =>
      openActionMenu(cell, [
        { label: '📝 Create a note', onClick: () => openPicker() },
        { label: '🔗 Connect to note', onClick: () => openLinkModal() },
      ])
    );
    return cell;
  }

  async function render() {
    renderAlarmbar();
    await prepareOfflineThemeImages();
    await refreshThemeContext();
    applyScreenTheme();
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
    tabbar.classList.toggle('hidden', !barPrefs.tabs);

    tabs.forEach((tab) => {
      const chip = document.createElement('div');
      chip.className =
        'tab' +
        (tab.id === activeTabId ? ' active' : '') +
        (triggeredAlarmIds.has(tab.note_id) ? ' alarm-triggered' : '');

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

  // --- Pin bar: shortcuts to pinned notes ---
  function renderPinbar() {
    const pinned = allNotesCache.filter((n) => n.pinned);
    pinbar.innerHTML = '';
    pinbar.classList.toggle('hidden', pinned.length === 0 || !barPrefs.pins);

    pinned.forEach((note) => {
      const chip = document.createElement('div');
      chip.className =
        'tab' +
        (note.id === currentId ? ' active' : '') +
        (triggeredAlarmIds.has(note.id) ? ' alarm-triggered' : '');

      const title = document.createElement('span');
      title.className = 'tab-title';
      title.textContent = `📌 ${note.title}`;

      chip.appendChild(title);
      chip.addEventListener('click', () => jumpTo(note.id, 'pin'));
      pinbar.appendChild(chip);
    });

    // The latest and to-do bars track the same note cache, so keep them in lockstep.
    renderLatestbar();
    renderTodobar();
  }

  // --- Latest bar: shortcuts to the most recently edited notes account-wide. ---
  const LATEST_BAR_COUNT = 8;
  function renderLatestbar() {
    const latest = [...allNotesCache]
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, LATEST_BAR_COUNT);
    latestbar.innerHTML = '';
    latestbar.classList.toggle('hidden', latest.length === 0 || !barPrefs.latest);

    latest.forEach((note) => {
      const chip = document.createElement('div');
      chip.className =
        'tab' +
        (note.id === currentId ? ' active' : '') +
        (triggeredAlarmIds.has(note.id) ? ' alarm-triggered' : '');

      const title = document.createElement('span');
      title.className = 'tab-title';
      title.textContent = `🕓 ${note.title}`;

      chip.appendChild(title);
      chip.addEventListener('click', () => jumpTo(note.id, 'latest'));
      latestbar.appendChild(chip);
    });
  }

  // --- To-do bar: a row (like the pin bar) of every open note under the
  // current one in the inferred hierarchy — not every open note account-wide,
  // so it reads as "what's left to do in this project" rather than a global
  // task list. ---
  let todobarGen = 0;
  async function renderTodobar() {
    const gen = ++todobarGen;
    const root = currentId;
    const todos = root != null ? await api.getSubtreeTodos(root) : [];
    if (gen !== todobarGen) return; // a newer call already landed — drop this one

    todobar.innerHTML = '';
    todobar.classList.toggle('hidden', todos.length === 0 || !barPrefs.todos);

    todos.forEach((note) => {
      const chip = document.createElement('div');
      chip.className =
        'tab' +
        (note.id === currentId ? ' active' : '') +
        (triggeredAlarmIds.has(note.id) ? ' alarm-triggered' : '');

      const title = document.createElement('span');
      title.className = 'tab-title';
      title.textContent = `◑ ${note.title}`;

      chip.appendChild(title);
      chip.addEventListener('click', () => jumpTo(note.id, 'todo'));
      todobar.appendChild(chip);
    });
  }

  // --- Alarm bar: a row (like the pin bar) of every alarm under the current
  // note in the inferred hierarchy — scoped the same way as the to-do bar, so
  // it reads as "what's ringing in this project" rather than every alarm
  // account-wide. ---
  let alarmbarGen = 0;
  async function renderAlarmbar() {
    const gen = ++alarmbarGen;
    const root = currentId;
    const subtreeIds = root != null ? await api.getSubtreeIds(root) : [];
    if (gen !== alarmbarGen) return; // a newer call already landed — drop this one
    const underHere = new Set(subtreeIds);

    alarmbar.innerHTML = '';
    // Location reminders have no clock — `⏰ ${a.time} ${a.title}` would read
    // as a broken chip with a blank time. They're surfaced via the map and
    // agenda instead, not this time-based bar.
    const scheduled = alarms.filter((a) => a.kind !== 'location' && underHere.has(a.noteId));
    alarmbar.classList.toggle('hidden', scheduled.length === 0 || !barPrefs.alarms);

    scheduled.forEach((a) => {
      const chip = document.createElement('div');
      chip.className =
        'tab' +
        (a.noteId === currentId ? ' active' : '') +
        (a.triggered ? ' alarm-triggered' : '');

      const title = document.createElement('span');
      title.className = 'tab-title';
      title.textContent = `⏰ ${a.time} ${a.title}`;

      chip.appendChild(title);
      chip.addEventListener('click', () => jumpTo(a.noteId, 'alarm'));
      alarmbar.appendChild(chip);
    });
  }

  // Fetch alarms, decide (in the viewer's timezone) which are ringing, repaint
  // the triggered tint, roll each alarm's next-ring instant forward on the
  // server so the push scheduler stays armed, and surface the popup /
  // notification for anything newly due.
  async function checkAlarms({ popup = true } = {}) {
    const ref = new Date();
    alarms = (await api.listAlarms()).map((a) => ({ ...a, triggered: alarmTriggered(a, ref) }));

    // Grid / tab / pin tint is keyed by NOTE id — a note glows if any of its
    // reminders is ringing.
    const nextNotes = new Set(alarms.filter((a) => a.triggered).map((a) => a.noteId));
    const changed =
      nextNotes.size !== triggeredAlarmIds.size ||
      [...nextNotes].some((id) => !triggeredAlarmIds.has(id));
    triggeredAlarmIds = nextNotes;

    // Popup dismiss / notified bookkeeping is keyed by REMINDER id.
    const ringingIds = new Set(alarms.filter((a) => a.triggered).map((a) => a.id));
    for (const id of [...alarmDismissed]) if (!ringingIds.has(id)) alarmDismissed.delete(id);
    for (const id of [...alarmNotified]) if (!ringingIds.has(id)) alarmNotified.delete(id);

    // Keep the server's next_at pointing at the upcoming occurrence — but leave
    // a reminder that is snoozed into the future alone. Location reminders carry
    // no clock: their next_at is stamped by /arrive and cleared by /ack, so the
    // client must never roll it. Only meaningful online (it arms the server push
    // scheduler); offline the reconnect does a fresh checkAlarms that catches up.
    if (net.online) {
      for (const a of alarms) {
        if (a.kind === 'location' || isTmp(a.id)) continue;
        if (a.snoozeUntil && new Date(a.snoozeUntil) > ref) continue;
        const want = isoOrNull(nextAlarmOccurrence(a, ref));
        if (want !== (a.nextAt || null)) api.scheduleAlarm(a.id, want);
      }
    }

    syncGeofenceWatch();
    renderAlarmbar();
    updateAgendaBadge(ringingIds.size);
    if (changed) {
      renderTabbar();
      renderPinbar();
      if (currentId) await render();
      if (!agendaOverlay.classList.contains('hidden')) openAgenda();
    }

    const ringing = alarms.filter((a) => a.triggered && !alarmDismissed.has(a.id));
    // Auto-open only at startup or when something newly fired — not on every
    // poll while an alarm sits unacknowledged (the bar/grid tint show that).
    if (popup && changed && ringing.length) showAlarmPopup(ringing);
    notifyAlarms(ringing);
  }

  // Foreground fallback notification (the server push covers the background
  // case). Android/installed PWAs reject `new Notification()`, so go through
  // the service worker registration.
  function notifyAlarms(ringing) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!('serviceWorker' in navigator)) return;
    const fresh = ringing.filter((a) => !alarmNotified.has(a.id));
    if (!fresh.length) return;
    navigator.serviceWorker.ready
      .then((reg) => {
        fresh.forEach((a) => {
          alarmNotified.add(a.id);
          reg.showNotification(`⏰ ${a.title}`, {
            body: alarmWhenText(a),
            tag: `alarm-${a.noteId}`,
            renotify: true,
            data: { url: `/#${a.noteId}` },
          });
        });
      })
      .catch(() => {});
  }

  function hideAlarmPopupRow(row) {
    row.remove();
    if (!alarmPopupList.childElementCount) alarmPopupOverlay.classList.add('hidden');
  }

  // A "Snooze…" dropdown for one reminder, shared by the ring popup and the
  // agenda. `after` runs once the snooze has been persisted and alarms refreshed.
  function buildSnoozeSelect(a, after) {
    const sel = document.createElement('select');
    sel.className = 'apo-snooze';
    sel.title = 'Remind me again later';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = 'Snooze…';
    sel.appendChild(ph);
    SNOOZE_OPTIONS.forEach((opt, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = opt.label;
      sel.appendChild(o);
    });
    sel.addEventListener('change', async () => {
      const opt = SNOOZE_OPTIONS[Number(sel.value)];
      sel.value = '';
      if (!opt) return;
      await api.snoozeAlarm(a.id, snoozeUntilIso(opt));
      alarmDismissed.delete(a.id);
      await checkAlarms({ popup: false });
      if (after) after();
    });
    return sel;
  }

  function showAlarmPopup(ringing) {
    alarmPopupList.innerHTML = '';
    ringing.forEach((a) => {
      const row = document.createElement('div');
      row.className = 'alarm-popup-item';

      const info = document.createElement('div');
      info.className = 'apo-info';
      const t = document.createElement('div');
      t.className = 'apo-title';
      t.textContent = a.title;
      const w = document.createElement('div');
      w.className = 'apo-when';
      w.textContent = alarmWhenText(a);
      info.appendChild(t);
      info.appendChild(w);

      const snooze = buildSnoozeSelect(a, () => hideAlarmPopupRow(row));

      const ok = document.createElement('button');
      ok.className = 'apo-ok';
      ok.textContent = 'OK';
      ok.title = "Don't show again until it next goes off";
      ok.addEventListener('click', async () => {
        await api.ackAlarm(a.id, isoOrNull(nextAlarmOccurrence(a, new Date())));
        alarmDismissed.delete(a.id);
        hideAlarmPopupRow(row);
        await checkAlarms({ popup: false });
      });

      const x = document.createElement('button');
      x.className = 'apo-x';
      x.textContent = '✕';
      x.title = 'Dismiss — show again on next start';
      x.addEventListener('click', () => {
        alarmDismissed.add(a.id);
        hideAlarmPopupRow(row);
      });

      row.appendChild(info);
      row.appendChild(snooze);
      row.appendChild(ok);
      row.appendChild(x);
      alarmPopupList.appendChild(row);
    });
    alarmPopupOverlay.classList.remove('hidden');
  }

  // --- Agenda: one "what's due" view across every reminder --------------------
  function startOfDay(x) {
    const d = new Date(x);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // A reminder's next fire instant, snooze-aware: the snooze time while it is
  // still in the future, else the next normal occurrence (null once a one-shot
  // has passed).
  function effectiveNextFire(a, ref = new Date()) {
    if (a.snoozeUntil) {
      const s = new Date(a.snoozeUntil);
      if (s > ref) return s;
    }
    return nextAlarmOccurrence(a, ref);
  }

  function agendaWhenText(d, ref = new Date()) {
    if (!d) return '';
    const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const dd = Math.round((startOfDay(d) - startOfDay(ref)) / 86400000);
    if (dd === 0) return `Today ${hh}`;
    if (dd === 1) return `Tomorrow ${hh}`;
    if (dd > 1 && dd < 7) return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${hh}`;
    return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${hh}`;
  }

  function updateAgendaBadge(n) {
    if (n > 0) {
      agendaBadge.textContent = n > 9 ? '9+' : String(n);
      agendaBadge.classList.remove('hidden');
    } else {
      agendaBadge.classList.add('hidden');
    }
  }

  function agendaRow(a, overdue) {
    const row = document.createElement('div');
    row.className = 'agenda-item' + (overdue ? ' agenda-overdue' : '');

    const info = document.createElement('div');
    info.className = 'agenda-info';
    const t = document.createElement('div');
    t.className = 'agenda-title linkish';
    t.textContent = a.title;
    t.addEventListener('click', () => {
      agendaOverlay.classList.add('hidden');
      jumpTo(a.noteId, 'agenda');
    });
    const w = document.createElement('div');
    w.className = 'agenda-when';
    const snoozed = a.snoozeUntil && new Date(a.snoozeUntil) > new Date();
    w.textContent = snoozed
      ? `Snoozed · ${agendaWhenText(a.fireAt)}`
      : overdue
        ? alarmWhenText(a)
        : agendaWhenText(a.fireAt);
    info.appendChild(t);
    info.appendChild(w);

    const snooze = buildSnoozeSelect(a, openAgenda);
    const ok = document.createElement('button');
    ok.className = 'agenda-ok';
    ok.textContent = '✓';
    ok.title = 'Done — quiet until it next goes off';
    ok.addEventListener('click', async () => {
      await api.ackAlarm(a.id, isoOrNull(nextAlarmOccurrence(a, new Date())));
      await checkAlarms({ popup: false });
      openAgenda();
    });

    row.appendChild(info);
    row.appendChild(snooze);
    row.appendChild(ok);
    return row;
  }

  // A note carrying unchecked `- [ ]` tasks — the agenda's secondary list.
  // Counts come from GET /api/agenda (the client note cache has no `content`).
  function openTaskRow(t) {
    const row = document.createElement('div');
    row.className = 'agenda-item agenda-task';
    const info = document.createElement('div');
    info.className = 'agenda-info';
    const title = document.createElement('div');
    title.className = 'agenda-title linkish';
    title.textContent = t.title;
    title.addEventListener('click', () => {
      agendaOverlay.classList.add('hidden');
      jumpTo(t.noteId, 'agenda');
    });
    const w = document.createElement('div');
    w.className = 'agenda-when';
    w.textContent = `${t.open} open task${t.open === 1 ? '' : 's'}`;
    info.appendChild(title);
    info.appendChild(w);
    row.appendChild(info);
    return row;
  }

  // A standing location reminder (armed, not ringing) — no clock, so no snooze.
  function placeRow(a) {
    const row = document.createElement('div');
    row.className = 'agenda-item agenda-place';
    const info = document.createElement('div');
    info.className = 'agenda-info';
    const t = document.createElement('div');
    t.className = 'agenda-title linkish';
    t.textContent = a.title;
    t.addEventListener('click', () => {
      agendaOverlay.classList.add('hidden');
      jumpTo(a.noteId, 'agenda');
    });
    const w = document.createElement('div');
    w.className = 'agenda-when';
    w.textContent = `When you arrive · ${a.radiusM || 250} m`;
    info.appendChild(t);
    info.appendChild(w);
    row.appendChild(info);
    const mapB = document.createElement('button');
    mapB.className = 'agenda-ok';
    mapB.textContent = '🗺';
    mapB.title = 'Show on map';
    mapB.addEventListener('click', () => {
      agendaOverlay.classList.add('hidden');
      openMap();
    });
    row.appendChild(mapB);
    return row;
  }

  // A note the user flagged to-do via the center-cell status button.
  function todoRow(t) {
    const row = document.createElement('div');
    row.className = 'agenda-item agenda-task';
    const info = document.createElement('div');
    info.className = 'agenda-info';
    const title = document.createElement('div');
    title.className = 'agenda-title linkish';
    title.textContent = t.title;
    title.addEventListener('click', () => {
      agendaOverlay.classList.add('hidden');
      jumpTo(t.noteId, 'agenda');
    });
    info.appendChild(title);
    row.appendChild(info);
    return row;
  }

  async function openAgenda() {
    agendaOverlay.classList.remove('hidden');
    agendaBody.textContent = 'Loading…';
    const ref = new Date();
    const list = (await api.listAlarms()).map((a) => ({
      ...a,
      triggered: alarmTriggered(a, ref),
      fireAt: effectiveNextFire(a, ref),
    }));

    const buckets = { overdue: [], today: [], week: [], later: [] };
    for (const a of list) {
      if (a.triggered) {
        buckets.overdue.push(a);
        continue;
      }
      if (!a.fireAt) continue; // acked one-shot in the past — nothing to show
      const dd = Math.round((startOfDay(a.fireAt) - startOfDay(ref)) / 86400000);
      if (dd <= 0) buckets.today.push(a);
      else if (dd < 7) buckets.week.push(a);
      else buckets.later.push(a);
    }
    for (const k of Object.keys(buckets)) {
      buckets[k].sort((x, y) => (x.fireAt || 0) - (y.fireAt || 0));
    }

    agendaBody.innerHTML = '';
    const groups = [
      ['Overdue', buckets.overdue],
      ['Today', buckets.today],
      ['This week', buckets.week],
      ['Later', buckets.later],
    ];
    let any = false;
    for (const [label, items] of groups) {
      if (!items.length) continue;
      any = true;
      const h = document.createElement('h3');
      h.textContent = label;
      agendaBody.appendChild(h);
      items.forEach((a) => agendaBody.appendChild(agendaRow(a, label === 'Overdue')));
    }

    // Standing geofence reminders that aren't currently ringing.
    const places = list.filter((a) => a.kind === 'location' && !a.triggered);
    if (places.length) {
      any = true;
      const h = document.createElement('h3');
      h.textContent = 'Places';
      agendaBody.appendChild(h);
      places.forEach((a) => agendaBody.appendChild(placeRow(a)));
    }

    // Secondary lists (server-computed): notes flagged to-do, then notes
    // carrying open `- [ ]` tasks in their body.
    const extra = await api.agenda();
    const todos = (extra && extra.todos) || [];
    if (todos.length) {
      any = true;
      const h = document.createElement('h3');
      h.textContent = 'To-do';
      agendaBody.appendChild(h);

      // Group by @context tag (server/tags.js) — a todo with several tags
      // appears under each one, since it genuinely fits either context. Only
      // adds grouping once something's actually tagged; with no tags in use
      // yet this renders exactly like the old flat list.
      const byTag = new Map();
      const untagged = [];
      todos.forEach((t) => {
        const tags = t.tags || [];
        if (!tags.length) {
          untagged.push(t);
          return;
        }
        tags.forEach((tag) => {
          if (!byTag.has(tag)) byTag.set(tag, []);
          byTag.get(tag).push(t);
        });
      });
      [...byTag.keys()].sort().forEach((tag) => {
        const sub = document.createElement('div');
        sub.className = 'agenda-subhead';
        sub.textContent = `@${tag}`;
        agendaBody.appendChild(sub);
        byTag.get(tag).forEach((t) => agendaBody.appendChild(todoRow(t)));
      });
      if (untagged.length) {
        if (byTag.size) {
          const sub = document.createElement('div');
          sub.className = 'agenda-subhead';
          sub.textContent = 'Other';
          agendaBody.appendChild(sub);
        }
        untagged.forEach((t) => agendaBody.appendChild(todoRow(t)));
      }
    }
    // Waiting: local (allNotesCache already has status for every note) — not
    // server-computed like the others, since it's deliberately left out of
    // buildAgenda/the digest (blocked on someone else isn't something to
    // act on yet, so it shouldn't be pushed/emailed as if it were).
    const waiting = allNotesCache.filter((n) => n.status === 'waiting');
    if (waiting.length) {
      any = true;
      const h = document.createElement('h3');
      h.textContent = 'Waiting';
      agendaBody.appendChild(h);
      waiting.forEach((n) => agendaBody.appendChild(todoRow({ noteId: n.id, title: n.title })));
    }
    const openTasks = (extra && extra.openTasks) || [];
    if (openTasks.length) {
      any = true;
      const h = document.createElement('h3');
      h.textContent = 'Open tasks';
      agendaBody.appendChild(h);
      openTasks.forEach((t) => agendaBody.appendChild(openTaskRow(t)));
    }
    // Structurally disconnected notes (no links at all) — easy to forget since
    // nothing points at them and they never turn up while navigating the grid.
    const orphans = (extra && extra.orphans) || [];
    if (orphans.length) {
      any = true;
      const h = document.createElement('h3');
      h.textContent = 'Orphaned notes';
      agendaBody.appendChild(h);
      orphans.forEach((o) => agendaBody.appendChild(todoRow(o)));
    }

    if (!any) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = 'Nothing scheduled.';
      agendaBody.appendChild(p);
    }
  }

  agendaBtn.addEventListener('click', openAgenda);
  agendaClose.addEventListener('click', () => agendaOverlay.classList.add('hidden'));
  agendaOverlay.addEventListener('click', (e) => {
    if (e.target === agendaOverlay) agendaOverlay.classList.add('hidden');
  });

  // --- Alarm editor (Android-style: time wheel + weekday circles + one-time date) ---
  function selectedAlarmDays() {
    return [...alarmDaysRow.querySelectorAll('.alarm-day-btn.active')].map((b) => Number(b.dataset.day));
  }

  function syncAlarmDateVisibility() {
    alarmDateWrap.classList.toggle('hidden', selectedAlarmDays().length > 0);
  }

  function defaultAlarmDate(hhmm) {
    const [h, m] = (hhmm || '00:00').split(':').map(Number);
    const d = new Date();
    const at = new Date();
    at.setHours(h, m, 0, 0);
    if (at <= d) d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  }

  // 'time' (clock) vs 'location' (geofence) — the two alarm-editor modes.
  let alarmKind = 'time';
  // The place chosen in the current editor session (current-location or map
  // pick); null falls back to the note's own lat/lon.
  let alarmPickedLoc = null;

  function currentAlarmLoc() {
    if (alarmPickedLoc) return alarmPickedLoc;
    const n = alarmEditNote;
    if (n && Number.isFinite(n.lat) && Number.isFinite(n.lon)) {
      return { lat: n.lat, lon: n.lon, fromNote: true };
    }
    return null;
  }

  function refreshAlarmLocReadout() {
    const loc = currentAlarmLoc();
    if (!loc) {
      alarmLocReadout.textContent = 'No location set';
      return;
    }
    const coords = `${loc.lat.toFixed(5)}, ${loc.lon.toFixed(5)}`;
    alarmLocReadout.textContent = loc.fromNote ? `Note's location · ${coords}` : coords;
  }

  function setAlarmKind(kind) {
    alarmKind = kind === 'location' ? 'location' : 'time';
    alarmKindRow.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', b.dataset.kind === alarmKind);
    });
    alarmTimeFields.classList.toggle('hidden', alarmKind === 'location');
    alarmPlaceFields.classList.toggle('hidden', alarmKind !== 'location');
    if (alarmKind === 'location') refreshAlarmLocReadout();
  }

  function openAlarmEditor(note) {
    alarmEditNote = note;
    alarmPickedLoc = null;
    const existing = alarms.find((a) => a.noteId === note.id);

    const d = new Date();
    alarmTimeInput.value =
      existing && existing.time
        ? existing.time
        : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

    const activeDays = new Set(existing ? existing.days : []);
    alarmDaysRow.innerHTML = '';
    ALARM_DAYS.forEach((label, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'alarm-day-btn' + (activeDays.has(ALARM_DAY_NUM[i]) ? ' active' : '');
      b.textContent = label[0];
      b.title = label;
      b.dataset.day = String(ALARM_DAY_NUM[i]);
      b.addEventListener('click', () => {
        b.classList.toggle('active');
        syncAlarmDateVisibility();
      });
      alarmDaysRow.appendChild(b);
    });

    alarmDateInput.value =
      existing && existing.date ? existing.date : defaultAlarmDate(alarmTimeInput.value);
    syncAlarmDateVisibility();

    if (existing && existing.kind === 'location') {
      alarmPickedLoc = { lat: existing.lat, lon: existing.lon };
      alarmRadiusInput.value = String(existing.radiusM || 250);
    } else {
      alarmRadiusInput.value = alarmRadiusInput.value || '250';
    }
    setAlarmKind(existing && existing.kind === 'location' ? 'location' : 'time');

    alarmRemoveBtn.classList.toggle('hidden', !existing);
    alarmOverlay.classList.remove('hidden');
  }

  function closeAlarmEditor() {
    alarmOverlay.classList.add('hidden');
    alarmEditNote = null;
    alarmPickedLoc = null;
  }

  alarmKindRow.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-kind]');
    if (b) setAlarmKind(b.dataset.kind);
  });

  alarmLocCurrentBtn.addEventListener('click', async () => {
    alarmLocCurrentBtn.disabled = true;
    const loc = await getLocation();
    alarmLocCurrentBtn.disabled = false;
    if (!loc) {
      toast('Location unavailable.');
      return;
    }
    alarmPickedLoc = loc;
    refreshAlarmLocReadout();
  });

  alarmLocPickBtn.addEventListener('click', () => {
    alarmOverlay.classList.add('hidden');
    openMap({
      pick: true,
      onPick: (c) => {
        alarmPickedLoc = c;
        refreshAlarmLocReadout();
      },
      onClose: () => {
        alarmOverlay.classList.remove('hidden');
      },
    });
  });

  async function afterAlarmChange() {
    await checkAlarms({ popup: false });
    if (!noteOverlay.classList.contains('hidden')) renderNoteFullscreen();
  }

  // --- Web Push registration (so alarms ring when the app is closed) ---
  function urlBase64ToUint8Array(base64) {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
    return out;
  }

  let pushSyncing = false;
  async function ensurePushSubscription() {
    if (pushSyncing) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    pushSyncing = true;
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const keyData = await api.getPushKey();
        if (!keyData || !keyData.key) return;
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyData.key),
        });
      }
      await api.subscribePush(sub.toJSON());
    } catch (err) {
      // permission revoked, key rotated, or the browser refused — ignore
    } finally {
      pushSyncing = false;
    }
  }

  // Ask for notification permission (once) then register for push.
  async function enableAlarmDelivery() {
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {}
    }
    await ensurePushSubscription();
  }

  alarmSaveBtn.addEventListener('click', async () => {
    if (!alarmEditNote) return;
    const existingAny = alarms.find((a) => a.noteId === alarmEditNote.id);

    if (alarmKind === 'location') {
      const loc = currentAlarmLoc();
      if (!loc) {
        toast('Set a location — use current or pick on map.');
        return;
      }
      const body = {
        kind: 'location',
        lat: loc.lat,
        lon: loc.lon,
        radiusM: Number(alarmRadiusInput.value) || 250,
      };
      try {
        body.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
      } catch {
        body.tz = null;
      }
      if (existingAny) await api.updateAlarm(existingAny.id, body);
      else await api.createAlarm({ ...body, noteId: alarmEditNote.id });
      await enableAlarmDelivery();
      closeAlarmEditor();
      await afterAlarmChange();
      return;
    }

    const time = alarmTimeInput.value;
    if (!/^\d{2}:\d{2}$/.test(time)) {
      toast('Pick a time.');
      return;
    }
    const days = selectedAlarmDays();
    const body = { time, days };
    if (days.length === 0) {
      if (!alarmDateInput.value) {
        toast('Pick a date, or choose repeat days.');
        return;
      }
      body.date = alarmDateInput.value;
    }
    // Seed the ack to this cycle's trigger so it doesn't ring the instant it's
    // set; nextAt arms the server-side push scheduler.
    const nowRef = new Date();
    const scheduleShape = { time, days, date: body.date || null };
    const seed = mostRecentAlarmTrigger(scheduleShape, nowRef);
    body.ackAt = (seed || nowRef).toISOString();
    body.nextAt = isoOrNull(nextAlarmOccurrence(scheduleShape, nowRef));
    try {
      body.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch {
      body.tz = null;
    }
    const existing = alarms.find((a) => a.noteId === alarmEditNote.id);
    if (existing) await api.updateAlarm(existing.id, body);
    else await api.createAlarm({ ...body, noteId: alarmEditNote.id });
    await enableAlarmDelivery();
    closeAlarmEditor();
    await afterAlarmChange();
  });

  alarmRemoveBtn.addEventListener('click', async () => {
    if (!alarmEditNote) return;
    const existing = alarms.find((a) => a.noteId === alarmEditNote.id);
    if (existing) await api.removeAlarm(existing.id);
    closeAlarmEditor();
    await afterAlarmChange();
  });

  alarmCancelBtn.addEventListener('click', closeAlarmEditor);
  alarmOverlay.addEventListener('click', (e) => {
    if (e.target === alarmOverlay) closeAlarmEditor();
  });

  // --- Topbar search (jump to note) ---
  let searchSeq = 0;
  let searchDebounce = null;

  // Shared two-line result row (icon + title, then a content snippet or the
  // inferred parent's title as a fallback subtitle) — used by both the
  // header's "jump to note" search and the "Connect to note" modal below, so
  // the two searches look and read the same.
  function buildResultRow(n) {
    const div = document.createElement('div');
    div.className = 'result';
    const icon = TYPE_ICON[n.type] ? `${TYPE_ICON[n.type]} ` : '';
    const title = document.createElement('div');
    title.className = 'result-title';
    title.textContent = icon + (n.title || 'Untitled');
    div.appendChild(title);
    if (n.snippet) {
      const snip = document.createElement('div');
      snip.className = 'result-snippet';
      snip.textContent = n.snippet;
      div.appendChild(snip);
    } else if (n.parentTitle) {
      const snip = document.createElement('div');
      snip.className = 'result-snippet result-parent';
      snip.textContent = `in ${n.parentTitle}`;
      div.appendChild(snip);
    }
    return div;
  }

  function renderSearchResults(list) {
    searchResults.innerHTML = '';
    list.forEach((n) => {
      const div = buildResultRow(n);
      div.addEventListener('click', () => {
        searchInput.value = '';
        searchResults.classList.add('hidden');
        jumpTo(n.id, 'search');
      });
      searchResults.appendChild(div);
    });
    searchResults.classList.toggle('hidden', list.length === 0);
  }

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    if (!q) {
      searchResults.classList.add('hidden');
      searchResults.innerHTML = '';
      return;
    }
    // Instant first paint from the local title cache…
    const ql = q.toLowerCase();
    renderSearchResults(
      allNotesCache.filter((n) => (n.title || '').toLowerCase().includes(ql)).slice(0, 8)
    );
    // …then replace with ranked full-text results from the server.
    const seq = ++searchSeq;
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(async () => {
      const rows = await api.searchNotes(q);
      if (seq === searchSeq && searchInput.value.trim() === q) renderSearchResults(rows);
    }, 180);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search')) {
      searchResults.classList.add('hidden');
    }
  });

  newNoteBtn.addEventListener('click', () => openPicker({ standalone: true }));

  // --- Picker (create a note — of any attachment style — or connect an
  // existing one to the current center, which is always the default target) ---
  const PICKER_TITLE_PLACEHOLDER = {
    text: 'New note title…',
    image: 'Caption (optional)…',
    audio: 'Caption (optional)…',
    file: 'Override name (optional)…',
    contact: 'Override title (optional)…',
    app: 'Label…',
  };

  let pickerStyle = 'text';
  // 'create' = the picker's original job (a new, optionally linked note, or
  // search-and-connect to an existing one). 'attach' = editing the currently
  // open note's *own* attachment instead — see openPicker's mode option.
  let pickerMode = 'create';
  let pickerAttachTarget = null; // the note id 'attach' mode edits
  let pickerHasAttachment = false; // that note already carries one, going in
  let pickerRecorder = null;
  let pickerRecordedBlob = null;
  const pickerTextStyleBtn = pickerStyleRow.querySelector('[data-style="text"]');

  function applyPickerStyleVisibility() {
    pickerPhotoRow.classList.toggle('hidden', pickerStyle !== 'image');
    pickerFileRow.classList.toggle('hidden', pickerStyle !== 'file');
    pickerAudioRow.classList.toggle('hidden', pickerStyle !== 'audio');
    pickerContactRow.classList.toggle('hidden', pickerStyle !== 'contact');
    pickerAppUri.classList.toggle('hidden', pickerStyle !== 'app');
    // 'attach' mode edits an existing note's file/type, not its title or the
    // graph — no "make it plain text" option here (that's the Remove button
    // below), no title field, and no search-and-connect section.
    pickerTextStyleBtn.classList.toggle('hidden', pickerMode === 'attach');
    pickerNewTitle.classList.toggle('hidden', pickerMode === 'attach');
    pickerCurrentAttachment.classList.toggle('hidden', !(pickerMode === 'attach' && pickerHasAttachment));
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

  // Builds the FormData for one of the non-text attachment styles from
  // whatever's currently filled in the picker's fields. Shared by "create a
  // new attachment note" (below) and "replace/set this note's own
  // attachment" (openPicker mode 'attach') — same fields, same validation.
  // Returns null (after a toast naming what's missing) if nothing was
  // supplied for the chosen style.
  function collectAttachmentFormData(style, appLabel) {
    const formData = new FormData();
    if (style === 'image') {
      const file = pickerCameraInput.files[0] || pickerPhotoInput.files[0];
      if (!file) {
        toast('Take a photo or choose one from your gallery first.');
        return null;
      }
      formData.set('type', 'image');
      formData.set('file', file);
    } else if (style === 'file') {
      const file = pickerFileInput.files[0];
      if (!file) {
        toast('Choose a file first.');
        return null;
      }
      formData.set('type', 'file');
      formData.set('file', file);
    } else if (style === 'audio') {
      if (!pickerRecordedBlob) {
        toast('Record something first.');
        return null;
      }
      formData.set('type', 'audio');
      formData.set('file', pickerRecordedBlob, 'recording.webm');
    } else if (style === 'contact') {
      const name = pickerContactName.value.trim();
      if (!name) {
        toast('Contact name is required.');
        return null;
      }
      formData.set('type', 'contact');
      formData.set('contactName', name);
      formData.set('contactPhone', pickerContactPhone.value);
      formData.set('contactEmail', pickerContactEmail.value);
    } else if (style === 'app') {
      const uri = pickerAppUri.value.trim();
      if (!uri) {
        toast('App link is required.');
        return null;
      }
      formData.set('type', 'app');
      formData.set('appUri', uri);
      if (appLabel) formData.set('appLabel', appLabel);
    }
    return formData;
  }

  // Photo: two paths to the same <input type=file>. The camera input carries
  // `capture`, the gallery one doesn't; picking from one clears the other so
  // only a single file is ever submitted.
  function showPhotoPick(fromInput) {
    const other = fromInput === pickerCameraInput ? pickerPhotoInput : pickerCameraInput;
    other.value = '';
    const f = fromInput.files[0];
    pickerPhotoStatus.textContent = f ? f.name : '';
  }
  pickerCameraBtn.addEventListener('click', () => pickerCameraInput.click());
  pickerGalleryBtn.addEventListener('click', () => pickerPhotoInput.click());
  pickerCameraInput.addEventListener('change', () => showPhotoPick(pickerCameraInput));
  pickerPhotoInput.addEventListener('change', () => showPhotoPick(pickerPhotoInput));

  pickerFileBtn.addEventListener('click', () => pickerFileInput.click());
  pickerFileInput.addEventListener('change', () => {
    const f = pickerFileInput.files[0];
    pickerFileStatus.textContent = f ? f.name : '';
  });

  pickerRecordBtn.addEventListener('click', async () => {
    if (pickerRecorder) {
      pickerRecorder.stop();
      return;
    }
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      toast('Audio recording is not supported in this browser.');
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast('Microphone permission was denied.');
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

  // `standalone: true` forces a plain, unlinked create even with a note
  // centered — the header's "new note" button is a fresh, independent note,
  // not a child of whatever you happen to be looking at (unlike the footer's
  // "add a linked note" button or clicking an empty grid cell, which are
  // both explicitly about the centered note). Attachment styles need a note to
  // hang off of the same way "Create & connect" does — reflect pendingLinkTarget.
  function syncPickerConnectUI() {
    pickerCreateBtn.textContent =
      pickerMode === 'attach' ? 'Save attachment' : pendingLinkTarget ? 'Create & connect' : 'Create';
  }

  const ATTACHABLE_TYPES = new Set(['image', 'audio', 'file', 'contact', 'app']);

  // Creates a new note (any style, optionally linked to whatever note it was
  // opened from) — mode 'attach' instead repurposes this same overlay to
  // replace or set *the currently open note's own* attachment (see the ➕ menu
  // in the note editor). Connecting to an *existing* note is a separate modal
  // now (openLinkModal) — this one only ever creates.
  function openPicker({ standalone = false, mode = 'create' } = {}) {
    pickerMode = mode;
    pendingLinkTarget = standalone ? null : currentId;
    pickerAttachTarget = mode === 'attach' ? currentId : null;
    pickerNewTitle.value = '';
    pickerPhotoInput.value = '';
    pickerCameraInput.value = '';
    pickerPhotoStatus.textContent = '';
    pickerFileInput.value = '';
    pickerFileStatus.textContent = '';
    pickerAppUri.value = '';
    pickerContactName.value = '';
    pickerContactPhone.value = '';
    pickerContactEmail.value = '';
    pickerRecordedBlob = null;
    pickerRecordStatus.textContent = '';
    pickerRecordBtn.textContent = '🎤 Start recording';

    pickerHasAttachment = mode === 'attach' && ATTACHABLE_TYPES.has(currentNote && currentNote.type);
    // Start on whatever this note already is, so "change attachment" opens
    // straight onto e.g. its photo, not defaulting back to the first style.
    pickerStyle = pickerHasAttachment ? currentNote.type : mode === 'attach' ? 'image' : 'text';
    pickerStyleRow
      .querySelectorAll('.picker-style-btn')
      .forEach((b) => b.classList.toggle('active', b.dataset.style === pickerStyle));

    pickerHeading.textContent = mode === 'attach' ? 'Change attachment' : 'Create a note';
    pickerCurrentAttachmentLabel.textContent = pickerHasAttachment
      ? `Current: ${TYPE_ICON[currentNote.type] || ''} ${currentNote.title}`.trim()
      : '';
    // Pre-fill contact/app fields from what's already there, so "change" starts
    // from the existing value instead of a blank form.
    if (pickerHasAttachment && currentNote.type === 'contact') {
      try {
        const c = JSON.parse(currentNote.attachment_path || '{}');
        pickerContactName.value = c.name || '';
        pickerContactPhone.value = c.phone || '';
        pickerContactEmail.value = c.email || '';
      } catch {
        /* stored payload isn't parseable JSON — start from blank fields */
      }
    } else if (pickerHasAttachment && currentNote.type === 'app') {
      pickerAppUri.value = currentNote.attachment_path || '';
    }

    syncPickerConnectUI();
    applyPickerStyleVisibility();

    pickerOverlay.classList.remove('hidden');
    if (mode !== 'attach') {
      // In 'attach' mode there's no title field; leave focus on the
      // already-selected style row instead.
      pickerNewTitle.focus();
      pickerNewTitle.select();
    }
  }

  function closePicker() {
    pickerOverlay.classList.add('hidden');
    pendingLinkTarget = null;
    pickerMode = 'create';
    pickerAttachTarget = null;
    if (pickerRecorder) pickerRecorder.stop();
  }

  pickerRemoveAttachmentBtn.addEventListener('click', async () => {
    if (!pickerAttachTarget) return;
    if (
      !(await confirmDialog('Remove this attachment? The note becomes a plain text note.', {
        confirmLabel: 'Remove',
      }))
    ) {
      return;
    }
    pickerRemoveAttachmentBtn.disabled = true;
    try {
      const note = await api.removeNoteAttachment(pickerAttachTarget);
      if (note.id === currentId) currentNote = note;
      closePicker();
      toast('Attachment removed.');
      await afterAttach();
    } catch (e) {
      if (e.httpStatus) toast(e.message || "Couldn't remove the attachment.");
    } finally {
      pickerRemoveAttachmentBtn.disabled = false;
    }
  });

  pickerCancelBtn.addEventListener('click', closePicker);
  pickerOverlay.addEventListener('click', (e) => {
    if (e.target === pickerOverlay) closePicker();
  });

  // --- Link modal: connects the currently open/centered note to an existing
  // one. Separate from the create modal above (openPicker) on purpose — that
  // one always makes something new; this one never does. ---
  let linkTarget = null;

  function openLinkModal() {
    linkTarget = currentId;
    linkSearch.value = '';
    linkResults.innerHTML = '';
    linkOverlay.classList.remove('hidden');
    linkSearch.focus();
  }
  function closeLinkModal() {
    linkOverlay.classList.add('hidden');
  }
  linkCancelBtn.addEventListener('click', closeLinkModal);
  linkOverlay.addEventListener('click', (e) => {
    if (e.target === linkOverlay) closeLinkModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !linkOverlay.classList.contains('hidden')) closeLinkModal();
  });

  let linkSearchSeq = 0;
  let linkSearchDebounce = null;

  function renderLinkResults(list) {
    const linkedIds = new Set(neighbors.map((n) => n.id));
    const matches = list.filter((n) => n.id !== linkTarget && !linkedIds.has(n.id)).slice(0, 8);

    linkResults.innerHTML = '';
    matches.forEach((n) => {
      const div = buildResultRow(n);
      div.addEventListener('click', async () => {
        await api.link(linkTarget, n.id);
        await loadNeighbors(currentId);
        await refreshColorData();
        closeLinkModal();
        await render();
        if (!noteOverlay.classList.contains('hidden')) renderNoteFullscreen();
      });
      linkResults.appendChild(div);
    });
  }

  linkSearch.addEventListener('input', () => {
    const q = linkSearch.value.trim();
    // Instant first paint from the local title cache…
    const ql = q.toLowerCase();
    renderLinkResults(
      q ? allNotesCache.filter((n) => (n.title || '').toLowerCase().includes(ql)) : allNotesCache
    );
    if (!q) {
      clearTimeout(linkSearchDebounce);
      return;
    }
    // …then replace with ranked full-text results (with snippets) from the
    // server, same as the header search.
    const seq = ++linkSearchSeq;
    clearTimeout(linkSearchDebounce);
    linkSearchDebounce = setTimeout(async () => {
      const rows = await api.searchNotes(q);
      if (seq === linkSearchSeq && linkSearch.value.trim() === q) renderLinkResults(rows);
    }, 180);
  });

  let pickerCreating = false;
  pickerCreateBtn.addEventListener('click', async () => {
    if (pickerCreating) return;

    if (pickerMode === 'attach') {
      const formData = collectAttachmentFormData(pickerStyle);
      if (!formData) return;
      pickerCreating = true;
      pickerCreateBtn.disabled = true;
      try {
        const note = await api.setNoteAttachment(pickerAttachTarget, formData);
        if (note.id === currentId) currentNote = note;
        closePicker();
        toast('Attachment saved.');
        await afterAttach();
      } catch (e) {
        if (e.httpStatus) toast(e.message || "Couldn't save the attachment.");
      } finally {
        pickerCreating = false;
        pickerCreateBtn.disabled = false;
      }
      return;
    }

    const title = pickerNewTitle.value.trim();
    if (pickerStyle === 'text') {
      if (!title) return;
    }
    const formData = pickerStyle === 'text' ? null : collectAttachmentFormData(pickerStyle, title);
    if (pickerStyle !== 'text' && !formData) return;

    pickerCreating = true;
    pickerCreateBtn.disabled = true;
    try {
      if (pickerStyle === 'text') {
        const note = await api.createNote(
          pendingLinkTarget ? { title, linkTo: pendingLinkTarget } : { title }
        );
        const hadTarget = !!pendingLinkTarget;
        closePicker();
        toast('Created.');
        if (hadTarget) {
          await afterAttach();
        } else {
          allNotesCache = await api.listNotes();
          renderPinbar();
          if (navigator.onLine && !isTmp(note.id)) {
            await refreshFromTabs(await api.openTab(note.id));
          } else {
            await goTo(note.id, 'new');
          }
        }
      } else {
        if (title) formData.set('title', title);
        await api.createAttachment(pendingLinkTarget, formData);
        closePicker();
        toast('Added.');
        await afterAttach();
      }
    } finally {
      pickerCreating = false;
      pickerCreateBtn.disabled = false;
    }
  });

  // Shared by the cold-boot check in init() and the listener below — a plain
  // numeric id, same as every `#${id}` link this app hands out itself (widget
  // taps, the agenda/digest, a shared/magic-link deep link); never a `tmp:`
  // offline id, so no need to consult idmap here.
  function hashNoteId() {
    const n = Number(location.hash.replace('#', ''));
    return n || null;
  }

  window.addEventListener('hashchange', () => {
    const hashId = hashNoteId();
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

  // --- Grid depth cycle button (expands each neighbor cell into its own 3x3) ---
  // Same icon always; lights up like the palette toggle when depth is raised.
  function paintDepthBtn() {
    depthCycleBtn.classList.toggle('active', gridDepth > GRID_DEPTH_MIN);
    depthCycleBtn.title = `Nested grid depth: ${gridDepth}`;
  }
  paintDepthBtn();

  async function applyGridDepth() {
    paintDepthBtn();
    localStorage.setItem('nico-notes-grid-depth', String(gridDepth));
    await render();
  }

  depthCycleBtn.addEventListener('click', async () => {
    gridDepth = gridDepth >= GRID_DEPTH_MAX ? GRID_DEPTH_MIN : gridDepth + 1;
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
    // Each mode gets its own colour (off = transparent) so the button itself
    // shows which one is active, not just its hover tooltip.
    colorModeBtn.classList.toggle('mode-path', colorMode === 'path');
    colorModeBtn.classList.toggle('mode-note', colorMode === 'note');
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
    h3.textContent = 'Orphans';
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

  // --- Map overlay: every located note as a pin on OpenStreetMap ---
  const mapOverlay = document.getElementById('map-overlay');
  const mapOverlayClose = document.getElementById('map-overlay-close');
  const mapStatusEl = document.getElementById('map-status');
  const mapModesEl = document.getElementById('map-modes');
  const mapEl = document.getElementById('map');

  let leafletMap = null;
  let mapMarkers = null;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // Leaflet writes fillColor as an SVG fill attribute, so resolve to a concrete
  // rgb()/hsl() string here rather than a CSS var or color-mix().
  function lerpHex(a, b, t) {
    const pa = a.match(/\w\w/g).map((h) => parseInt(h, 16));
    const pb = b.match(/\w\w/g).map((h) => parseInt(h, 16));
    const m = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
    return `rgb(${m[0]}, ${m[1]}, ${m[2]})`;
  }

  // Solid pin colour for the active colour mode (map has no "path" mode).
  function mapColorFor(note) {
    if (colorMode === 'note') {
      return lerpHex('4f6df5', 'c9821a', noteHeat[note.id] || 0);
    }
    return '#4f6df5';
  }

  async function drawMapMarkers() {
    const geo = allNotesCache.filter(
      (n) => Number.isFinite(n.lat) && Number.isFinite(n.lon)
    );
    mapStatusEl.textContent =
      `${geo.length} mapped · ${allNotesCache.length - geo.length} without location`;

    mapMarkers.clearLayers();

    // Notes captured at (nearly) the same spot stack invisibly — one pin hides
    // the rest. Bucket by a lat/lon grid and draw a stack as a single counted
    // marker whose popup lists every note there. The grid cell is loose and
    // zoom-aware: ~40 screen-pixels wide but never under 50 m, so zooming in
    // shrinks the buckets and stacks split back into individual pins.
    const groupM = Math.max(50, 40 * mapMetersPerPixel());
    const latCellDeg = groupM / 111320;

    const noteLink = (note) => {
      const icon = TYPE_ICON[note.type] ? `${TYPE_ICON[note.type]} ` : '';
      return (
        `<a href="#${note.id}" data-note-id="${note.id}">` +
        `${icon}${escapeHtml(note.title || 'Untitled')}</a>`
      );
    };

    const groups = new Map();
    geo.forEach((note) => {
      const lonCellDeg =
        latCellDeg / Math.max(Math.cos((note.lat * Math.PI) / 180), 1e-6);
      const key =
        Math.round(note.lat / latCellDeg) + ':' + Math.round(note.lon / lonCellDeg);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(note);
    });

    groups.forEach((notes) => {
      const lead = notes[0];
      if (notes.length === 1) {
        const icon = TYPE_ICON[lead.type] ? `${TYPE_ICON[lead.type]} ` : '';
        L.circleMarker([lead.lat, lead.lon], {
          radius: 8,
          color: '#fff',
          weight: 2,
          fillColor: mapColorFor(lead),
          fillOpacity: 0.95,
        })
          .bindPopup(
            `<b>${icon}${escapeHtml(lead.title || 'Untitled')}</b><br />` +
              `<a href="#${lead.id}" data-note-id="${lead.id}">Open note</a>`
          )
          .addTo(mapMarkers);
        return;
      }

      // Sit the counted marker at the bucket's centroid.
      const lat = notes.reduce((s, n) => s + n.lat, 0) / notes.length;
      const lon = notes.reduce((s, n) => s + n.lon, 0) / notes.length;
      L.marker([lat, lon], {
        icon: L.divIcon({
          className: 'map-stack-icon',
          html: `<span style="background:${mapColorFor(lead)}">${notes.length}</span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
          popupAnchor: [0, -14],
        }),
      })
        .bindPopup(
          `<b>${notes.length} notes here</b>` +
            `<ul class="map-stack-list">` +
            notes.map((n) => `<li>${noteLink(n)}</li>`).join('') +
            `</ul>`
        )
        .addTo(mapMarkers);
    });

    drawReminderMarkers(latCellDeg);
  }

  // Location reminders on the map: an amber radius circle per reminder plus a
  // 🔔 marker, bucketed like note pins so several at one spot become one marker
  // whose popup lists them.
  function drawReminderMarkers(latCellDeg) {
    const rems = (alarms || []).filter(
      (a) => a.kind === 'location' && Number.isFinite(a.lat) && Number.isFinite(a.lon)
    );
    if (!rems.length) return;

    const groups = new Map();
    rems.forEach((r) => {
      const lonCellDeg = latCellDeg / Math.max(Math.cos((r.lat * Math.PI) / 180), 1e-6);
      const key = Math.round(r.lat / latCellDeg) + ':' + Math.round(r.lon / lonCellDeg);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });

    groups.forEach((list) => {
      list.forEach((r) => {
        L.circle([r.lat, r.lon], {
          radius: r.radiusM || 250,
          color: '#e8590c',
          weight: 1,
          fillColor: '#e8590c',
          fillOpacity: 0.12,
        }).addTo(mapMarkers);
      });
      const lat = list.reduce((s, r) => s + r.lat, 0) / list.length;
      const lon = list.reduce((s, r) => s + r.lon, 0) / list.length;
      const popup =
        list.length === 1
          ? `<b>🔔 ${escapeHtml(list[0].title || 'Untitled')}</b><br />` +
            `Reminds when you arrive · ${list[0].radiusM || 250} m<br />` +
            `<a href="#${list[0].noteId}" data-note-id="${list[0].noteId}">Open note</a>`
          : `<b>${list.length} arrival reminders here</b>` +
            `<ul class="map-stack-list">` +
            list
              .map(
                (r) =>
                  `<li><a href="#${r.noteId}" data-note-id="${r.noteId}">` +
                  `${escapeHtml(r.title || 'Untitled')}</a> · ${r.radiusM || 250} m</li>`
              )
              .join('') +
            `</ul>`;
      L.marker([lat, lon], {
        icon: L.divIcon({
          className: 'map-rem-icon',
          html: `<span>${list.length === 1 ? '🔔' : list.length}</span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
          popupAnchor: [0, -14],
        }),
      })
        .bindPopup(popup)
        .addTo(mapMarkers);
    });
  }

  // Metres per screen pixel at the map's current zoom and centre latitude.
  function mapMetersPerPixel() {
    const lat = leafletMap.getCenter().lat;
    return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** leafletMap.getZoom();
  }

  // Initial view when the map opens — fit all located notes, or fall back to the
  // viewer's own position (then the whole world) when there are none. Kept out
  // of drawMapMarkers so re-bucketing on zoom doesn't yank the view around.
  async function centerMapOnNotes() {
    const pts = allNotesCache
      .filter((n) => Number.isFinite(n.lat) && Number.isFinite(n.lon))
      .map((n) => [n.lat, n.lon]);
    (alarms || []).forEach((a) => {
      if (a.kind === 'location' && Number.isFinite(a.lat) && Number.isFinite(a.lon)) {
        pts.push([a.lat, a.lon]);
      }
    });
    if (pts.length > 0) {
      leafletMap.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
      return;
    }
    const here = await getLocation();
    if (here) {
      leafletMap.setView([here.lat, here.lon], 13);
      mapStatusEl.textContent = 'No located notes yet — showing your location';
    } else {
      leafletMap.setView([20, 0], 2);
      mapStatusEl.textContent = 'No located notes yet';
    }
  }

  function syncMapModes() {
    mapModesEl.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === colorMode);
    });
  }

  // While set, the next map background click is captured as a location pick
  // (for the alarm editor's "Pick on map") instead of doing nothing.
  let mapPick = null;

  async function openMap(opts = {}) {
    mapOverlay.classList.remove('hidden');
    mapPick = opts.pick ? { onPick: opts.onPick || null, onClose: opts.onClose || null } : null;
    mapPickBanner.classList.toggle('hidden', !mapPick);

    if (!leafletMap) {
      leafletMap = L.map('map');
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(leafletMap);
      leafletMap.setView([20, 0], 2);
      mapMarkers = L.layerGroup().addTo(leafletMap);

      // Re-bucket the stacks for the new zoom (fires once per zoom gesture,
      // after the animation settles).
      leafletMap.on('zoomend', () => { drawMapMarkers(); });

      // Pick mode: a tap on the map hands its coords back and closes.
      leafletMap.on('click', (e) => {
        if (!mapPick) return;
        const cb = mapPick.onPick;
        if (cb) cb({ lat: e.latlng.lat, lon: e.latlng.lng });
        closeMap();
      });

      mapEl.addEventListener('click', (e) => {
        const a = e.target.closest('a[data-note-id]');
        if (!a) return;
        e.preventDefault();
        closeMap();
        goTo(Number(a.dataset.noteId), 'map');
      });
    }

    // The container had zero size while hidden; Leaflet must re-measure it.
    requestAnimationFrame(() => leafletMap.invalidateSize());

    syncMapModes();
    await refreshColorData();
    await drawMapMarkers();
    await centerMapOnNotes();
  }

  function closeMap() {
    mapOverlay.classList.add('hidden');
    mapPickBanner.classList.add('hidden');
    const onClose = mapPick && mapPick.onClose;
    mapPick = null;
    if (onClose) onClose();
  }

  // Full-size image viewer: an in-app overlay (with its own close button)
  // instead of `target="_blank"`, which — in an installed/standalone PWA —
  // can open a bare window with no back/close affordance at all.
  function openImageLightbox(url, alt) {
    imageOverlayImg.src = url;
    imageOverlayImg.alt = alt || '';
    imageOverlay.classList.remove('hidden');
  }

  function closeImageLightbox() {
    imageOverlay.classList.add('hidden');
    // Not `src = ''` — that re-requests the current page in some browsers.
    imageOverlayImg.removeAttribute('src');
  }

  imageOverlayClose.addEventListener('click', closeImageLightbox);
  imageOverlay.addEventListener('click', (e) => {
    if (e.target === imageOverlay) closeImageLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !imageOverlay.classList.contains('hidden')) closeImageLightbox();
  });

  mapBtn.addEventListener('click', () => openMap());
  mapOverlayClose.addEventListener('click', closeMap);
  mapOverlay.addEventListener('click', (e) => {
    if (e.target === mapOverlay) closeMap();
  });
  mapModesEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    colorMode = btn.dataset.mode;
    applyColorModeButton();
    syncMapModes();
    await refreshColorData();
    await drawMapMarkers();
    if (currentId) await render();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !mapOverlay.classList.contains('hidden')) closeMap();
  });

  insightsBtn.addEventListener('click', openInsights);
  insightsClose.addEventListener('click', () => insightsOverlay.classList.add('hidden'));
  insightsOverlay.addEventListener('click', (e) => {
    if (e.target === insightsOverlay) insightsOverlay.classList.add('hidden');
  });

  // --- History / undo ---------------------------------------------------------
  const HISTORY_ICON = {
    link: '🔗',
    unlink: '✂️',
    rehome: '↔️',
    create: '✨',
    update: '✏️',
    status: '✅',
    pin: '📌',
    unpin: '📌',
  };

  function closeHistory() {
    historyOverlay.classList.add('hidden');
  }

  // Full app-state resync after an undo — the reversed op may have added/removed
  // a link, flipped a status, or soft-deleted the centered note, so rebuild from
  // the tab list (which drops tabs whose note is now deleted) and, if the
  // fullscreen editor is open, refresh or dismiss it.
  async function refreshAfterUndo() {
    const editingId = noteOverlay.classList.contains('hidden') ? null : currentId;
    allNotesCache = await api.listNotes();
    const tabsList = await api.listTabs();
    await refreshFromTabs(tabsList);
    if (editingId != null) {
      const n = currentId === editingId ? await api.getNote(currentId) : null;
      if (n && n.status !== 'deleted') {
        currentNote = n;
        renderNoteFullscreen();
      } else {
        closeNoteFullscreen();
      }
    }
  }

  async function openHistory() {
    historyBody.innerHTML = 'Loading…';
    historyOverlay.classList.remove('hidden');
    const rows = await api.getHistory();
    historyBody.innerHTML = '';

    if (!rows.length) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = 'Nothing to undo yet.';
      historyBody.appendChild(p);
      return;
    }

    rows.forEach((row) => {
      const item = document.createElement('div');
      item.className =
        'history-item' + (row.undone_at ? ' undone' : '') + (row.stale ? ' stale' : '');

      const icon = document.createElement('div');
      icon.className = 'history-icon';
      icon.textContent = HISTORY_ICON[row.action] || '•';

      const info = document.createElement('div');
      info.className = 'history-info';
      const summary = document.createElement('div');
      summary.className = 'history-summary';
      summary.textContent = row.summary;
      const undone = Boolean(row.undone_at);

      const when = document.createElement('div');
      when.className = 'history-when';
      when.textContent = new Date(row.created_at).toLocaleString();
      if (undone) when.textContent += row.stale ? ' · undone · can’t redo' : ' · undone';
      else if (row.stale) when.textContent += ' · already reverted elsewhere';
      info.appendChild(summary);
      info.appendChild(when);

      const btn = document.createElement('button');
      btn.className = 'history-undo';
      btn.textContent = undone ? '↻' : '↩';
      btn.title = undone ? 'Redo this' : 'Undo this';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const res = undone ? await api.redoHistory(row.id) : await api.undoHistory(row.id);
        if (!res.ok) {
          when.textContent = res.error || (undone ? 'Could not redo' : 'Could not undo');
          when.classList.add('history-error');
          return;
        }
        await refreshAfterUndo();
        await openHistory();
      });

      item.appendChild(icon);
      item.appendChild(info);
      item.appendChild(btn);
      historyBody.appendChild(item);
    });
  }

  historyBtn.addEventListener('click', openHistory);
  historyClose.addEventListener('click', closeHistory);
  historyOverlay.addEventListener('click', (e) => {
    if (e.target === historyOverlay) closeHistory();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !historyOverlay.classList.contains('hidden')) closeHistory();
  });

  // --- Login (passwordless magic link) ---
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  function showLogin() {
    loginError.textContent = '';
    loginError.style.color = 'var(--danger)';
    loginOverlay.classList.remove('hidden');
    loginEmail.focus();
    const params = new URLSearchParams(location.search);
    if (params.get('login') === 'invalid') {
      loginError.textContent = 'That login link was invalid or expired — request a new one.';
    }
  }

  let linkSending = false;
  async function doLogin() {
    if (linkSending) return;
    const email = loginEmail.value.trim();
    if (!EMAIL_RE.test(email)) {
      loginError.style.color = 'var(--danger)';
      loginError.textContent = 'Enter a valid email address.';
      return;
    }
    linkSending = true;
    loginBtn.disabled = true;
    loginError.textContent = '';
    try {
      await api.requestLoginLink(email);
    } catch {
      /* uniform outcome regardless */
    }
    linkSending = false;
    loginBtn.disabled = false;
    loginError.style.color = 'var(--muted)';
    loginError.textContent = `If ${email} has an account, a login link is on its way. Check your inbox.`;
  }

  loginBtn.addEventListener('click', doLogin);
  loginEmail.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
  });

  function renderAccountWidgetUrl() {
    accountWidgetUrl.value = widgetToken
      ? `${location.origin}/api/widget?token=${widgetToken}`
      : '(unavailable — reload the page)';
  }

  function closeAccount() {
    accountOverlay.classList.add('hidden');
  }

  // Settings section list: clicking a nav item swaps the visible panel.
  function showSettingsSection(name) {
    settingsNav.querySelectorAll('.settings-nav-item').forEach((b) => {
      b.classList.toggle('active', b.dataset.section === name);
    });
    accountOverlay.querySelectorAll('.settings-section').forEach((s) => {
      s.classList.toggle('active', s.dataset.section === name);
    });
  }
  settingsNav.addEventListener('click', (e) => {
    const btn = e.target.closest('.settings-nav-item');
    if (btn) showSettingsSection(btn.dataset.section);
  });

  // Header-row toggles (the "Header rows" section).
  const barToggleEls = {
    tabs: document.getElementById('bar-toggle-tabs'),
    pins: document.getElementById('bar-toggle-pins'),
    latest: document.getElementById('bar-toggle-latest'),
    todos: document.getElementById('bar-toggle-todos'),
    alarms: document.getElementById('bar-toggle-alarms'),
  };
  Object.entries(barToggleEls).forEach(([key, el]) => {
    el.addEventListener('change', () => setBarPref(key, el.checked));
  });
  function syncBarToggles() {
    Object.entries(barToggleEls).forEach(([key, el]) => {
      el.checked = barPrefs[key];
    });
  }

  accountBtn.addEventListener('click', () => {
    if (!currentUser) {
      showLogin();
      return;
    }
    accountEmail.textContent = `Signed in as ${currentUser.email}`;
    renderAccountWidgetUrl();
    syncBarToggles();
    showSettingsSection('account');
    loadDigestPrefs();
    renderSessions();
    accountOverlay.classList.remove('hidden');
  });

  // --- Signed-in devices (Account section) ------------------------------
  function deviceLabel(ua) {
    if (!ua) return 'Unknown device';
    const os =
      /Android/i.test(ua) ? 'Android' :
      /iPhone/i.test(ua) ? 'iPhone' :
      /iPad/i.test(ua) ? 'iPad' :
      /Macintosh|Mac OS X/i.test(ua) ? 'Mac' :
      /Windows/i.test(ua) ? 'Windows' :
      /Linux/i.test(ua) ? 'Linux' : 'Device';
    const browser =
      /Edg\//i.test(ua) ? 'Edge' :
      /OPR\/|Opera/i.test(ua) ? 'Opera' :
      /Firefox\//i.test(ua) ? 'Firefox' :
      /Chrome\//i.test(ua) ? 'Chrome' :
      /Safari\//i.test(ua) ? 'Safari' : '';
    return browser ? `${browser} on ${os}` : os;
  }

  function relTime(iso) {
    const then = new Date(iso).getTime();
    if (!then) return '';
    const s = Math.round((Date.now() - then) / 1000);
    if (s < 90) return 'just now';
    const m = Math.round(s / 60);
    if (m < 90) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 36) return `${h} h ago`;
    return `${Math.round(h / 24)} d ago`;
  }

  async function renderSessions() {
    sessionList.textContent = 'Loading…';
    const { sessions: rows } = await api.listSessions();
    sessionList.innerHTML = '';
    if (!rows.length) {
      sessionList.textContent = 'No other sessions.';
      sessionRevokeOthersBtn.disabled = true;
      return;
    }
    sessionRevokeOthersBtn.disabled = rows.length < 2;
    for (const s of rows) {
      const row = document.createElement('div');
      row.className = 'session-row';
      const meta = document.createElement('div');
      meta.className = 'session-meta';
      const name = document.createElement('span');
      name.className = 'session-name';
      name.textContent = deviceLabel(s.ua) + (s.current ? ' — this device' : '');
      const sub = document.createElement('span');
      sub.className = 'session-sub';
      sub.textContent = `active ${relTime(s.last_seen_at)}`;
      meta.append(name, sub);
      row.append(meta);
      if (!s.current) {
        const btn = document.createElement('button');
        btn.className = 'secondary';
        btn.textContent = 'Sign out';
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          await api.revokeSession(s.sid);
          renderSessions();
        });
        row.append(btn);
      }
      sessionList.append(row);
    }
  }

  sessionRevokeOthersBtn.addEventListener('click', async () => {
    if (!(await confirmDialog('Sign out every other device? They will need to sign in again.', { confirmLabel: 'Sign out others' }))) return;
    sessionRevokeOthersBtn.disabled = true;
    await api.revokeOtherSessions();
    toast('Signed out all other devices.');
    renderSessions();
  });

  accountCloseBtn.addEventListener('click', closeAccount);
  accountOverlay.addEventListener('click', (e) => {
    if (e.target === accountOverlay) closeAccount();
  });

  accountCopyBtn.addEventListener('click', async () => {
    if (!widgetToken) return;
    try {
      await navigator.clipboard.writeText(accountWidgetUrl.value);
      toast('Widget URL copied');
    } catch {
      accountWidgetUrl.focus();
      accountWidgetUrl.select();
      toast('Copy the selected URL');
    }
  });

  accountSwitchBtn.addEventListener('click', async () => {
    if (!(await confirmDialog('Sign out and sign in as someone else?', { confirmLabel: 'Sign out' }))) return;
    await api.logout();
    try {
      localStorage.removeItem(Themes.BOOT_KEY); // don't pre-paint this account's theme for the next sign-in
    } catch {
      /* storage blocked */
    }
    location.reload();
  });

  exportBtn.addEventListener('click', () => {
    // Same-origin GET; the response is Content-Disposition: attachment so the
    // browser downloads it without navigating away from the app.
    exportBtn.disabled = true;
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = '/api/account/export';
    document.body.appendChild(iframe);
    toast('Preparing your export…');
    setTimeout(() => {
      iframe.remove();
      exportBtn.disabled = false;
    }, 8000);
  });

  restoreBtn.addEventListener('click', () => restoreFile.click());
  restoreFile.addEventListener('change', async () => {
    const file = restoreFile.files[0];
    if (!file) return;
    restoreFile.value = '';
    const ok = await confirmDialog(
      `Restore from "${file.name}"? This replaces every note, link, tab, reminder and attachment in this account with the backup. What's here now is deleted.`,
      { confirmLabel: 'Replace everything', danger: true }
    );
    if (!ok) return;
    restoreBtn.disabled = true;
    restoreStatus.textContent = 'Restoring…';
    try {
      const fd = new FormData();
      fd.set('file', file);
      const res = await fetch('/api/account/import', { method: 'POST', body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        restoreStatus.textContent = body.error || 'Restore failed.';
        return;
      }
      const r = body.restored || {};
      restoreStatus.textContent = `Restored ${r.notes || 0} notes, ${r.links || 0} links, ${r.reminders || 0} reminders, ${r.attachments || 0} files. Reloading…`;
      setTimeout(() => location.reload(), 1200);
    } catch {
      restoreStatus.textContent = 'Restore failed.';
    } finally {
      restoreBtn.disabled = false;
    }
  });

  accountDeleteBtn.addEventListener('click', async () => {
    const ok = await confirmDialog(
      'Delete your account and every note, link, reminder and file in it? We’ll email you a link to confirm. This cannot be undone.',
      { confirmLabel: 'Email me the link', danger: true }
    );
    if (!ok) return;
    accountDeleteBtn.disabled = true;
    try {
      const res = await fetch('/api/account/delete-request', { method: 'POST' });
      if (res.ok) {
        toast('Check your email for a link to confirm deletion.');
      } else {
        toast('Could not start account deletion.');
      }
    } catch {
      toast('Could not start account deletion.');
    } finally {
      accountDeleteBtn.disabled = false;
    }
  });

  accountResetWidgetBtn.addEventListener('click', async () => {
    if (
      !(await confirmDialog('Reset the widget feed URL? The current URL will stop working.', {
        confirmLabel: 'Reset',
        danger: true,
      }))
    )
      return;
    const res = await api.rotateWidgetToken();
    widgetToken = res.widgetToken || widgetToken;
    renderAccountWidgetUrl();
    toast('New widget URL generated');
  });

  // --- Import (in the account overlay) ------------------------------------
  let importBusy = false;

  async function pollImport(jobId) {
    importStatus.textContent = 'Importing…';
    for (;;) {
      await new Promise((r) => setTimeout(r, 1500));
      let job;
      try {
        job = await fetch(`/api/import/${jobId}`).then((r) => (r.ok ? r.json() : null));
      } catch {
        continue;
      }
      if (!job) continue;
      if (job.status === 'error') {
        importStatus.textContent = `Import failed: ${job.error || 'unknown error'}`;
        return;
      }
      if (job.status === 'done') {
        const t = job.totals || {};
        const bits = [`${t.notes || 0} notes`];
        if (t.updated) bits.push(`${t.updated} updated`);
        if (t.links) bits.push(`${t.links} links`);
        if (t.hubs) bits.push(`${t.hubs} hubs`);
        if (t.images) bits.push(`${t.images} images`);
        if (t.skipped) bits.push(`${t.skipped} skipped`);
        if (t.unresolvedCount) bits.push(`${t.unresolvedCount} dead links`);
        importStatus.textContent = `Imported ${bits.join(', ')}.`;
        allNotesCache = await api.listNotes();
        renderPinbar();
        return;
      }
    }
  }

  importRunBtn.addEventListener('click', async () => {
    if (importBusy) return;
    const file = importFile.files[0];
    if (!file) {
      importStatus.textContent = 'Choose a .zip or .md file first.';
      return;
    }
    importBusy = true;
    importRunBtn.disabled = true;
    importStatus.textContent = 'Uploading…';
    try {
      const fd = new FormData();
      fd.set('format', importFormat.value);
      fd.set('file', file);
      const res = await fetch('/api/import', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `upload failed (${res.status})`);
      await pollImport(data.jobId);
    } catch (e) {
      importStatus.textContent = `Import failed: ${e.message}`;
    } finally {
      importBusy = false;
      importRunBtn.disabled = false;
    }
  });

  // --- Digest settings (in the account overlay) -----------------------------
  const localTzName = () => Intl.DateTimeFormat().resolvedOptions().timeZone || '';

  function fillDigestHours() {
    if (digestHour.options.length) return;
    for (let h = 0; h < 24; h += 1) {
      const o = document.createElement('option');
      o.value = String(h);
      o.textContent = `${String(h).padStart(2, '0')}:00`;
      digestHour.appendChild(o);
    }
  }

  function renderDigestStatus(p) {
    if (!p || p.cadence === 'off') {
      digestStatus.textContent = 'Off — no scheduled digest.';
      return;
    }
    const when = p.cadence === 'weekly' ? 'Mondays' : 'every day';
    const chan = { push: 'push', email: 'email', both: 'push + email' }[p.channel] || p.channel;
    let s = `On — ${when} at ${String(p.hour).padStart(2, '0')}:00 ${p.tz || localTzName() || 'UTC'}, via ${chan}.`;
    if (p.channel !== 'push' && p.mailConfigured === false) {
      s += ' ⚠️ email is not configured on this server.';
    }
    if (p.lastSentAt) s += ` Last sent ${new Date(p.lastSentAt).toLocaleString()}.`;
    digestStatus.textContent = s;
  }

  async function loadDigestPrefs() {
    fillDigestHours();
    const p = await api.getDigestPrefs();
    if (!p) {
      digestStatus.textContent = '';
      return;
    }
    digestCadence.value = p.cadence || 'off';
    digestHour.value = String(p.hour == null ? 8 : p.hour);
    digestChannel.value = p.channel || 'push';
    renderDigestStatus(p);
  }

  async function saveDigestPrefs() {
    const body = {
      cadence: digestCadence.value,
      hour: Number(digestHour.value),
      channel: digestChannel.value,
      tz: localTzName(),
    };
    const p = await api.saveDigestPrefs(body);
    if (!p) {
      toast('Could not save digest settings');
      return;
    }
    renderDigestStatus(p);
    if (body.cadence !== 'off' && body.channel !== 'email') enableAlarmDelivery();
    toast('Digest settings saved');
  }

  [digestCadence, digestHour, digestChannel].forEach((el) =>
    el.addEventListener('change', saveDigestPrefs)
  );

  digestTestBtn.addEventListener('click', async () => {
    digestTestBtn.disabled = true;
    try {
      const r = await api.sendTestDigest(digestCadence.value === 'weekly' ? 'weekly' : 'daily');
      if (!r.ok) {
        toast(r.error || 'Could not send a test digest');
      } else if (r.errors && r.errors.length) {
        toast(`Sent with problems: ${r.errors.join('; ')}`);
      } else {
        const via = Object.entries(r.sent || {})
          .filter(([, v]) => v)
          .map(([k]) => k)
          .join(' + ');
        toast(via ? `Test digest sent via ${via}` : 'Nothing was sent');
      }
    } finally {
      digestTestBtn.disabled = false;
    }
  });

  init();
})();
