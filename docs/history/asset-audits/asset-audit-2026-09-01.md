# Asset audit — 2026-09-01 (Issue #148)

Audit-only pass. No production assets were converted, deleted, or moved. No PWA cache config was touched. No git history was rewritten.

## Backup

Before any inspection, every tracked image/audio file in `public/` and `design/` was copied, preserving relative paths, to a sibling directory outside the repo:

```
../kana-game-original-assets-2026-09-01/
```

- Files copied: 1548 / 1548
- Verification: SHA-256 of every source file was compared against its backup copy — **0 mismatches, 0 read errors**.
- The backup directory is untracked (outside the repo root) and was not added to git.
- `archive/pre-asset-optimization-2026-09-01` on GitHub was not touched.

Per-file backup verification results are included in [`asset-inventory-2026-09-01.json`](./asset-inventory-2026-09-01.json) (`backup_sha256_match`, `backup_size_match` fields).

## Scope

- `public/**` — runtime assets shipped to the deployed app.
- `design/**` — reference/master assets (source PSD-equivalents, AI-generation batches, pre-conversion originals), not shipped.
- No other tracked image/audio files exist outside these two trees.

Extensions covered: `.png .webp .jpg .jpeg .gif .svg .mp3 .wav .ogg .m4a`.

Total: **1548 files, 567,316,983 bytes (541 MiB)**.

## Per-extension totals

| Extension | Count | Total size |
|---|---|---|
| .png | 341 | 410.6 MiB (430,467,549 B) |
| .webp | 373 | 52.1 MiB (54,683,966 B) |
| .wav | 808 | 77.3 MiB (81,081,366 B) |
| .mp3 | 23 | 826.8 KiB (846,639 B) |
| .jpg | 2 | 222.6 KiB (227,941 B) |
| .svg | 1 | 9.3 KiB (9,522 B) |

## Per-directory totals

| Directory | Count | Total size |
|---|---|---|
| public/audio | 518 | 47.1 MiB |
| public/category-icons | 4 | 25.6 KiB |
| public/favicon.svg | 1 | 9.3 KiB |
| public/guide | 30 | 17.2 MiB |
| public/icons | 4 | 401.9 KiB |
| public/mascot | 6 | 7.9 MiB |
| public/restaurant-dishes | 28 | 30.1 MiB |
| public/similar-letters | 2 | 434.2 KiB |
| public/summary-results | 5 | 5.7 MiB |
| public/word-icons | 305 | 3.9 MiB |
| design/audio | 313 | 31.0 MiB |
| design/images | 332 | 397.2 MiB |

**Runtime totals** (everything under `public/`):
- Runtime images: **68.9 MB** (word-icons, mascot, guide, restaurant-dishes, category-icons, similar-letters, summary-results, favicon, apple-touch-icon)
- Runtime audio: **49.4 MB** (public/audio, all `.wav`)

**Design-reference total** (`design/`): ~428 MB — over 75% of the repo's tracked asset weight, and none of it ships to the deployed app. `design/images` alone (397 MB) is dominated by high-resolution AI-generation batches and originals.

## Largest 25 runtime assets

See `largest_25_runtime_assets` in [`asset-summary-2026-09-01.json`](./asset-summary-2026-09-01.json). The largest entries include multi-megabyte PNGs under `public/mascot/` and `public/guide/` (~1.7–2.2 MB), followed by large WebP illustrations under `public/restaurant-dishes/`, `public/summary-results/`, `public/mascot/`, and `public/guide/` (~1.1–1.5 MB). These are the highest-value image optimization candidates.

## Exact duplicates (by SHA-256)

5 duplicate groups found. Four are runtime↔design or design-only duplicates; one group is two different runtime paths with identical content and therefore may waste runtime/cache bytes if both URLs are fetched:

