# Asset optimization rollout (Issue #153)

Rollout of the human-approved Issue #150 recipe (`docs/history/asset-audits/asset-optimization-pilot-2026-09-01.md`)
to all eligible oversized runtime images. No gameplay, curriculum, scoring/review
rules, audio, or PWA cache policy were changed.

- Starting `main`: `066456d991efd8f5bb92c9a178147d35e2ee9399`
- Local original-assets backup (untouched): `../kana-game-original-assets-2026-09-01/`
- GitHub backup branch (untouched): `archive/pre-asset-optimization-2026-09-01` (`640173475600e587391f8724dff09e0e995e129c`)
- Machine-readable per-file data: [`asset-optimization-rollout-2026-09-01.json`](./asset-optimization-rollout-2026-09-01.json)

## Scope

Applied:
- `public/mascot/` (6 files)
- `public/guide/` (13 files — 6 already-WebP `ask-tamamizu-*`/`review-guide.webp`/`learn-tracing.webp`, 5 PNG→WebP conversions for `slide-particle-*`/`slide-special-katakana`/`ask-tamamizu-particle`, plus `order.png`/`restaurant-intro.png` counted under mascot)
- `public/restaurant-dishes/` (28 files, all four dish categories)
- `public/summary-results/` (5 files)
- `public/similar-letters/` (2 files — both materially large relative to their `max-w-xs` display size)

