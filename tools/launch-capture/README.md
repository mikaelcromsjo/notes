# launch-capture

Records a short walkthrough of the app's new-user onboarding graph (headless
Chrome via Playwright) as PNG frames + an assembled GIF/MP4, for
launch/marketing material.

Standalone tooling — its own `package.json`/deps, **not** part of the app
runtime (`npm start` / `server/`). Never touches `data/notes.db` or sends
real email; see the comment at the top of `capture.js` for how it isolates
itself (throwaway server instance, scratch sqlite file, mailer forced off).

## Setup (once)

```
cd tools/launch-capture
npm install
npx playwright install chromium   # add --with-deps if you have sudo; not required here
```

## Run

```
npm run capture -- [--steps N] [--width W] [--height H] [--scale S] [--hold SECONDS] [--keep]
```

- `--steps` (default 7): how far into the onboarding chain to walk (0 = just
  the Welcome note, up to 11 = the full chain through the Tips note).
- `--width`/`--height`/`--scale`: viewport + device pixel ratio. Default
  430x932 @2x (a phone frame) since the app is mobile-first.
- `--hold`: seconds each frame is held in the assembled GIF/MP4.
- `--keep`: don't delete the scratch sqlite file afterwards (for debugging).

Output lands in `out/<run-timestamp>/`: numbered PNG frames, `walkthrough.gif`,
`walkthrough.mp4`.

Icons render via a vendored monochrome "Noto Emoji" webfont (`fonts/`,
OFL-licensed) injected into the page, since this box has no emoji font
installed and can't `apt install` one without sudo. The *color* Noto Emoji
font was tried first but renders fully blank in this headless Chromium's
software rasterizer (no GPU color-glyph support in the sandbox) — the
monochrome line-art variant renders correctly, so that's what's used.

## What it does NOT do

It only produces media files locally. It does not post anywhere — see the
conversation/memory notes on why auto-posting to a personal Facebook profile
or into Facebook groups isn't something to automate (API restrictions +
ToS/spam risk to the real account), independent of this tool.