1. `public/audio/words/ma-ame.wav` ≡ `design/audio/words/ai-generated-2026-08/words/ma-ame.wav` — expected (design source retained alongside shipped copy).
2. `public/audio/words/youon-sha-juu.wav` ≡ `design/audio/words/ai-generated-2026-08/words/youon-sha-juu.wav` — same pattern.
3. `public/mascot/correct.webp` ≡ `public/mascot/streak.webp` — **both shipped**, byte-identical. Confirm intentional (streak reaction reusing the correct-answer art) before any future change; not altered here.
4. `design/images/word-illustrations/chatgpt-batch-2026-08-19/images/chouon-a-okaasan.png` ≡ `.../ha-haha.png` — design-only.
5. `design/images/word-illustrations/chatgpt-batch-2026-08-19/images/youon-cha-na-gyuuniku.png` ≡ `.../youon-ka-gyuuniku.png` — design-only.

Full list with hashes: `exact_duplicates` in the summary JSON.

## Large PNGs (>200 KB)

338 files, mostly under `design/images/` (AI-generation batches, originals). However, several multi-megabyte runtime PNGs also exist under `public/guide/` and `public/mascot/`; these are high-priority runtime optimization candidates. Full list in the summary JSON (`large_pngs_over_200kb`).

## Large WebPs (>100 KB)

48 files, all under `public/` (mascot, guide, restaurant-dishes, summary-results, similar-letters). These are shipped runtime assets and are the most relevant optimization candidates. Full list in `large_webps_over_100kb`.

### Resolution vs. actual display size (runtime WebPs)

Checked component usage for the largest groups:

- **`public/mascot/*.webp`** — 1672×941 px, 795 KB–1.09 MB each, but `Mascot.tsx` renders them at `h-24` (96 px tall; `className="h-24 w-auto ... object-contain"`). Source is ~10× the display resolution.
- **`public/guide/*.webp`** — 700–1800 px wide, ~1.1 MB each, used as full-width guide illustrations. Display size is closer to source resolution; less clearly oversized than mascot/summary assets, but worth checking per-screen breakpoint width in a follow-up.
- **`public/summary-results/*.webp`** — ~1660×940 px, ~1–1.2 MB each, session-summary illustrations. Same 1672×941 "hero" master size as mascot; actual on-screen size should be confirmed the same way before touching.
- **`public/restaurant-dishes/*.webp`** — 1254×1254 px, ~800 KB–1.1 MB, used in the Restaurant mini-game. Displayed on a game board; on-screen size needs confirming but these are square hero-scale masters like the rest.
- **`public/word-icons/*.webp`** — already 256×256 px, 2–12 KB (median 256×256). Already small; **not flagged for recompression**, per instructions not to touch already-small WebPs.

This is a resolution finding, not a format finding — several runtime WebPs already use an efficient codec but were exported at a "hero illustration" master resolution regardless of their small on-screen footprint (mascot in particular, rendered at ~1/17th its pixel area). A follow-up issue should downscale-to-display-size (with 2x/3x safety margin for high-DPI) rather than only recompress.

## WAV files

808 total, 518 of them runtime (`public/audio/**`), 290 in `design/audio/` (source/reference recordings and generation batches).

Runtime WAV stats (518 files, 47.1 MB, all `pcm_s16le`, mono):

- Duration: 0.32 s – 26.59 s, average 1.78 s (most are single kana/word/feedback clips; the 26.59 s outlier is likely a longer guide/explainer clip — worth a manual spot check before any batch processing).
- Sample rates in use: **44100 Hz and 24000 Hz** (mixed — reflects different generation sources per [prior audio-generation history](../../../Learnings.md), not a defect, but means any future codec pilot should test both source rates rather than assuming one).
- Channels: mono throughout.
- Codec: uncompressed PCM 16-bit throughout — no runtime audio is currently compressed at all.

**No format-only conclusion is drawn here.** The Acceptance Criteria explicitly rule out "WAV therefore MP3." What this audit does establish:

- 47 MB of runtime audio is 100% uncompressed PCM, which is the single largest concrete size-reduction opportunity in `public/`.
- Most clips are very short (median well under 2 s), which is exactly the case where MP3's ~1152-sample encoder delay/padding and low-bitrate artifacting matter most — short kana/word clips are disproportionately sensitive to trimming/clipping errors and to any perceptible pre/post-roll silence changes, since users hear them in isolation and repeatedly.
- Mixed 44.1 kHz / 24 kHz sources add another variable: naive re-encoding at a single fixed target rate could resample content that was never actually recorded at that rate.

