# Asset optimization pilot (Issue #150)

Pilot on a small representative set of oversized runtime images, following up
on the Issue #148 asset audit (`docs/history/asset-audits/asset-audit-2026-09-01.md`).
**No production images were changed.** All candidate files were generated in a
repo-external comparison folder for human review.

- Starting `main`: `33b07ff5d671104940d04fdfcd5c4dd24d123a1c`
- Local original-assets backup (untouched): `../kana-game-original-assets-2026-09-01/`
- GitHub backup branch (untouched): `archive/pre-asset-optimization-2026-09-01` (`640173475600e587391f8724dff09e0e995e129c`)
- Comparison folder (repo-external, not committed):
  `../kana-game-issue150-candidates-2026-09-01/`
  - `source/` — copies of the six pilot source files
  - `candidates/` — generated candidate files
  - `compare/` — side-by-side PNGs (source | candidate) for human review, flattened onto a white background so alpha is visible

## Tooling

No `cwebp`/ImageMagick available in this environment. Used `ffmpeg` (9.0,
`libwebp` encoder) for both resizing (Lanczos) and WebP encoding — it
preserves alpha (`yuva420p` output confirmed per-file below) and supports
explicit quality control via `-q:v`.

```
ffmpeg -i <source> -vf "scale=<w>:<h>:flags=lanczos" -c:v libwebp -lossless 0 -q:v <q> <out>.webp
```

Sizing rule applied per the issue: 3× the actual measured CSS display height/width
(high-DPI safety margin), verified against source code, not guessed. Where the
source was already smaller than the 3× target, no upscale was performed —
the file was simply re-encoded as WebP (PNG candidates) or left at native
resolution (already-WebP candidate for the guide slide).

## CSS display-size evidence

