# PWA installability: audit + real-device QA checklist

Human-facing checklist for verifying Tamamizu installs to a phone home screen
and launches in standalone app-like mode. Companion to the automated checks
in `vite.config.test.ts` and `src/pwaAssets.test.ts`, which cover what can be
verified deterministically without a real device or browser install UI.

## Current configuration (verified 2026-09-16, Issue #283)

- `vite-plugin-pwa` (`vite.config.ts`, `PWA_MANIFEST`) declares `name`,
  `short_name`, `display: 'standalone'`, and icons for `192x192`, `512x512`,
  and a `512x512` `purpose: 'maskable'` variant. `theme_color` /
  `background_color` are both `#ffffff`.
- `index.html` links `rel="icon"` to `/favicon.svg` and
  `rel="apple-touch-icon"` to `/icons/apple-touch-icon.png`. Both are
  root-relative paths into `public/`, which Vite automatically rewrites to
  be prefixed with the build's `base` — confirmed locally by building both
  with the default GitHub Pages project path (`/kana-game/`) and with a
  domain-root `base` (`/`, matching the live custom-domain deployment at
  `https://app.tamamizu.giganihongo.com/` per `ops/project-state.json` §8):
  both builds produced correct `base`-prefixed `href`s, and the generated
  manifest's `start_url`/`scope` and icon paths resolved correctly for
  either base.
- The generated service worker precaches `favicon.svg`,
  `manifest.webmanifest`, and all three manifest icons automatically (see
  `dist/sw.js` after a build), independent of the `globPatterns` list used
  for the JS/CSS/HTML/font app shell.
- No path/installability defect was found in this audit — the manifest,
  service worker, and icon path handling already work correctly for both
  the GitHub Pages project-path build and the custom-domain root build.

## Human Gate: icon/logo branding

`public/favicon.svg` and `public/icons/*.png` are still placeholder/legacy
assets (the favicon is a generic purple abstract mark, not a Tamamizu brand
mark). **Do not replace these without an approved Tamamizu icon/logo source
master.** Once a human supplies/approves one, regenerate the required
runtime variants (192, 512, maskable 512, Apple touch icon, favicon) using
safe-zone rules for maskable icons, keep the same manifest `sizes`/`purpose`
declarations, and re-run `npm test` — `src/pwaAssets.test.ts` will catch any
new file whose actual pixel dimensions don't match its declared `sizes`.

## Real-device QA checklist

Automated tests cannot exercise a real mobile browser's install prompt or
home-screen launch behavior. A human must complete this on an actual device
against the current Production URL (`https://app.tamamizu.giganihongo.com/`)
or a deployed preview.

### Android (Chrome)

- [ ] Open the site in Chrome; confirm Chrome offers "Install app" / "Add to
      Home screen" (via the omnibox install icon or the ⋮ menu).
- [ ] Install it; confirm the home-screen icon matches the current app icon
      (placeholder mark until the Human Gate above is resolved) and the
      label matches `short_name` ("Tamamizu").
- [ ] Launch from the home-screen icon; confirm it opens in standalone mode
      (no browser address bar/tabs chrome).
- [ ] Make a trivial content change and redeploy (or simulate by bumping a
      cached asset); relaunch the installed app and confirm it picks up the
      update (`registerType: 'autoUpdate'`) without requiring a manual
      uninstall/reinstall.

### iPhone (Safari)

- [ ] Open the site in Safari; use Share → **Add to Home Screen**.
- [ ] Confirm the suggested name matches `short_name`/`name` and the
      preview icon matches the current app icon (via `apple-touch-icon`).
- [ ] Launch from the home-screen icon; confirm it opens in standalone mode
      (no Safari chrome).
- [ ] Fully close the app (swipe away from the app switcher) and relaunch
      from the home screen; confirm it reopens correctly rather than
      showing a blank/error screen.

Record results (pass/fail, device/OS/browser version, screenshots if
useful) against this checklist before the final Human go/no-go referenced in
Issue #283.
