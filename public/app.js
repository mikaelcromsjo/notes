(() => {
  const grid = document.getElementById('grid');
  const tabbar = document.getElementById('tabbar');
  const pinbar = document.getElementById('pinbar');
  const todobar = document.getElementById('todobar');
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  const newNoteBtn = document.getElementById('new-note-btn');

  const colorModeBtn = document.getElementById('color-mode-btn');
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

  const alarmbar = document.getElementById('alarmbar');
  const alarmOverlay = document.getElementById('alarm-overlay');
  const alarmTimeInput = document.getElementById('alarm-time-input');
  const alarmDaysRow = document.getElementById('alarm-days-row');
  const alarmDateWrap = document.getElementById('alarm-date-wrap');
  const alarmDateInput = document.getElementById('alarm-date-input');
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

  const TYPE_ICON = { image: '🖼️', audio: '🎤', contact: '👤', app: '🔗' };

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
    allLinks = (data && data.links) || [];
    linkCount = (data && data.linkCount) || 0;
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
    const t = mostRecentAlarmTrigger(a, ref);
    if (!t) return false;
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

  const api = {
    listNotes: () => fetch('/api/notes').then((r) => r.json()),
    searchNotes: (q) =>
      fetch(`/api/notes/search?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    rotateWidgetToken: () =>
      fetch('/api/session/widget-token', { method: 'POST' }).then((r) => r.json()),
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
    link: (a, b, rehomeFrom) =>
      fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rehomeFrom ? { a, b, rehomeFrom } : { a, b }),
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
    requestLoginLink: (email) =>
      fetch('/api/auth/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      }),
    logout: () => fetch('/api/session', { method: 'DELETE' }),
    getNoteHeat: () => fetch('/api/stats/note-heat').then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    getClusters: () => fetch('/api/stats/clusters').then((r) => (r.ok ? r.json() : { clusters: {} })).catch(() => ({ clusters: {} })),
    getInsights: () => fetch('/api/stats/insights').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    getHistory: () => fetch('/api/history').then((r) => (r.ok ? r.json() : [])).catch(() => []),
    undoHistory: (id) =>
      fetch(`/api/history/${id}/undo`, { method: 'POST' })
        .then((r) => r.json().then((j) => ({ ok: r.ok, ...j })))
        .catch(() => ({ ok: false, error: 'network error' })),
    redoHistory: (id) =>
      fetch(`/api/history/${id}/redo`, { method: 'POST' })
        .then((r) => r.json().then((j) => ({ ok: r.ok, ...j })))
        .catch(() => ({ ok: false, error: 'network error' })),
    listAlarms: () => fetch('/api/alarms').then((r) => (r.ok ? r.json() : [])).catch(() => []),
    createAlarm: (data) =>
      fetch('/api/alarms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    updateAlarm: (id, data) =>
      fetch(`/api/alarms/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    removeAlarm: (id) => fetch(`/api/alarms/${id}`, { method: 'DELETE' }),
    ackAlarm: (id, nextAt) =>
      fetch(`/api/alarms/${id}/ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ at: new Date().toISOString(), nextAt: nextAt || null }),
      }),
    snoozeAlarm: (id, until) =>
      fetch(`/api/alarms/${id}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ until }),
      }),
    scheduleAlarm: (id, nextAt) =>
      fetch(`/api/alarms/${id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextAt: nextAt || null }),
      }).catch(() => {}),
    agenda: () => {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      return fetch(`/api/agenda${tz ? `?tz=${encodeURIComponent(tz)}` : ''}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
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

  // The translucent tint for a note under the active colour mode, or null.
  function tintFor(note) {
    if (colorMode === 'off' || !note) return null;
    if (colorMode === 'path') {
      const p = typeof note.p === 'number' ? note.p : 0;
      if (p > 0) return `color-mix(in srgb, var(--accent) ${Math.round(p * 55)}%, transparent)`;
    } else if (colorMode === 'note') {
      const h = noteHeat[note.id] || 0;
      if (h > 0) return `color-mix(in srgb, var(--pin) ${Math.round(h * 55)}%, transparent)`;
    } else if (colorMode === 'cluster') {
      const cid = clusters[note.id];
      if (cid != null) return `hsl(${clusterHues[cid] || 0} 70% 88% / 0.75)`;
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
    widgetToken = sess.widgetToken || null;
    accountBtn.title = `Signed in as ${currentUser.email}`;
    allNotesCache = await api.listNotes();
    const tabsList = await api.listTabs();
    await refreshFromTabs(tabsList);
    await checkAlarms();
    ensurePushSubscription();
    setInterval(() => checkAlarms(), 30000);
    // Re-check the moment the app is foregrounded again — a backgrounded PWA's
    // timers are throttled, so an alarm that came due while away rings now.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) checkAlarms();
    });
    handleDeepLink();
  }

  // A digest notification / its "view online" page can open the app straight to
  // a view: /?d=agenda or /?d=insights. Consume the param so a reload is clean.
  function handleDeepLink() {
    const d = new URLSearchParams(location.search).get('d');
    if (d !== 'agenda' && d !== 'insights') return;
    const url = new URL(location.href);
    url.searchParams.delete('d');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
    if (d === 'agenda') openAgenda();
    else openInsights();
  }

  function renderEmptyState() {
    grid.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'empty-state';
    div.innerHTML = `<button id="first-note-btn">Create your first note</button>`;
    grid.appendChild(div);
    document.getElementById('first-note-btn').addEventListener('click', () => openPicker());
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

    const status = document.createElement('span');
    status.className = 'save-status';
    status.textContent = '';

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
      if (previewing) paintPreview();
      previewDiv.hidden = !previewing;
      content.hidden = previewing;
      previewBtn.textContent = previewing ? '✏️ Edit' : '👁 Preview';
    });

    frag.appendChild(title);
    frag.appendChild(previewBtn);
    frag.appendChild(content);
    frag.appendChild(previewDiv);

    if (linkCount > LINK_LIST_THRESHOLD) frag.appendChild(buildLinksPanel());

    // Center-cell status button — a tri-state cycle over notes.status:
    //   active (no marker) → todo (an open thing to do) → done → active.
    // 'todo' and 'done' both surface in the agenda + digest; only 'done' dims.
    const statusStep = { active: 'todo', todo: 'done', done: 'active' };
    const statusFace = {
      active: { icon: '○', title: 'Mark as to-do', cls: '' },
      todo: { icon: '◑', title: 'Mark as done', cls: ' todo' },
      done: { icon: '✅', title: 'Clear status', cls: ' active' },
    };
    const curStatus = statusStep[currentNote.status] ? currentNote.status : 'active';

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
    doneBtn.title = statusFace[curStatus].title;
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
    addBtn.title = 'Add a linked note';
    addBtn.addEventListener('click', () => openPicker());

    actions.appendChild(addBtn);
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

    doneBtn.addEventListener('click', async () => {
      currentNote = await api.setStatus(currentId, statusStep[curStatus]);
      allNotesCache = await api.listNotes();
      renderPinbar();
      await onRerender();
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

    const preview = buildAttachmentPreview(currentNote);
    if (preview) cell.appendChild(preview);

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
    } else {
      content.textContent = 'Write here…';
    }

    cell.appendChild(title);
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
      const focus = e.target.closest('.center-title')
        ? 'title'
        : e.target.closest('.center-content')
        ? 'content'
        : null;
      openNoteFullscreen(focus);
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
      cell.addEventListener('click', () => goTo(neighbor.id, navVia));
    }

    return cell;
  }

  // Fullscreen editor for the current center note (title/content, meta,
  // pin/delete/done). `focus` optionally puts the caret in 'title' or 'content'.
  function renderNoteFullscreen(focus) {
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

    if (focus === 'title' || focus === 'content') {
      const el = inner.querySelector(focus === 'title' ? '.center-title' : '.center-content');
      if (el) {
        el.focus();
        const end = el.value.length;
        try { el.setSelectionRange(end, end); } catch {}
      }
    }
  }

  async function openNoteFullscreen(focus) {
    if (!currentId) return;
    currentNote = await api.getNote(currentId);
    if (!currentNote) return;
    renderNoteFullscreen(focus);
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
    renderAlarmbar();
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

    // The to-do bar tracks the same note cache, so keep it in lockstep.
    renderTodobar();
  }

  // --- To-do bar: a row (like the pin bar) of every note flagged status:'todo' ---
  function renderTodobar() {
    const todos = allNotesCache.filter((n) => n.status === 'todo');
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

  // --- Alarm bar: a row (like the pin bar) of every note that has an alarm ---
  function renderAlarmbar() {
    alarmbar.innerHTML = '';
    alarmbar.classList.toggle('hidden', alarms.length === 0 || !barPrefs.alarms);

    alarms.forEach((a) => {
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
    // a reminder that is snoozed into the future alone.
    for (const a of alarms) {
      if (a.snoozeUntil && new Date(a.snoozeUntil) > ref) continue;
      const want = isoOrNull(nextAlarmOccurrence(a, ref));
      if (want !== (a.nextAt || null)) api.scheduleAlarm(a.id, want);
    }

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

    // Secondary lists (server-computed): notes flagged to-do, then notes
    // carrying open `- [ ]` tasks in their body.
    const extra = await api.agenda();
    const todos = (extra && extra.todos) || [];
    if (todos.length) {
      any = true;
      const h = document.createElement('h3');
      h.textContent = 'To-do';
      agendaBody.appendChild(h);
      todos.forEach((t) => agendaBody.appendChild(todoRow(t)));
    }
    const openTasks = (extra && extra.openTasks) || [];
    if (openTasks.length) {
      any = true;
      const h = document.createElement('h3');
      h.textContent = 'Open tasks';
      agendaBody.appendChild(h);
      openTasks.forEach((t) => agendaBody.appendChild(openTaskRow(t)));
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

  function openAlarmEditor(note) {
    alarmEditNote = note;
    const existing = alarms.find((a) => a.noteId === note.id);

    const d = new Date();
    alarmTimeInput.value = existing
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
    alarmRemoveBtn.classList.toggle('hidden', !existing);
    alarmOverlay.classList.remove('hidden');
  }

  function closeAlarmEditor() {
    alarmOverlay.classList.add('hidden');
    alarmEditNote = null;
  }

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

  function renderSearchResults(list) {
    searchResults.innerHTML = '';
    list.forEach((n) => {
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
      }
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

  newNoteBtn.addEventListener('click', () => openPicker());

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
    pickerConnectSection.classList.toggle('hidden', pickerStyle !== 'text' || !pendingLinkTarget);
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
    // Attachment styles and "connect" both need a note to hang off of; with no
    // centered note this is a plain new-note create.
    pickerStyleRow.classList.toggle('hidden', !pendingLinkTarget);
    pickerCreateBtn.textContent = pendingLinkTarget ? 'Create & connect' : 'Create';
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
        if (!noteOverlay.classList.contains('hidden')) renderNoteFullscreen();
      });
      pickerResults.appendChild(div);
    });
  });

  let pickerCreating = false;
  pickerCreateBtn.addEventListener('click', async () => {
    if (pickerCreating) return;
    const title = pickerNewTitle.value.trim();

    const formData = new FormData();
    if (pickerStyle === 'text') {
      if (!title) return;
    } else if (pickerStyle === 'image') {
      const file = pickerPhotoInput.files[0];
      if (!file) {
        toast('Choose a photo first.');
        return;
      }
      formData.set('type', 'image');
      formData.set('file', file);
    } else if (pickerStyle === 'audio') {
      if (!pickerRecordedBlob) {
        toast('Record something first.');
        return;
      }
      formData.set('type', 'audio');
      formData.set('file', pickerRecordedBlob, 'recording.webm');
    } else if (pickerStyle === 'contact') {
      const name = pickerContactName.value.trim();
      if (!name) {
        toast('Contact name is required.');
        return;
      }
      formData.set('type', 'contact');
      formData.set('contactName', name);
      formData.set('contactPhone', pickerContactPhone.value);
      formData.set('contactEmail', pickerContactEmail.value);
    } else if (pickerStyle === 'app') {
      const uri = pickerAppUri.value.trim();
      if (!uri) {
        toast('App link is required.');
        return;
      }
      formData.set('type', 'app');
      formData.set('appUri', uri);
      formData.set('appLabel', title);
    }

    pickerCreating = true;
    pickerCreateBtn.disabled = true;
    try {
      if (pickerStyle === 'text') {
        const note = await api.createNote(
          pendingLinkTarget ? { title, linkTo: pendingLinkTarget } : { title }
        );
        const hadTarget = !!pendingLinkTarget;
        closePicker();
        if (hadTarget) {
          await afterAttach();
        } else {
          allNotesCache = await api.listNotes();
          renderPinbar();
          await refreshFromTabs(await api.openTab(note.id));
        }
      } else {
        if (title) formData.set('title', title);
        await api.createAttachment(pendingLinkTarget, formData);
        closePicker();
        await afterAttach();
      }
    } finally {
      pickerCreating = false;
      pickerCreateBtn.disabled = false;
    }
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
    if (colorMode === 'cluster') {
      const cid = clusters[note.id];
      if (cid != null && clusterHues[cid] != null) return `hsl(${clusterHues[cid]} 65% 52%)`;
      return '#9aa0a8';
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
    geo.forEach((note) => {
      const icon = TYPE_ICON[note.type] ? `${TYPE_ICON[note.type]} ` : '';
      L.circleMarker([note.lat, note.lon], {
        radius: 8,
        color: '#fff',
        weight: 2,
        fillColor: mapColorFor(note),
        fillOpacity: 0.95,
      })
        .bindPopup(
          `<b>${icon}${escapeHtml(note.title || 'Untitled')}</b><br />` +
            `<a href="#${note.id}" data-note-id="${note.id}">Open note</a>`
        )
        .addTo(mapMarkers);
    });

    if (geo.length > 0) {
      leafletMap.fitBounds(geo.map((n) => [n.lat, n.lon]), { padding: [40, 40], maxZoom: 16 });
    } else {
      const here = await getLocation();
      if (here) {
        leafletMap.setView([here.lat, here.lon], 13);
        mapStatusEl.textContent = 'No located notes yet — showing your location';
      } else {
        leafletMap.setView([20, 0], 2);
        mapStatusEl.textContent = 'No located notes yet';
      }
    }
  }

  function syncMapModes() {
    mapModesEl.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === colorMode);
    });
  }

  async function openMap() {
    mapOverlay.classList.remove('hidden');

    if (!leafletMap) {
      leafletMap = L.map('map');
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(leafletMap);
      leafletMap.setView([20, 0], 2);
      mapMarkers = L.layerGroup().addTo(leafletMap);

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
  }

  function closeMap() {
    mapOverlay.classList.add('hidden');
  }

  mapBtn.addEventListener('click', openMap);
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
    accountOverlay.classList.remove('hidden');
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
    location.reload();
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