**Recommendation for a future issue**: do not batch-convert. Pilot a codec change (e.g. WAV → AAC or Opus, not necessarily MP3) on a small, deliberately chosen sample — covering both source sample rates, at least one very short clip and one long outlier, spanning feedback/word/character categories — and do an actual listening pass (per [`feedback_audio_verification`](../../../Learnings.md), a human must confirm audio quality; do not claim it "sounds correct" from tooling alone) before considering wider rollout. Confirm gapless playback behavior in the app's actual `<audio>` playback path (`staticFileProvider.ts`), not just standalone player behavior, since encoder padding can introduce audible clicks/gaps specifically in rapid-fire quiz playback.

## Possibly-unused runtime assets

Reference-checking is heuristic: it greps `src/**/*.{ts,tsx,js,jsx,json}` (plus `vite.config.ts`) for each asset's basename, then separately confirmed `index.html` for the two root-level files that pattern missed. Audio/image paths are partly built dynamically from data-driven ids, so this is a **candidate list for manual confirmation, not a verified-dead list**.

After correcting for `index.html`-only references (favicon, apple touch icon — both confirmed referenced, removed from the candidate list), the following remain with **no matching identifier found anywhere in `src/`**:

- `public/audio/feedback/donmai.wav`
- `public/audio/feedback/ganbatte.wav`
- `public/audio/feedback/kakkoii.wav`
- `public/audio/feedback/zannen.wav`
- `public/audio/words/ha-haha.wav`
- `public/audio/words/sa-kazu.wav`
- `public/audio/words/ta-ito.wav`
- `public/word-icons/ha-haha.webp`
- `public/word-icons/sa-kazu.webp`
- `public/word-icons/ta-ito.webp`
- `public/word-icons/katakana-ma-suimingu.webp`
- `public/word-icons/katakana-ra-raion.webp`
- `public/word-icons/katakana-ya-daiya.webp`

Cross-checked `src/data/feedback.ts`: current feedback-line ids are `wrong_oshii`, `wrong_ganbare`, `wrong_daijoubu`, `correct_iine`, `correct_seikai`, `correct_sonochoushi`, `streak_5_sugoi`, `streak_8_kanpeki`, `streak_10_saikou`, `streak_15_perfect` — none of them is `donmai`/`ganbatte`/`kakkoii`/`zannen`, so those four `.wav` files appear to be from a retired feedback-line naming scheme.

`ha-haha`, `sa-kazu`, `ta-ito` and the three `katakana-*` word-icon ids have no matches in `src/data/*.ts` either, suggesting retired/renamed vocabulary entries whose audio+icon pairs were never cleaned up.

**Not deleted in this issue** — per guardrails (vocabulary/audio is locked, per [`feedback_kana_game_vocab_locked`](../../../Learnings.md), and this issue is audit-only). Recommend a small follow-up issue to confirm each id against `git log`/`git blame` history for `words.ts`/`feedback.ts` and remove only after explicit confirmation.

## Files

- [`asset-inventory-2026-09-01.json`](./asset-inventory-2026-09-01.json) — full per-file inventory (1548 entries): path, runtime/design-reference classification, format, byte size, SHA-256, backup verification result, image dimensions/alpha where applicable, audio duration/codec/sample-rate/channels/bitrate where applicable, and the reference heuristic.
- [`asset-summary-2026-09-01.json`](./asset-summary-2026-09-01.json) — aggregated machine-readable summary backing every table/list in this document.

## Explicitly out of scope for this issue

- No production image/audio was converted or recompressed.
- No file was deleted.
- No PWA cache configuration was changed.
- No git history was rewritten.
- Already-small WebPs (e.g. `word-icons/*`) were left alone, not re-touched.
- No heavy new dependency was added; hashing used Node's built-in `crypto`, image dimensions were read from raw file headers, and audio metadata used `ffprobe-static`, which was already an existing transitive dependency in `node_modules`.
