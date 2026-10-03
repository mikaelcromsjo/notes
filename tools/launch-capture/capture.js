#!/usr/bin/env node
// Records a short walkthrough of the app's new-user onboarding graph as PNG
// frames + an assembled GIF/MP4, for launch/marketing material.
//
// Safety: never touches the real app. It boots a second, throwaway server
// instance (child process) pointed at a scratch sqlite file under .scratch/,
// on its own port, and forces the mailer off via MAIL_CONFIG pointing at a
// file that doesn't exist — so the magic-link email is only ever logged to
// this process's stdout, never actually sent. (uploads/ and vapid.json are
// shared, not DB-scoped — see the "Shared resources not DB-scoped" gotcha —
// but this script never uploads anything or touches push, so that's moot.)
//
// Usage:
//   npm run capture -- [--steps N] [--width W] [--height H] [--scale S] [--hold SECONDS] [--keep]
//
// Output: tools/launch-capture/out/<run-timestamp>/frame_XX.png, walkthrough.gif, walkthrough.mp4

const { chromium } = require('playwright');
const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

const REPO_ROOT = path.join(__dirname, '..', '..');
const SCRATCH_ROOT = path.join(__dirname, '.scratch');
const OUT_ROOT = path.join(__dirname, 'out');
const EMOJI_FONT_DIR = path.join(__dirname, 'fonts', 'noto-emoji-mono');

// This box has no emoji font installed system-wide (no sudo to apt install
// one), and the app's UI is emoji-heavy (header icons, note titles) —
// without this, screenshots show blank/tofu boxes. Inline the vendored
// Noto Emoji subset CSS as an extra style tag, as data URIs so it needs no
// extra HTTP server, appended *after* the page's own resolved font stack so
// it only supplies glyphs the real fonts lack.
//
// This is the monochrome "Noto Emoji" family, not color "Noto Color Emoji":
// tried the color one first, but this headless Chromium's software
// rasterizer renders its glyphs fully blank (no GPU color-bitmap/COLR
// support in this sandbox) — confirmed in isolation, not an app issue.
// Monochrome line-art icons beat invisible ones for a screenshot.
async function injectEmojiFont(page) {
  let css = fs.readFileSync(path.join(EMOJI_FONT_DIR, 'noto-emoji.css'), 'utf8');
  css = css.replace(/,?\s*url\(\.\/files\/([^)]+\.woff)\)\s*format\('woff'\)/g, ''); // drop unused woff fallback refs
  css = css.replace(/url\(\.\/files\/([^)]+\.woff2)\)/g, (_, file) => {
    const data = fs.readFileSync(path.join(EMOJI_FONT_DIR, file)).toString('base64');
    return `url(data:font/woff2;base64,${data})`;
  });
  const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  await page.addStyleTag({
    content: `${css}\n* { font-family: ${bodyFont}, 'Noto Emoji' !important; }`,
  });
}

// Full onboarding chain from server/onboarding.js, in order. The first is
// already centered on load; each following title is tapped in turn.
const ALL_TITLES = [
  '👋 Welcome',
  '🚀 Take the tour',
  '👆 Tap zones',
  '🫳 Move it',
  '⏳ Mark it waiting',
  '◑ Flag a to-do',
  '✅ Mark it done',
  '⏰ Set an alarm',
  '📌 Pin it',
  '🔔 Check the agenda',
  '🗺️ Check the map',
  '💡 Tips: attachments & wikilinks',
];

function parseArgs(argv) {
  const opts = { steps: 7, width: 430, height: 932, scale: 2, hold: 1.4, keep: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--steps') opts.steps = Number(argv[++i]);
    else if (a === '--width') opts.width = Number(argv[++i]);
    else if (a === '--height') opts.height = Number(argv[++i]);
    else if (a === '--scale') opts.scale = Number(argv[++i]);
    else if (a === '--hold') opts.hold = Number(argv[++i]);
    else if (a === '--keep') opts.keep = true;
  }
  opts.steps = Math.max(0, Math.min(opts.steps, ALL_TITLES.length - 1));
  return opts;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function spawnServer({ port, dbPath }) {
  const child = spawn(process.execPath, [path.join(REPO_ROOT, 'server', 'index.js')], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      DB_PATH: dbPath,
      PUBLIC_ORIGIN: `http://127.0.0.1:${port}`,
      // Nonexistent path -> mailer.configured() === false, guaranteed, even
      // if the real data/mail.json (Gmail creds) exists. See file header.
      MAIL_CONFIG: path.join(SCRATCH_ROOT, 'no-mail.json'),
      COOKIE_INSECURE: '1',
    },
  });
  let log = '';
  child.stdout.on('data', (d) => {
    log += d.toString();
    process.stdout.write(`[server] ${d}`);
  });
  child.stderr.on('data', (d) => process.stderr.write(`[server:err] ${d}`));
  return { child, getLog: () => log };
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 302) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`server did not come up at ${url} within ${timeoutMs}ms`);
}

