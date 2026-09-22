// Theme model shared by the browser (window.NicoThemes) and the server
// (require('../public/themes.js')) — one definition of what a valid theme is, so
// the server's sanitizer and the client's renderer can never drift apart.
//
// A *style* is a sparse object; every field is optional and an absent field means
// "inherit" (from the app theme, or from an ancestor note's theme):
//   colors: { bg, surface, text, accent, border,
//             pin, todo, waiting, latest, noteHeat, alarm, danger }   '#rrggbb' each
//   font:   key of FONTS
//   bg:     { img, hue, dim }   page background — img is 'preset:<key>', an
//   card:   { img, hue, dim }   uploaded '/uploads/<file>' or 'none'; hue 0-359 (deg
//                               rotation applied to the image), dim 0-90 (% veil)
//   glow:   0-100   neon-style outer glow on cards
//   cardAlpha: 0-100   opacity % of the note cards' background (100 = solid)
//   textFx: 'auto' | 'off' | 'shadow' | 'outline'   legibility halo on card text;
//           auto (the default) adds a shadow only where the card background is busy
// Notes carry one (plus a "also apply to sub notes" flag); the account carries the
// active app theme and any user-made ones.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NicoThemes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const SYSTEM_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  // Files live in public/vendor/fonts (declared in style.css); the system stack is
  // the fallback so text never disappears while a font loads.
  const FONTS = {
    system: { label: 'System', stack: SYSTEM_STACK },
    inter: { label: 'Inter', stack: `"Nico Inter", ${SYSTEM_STACK}` },
    nunito: { label: 'Nunito (rounded)', stack: `"Nico Nunito", ${SYSTEM_STACK}` },
    lora: { label: 'Lora (serif)', stack: `"Nico Lora", Georgia, "Times New Roman", serif` },
    mono: {
      label: 'JetBrains Mono',
      stack: `"Nico JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace`,
    },
    orbitron: { label: 'Orbitron (display)', stack: `"Nico Orbitron", ${SYSTEM_STACK}` },
  };

  // Built-in background images. Pure CSS gradients (no files to ship or cache), so
  // the hue slider can rotate them freely via filter: hue-rotate().
  const IMAGES = {
    neon: {
      label: 'Neon glow',
      css:
        'radial-gradient(60% 50% at 12% 8%, rgba(255,43,214,.55), transparent 62%),' +
        'radial-gradient(55% 45% at 88% 18%, rgba(0,229,255,.45), transparent 62%),' +
        'radial-gradient(70% 60% at 72% 96%, rgba(124,58,237,.6), transparent 66%),' +
        'radial-gradient(45% 40% at 8% 92%, rgba(0,255,163,.3), transparent 62%),' +
        'linear-gradient(160deg, #12062a, #060a26 55%, #16052e)',
    },
    'neon-card': {
      label: 'Neon card',
      css:
        'linear-gradient(135deg, rgba(255,43,214,.42), rgba(0,229,255,.3) 55%, rgba(124,58,237,.42)),' +
        'linear-gradient(160deg, #1b0d3a, #0c1233)',
    },
    aurora: {
      label: 'Aurora',
      css:
        'radial-gradient(70% 55% at 20% 10%, rgba(52,211,153,.55), transparent 65%),' +
        'radial-gradient(60% 50% at 85% 25%, rgba(96,165,250,.55), transparent 65%),' +
        'radial-gradient(70% 60% at 50% 100%, rgba(167,139,250,.5), transparent 68%),' +
        'linear-gradient(180deg, #0f172a, #172554)',
    },
    sunset: {
      label: 'Sunset',
      css: 'linear-gradient(160deg, #fde68a 0%, #fb923c 32%, #e11d74 68%, #4c1d95 100%)',
    },
    ocean: {
      label: 'Ocean',
      css:
        'radial-gradient(80% 60% at 80% 0%, rgba(125,211,252,.7), transparent 60%),' +
        'linear-gradient(170deg, #e0f2fe, #38bdf8 55%, #1e3a8a)',
    },
    paper: {
      label: 'Soft paper',
      css:
        'radial-gradient(90% 70% at 10% 0%, rgba(255,255,255,.9), transparent 60%),' +
        'linear-gradient(160deg, #f5efe6, #e7dcc9)',
    },
  };

  // Core = the everyday reading colours. Tabs = the pin/todo/waiting/latest/alarm
  // header bars, the note-heat colour-coding tint, and the delete/danger colour —
  // each auto-gets a readable contrast text colour (see AUTO_CONTRAST_KEYS below),
  // the same way `accent` always has. Grouped for the theme editor's layout
  // (COLOR_GROUPS); COLOR_KEYS is just both groups flattened.
  const COLOR_GROUPS = [
    ['Core', ['bg', 'surface', 'text', 'accent', 'border']],
    ['Tabs & status', ['pin', 'todo', 'waiting', 'latest', 'noteHeat', 'alarm', 'danger']],
  ];
  const COLOR_KEYS = COLOR_GROUPS.flatMap(([, keys]) => keys);
  const COLOR_LABELS = {
    bg: 'Background',
    surface: 'Cards & bars',
    text: 'Text',
    accent: 'Accent',
    border: 'Borders',
    pin: 'Pinned tab',
    todo: 'To-do tab',
    waiting: 'Waiting tab',
    latest: 'Latest tab',
    noteHeat: 'Note-heat tint',
    alarm: 'Alarm tab',
    danger: 'Delete / danger',
  };
  // camelCase key → the CSS custom property's actual name, where it differs.
  const CSS_VAR_NAME = { noteHeat: 'note-heat' };
  // These get an auto-computed `--<name>-contrast` alongside them (light or dark
  // text, whichever reads on top of the colour itself) — every tab/status colour,
  // same treatment `accent` already had.
  const AUTO_CONTRAST_KEYS = ['accent', 'pin', 'todo', 'waiting', 'latest', 'noteHeat', 'alarm', 'danger'];

  // Matches the :root block in style.css, so an empty style renders exactly like
  // the stylesheet on its own.
  const DEFAULT_COLORS = {
    bg: '#f4f5f7',
    surface: '#ffffff',
    text: '#1c1e21',
    accent: '#4f6df5',
    border: '#e2e4e9',
    muted: '#767a82',
    pin: '#5f6aff',
    todo: '#0d9488',
    waiting: '#b45309',
    latest: '#c2185b',
    noteHeat: '#8b5cf6',
    alarm: '#55235d',
    danger: '#e0575b',
  };
  const DEFAULT_SHADOW = '0 1px 3px rgba(20, 20, 30, 0.08), 0 1px 2px rgba(20, 20, 30, 0.06)';

  // Built-in whole-app themes (selectable, not editable in place — editing one
  // forks it into a user theme).
  const PRESETS = {
    light: { label: 'Light', style: {} },
    dark: {
      label: 'Dark',
      style: {
        colors: { bg: '#121418', surface: '#1c1f25', text: '#e8eaed', accent: '#7c9cff' },
      },
    },
    neon: {
      label: 'Neon',
      style: {
        colors: {
          bg: '#0a0518',
          surface: '#150c2c',
          text: '#f3eaff',
          accent: '#ff2bd6',
          border: '#5b2a9b',
        },
        font: 'mono',
        bg: { img: 'preset:neon' },
        card: { img: 'preset:neon-card', dim: 35 },
        glow: 60,
      },
    },
    sunset: {
      label: 'Sunset',
      style: {
        colors: {
          bg: '#fde9d9',
          surface: '#fff6ec',
          text: '#43261a',
          accent: '#ea580c',
          border: '#f3c89f',
          pin: '#c2410c',
          todo: '#ca8a04',
          waiting: '#92400e',
          latest: '#be123c',
          noteHeat: '#f97316',
          alarm: '#9a3412',
          danger: '#dc2626',
        },
        font: 'nunito',
        bg: { img: 'preset:sunset' },
        cardAlpha: 94,
      },
    },
    ocean: {
      label: 'Ocean',
      style: {
        colors: {
          bg: '#e6f6fd',
          surface: '#f3fbff',
          text: '#0b2a3d',
          accent: '#0284c7',
          border: '#bfe3f5',
          pin: '#2563eb',
          todo: '#0891b2',
          waiting: '#b45309',
          latest: '#db2777',
          noteHeat: '#06b6d4',
          alarm: '#1e3a8a',
          danger: '#dc2626',
        },
        font: 'inter',
        bg: { img: 'preset:ocean' },
        cardAlpha: 92,
      },
    },
    aurora: {
      label: 'Aurora',
      style: {
        colors: {
          bg: '#0b1220',
          surface: '#141b2e',
          text: '#e7edf7',
          accent: '#34d399',
          border: '#28324a',
          pin: '#818cf8',
          todo: '#34d399',
          waiting: '#f59e0b',
          latest: '#f472b6',
          noteHeat: '#a78bfa',
          alarm: '#f43f5e',
          danger: '#ef4444',
        },
        font: 'inter',
        bg: { img: 'preset:aurora' },
      },
    },
    forest: {
      label: 'Forest',
      style: {
        colors: {
          bg: '#f1f7f0',
          surface: '#ffffff',
          text: '#1c2e1a',
          accent: '#15803d',
          border: '#cfe3cb',
          pin: '#6d28d9',
          todo: '#15803d',
          waiting: '#92400e',
          latest: '#be123c',
          noteHeat: '#22c55e',
          alarm: '#7c2d12',
          danger: '#dc2626',
        },
      },
    },
    'rose-quartz': {
      label: 'Rose Quartz',
      style: {
        colors: {
          bg: '#fdf2f8',
          surface: '#ffffff',
          text: '#4a1942',
          accent: '#db2777',
          border: '#f9d6e8',
          pin: '#9333ea',
          todo: '#059669',
          waiting: '#b45309',
          latest: '#db2777',
          noteHeat: '#ec4899',
          alarm: '#be185d',
          danger: '#dc2626',
        },
        font: 'nunito',
      },
    },
    slate: {
      label: 'Slate',
      style: {
        colors: {
          bg: '#f1f5f9',
          surface: '#ffffff',
          text: '#0f172a',
          accent: '#334155',
          border: '#cbd5e1',
          pin: '#2563eb',
          todo: '#0d9488',
          waiting: '#b45309',
          latest: '#c2185b',
          noteHeat: '#6366f1',
          alarm: '#475569',
          danger: '#dc2626',
        },
        font: 'mono',
      },
    },
    sepia: {
      label: 'Sepia',
      style: {
        colors: {
          bg: '#f3ead9',
          surface: '#faf3e6',
          text: '#3b2f22',
          accent: '#92400e',
          border: '#e3d3b5',
          pin: '#7c3aed',
          todo: '#4d7c0f',
          waiting: '#92400e',
          latest: '#9f1239',
          noteHeat: '#b45309',
          alarm: '#78350f',
          danger: '#b91c1c',
        },
        font: 'lora',
        bg: { img: 'preset:paper' },
        cardAlpha: 96,
      },
    },
    midnight: {
      label: 'Midnight',
      style: {
        colors: {
          bg: '#05070d',
          surface: '#10141f',
          text: '#e5e9f2',
          accent: '#6366f1',
          border: '#232a3d',
          pin: '#818cf8',
          todo: '#22c55e',
          waiting: '#eab308',
          latest: '#f472b6',
          noteHeat: '#a78bfa',
          alarm: '#f87171',
          danger: '#ef4444',
        },
      },
    },
  };

  const TEXT_FX = ['auto', 'off', 'shadow', 'outline'];
  const HEX = /^#[0-9a-f]{6}$/i;
  const IMG_PRESET = /^preset:[a-z0-9-]{1,32}$/;
  const IMG_UPLOAD = /^\/uploads\/[A-Za-z0-9._-]{1,100}$/;

  function clampInt(v, lo, hi) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return undefined;
    return Math.min(hi, Math.max(lo, n));
  }

  function cleanImage(raw, uploadOk) {
    if (!raw || typeof raw !== 'object') return null;
    const out = {};
    if (typeof raw.img === 'string') {
      // 'none' = deliberately no image (overrides one inherited from above);
      // an absent img just inherits.
      if (raw.img === 'none' || IMG_PRESET.test(raw.img)) out.img = raw.img;
      else if (IMG_UPLOAD.test(raw.img) && (!uploadOk || uploadOk(raw.img))) out.img = raw.img;
    }
    const hue = clampInt(raw.hue, 0, 359);
    if (hue !== undefined) out.hue = hue;
    const dim = clampInt(raw.dim, 0, 90);
    if (dim !== undefined) out.dim = dim;
    return Object.keys(out).length ? out : null;
  }

  // Whitelist-normalise untrusted input into a style. Anything unrecognised is
  // dropped (the values end up inside CSS, so nothing free-form survives).
  // `uploadOk(path)` lets the server require that an uploaded path is the user's own.
  function sanitizeStyle(raw, { uploadOk } = {}) {
    if (!raw || typeof raw !== 'object') return null;
    const out = {};
    if (raw.colors && typeof raw.colors === 'object') {
      const colors = {};
      for (const k of COLOR_KEYS) {
        if (typeof raw.colors[k] === 'string' && HEX.test(raw.colors[k])) {
          colors[k] = raw.colors[k].toLowerCase();
        }
      }
      if (Object.keys(colors).length) out.colors = colors;
    }
    if (typeof raw.font === 'string' && Object.prototype.hasOwnProperty.call(FONTS, raw.font)) {
      out.font = raw.font;
    }
    for (const k of ['bg', 'card']) {
      const img = cleanImage(raw[k], uploadOk);
      if (img) out[k] = img;
    }
    const glow = clampInt(raw.glow, 0, 100);
    if (glow !== undefined && raw.glow !== null) out.glow = glow;
    if (TEXT_FX.includes(raw.textFx)) out.textFx = raw.textFx;
    const cardAlpha = clampInt(raw.cardAlpha, 0, 100);
    if (cardAlpha !== undefined && raw.cardAlpha !== null) out.cardAlpha = cardAlpha;
    return Object.keys(out).length ? out : null;
  }

  // Field-by-field merge: `over` wins where it sets something, `base` shows through
  // everywhere else. This is what makes a sub note able to override only the font
  // while still picking up its ancestor's colours and background.
  function mergeStyles(base, over) {
    const a = base || {};
    const b = over || {};
    const out = { ...a, ...b };
    for (const k of ['colors', 'bg', 'card']) {
      if (a[k] || b[k]) out[k] = { ...(a[k] || {}), ...(b[k] || {}) };
    }
    for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
    return out;
  }

  // ---- colour helpers -----------------------------------------------------
  function rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function toHex(c) {
    return '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  }
  // t = share of `a` in the mix.
  function mix(a, b, t) {
    const x = rgb(a);
    const y = rgb(b);
    return toHex(x.map((v, i) => v * t + y[i] * (1 - t)));
  }
  function luminance(hex) {
    const [r, g, bl] = rgb(hex).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  }

  function autoContrast(hex) {
    return luminance(hex) > 0.45 ? '#111111' : '#ffffff';
  }

  function effectiveColors(style) {
    const c = (style && style.colors) || {};
    const d = DEFAULT_COLORS;
    const bg = c.bg || d.bg;
    const text = c.text || d.text;
    let surface = c.surface || d.surface;
    if (!c.surface && c.bg) surface = luminance(c.bg) < 0.4 ? mix('#ffffff', c.bg, 0.07) : mix('#ffffff', c.bg, 0.6);
    const custom = c.bg || c.text || c.surface;
    const out = {
      bg,
      surface,
      text,
      accent: c.accent || d.accent,
      border: c.border || (custom ? mix(text, surface, 0.16) : d.border),
      muted: c.bg || c.text ? mix(text, bg, 0.58) : d.muted,
    };
    for (const k of AUTO_CONTRAST_KEYS) if (k !== 'accent') out[k] = c[k] || d[k];
    return out;
  }

  // Card text gets a halo in the opposite tone to the text (dark behind light
  // text, light behind dark) so it stays readable over an image or a see-through
  // card. 'auto' only kicks in where the backdrop is actually busy: a card image
  // that isn't mostly faded out, or a translucent card over a page image.
  function textShadow(s, c, vars) {
    const fx = s.textFx || 'auto';
    if (fx === 'off') return 'none';
    const cardImg = vars['--card-img'] !== 'none';
    const pageImg = vars['--bg-img'] !== 'none';
    const alpha = s.cardAlpha == null ? 100 : s.cardAlpha;
    const busy = (cardImg && ((s.card && s.card.dim) || 0) < 50) || (pageImg && alpha < 90);
    if (fx === 'auto' && !busy) return 'none';
    const halo = luminance(c.text) > 0.4 ? '0,0,0' : '255,255,255';
    if (fx === 'outline') {
      const o = `rgba(${halo},.9)`;
      return `-1px -1px 0 ${o}, 1px -1px 0 ${o}, -1px 1px 0 ${o}, 1px 1px 0 ${o}, 0 0 4px ${o}`;
    }
    return `0 1px 2px rgba(${halo},.85), 0 0 8px rgba(${halo},.6)`;
  }

  // The complete set of CSS custom properties a style resolves to. `resolveUrl`
  // maps an uploaded path to something loadable right now (the path itself online,
  // an object URL offline) or null when it isn't available.
  function cssVars(style, resolveUrl) {
    const s = style || {};
    const c = effectiveColors(s);
    const vars = {
      '--bg': c.bg,
      '--surface': c.surface,
      '--text': c.text,
      '--muted': c.muted,
      '--border': c.border,
      '--color-scheme': luminance(c.bg) < 0.4 ? 'dark' : 'light',
      '--font-body': (FONTS[s.font] || FONTS.system).stack,
    };
    for (const k of AUTO_CONTRAST_KEYS) {
      const cssName = CSS_VAR_NAME[k] || k;
      vars[`--${cssName}`] = c[k];
      vars[`--${cssName}-contrast`] = autoContrast(c[k]);
    }
    const glow = s.glow || 0;
    vars['--shadow'] = glow
      ? `0 0 ${Math.round(4 + glow * 0.22)}px ${mix(c.accent, c.bg, 0.55)}, 0 0 1px ${c.accent}`
      : DEFAULT_SHADOW;
    vars['--card-alpha'] = String((s.cardAlpha == null ? 100 : s.cardAlpha) / 100);
    for (const k of ['bg', 'card']) {
      const im = s[k] || {};
      let css = 'none';
      if (im.img) {
        if (IMG_PRESET.test(im.img)) {
          const p = IMAGES[im.img.slice(7)];
          if (p) css = p.css;
        } else if (IMG_UPLOAD.test(im.img)) {
          const url = resolveUrl ? resolveUrl(im.img) : im.img;
          if (url) css = `url("${url}")`;
        }
      }
      vars[`--${k}-img`] = css;
      vars[`--${k}-hue`] = `${im.hue || 0}deg`;
      vars[`--${k}-dim`] = String((im.dim || 0) / 100);
    }
    vars['--text-shadow'] = textShadow(s, c, vars);
    return vars;
  }

  function isEmpty(style) {
    return !style || Object.keys(style).length === 0;
  }

  // Themes stored in localStorage let boot() paint the right colours before app.js
  // loads (no flash of the light theme on a dark-themed account).
  const BOOT_KEY = 'nico-theme-boot';
  function applyVars(el, vars) {
    for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  }
  function boot() {
    try {
      const raw = localStorage.getItem(BOOT_KEY);
      if (!raw) return;
      const { vars, hasBg } = JSON.parse(raw);
      applyVars(document.documentElement, vars || {});
      document.documentElement.classList.toggle('has-bg', Boolean(hasBg));
    } catch {
      /* storage blocked or corrupt — fall back to the stylesheet */
    }
  }

  return {
    FONTS,
    TEXT_FX,
    IMAGES,
    PRESETS,
    COLOR_KEYS,
    COLOR_GROUPS,
    COLOR_LABELS,
    DEFAULT_COLORS,
    BOOT_KEY,
    sanitizeStyle,
    mergeStyles,
    effectiveColors,
    cssVars,
    isEmpty,
    applyVars,
    boot,
  };
});
