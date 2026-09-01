# Runtime audio codec pilot (Issue #151)

Pilot on a small representative set of runtime WAV clips, following up on the
Issue #148 asset audit
(`docs/history/asset-audits/asset-audit-2026-09-01.md`). **No production
audio was changed.** All candidate files were generated in a repo-external
comparison folder for objective measurement and human listening.

- Starting `main`: `206bf621b33e48109739470923762714d90773b9`
- Local original-assets backup (untouched): `../kana-game-original-assets-2026-09-01/`
- GitHub backup branch (untouched): `archive/pre-asset-optimization-2026-09-01` (`640173475600e587391f8724dff09e0e995e129c`)
- Comparison folder (repo-external, not committed):
  `../kana-game-issue151-audio-candidates-2026-09-01/`
  - `original/` — the 10 pilot source WAVs
  - `mp3/`, `aac/`, `opus/` — per-codec candidates
  - `metrics/metrics.json` — full objective metrics (30 rows: 10 samples × 3 codecs)
  - `metrics/commands.txt` — every exact ffmpeg command run
  - `browser-check/` — temporary, uncommitted static page + Opus/AAC copies used for a real desktop-browser playback smoke test
  - `manifest.md` — human-listening comparison guide and checklist

Existing WAVs are already mastered/loudness-normalized (per prior generation
history); **no normalization was applied here** — the shipped WAVs were used
as-is as the codec-comparison source.

## Tooling

`ffmpeg version 9.0-full_build-www.gyan.dev` (libavcodec 63.1.100), with the
`libmp3lame`, native `aac`, and `libopus` encoders.

## Representative sample (10 clips)