async function requestLoginLink(baseUrl, email, getLog) {
  const res = await fetch(`${baseUrl}/api/auth/request-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(`request-link failed: ${res.status}`);

  const marker = `login link for ${email}: `;
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const log = getLog();
    const idx = log.indexOf(marker);
    if (idx !== -1) {
      const rest = log.slice(idx + marker.length);
      const link = rest.split(/\s/)[0].trim();
      if (link) return link;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('did not see the logged login link (is data/mail.json somehow reachable? check MAIL_CONFIG)');
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, (err, stdout, stderr) => {
      if (err) return reject(new Error(`${cmd} ${args.join(' ')} failed: ${stderr || err.message}`));
      resolve(stdout);
    });
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const titles = ALL_TITLES.slice(0, opts.steps + 1);

  fs.rmSync(SCRATCH_ROOT, { recursive: true, force: true });
  fs.mkdirSync(SCRATCH_ROOT, { recursive: true });
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(OUT_ROOT, runId);
  fs.mkdirSync(outDir, { recursive: true });

  const port = await getFreePort();
  const dbPath = path.join(SCRATCH_ROOT, 'notes.db');
  const baseUrl = `http://127.0.0.1:${port}`;
  const email = `launch-capture+${Date.now()}@capture.local`;

  console.log(`[capture] scratch db: ${dbPath}`);
  console.log(`[capture] isolated server: ${baseUrl}`);

  const { child, getLog } = spawnServer({ port, dbPath });
  let browser;
  try {
    await waitForServer(`${baseUrl}/`, 15000);
    const link = await requestLoginLink(baseUrl, email, getLog);
    console.log(`[capture] signing in via: ${link}`);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: opts.width, height: opts.height },
      deviceScaleFactor: opts.scale,
    });
    const page = await context.newPage();
    await page.goto(link, { waitUntil: 'networkidle' });
    await injectEmojiFont(page);
    // The service worker fires its "new version" reload toast on the very
    // first activation too, not just real updates — irrelevant noise here.
    await page.addStyleTag({ content: '#toast-host { display: none !important; }' });

    const frames = [];
    async function shoot(label) {
      const file = path.join(outDir, `frame_${String(frames.length).padStart(2, '0')}.png`);
      await page.screenshot({ path: file, animations: 'disabled' });
      frames.push(file);
      console.log(`[capture] frame ${frames.length - 1}: ${label} -> ${path.basename(file)}`);
    }

    await page.waitForFunction(
      (t) => document.querySelector('.center-title')?.textContent.trim() === t,
      titles[0],
      { timeout: 10000 }
    );
    // `?fresh=1` (new-account redirect) auto-opens the Welcome note in the
    // fullscreen preview overlay (see handleDeepLink in app.js) — close it
    // so the grid itself, the app's main visual hook, is what gets shot.
    const closeBtn = page.locator('#note-overlay-close');
    if (await closeBtn.isVisible().catch(() => false)) await closeBtn.click();
    await page.waitForTimeout(200);
    await shoot(titles[0]);

    for (let i = 1; i < titles.length; i++) {
      const title = titles[i];
      const cell = page.locator('#grid .cell.neighbor', {
        has: page.locator('.neighbor-title', { hasText: title }),
      });
      await cell.first().click({ position: { x: 20, y: 10 } });
      await page.waitForFunction(
        (t) => document.querySelector('.center-title')?.textContent.trim() === t,
        title,
        { timeout: 10000 }
      );
      await page.waitForTimeout(250);
      await shoot(title);
    }

    await browser.close();
    browser = null;

    const gifPath = path.join(outDir, 'walkthrough.gif');
    const mp4Path = path.join(outDir, 'walkthrough.mp4');
    const pattern = path.join(outDir, 'frame_%02d.png');
    const rate = `1/${opts.hold}`;

    console.log('[capture] assembling GIF...');
    await run('ffmpeg', [
      '-y', '-framerate', rate, '-i', pattern,
      '-vf', 'scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3',
      '-loop', '0', gifPath,
    ]);
    console.log('[capture] assembling MP4...');
    await run('ffmpeg', [
      '-y', '-framerate', rate, '-i', pattern,
      '-vf', 'scale=640:-2:flags=lanczos,fps=30,format=yuv420p',
      mp4Path,
    ]);

    console.log(`\n[capture] done: ${outDir}`);
    console.log(`  ${frames.length} frames, ${gifPath}, ${mp4Path}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill();
    if (!opts.keep) fs.rmSync(SCRATCH_ROOT, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('[capture] failed:', err);
  process.exit(1);
});