Not touched: `public/word-icons/`, category icons, favicon/app icons, `design/`,
audio, and small guide slides already under ~120 KB (`slide-chouon-*`,
`slide-youon.webp`, `slide-welcome.webp`, `slide-kana-sounds.webp`, etc.),
`practice-guide.webp` (68 KB, already small), and
`ask-tamamizu-special-katakana.webp` (241 KB, already re-encoded in a prior
pass — pix_fmt `yuv420p`, not part of this rollout's before/after set).

## Recipe applied (per Issue #150 / #153)

Sizing rule confirmed per usage group directly in code before conversion:

| Usage group | Component / className | Max CSS display size | 3× target |
|---|---|---|---|
| `mascot/{normal,correct,incorrect,streak}.webp` | `Mascot.tsx` `h-24 w-auto` | 96px height | 288px height |
| `mascot/order.png` | `RestaurantPage.tsx` `h-28 w-28 sm:h-32 sm:w-32` | 128px (sm) | 384px |
| `mascot/restaurant-intro.png` | `RestaurantPage.tsx` `h-auto w-full max-w-md` | 448px width | 1344px — exceeds source (1254px); native-resolution re-encode, no upscale |
| `restaurant-dishes/**/*.webp` (`DishGlyph`) | `RestaurantPage.tsx` largest `h-24 w-24` | 96px | 288px |
| `summary-results/*.webp` | `PracticeScoreVisual.tsx` `h-56 w-56 sm:h-64 sm:w-64` | 256px (sm) | 768px |
| `guide/ask-tamamizu-*`, `guide/slide-particle-*`, `guide/slide-special-katakana` | `ConceptGuide.tsx` (via IntroGuide/ParticleGuide/ReviewGuide/SpecialKatakanaGuide/YouonGuide/ChouonGuide) `w-full h-auto sm:w-auto sm:max-h-[60vh]` | full mobile width / ≤60vh desktop | source (941–1536px) already at/below a realistic 3× target; native-resolution re-encode, no downscale (same treatment the pilot used for `slide-particle-3.png`) |
| `guide/review-guide.webp` | `ReviewGuide.tsx` `w-full max-w-xl` (distinct — no `sm:` breakpoint, no height cap) | 576px width | 1728px — exceeds source (1599px); native-resolution re-encode |
| `guide/learn-tracing.webp` | `LearnTracingGuide.tsx` `max-h-56 w-full max-w-sm sm:max-h-64` (distinct sizing rule) | 256px height (sm) | 768px height — below source (1285px); downscaled |
| `similar-letters/{shi-tsu,so-n}.webp` | `LearnPage.tsx` / `TracingPage.tsx` `w-full max-w-xs` (distinct — same image reused across both routes) | 320px width | 960px — exceeds source (1249px/1161px); native-resolution re-encode |

Encoding: `ffmpeg` (9.0, `libwebp` encoder), Lanczos scaling where downscaled.
Alpha-bearing sources: q82. Opaque illustration PNGs: q85. No upscaling. No
AVIF/new-format comparison, no aggressive quality sweep — same conservative
settings the pilot validated.

For the 7 PNG→WebP conversions (`mascot/order.png`, `mascot/restaurant-intro.png`,
`guide/ask-tamamizu-particle.png`, `guide/slide-particle-{1,2,3}.png`,
`guide/slide-special-katakana.png`), every active source/test reference was
updated to the new `.webp` path and the old PNG was `git rm`'d — verified zero
remaining `.png` references to these paths anywhere in `src/`.

`mascot/correct.webp` / `streak.webp`: still byte-identical after independent
re-encoding (both from the same source art, same recipe). Per the issue, no
URL dedup was made — both logical paths were optimized independently, keeping
the existing simple two-file structure.

## Savings

| Directory | Before | After | Saved | Reduction |
|---|---:|---:|---:|---:|
| `public/mascot` | 8,302,329 B (7.9 MiB) | 360,014 B (352 KiB) | 7,942,315 B | 95.7% |
| `public/guide` | 18,067,810 B (17.2 MiB) | 3,438,236 B (3.3 MiB) | 14,629,574 B | 81.0% |
| `public/restaurant-dishes` | 31,583,480 B (30.1 MiB) | 594,006 B (580 KiB) | 30,989,474 B | 98.1% |
| `public/summary-results` | 5,978,450 B (5.7 MiB) | 886,924 B (866 KiB) | 5,091,526 B | 85.2% |
| `public/similar-letters` | 444,604 B (434 KiB) | 37,922 B (37 KiB) | 406,682 B | 91.5% |
| **Total (these 5 directories)** | **64,376,673 B (61.4 MiB)** | **5,317,102 B (5.1 MiB)** | **59,059,571 B (56.3 MiB)** | **91.7%** |

53 files changed. Every file individually exceeds the >50% reduction bar (all
in the 81–99% range); no file was made larger than its source, upscaled
beyond source resolution, or lost its alpha channel.

## Mechanical verification

Per-file automated checks (full results in the JSON), for all 53 changed files:

- decodes via `ffprobe` — pass, all 53
- aspect ratio preserved within rounding tolerance — pass, all 53
- never larger than source dimensions (no upscale) — pass, all 53
- alpha preserved where source had it (opaque sources stay opaque) — pass, all 53
- referenced runtime path exists — pass, all 53
- removed PNG paths (`mascot/order.png`, `mascot/restaurant-intro.png`,
  `guide/ask-tamamizu-particle.png`, `guide/slide-particle-{1,2,3}.png`,
  `guide/slide-special-katakana.png`) have zero remaining references in `src/`
  or `index.html` — confirmed via repo-wide grep
- excluded small asset classes (`word-icons/`, category icons, favicon/app
  icons, `design/`, audio, small guide slides, `practice-guide.webp`) —
  confirmed untouched via `git status`

## Representative visual review

Side-by-side (source | candidate, flattened to white where alpha applies)
generated in a repo-external comparison folder for:

- `mascot/normal.webp` — mascot alpha (bust art, transparent background)
- `guide/slide-particle-3.png` → `.webp` — guide text/line art (small Latin captions + kana)
- `restaurant-dishes/katakana/chikin.webp` — restaurant dish alpha (plate/food edges)
- `summary-results/summary-result-5.webp` — summary-result alpha (sparkle/highlight edges)
- `similar-letters/shi-tsu.webp` — new sizing-rule class (`max-w-xs`, shared across two routes)
- `guide/learn-tracing.webp` — distinct sizing rule (`max-h-56/64`, downscaled)
- `guide/review-guide.webp` — distinct sizing rule (`max-w-xl`, no `sm:` breakpoint)
- `mascot/restaurant-intro.png` → `.webp` — opaque PNG→WebP, native resolution, in-scene photographic art with overlaid dialogue text

All eight showed clean edges, correct alpha, crisp text/line art, and no
visible compression artifacting or regression at their respective display
target sizes.

## Verification gap — real-browser check not performed

The approved plan calls for a desktop and ~360px-mobile real-browser check
(load failure, clipping, distortion, transparency, text/line art, obvious
visual regression) in addition to the tooling/side-by-side checks above. No
browser automation tool was available in this session to drive the app's dev
server and capture that check. This is being reported explicitly as an
**unmet verification gap**, not marked complete — a human or a session with
browser access should confirm the above representative classes (and ideally
the PNG→WebP conversions specifically, since those also changed URLs/build
output) render correctly at both viewport sizes before merge.

## `npm run verify`

- `npx vitest run` — 1344 tests passed (83 files), including the two focused
  reference-path fixes below
- `oxlint` — clean
- `tsc -b && vite build` — clean production build
- `git diff --check origin/main...HEAD` — clean

Two stale PNG references (missed by the initial per-usage edit pass) were
caught by the focused test run and fixed before the full verify: `mascot/order.png`
and `mascot/restaurant-intro.png` string assertions in `RestaurantPage.test.tsx`.

## Guardrails followed

- No changes to `../kana-game-original-assets-2026-09-01/` or `archive/pre-asset-optimization-2026-09-01`.
- No `word-icons/`, category-icon, favicon/app-icon, or `design/` files touched.
- No audio, gameplay, curriculum, scoring/review-rule, or PWA cache-policy changes.
- No new image format introduced (WebP only).
- No aggressive quality sweep or AVIF comparison — same conservative q82/q85 settings as the pilot.
- Git history not rewritten.
