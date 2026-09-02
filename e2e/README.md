# Browser smoke suite (Playwright)

A small, bounded real-browser suite for KanaGame behaviors that Vitest/jsdom
cannot reliably prove: real layout/overflow at a narrow viewport, real
`<canvas>` pointer events, real hash-based routing, and a real
`<audio>`/`AudioContext` boundary. See [Issue #177](https://github.com/yhalcyon-GH/kana-game/issues/177)
for the full scope and guardrails.

This is deliberately **not** a general E2E or visual-regression project:

- Chromium only, no cross-browser matrix.
- No screenshot baselines / visual regression.
- No exhaustive route matrix — exactly the seven scoped flows below, one
  spec file each.
- Curriculum/SRS/selection logic is Vitest's job, not this suite's — these
  specs only click through a fixed representative row/checkpoint.

## Scope (one spec file each)

1. `introduction.spec.ts` — first launch shows the Introduction; Skip
   reaches Home.
2. `learn-practice.spec.ts` — a representative Hiragana row renders through
   Learn; the Practice Hub is reachable.
3. `restaurant.spec.ts` — a two-item Restaurant question fits a 320px
   viewport with no horizontal overflow and stays answerable.
4. `cafe.spec.ts` — a two-item Cafe question fits a 320px viewport, keeps
   the answer hidden until revealed, and stays answerable.
5. `tracing.spec.ts` — a Tracing lesson renders SVG stroke guides, accepts a
   pointer stroke, and Clear stays usable.
6. `recovery.spec.ts` — an unmatched route renders the not-found state; Go
   Home recovers.
7. `audio-boundary.spec.ts` — a pronunciation control can be activated
   without a learner-facing crash (no corpus-wide audio validation, no
   audible-device assertions).

## Determinism

`fixtures.ts`'s `seedProgress()` writes a known `kana-game-progress`
localStorage state via `page.addInitScript` before the app's own scripts
run, so every spec (other than `introduction.spec.ts`, which needs a
genuinely empty first-launch state) starts with every one-time Guide
overlay already marked completed — otherwise `IntroGuide` alone would block
every route (see `App.tsx`). Specs otherwise rely on fixed content (the
hiragana a-row, the `na-row`/`katakana-ha-row` checkpoints) rather than
random question order, per the repository's E2E guardrails.

Speech input is never exercised — headless Chromium has no
`SpeechRecognition`/microphone, so Restaurant/Cafe always fall through to
their existing Romaji-choice fallback UI, same as any learner without a
working mic.

## Running locally

```bash
npm install                              # once, to lock @playwright/test
npx playwright install --with-deps chromium   # once, to fetch the browser
npm run e2e
```

`playwright.config.ts`'s `webServer` builds the app and runs `vite preview`
against a fixed port automatically — no separate server step needed.

## Maintenance note

`fixtures.ts`'s `STORE_VERSION` constant mirrors
`src/store/progressStore.ts`'s `persist` `version`. It doesn't need to track
that value exactly (`mergePersistedProgress` tolerantly backfills every
field regardless), but if the store's version moves far ahead, bump this
constant to stay a reasonably close snapshot of what "already migrated"
progress state looks like.