Reused Issue #148's inventory (`asset-inventory-2026-09-01.json`, 518 runtime
WAV entries) to select samples rather than re-surveying the corpus. Both
runtime source sample rates are represented (107 files at 44.1 kHz, 411 at
24 kHz per the Issue #148 audit).

| # | Sample | Source path | Category | Source rate | Source duration |
|---|---|---|---|---|---|
| 01 | `01-na-shortkana` | `public/audio/characters/na.wav` | very short single-kana | 44.1 kHz | 0.504 s |
| 02 | `02-shi-fricative` | `public/audio/characters/shi.wav` | fricative (し) | 44.1 kHz | 0.560 s |
| 03 | `03-tsu-affricate` | `public/audio/characters/tsu.wav` | affricate (つ) | 44.1 kHz | 0.621 s |
| 04 | `04-cha-youon` | `public/audio/characters/cha.wav` | yōon (ちゃ) | 44.1 kHz | 1.281 s |
| 05 | `05-katakana-fa-specialkatakana` | `public/audio/characters/katakana-fa.wav` | Special Katakana (ファ) | 24 kHz | 0.578 s |
| 06 | `06-na-natsu-word` | `public/audio/words/na-natsu.wav` | word clip | 24 kHz | 1.720 s |
| 07 | `07-correct-seikai-feedback` | `public/audio/feedback/correct_seikai.wav` | feedback | 24 kHz | 0.793 s |
| 08 | `08-intro-welcome-guide` | `public/audio/guide/intro-welcome.wav` | guide narration | 24 kHz | 4.000 s |
| 09 | `09-misoshiru-restaurant` | `public/audio/restaurant/hiragana/misoshiru.wav` | restaurant phrase | 24 kHz | 0.865 s |
| 10 | `10-chouon-8-longest` | `public/audio/guide/chouon-8.wav` | longest runtime clip (guide narration) | 24 kHz | 26.593 s |

All 10 sources are `pcm_s16le` mono, matching the Issue #148 finding that
every runtime WAV is uncompressed PCM16 mono.

## Codec candidates

One conservative setting per codec was generated; no second bitrate/quality
tier was needed (no candidate showed a clear artifact, see Human listening
below), so no quality sweep was run.

| Codec | Container | Encoder | Bitrate | Channels | Sample rate handling |
|---|---|---|---|---|---|
| MP3 | `.mp3` | `libmp3lame` | 96 kbps CBR | mono (`-ac 1`) | preserved (`-ar` set to source rate) |
| AAC-LC | `.m4a` | native `aac` | 96 kbps CBR | mono (`-ac 1`) | preserved (`-ar` set to source rate) |
| Opus | `.opus` (Ogg) | `libopus` | 48 kbps | mono (`-ac 1`) | **forced to 48 kHz internally by libopus** regardless of source rate — see below |

Exact commands (per sample, `$rate` = source sample rate probed via `ffprobe`):

```
ffmpeg -y -i original/<sample>.wav -c:a libmp3lame -b:a 96k -ar $rate -ac 1 mp3/<sample>.mp3
ffmpeg -y -i original/<sample>.wav -c:a aac        -b:a 96k -ar $rate -ac 1 aac/<sample>.m4a
ffmpeg -y -i original/<sample>.wav -c:a libopus    -b:a 48k          -ac 1 opus/<sample>.opus
```

Full log of all 30 invocations: `metrics/commands.txt`.

**Opus internal sample rate**: libopus only operates at 8/12/16/24/48 kHz
internally. ffmpeg's Opus encoder resamples both the 44.1 kHz and 24 kHz
sources up to 48 kHz before encoding — every Opus candidate's decoded
`sample_rate` reports `48000` regardless of source rate. This is expected
Opus codec behavior, not a pilot misconfiguration, and would apply to all
518 files if Opus is adopted for rollout.

## Objective metrics

Full per-sample-per-codec data (30 rows) in `metrics/metrics.json`. Summary:

| Codec | Total candidate bytes (10 samples) | Overall size reduction | Any clipping | Any decode failure | Max \|leading pad\| | Max \|trailing pad\| |
|---|---:|---:|---|---|---:|---:|
| MP3 | 460,365 B | 76.0% | no | no | 3.4 ms | 2.1 ms |
| AAC-LC/M4A | 443,204 B | 76.9% | no | no | 0.7 ms | 0.1 ms |
| Opus | 176,727 B | 90.8% | no | no | 3.4 ms | 12.6 ms |

(Source total for the 10 samples: 1,920,724 bytes.)

Per-sample detail:

| Sample | Codec | Src bytes | Cand bytes | Reduction | Duration Δ (s) | Lead pad Δ (s) | Trail pad Δ (s) | Peak (dB) | Clip | Decode OK |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| 01-na | MP3 | 44,530 | 6,940 | 84.4% | 0.0000 | 0.0001 | 0.0001 | -3.6 | no | yes |
| 01-na | AAC | 44,530 | 7,512 | 83.1% | 0.0000 | -0.0001 | 0.0000 | -0.9 | no | yes |
| 01-na | Opus | 44,530 | 2,785 | 93.7% | 0.0065 | 0.0001 | 0.0080 | -3.5 | no | yes |
| 02-shi | MP3 | 49,470 | 7,567 | 84.7% | 0.0000 | 0.0000 | 0.0001 | -1.9 | no | yes |
| 02-shi | AAC | 49,470 | 8,193 | 83.4% | 0.0000 | 0.0000 | 0.0001 | -1.5 | no | yes |
| 02-shi | Opus | 49,470 | 3,467 | 93.0% | 0.0065 | 0.0000 | -0.0000 | -1.7 | no | yes |
| 03-tsu | MP3 | 54,850 | 8,194 | 85.1% | 0.0000 | 0.0000 | 0.0001 | -1.9 | no | yes |
| 03-tsu | AAC | 54,850 | 8,913 | 83.8% | 0.0000 | 0.0000 | 0.0000 | -1.6 | no | yes |
| 03-tsu | Opus | 54,850 | 3,691 | 93.3% | 0.0065 | 0.0001 | 0.0001 | -1.7 | no | yes |
| 04-cha | MP3 | 113,068 | 16,344 | 85.5% | 0.0000 | 0.0000 | 0.0014 | -1.9 | no | yes |
| 04-cha | AAC | 113,068 | 16,910 | 85.0% | 0.0000 | -0.0007 | 0.0000 | -1.4 | no | yes |
| 04-cha | Opus | 113,068 | 6,373 | 94.4% | 0.0065 | 0.0016 | 0.0036 | -1.6 | no | yes |
| 05-fa | MP3 | 27,822 | 8,108 | 70.9% | 0.0000 | 0.0000 | 0.0021 | -5.8 | no | yes |
| 05-fa | AAC | 27,822 | 7,095 | 74.5% | 0.0000 | 0.0000 | 0.0000 | -5.2 | no | yes |
| 05-fa | Opus | 27,822 | 3,400 | 87.8% | 0.0065 | -0.0019 | -0.0126 | -4.6 | no | yes |
| 06-natsu | MP3 | 82,638 | 21,644 | 73.8% | 0.0000 | 0.0000 | 0.0000 | -2.3 | no | yes |
| 06-natsu | AAC | 82,638 | 19,456 | 76.5% | 0.0000 | 0.0000 | 0.0000 | -2.1 | no | yes |
| 06-natsu | Opus | 82,638 | 7,556 | 90.9% | 0.0065 | 0.0000 | 0.0103 | -2.1 | no | yes |
| 07-seikai | MP3 | 38,144 | 10,700 | 71.9% | 0.0009 | -0.0003 | 0.0009 | -5.6 | no | yes |
| 07-seikai | AAC | 38,144 | 11,410 | 70.1% | 0.0000 | 0.0000 | 0.0000 | -5.3 | no | yes |
| 07-seikai | Opus | 38,144 | 4,668 | 87.8% | 0.0065 | -0.0011 | -0.0052 | -5.3 | no | yes |
| 08-welcome | MP3 | 192,078 | 49,004 | 74.5% | 0.0000 | 0.0000 | 0.0000 | -6.2 | no | yes |
| 08-welcome | AAC | 192,078 | 51,815 | 73.0% | 0.0000 | 0.0000 | 0.0000 | -5.8 | no | yes |
| 08-welcome | Opus | 192,078 | 22,616 | 88.2% | 0.0065 | 0.0000 | 0.0033 | -5.5 | no | yes |
| 09-misoshiru | MP3 | 41,598 | 11,564 | 72.2% | 0.0010 | 0.0034 | 0.0010 | -6.0 | no | yes |
| 09-misoshiru | AAC | 41,598 | 11,653 | 72.0% | 0.0000 | 0.0000 | 0.0000 | -5.5 | no | yes |
| 09-misoshiru | Opus | 41,598 | 5,153 | 87.6% | 0.0065 | 0.0034 | -0.0007 | -5.4 | no | yes |
| 10-chouon-8 | MP3 | 1,276,526 | 320,300 | 74.9% | 0.0013 | 0.0000 | 0.0000 | -4.8 | no | yes |
| 10-chouon-8 | AAC | 1,276,526 | 300,247 | 76.5% | 0.0000 | 0.0000 | 0.0000 | -4.5 | no | yes |
| 10-chouon-8 | Opus | 1,276,526 | 117,018 | 90.8% | 0.0065 | -0.0000 | 0.0000 | -4.4 | no | yes |

Notes:

- No clipping (`max_volume >= -0.1 dB`) and no decode failure across any of
  the 30 candidates.
- All duration deltas and leading/trailing silence deltas are **sub-13ms**
  across all codecs and all samples, including the shortest clips (01–05,
  0.5–1.3s). Opus's largest single trailing-padding change was 12.6 ms
  (sample 05, a *reduction* in trailing silence, not an addition). MP3/AAC
  padding changes are all under 3.5 ms.
- Per the issue's caution, padding of tens of ms matters proportionally more
  for very short kana clips (samples 01–05 are 0.5–1.3s) — this pilot's
  worst case (12.6 ms on a 0.578s clip, ~2.2% of clip length) is flagged
  here explicitly rather than dismissed, but was covered by the human
  listening pass below, which did not flag an audible issue on that sample.
- **Metrics alone do not establish pronunciation/quality safety** — see
  Human listening below, which is required before any rollout decision.

## Human listening comparison

Comparison set built in `../kana-game-issue151-audio-candidates-2026-09-01/`
(`original/`, `mp3/`, `aac/`, `opus/`, `manifest.md` — full checklist and
per-sample table). Kept to the 10 pilot samples to avoid overloading review
effort, per the issue's guidance.

**Result: the user listened to all 10 samples across all three codecs**
(original → MP3 → AAC → Opus) and confirmed no issues against the manifest's
checklist — specifically checked samples 01–05 (short kana, fricative,
affricate, yōon, Special Katakana) for consonant clipping or click/pop
artifacts. No candidate failed a check point.

## Browser compatibility

Production runtime (`src/audio/staticFileProvider.ts`) was **not modified**
— it still hardcodes `.wav` (`audioEl.src = ...audio/${request.key}.wav`).

A temporary, uncommitted static file server + a standalone HTML page (kept
entirely in the external candidates folder, never touching the repo) was
used to smoke-test playback of the leading candidate (Opus) and AAC through
a real `<audio>` element:

- Desktop browser: **confirmed working.** The user opened the page and
  confirmed both `canPlayType` support and actual audible playback for the
  Opus (`audio/ogg; codecs=opus`) and AAC (`audio/mp4; codecs=mp4a.40.2`)
  candidate files.
- **Smartphone / PWA verification: not performed — explicit verification
  gap.** No physical iPhone/Android device or mobile browser was available
  in this session. Per the issue, iPhone/Android compatibility is a
  **required rollout gate**, not something to assume from codec
  specifications — Opus-in-Ogg in particular has historically had uneven
  native `<audio>` support on Safari/iOS compared to Chrome/Android, so this
  must be verified on real devices (or their equivalents) before any
  broader rollout, independent of this pilot's desktop result.

## Decision

**Recommendation: A — one codec/container/setting for full runtime audio
rollout, specifically Opus (Ogg container) at a conservative speech
bitrate.**

Reasoning:

- Opus gave the largest size reduction (90.8% vs. 76–77% for MP3/AAC) with
  no clipping, no decode failures, and padding differences in the same
  sub-13ms range as MP3/AAC — well within what the human listening pass
  confirmed as inaudible across all 10 samples, including the
  pronunciation-critical short/fricative/affricate/yōon/Special-Katakana set
  (01–05).
- MP3 and AAC did not show any quality or reliability advantage over Opus in
  this pilot that would justify their ~2.4x larger footprint; there was no
  concrete decision-changing reason found to split settings by clip length
  (option B), since the longest clip (10, 26.6s narration) showed no worse
  behavior than the shortest clips.
- This recommendation is **conditional on the outstanding smartphone/PWA
  browser-compatibility verification gap above being closed** before rollout
  — desktop-only verification is not sufficient per the issue's explicit
  gate, and Opus/Ogg format support is the more likely of the three codecs
  to have real per-platform gaps on iOS.

If the mobile/PWA check surfaces a real Opus playback gap on a required
platform, AAC-LC/M4A is the next-best fallback recommendation from this
pilot's data (broader native format support than Opus historically, better
compression than MP3, no measured quality issues here).