| File | Usage site | Measured CSS max size |
|---|---|---|
| `mascot/normal.webp` (also `incorrect.webp`) | [Mascot.tsx:21](../../../src/components/Mascot.tsx#L21) — `h-24 w-auto` | 96px height |
| `mascot/order.png` | [RestaurantPage.tsx:405](../../../src/routes/games/RestaurantPage.tsx#L405) — `h-28 w-28 ... sm:h-32 sm:w-32` | 128px (sm breakpoint) |
| `mascot/restaurant-intro.png` | [RestaurantPage.tsx:553](../../../src/routes/games/RestaurantPage.tsx#L553) — `h-auto w-full max-w-md` | 448px width (Tailwind `max-w-md`) |
| `guide/slide-particle-3.png` | [ConceptGuide.tsx:71](../../../src/components/ConceptGuide.tsx#L71) — `w-full h-auto ... sm:w-auto sm:max-h-[60vh]` (mobile-first, full width; desktop capped at 60vh) | full width on mobile, ≤60vh on desktop — source (1086×1448) is already at or below a realistic 3× target, so no upscale |
| `restaurant-dishes/katakana/chikin.webp` | [RestaurantPage.tsx:411](../../../src/routes/games/RestaurantPage.tsx#L411) — `DishGlyph` `h-24 w-24` (largest target size used) | 96px |
| `summary-results/summary-result-5.webp` | [PracticeScoreVisual.tsx:11](../../../src/components/PracticeScoreVisual.tsx#L11) — `h-56 w-56 sm:h-64 sm:w-64` | 256px (sm breakpoint) |

## Candidate set and results

All six candidates preserve aspect ratio. Alpha-bearing sources (mascot,
restaurant-dishes, summary-results — all confirmed `argb`/`yuva420p`) keep
alpha in the candidate (`yuva420p` confirmed in output ffprobe). The two
opaque illustration PNGs (`order.png`, `slide-particle-3.png`, both source
`rgb24`) have no alpha to preserve.

### 1. `public/mascot/normal.webp` (oversized mascot WebP, `h-24`)

- Source: 1672×941, 813,688 bytes, WebP, pix_fmt `argb`
  SHA-256 `18630dff07c21738685f37aec9e05bb693bf4c2e44035ad048786ec91305c0b9`
- Display target: 96px height → 3× = 288px height
- Candidate: `candidates/normal_288h_q82.webp` — 512×288, WebP q82, pix_fmt `yuva420p`
- Candidate bytes: 30,452 — **96.3% reduction**
- Alpha preserved: yes
- Command: `ffmpeg -i normal.webp -vf "scale=-1:288:flags=lanczos" -c:v libwebp -lossless 0 -q:v 82 out.webp`
- Visual check: `compare/mascot-normal_compare.png` — clean edges, no visible banding/artifacting at target display size.

### 2. `correct.webp` / `streak.webp` byte-identical pair

- Confirmed still byte-identical: SHA-256
  `3656785bbf4820dab6bd361aa1d4771e131b86eccee6df0375f54291dbfe11b7` for both
  (1672×941, 1,115,282 bytes each).
- **No file change made in this pilot** (per the issue: assess only, don't
  change runtime behavior yet). Future dedup (e.g. `streak.webp` reusing the
  `correct.webp` URL, or a build-time symlink/copy step) is worth doing
  alongside the mascot resize rollout, since both would currently need the
  same 288px-height re-encode — but that is a separate decision to make
  explicitly, not an automatic consequence of this pilot.

### 3. `public/guide/slide-particle-3.png` (largest guide PNG)

- Source: 1086×1448, 2,048,773 bytes, PNG, pix_fmt `rgb24` (opaque)
  SHA-256 `e7d4a3f2671756cab0e95a9f20ac852229842cc255bc26b21f3543e5d6c28369`
- Display target: full width on mobile, ≤60vh on desktop. Source resolution
  is already below a realistic 3× mobile-width target, so this candidate is
  a **format comparison only** (PNG source vs. WebP re-encode at native
  resolution), not a downscale.
- Candidate: `candidates/slide-particle-3_native_q85.webp` — 1086×1448 (native), WebP q85, pix_fmt `yuv420p`
- Candidate bytes: 139,396 — **93.2% reduction**
- Alpha preserved: n/a (source has no alpha)
- Command: `ffmpeg -i slide-particle-3.png -c:v libwebp -lossless 0 -q:v 85 out.webp`
- Visual check: `compare/slide-particle-3_compare.png` — text (including small Latin captions) and line art remain crisp; no visible compression artifacts at full-slide viewing size.

### 4. `public/mascot/order.png` (multi-MB mascot PNG, confirmed small display size)

- Source: 1254×1254, 2,082,142 bytes, PNG, pix_fmt `rgb24` (opaque)
  SHA-256 `231562f34b7cfda53683ba6c3b3e31947a0ef84b4a14742cad84f7a908c48c93`
- Display target: 128px (sm:h-32) → 3× = 384px
- Candidate: `candidates/order_384_q85.webp` — 384×384, WebP q85, pix_fmt `yuv420p`
- Candidate bytes: 27,132 — **98.7% reduction**
- Alpha preserved: n/a (source has no alpha)
- Command: `ffmpeg -i order.png -vf "scale=384:384:flags=lanczos" -c:v libwebp -lossless 0 -q:v 85 out.webp`
- Visual check: `compare/order_compare.png` — no visible regression at target size.

### 5. `public/restaurant-dishes/katakana/chikin.webp` (large restaurant-dishes WebP)

- Source: 1254×1254, 1,507,448 bytes, WebP, pix_fmt `argb`
  SHA-256 `8cf3bb85954826756f47647418450d38ffa4e2243476661295a91b2f4535d8b7`
- Display target: 96px (`h-24 w-24`, largest `DishGlyph` size used) → 3× = 288px
- Candidate: `candidates/chikin_288_q82.webp` — 288×288, WebP q82, pix_fmt `yuva420p`
- Candidate bytes: 28,646 — **98.1% reduction**
- Alpha preserved: yes
- Command: `ffmpeg -i chikin.webp -vf "scale=288:288:flags=lanczos" -c:v libwebp -lossless 0 -q:v 82 out.webp`
- Visual check: `compare/chikin_compare.png` — plate edge and lettuce detail remain clean.

### 6. `public/summary-results/summary-result-5.webp`

- Source: 1659×948, 1,387,672 bytes, WebP, pix_fmt `argb`
  SHA-256 `700bcbbf58ab027a1b0c1ccd87b7ca3d7fa7536a86548658ddf8c699ac2c59ce`
- Display target: 256px height (`sm:h-64`) → 3× = 768px height
- Candidate: `candidates/summary-result-5_768h_q82.webp` — 1344×768, WebP q82, pix_fmt `yuva420p`
- Candidate bytes: 214,862 — **84.5% reduction**
- Alpha preserved: yes
- Command: `ffmpeg -i summary-result-5.webp -vf "scale=-1:768:flags=lanczos" -c:v libwebp -lossless 0 -q:v 82 out.webp`
- Visual check: `compare/summary-result-5_compare.png` — sparkle/highlight edges remain clean, no visible haloing.

## Summary table

| # | File | Source bytes | Candidate bytes | Reduction | Alpha preserved |
|---|---|---:|---:|---:|---|
| 1 | mascot/normal.webp | 813,688 | 30,452 | 96.3% | yes |
| 3 | guide/slide-particle-3.png | 2,048,773 | 139,396 | 93.2% | n/a |
| 4 | mascot/order.png | 2,082,142 | 27,132 | 98.7% | n/a |
| 5 | restaurant-dishes/katakana/chikin.webp | 1,507,448 | 28,646 | 98.1% | yes |
| 6 | summary-results/summary-result-5.webp | 1,387,672 | 214,862 | 84.5% | yes |

Item #2 (`correct.webp`/`streak.webp`) is an evidence-only dedup note, not a
byte-reduction candidate — see above.

Every candidate exceeds the issue's ">50% on oversized pilot files" bar.
Per-file percentages this high are expected: source WebPs/PNGs were encoded
at resolutions far beyond any actual on-screen use (e.g. 1254×1254 or
1672×941 source assets displayed at 96–256px), so most of the reduction
comes from resolution matching rather than aggressive quality reduction —
consistent with the issue's "prioritize resolution reduction before
aggressive quality reduction" guidance. WebP quality was kept conservative
(q82 for photographic/painterly alpha art, q85 for flat illustration PNGs);
a second, more aggressive quality pass was not evaluated because the
conservative pass already cleared the bar with no visible regression.

## Human review needed

Tooling comparisons above are evidence, not a verdict. Open the `compare/`
PNGs in `../kana-game-issue150-candidates-2026-09-01/compare/` (source left,
candidate right, flattened onto white to show alpha) and confirm at actual
device sizes (desktop and ~360px mobile) before any rollout decision.

## Verification

- `npm run verify` — pass (see command output in PR)
- `git diff --check origin/main...HEAD` — pass
- No runtime image bytes, URLs, PWA cache policy, gameplay, or curriculum data were changed by this pilot. Only this report was added under version control.

## Guardrails followed

- No bulk conversion — only the 6 representative pilot files were processed.
- No changes to `../kana-game-original-assets-2026-09-01/` or `archive/pre-asset-optimization-2026-09-01`.
- No `word-icons/` files touched.
- No new image format introduced (WebP only, as directed).
- No production runtime URLs, PWA cache policy, gameplay, or curriculum changed.
- Candidate binaries kept in a repo-external folder; only this report is committed.
