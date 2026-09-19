# PWA update flow (Issue #310, #316)

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
  once, globally, from `App.tsx`). The browser's own SW lifecycle checks for
  a new `sw.js` on normal navigation/reload, same as any other PWA.
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

## Deterministic update checks (Issue #316)

Relying only on the browser's own service-worker lifecycle heuristics was not
reliable enough for an installed/standalone PWA that can stay open for a long
time — those checks are throttled, run only around navigation, and are easy
to miss if the learner never fully closes and reopens the app. Instead of
waiting on that, `UpdatePrompt` explicitly asks the existing registration to
check:

- `src/hooks/useServiceWorkerUpdateChecks.ts` receives the
  `ServiceWorkerRegistration` from `useRegisterSW`'s `onRegisteredSW`
  callback and calls `registration.update()`:
  - once as soon as the registration is available (effectively "on launch");
  - again on `window`'s `focus` event and on `visibilitychange` becoming
    `visible` (the app returning to the foreground);
  - on a bounded periodic timer (`PERIODIC_UPDATE_CHECK_MS`, default one
    hour) while the app stays open in one tab.
- All of the above share one throttle (`UPDATE_CHECK_THROTTLE_MS`, default
  60 seconds): rapid focus/visibility churn (e.g. quickly switching tabs)
  cannot trigger more than one network check per throttle window.
- `registration.update()` only fetches `sw.js` and, if it differs, installs
  the new worker in the background — it never activates a waiting worker or
  reloads the page by itself. The existing prompt-based Update UX from #310
  (`needRefresh` → banner → learner taps **Update** → `updateServiceWorker(true)`)
  is unchanged and is still the only thing that activates a new worker, so a
  mid-lesson reload without consent still cannot happen.
- This is the only place `registration.update()` is called and
  `UpdatePrompt` remains the only `useRegisterSW()`/registration call in the
  app, so this does not introduce a second service-worker registration or a
  second `needRefresh` source.

### One-time recovery for installs that predate this fix

An install from before this change may be stuck on an old build if it was
never fully closed/reopened or navigated while a newer `sw.js` was live,
since it had no way to actively ask for an update check. For a learner
reporting this:

1. Fully close the installed PWA (not just background it) and reopen it, or
   do a manual reload — either now runs this deterministic check on launch.
2. If the **Update** banner still doesn't appear after a few seconds, check
   Settings → About's `Build: <sha>` against the deployed commit; if it's
   still stale, one manual reload is normally enough once this version of
   the app (with the launch/focus checks) is what's currently installed.
3. Only as an actual last resort — e.g. the install itself is corrupted in a
   way a normal update/reload cannot resolve — suggest uninstalling/clearing
   site data, and say explicitly that this will erase local progress.

Routine future deploys should not need this recovery path at all: the
launch/focus/periodic checks above make picking up a new build deterministic
without any manual intervention.

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
2. If no banner appears, do a normal reload/relaunch — the browser checks
   for a new service worker on navigation. Give it a few seconds.
3. Confirm the build id under Settings → About (`Build: <sha>`) matches (or
   postdates) the deployed commit.

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
- The launch/focus/visibility/periodic checks in
  `useServiceWorkerUpdateChecks` (#316) only ever call `registration.update()`
  — they cannot themselves activate a worker or reload the page, and the
  shared throttle plus the single registration above mean they cannot cause
  duplicate checks or duplicate `needRefresh` events either.