### Projected full-runtime savings (estimate)

Applying this pilot's aggregate ratio (176,727 / 1,920,724 = 9.20% of
original size, i.e. 90.8% reduction) to the full Issue #148 runtime audio
total (518 files, 49,373,726 bytes):

- **Estimated projected total runtime audio bytes if all 518 WAVs were
  converted to Opus at this pilot's setting: ~4.54 MB** (49,373,726 ×
  0.0920 ≈ 4,542,383 bytes).
- **Estimated projected savings: ~44.8 MB (~90.8%)** of the current 47.1 MiB
  runtime audio total.

This is an **estimate only**, extrapolated from a 10-file pilot ratio (2% of
the 518-file corpus) — it is not a measured result for the full corpus and
should not be treated as more precise than the underlying sample size
suggests. Actual full-corpus compression ratio will vary per clip based on
content (silence proportion, spectral complexity) and is not established by
this pilot.

## Guardrails followed

- No production WAV replaced or deleted — all 518 runtime files under
  `public/audio/` are untouched (verified: pilot only read from `public/`,
  never wrote to it).
- No runtime audio URL/filename changed — `src/audio/staticFileProvider.ts`
  is unmodified.
- No PWA cache policy changed — `vite.config.ts` is unmodified.
- No loudness normalization or remastering — all candidates were encoded
  directly from the existing mastered WAVs with no `-af loudnorm` or gain
  adjustment.
- No gameplay/curriculum changes.
- No unrelated refactor.
- No git history rewrite.
- No changes to `../kana-game-original-assets-2026-09-01/` or
  `archive/pre-asset-optimization-2026-09-01`.
- No bulk conversion — only the 10 representative pilot files were
  processed, all candidate binaries kept outside the repo.

## Verification

- `npm run verify` — pass (see PR for command output).
- `git diff --check origin/main...HEAD` — pass.
- Only this report was added under version control; no runtime code, audio,
  image, or curriculum files were changed by this pilot.

## Files

- This report.
- Candidate audio, metrics JSON, ffmpeg command log, and the temporary
  browser-check page all live in
  `../kana-game-issue151-audio-candidates-2026-09-01/` (repo-external, not
  committed).
