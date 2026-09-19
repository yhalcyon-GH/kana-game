# PWA installability: audit + real-device QA checklist

Human-facing checklist for verifying Tamamizu installs to a phone home screen
and launches in standalone app-like mode. Companion to the automated checks
in `vite.config.test.ts` and `src/pwaAssets.test.ts`, which cover what can be
verified deterministically without a real device or browser install UI.

## Current configuration (updated 2026-09-17, Issue #283)

- `vite-plugin-pwa` (`vite.config.ts`, `PWA_MANIFEST`) declares `name`,
  `short_name`, `display: 'standalone'`, and icons for `192x192`, `512x512`,
  and a `512x512` `purpose: 'maskable'` variant. `theme_color` /
  `background_color` are both `#ffffff`.
- The human owner approved the final Tamamizu fox-girl app-icon artwork on
  2026-09-17. The approved artwork is now the source of the runtime icon set:
  `public/icons/icon-192.png`, `public/icons/icon-512.png`,
  `public/icons/maskable-icon-512.png`, `public/icons/apple-touch-icon.png`,
  and `public/icons/favicon-32x32.png`.
- `index.html` links `rel="icon"` to `/icons/favicon-32x32.png` and
  `rel="apple-touch-icon"` to `/icons/apple-touch-icon.png`. Both are
  root-relative paths into `public/`, so Vite prefixes them with the build's
  `base` for either the GitHub Pages project path (`/kana-game/`) or the
  custom-domain root build (`/`).
- The PWA manifest icon `src` values remain base-relative, so the same
  manifest works correctly under both deployment bases without hardcoded
  `/kana-game/` paths.
- The final icon PNGs are opaque and keep the character's face and other
  identifying content away from the extreme corners. The maskable manifest
  entry therefore remains safe for platform shape masks while preserving the
  same approved Tamamizu artwork across normal and maskable icon surfaces.
- `src/pwaAssets.test.ts` verifies manifest icon existence/dimensions plus the
  browser favicon and Apple touch icon paths/dimensions.

## Branding gate — completed

The previous placeholder/legacy icon gate is complete. Do not silently replace
these approved assets with a different mascot or generated variant. Any future
brand redesign should be a separate human-approved change.

A normalized copy of the approved 512px app icon is kept at
`design/images/tamamizu/tamamizu-app-icon-approved.png` for provenance and
future regeneration of runtime sizes.

## Real-device QA checklist — remaining Human Gate

Automated tests cannot exercise a real mobile browser's install prompt or
home-screen launch behavior. A human must complete this on an actual device
against the current Production URL (`https://app.tamamizu.giganihongo.com/`)
or a deployed preview.

### Android (Chrome)

- [ ] Open the site in Chrome; confirm Chrome offers "Install app" / "Add to
      Home screen" (via the omnibox install icon or the ⋮ menu).
- [ ] Install it; confirm the home-screen icon is the approved Tamamizu icon
      and the label matches `short_name` ("Tamamizu").
- [ ] Launch from the home-screen icon; confirm it opens in standalone mode
      (no browser address bar/tabs chrome).
- [ ] After a normal future deployment/update, relaunch the installed app,
      confirm the "A new version is available" Update prompt appears (see
      `docs/pwa-update-flow.md`), and tapping Update picks up the new build
      without requiring a manual uninstall/reinstall.

### iPhone (Safari)

- [ ] Open the site in Safari; use Share → **Add to Home Screen**.
- [ ] Confirm the suggested name matches `short_name`/`name` and the preview
      icon is the approved Tamamizu icon via `apple-touch-icon`.
- [ ] Launch from the home-screen icon; confirm it opens in standalone mode
      (no Safari chrome).
- [ ] Fully close the app (swipe away from the app switcher) and relaunch
      from the home screen; confirm it reopens correctly rather than showing
      a blank/error screen.

Record results (pass/fail, device/OS/browser version, screenshots if useful)
against this checklist before the final Human go/no-go referenced in Issue
#283.
