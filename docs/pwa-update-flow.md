# PWA update flow (Issue #310)

What happens when a new build ships to Production, and what an AI session or
human should tell a learner instead of "uninstall the app" / "clear site
data" — both of which would destroy locally-persisted progress for no
reason.

## Current behavior

- `vite.config.ts` sets `VitePWA({ registerType: 'prompt', injectRegister:
  false, ... })`. The service worker never auto-activates a new version and
  the plugin never auto-injects its own register script.
- `src/components/UpdatePrompt.tsx` is the sole registration point: it calls
  `useRegisterSW()` from `virtual:pwa-register/react` on mount (rendered
  once, globally, from `App.tsx`). Once the registration is available it
  explicitly calls `registration.update()` immediately, again when the app
  returns to the foreground/focus after a 5-minute throttle window, and once
  per hour while the app remains open. This avoids relying only on browser
  lifecycle heuristics, which left one installed Production PWA stuck on an
  older app shell in Issue #316.
- When a new worker finishes installing and is waiting, `useRegisterSW`'s
  `needRefresh` flips to `true` and `UpdatePrompt` shows a small "A new
  version is available." banner with an **Update** button.
- Tapping **Update** calls `updateServiceWorker(true)`, which posts
  `SKIP_WAITING` to the waiting worker and reloads once the new worker takes
  control (`controllerchange`, handled internally by the generated
  register script — guarded so it only reloads once, not in a loop).
- The current build identifier (`VITE_BUILD_SHA`, injected by
  `.github/workflows/deploy.yml` from the CI commit SHA) is always visible
  as `Build: <short sha>` at the bottom of the About/Settings page
  (`src/components/AboutContent.tsx`, `src/lib/buildInfo.ts`) — useful for
  confirming which build is actually running during QA, with or without an
  update prompt showing.

## What updating does and does not touch

- Activating the new worker replaces the app-shell precache (JS/CSS/HTML)
  managed by Workbox's `precacheAndRoute`/`cleanupOutdatedCaches`, and the
  page reloads to pick up the new shell.
- It does **not** touch `localStorage` (progress, settings — see
  `src/store/progressStore.ts`), IndexedDB, or the runtime media cache
  (`kana-game-media`, used for audio/images — see `PWA_RUNTIME_CACHING` in
  `vite.config.ts`). Those are separate storage the SW lifecycle never
  clears.
- Offline installability is unaffected: the manifest, icons, and
  `display: 'standalone'` config are unchanged by this work.

## For AI sessions / support: what to tell a learner

A learner who reports "the app looks old" or "my update isn't showing up"
after a known Production deployment should be told to:

1. Open the app and check the **Update** banner; tap **Update** if shown.
2. If no banner appears, bring the app to the foreground or relaunch it and
   give it a few seconds. Current builds explicitly call
   `ServiceWorkerRegistration.update()` on launch/foreground, with bounded
   throttling, so this is deterministic rather than relying only on browser
   heuristics.
3. Confirm the build id under Settings → About (`Build: <sha>`) matches (or
   postdates) the deployed commit.

### One-time recovery for installs older than Issue #316

Builds that predate the active `registration.update()` logic obviously cannot
execute that new logic until they have updated at least once. If such an old
installed PWA remains stuck, do not clear site data or uninstall it as the
first response. Use a same-origin browser reload/foreground attempt first so
the existing service-worker registration gets another update opportunity.
If that still does not move the build, use a non-destructive service-worker
update action (for example, remote browser debugging that invokes
`registration.update()`) while preserving site storage. Only clear storage or
reinstall as a final recovery option after local progress has been backed up
or the user explicitly accepts the data-loss risk.

Uninstalling the PWA or clearing site data/storage is **not** the correct
routine fix — it is unnecessary (this flow already delivers the update
safely) and destructive (it wipes local progress). Only suggest it if a
learner's install is actually corrupted in a way this normal update flow
cannot resolve, and say so explicitly as a last resort.

## Avoiding update/prompt loops

- `registerType: 'prompt'` plus the single `useRegisterSW()` call in
  `UpdatePrompt` is the only SW registration in the app — no duplicate
  registration means no duplicate `needRefresh` events.
- The generated register script's `controllerchange` handler reloads at
  most once per activation (it's not re-armed until another update is
  found), so tapping Update cannot cause a reload loop.
- `needRefresh` only becomes `true` when a genuinely new worker is
  installed and waiting, so the banner does not reappear for an already
  up-to-date build.
