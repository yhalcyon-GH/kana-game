# Runtime audio codec pilot (Issue #151)

Pilot on a small representative set of runtime WAV clips, following up on the
Issue #148 asset audit
(`docs/history/asset-audits/asset-audit-2026-09-01.md`). **No production
audio was changed.** All candidate files were generated in a repo-external
comparison folder for objective measurement and targeted human listening.

- Starting `main`: `206bf621b33e48109739470923762714d90773b9`
- Local original-assets backup (untouched): `../kana-game-original-assets-2026-09-01/`
- GitHub backup branch (untouched): `archive/pre-asset-optimization-2026-09-01` (`640173475600e587391f8724dff09e0e995e129c`)
- Comparison folder (repo-external, not committed):
  `../kana-game-issue151-audio-candidates-2026-09-01/`
  - `original/` — the 10 pilot source WAVs
  - `mp3/`, `aac/`, `opus/` — per-codec candidates
  - `metrics/metrics.json` — full objective metrics (30 rows: 10 samples × 3 codecs)
  - `metrics/commands.txt` — every exact ffmpeg command run
  - `browser-check/` — temporary, uncommitted static page used for desktop codec playback checks
  - `manifest.md` — human-listening comparison guide

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

One conservative setting per codec was generated. The pilot is intended to
choose a safe deployment format, not to exhaustively optimize every codec.

| Codec | Container | Encoder | Bitrate | Channels | Sample rate handling |
|---|---|---|---|---|---|
| MP3 | `.mp3` | `libmp3lame` | 96 kbps CBR | mono (`-ac 1`) | preserved (`-ar` set to source rate) |
| AAC-LC | `.m4a` | native `aac` | 96 kbps CBR | mono (`-ac 1`) | preserved (`-ar` set to source rate) |
| Opus | `.opus` (Ogg) | `libopus` | 48 kbps | mono (`-ac 1`) | forced to 48 kHz internally by libopus |

Exact commands (per sample, `$rate` = source sample rate probed via `ffprobe`):

```sh
ffmpeg -y -i original/<sample>.wav -c:a libmp3lame -b:a 96k -ar $rate -ac 1 mp3/<sample>.mp3
ffmpeg -y -i original/<sample>.wav -c:a aac        -b:a 96k -ar $rate -ac 1 aac/<sample>.m4a
ffmpeg -y -i original/<sample>.wav -c:a libopus    -b:a 48k          -ac 1 opus/<sample>.opus
```

Full log of all 30 invocations: `metrics/commands.txt`.

**Opus internal sample rate:** libopus operates at 8/12/16/24/48 kHz
internally. ffmpeg therefore resampled these Opus candidates to 48 kHz. That
is expected codec behavior, but it is one additional transformation compared
with the selected MP3 recipe, which preserves the source sample rate.

## Objective metrics

Full per-sample-per-codec data (30 rows) is in the repo-external
`metrics/metrics.json`. Summary:

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

- No clipping (`max_volume >= -0.1 dB`) and no decode failure occurred across
  any of the 30 candidates.
- All duration deltas and leading/trailing silence deltas were sub-13 ms.
- MP3's measured padding/silence changes were all under 3.5 ms, including the
  pronunciation-critical short clips.
- Metrics alone do not prove subjective pronunciation quality; targeted human
  evidence is recorded below.

## Human listening evidence and review scope

The pilot deliberately uses **representative human checks rather than an
exhaustive 10 × 3 listening matrix**.

Recorded human evidence:

- **MP3:** representative MP3 pilot samples were listened to earlier and no
  audible noise, pronunciation problem, or boundary artifact was reported.
- **AAC-LC/M4A:** most checked samples were acceptable, but
  `01-na-shortkana.m4a` produced a slight click/pop. The current AAC recipe is
  therefore not selected for rollout.
- **Opus:** human quality evaluation was not completed in the user's original
  comparison environment because the Opus candidate could not be played
  there. This is not evidence that Opus quality is bad; it simply leaves the
  human gate incomplete for that candidate.

Given the existing representative MP3 listening pass, MP3's mature/lower-risk
browser support, the clean objective checks above, and the project's goal of
reducing unnecessary human verification cost, **no additional manual MP3
listening is required for this pilot**. The rollout should rely on automated
whole-corpus checks plus a small representative end-to-end smoke test rather
than asking the user to listen to hundreds of files.

## Browser / PWA compatibility

Production runtime (`src/audio/staticFileProvider.ts`) was not modified in
this pilot and still resolves `.wav` assets.

A temporary standalone desktop `<audio>` page was used during codec
exploration. That check confirmed browser-level playback for tested AAC/Opus
files, but it is **not** treated as a KanaGame runtime integration test.

For MP3, broad browser compatibility is one reason it is preferred over the
more compressed alternatives. Nevertheless, Issue #151 explicitly requires a
real browser/PWA rollout gate. Keep that gate small and integration-focused:

- one representative short pronunciation clip through the actual KanaGame
  audio path on desktop;
- one representative playback check on iPhone Safari / installed PWA;
- one representative playback check on Android Chrome / installed PWA.

These checks are for **format/integration compatibility**, not another broad
subjective audio-quality review. They may be completed during the separate
production rollout before merge; they do not require re-listening to all 10
pilot samples.

## Decision

**Recommendation: A — use one MP3 recipe for the full runtime rollout:**

- container/extension: `.mp3`
- encoder: `libmp3lame`
- bitrate: 96 kbps CBR
- channels: mono (`-ac 1`)
- sample rate: preserve each source file's existing 44.1 kHz or 24 kHz rate
- source: the existing mastered WAVs, with no re-normalization

Why MP3 rather than AAC or Opus:

- The project already has representative human evidence that the MP3 output
  is acceptable, so further listening would add verification cost without a
  proportionate risk reduction.
- All 10 MP3 candidates decoded successfully, showed no clipping, and kept
  measured duration/padding differences very small.
- MP3 reduces this pilot set by about 76%, which is already a large practical
  reduction from the current WAV footprint.
- AAC offers almost no size advantage over MP3 in this pilot (76.9% vs 76.0%)
  and the checked shortest AAC sample produced a slight click/pop.
- Opus compresses substantially better (90.8%), but its human gate remained
  incomplete and it introduces more container/platform validation burden.
  The additional savings are not worth increasing verification complexity for
  this project when MP3 already meets the core size/reliability objective.
- There is no evidence justifying a short-vs-long codec split; one format is
  simpler for URLs, caching, testing, and future asset production.

### Projected full-runtime savings (estimate)

Applying the measured MP3 pilot ratio
(460,365 / 1,920,724 = 23.97% of original size) to the full Issue #148 runtime
audio total (518 files, 49,373,726 bytes):

- **Estimated projected MP3 total: ~11.83 MB**
  (`49,373,726 × 0.23968 ≈ 11,834,046 bytes`).
- **Estimated projected savings: ~37.54 MB (~76.0%)**.

This is an estimate extrapolated from 10 representative files, not a measured
full-corpus result. The production rollout must report the actual total after
all 518 files are converted.

## Guardrails followed

- No production WAV replaced or deleted.
- No runtime audio URL/filename changed.
- No PWA cache policy changed.
- No loudness normalization or remastering.
- No gameplay/curriculum changes.
- No unrelated refactor.
- No git history rewrite.
- No changes to `../kana-game-original-assets-2026-09-01/` or
  `archive/pre-asset-optimization-2026-09-01`.
- No bulk conversion; only 10 representative pilot files were processed and
  candidate binaries remain outside the repo.

## Verification

- `npm run verify` — pass on the original report commit (1344 tests / 83 files,
  lint clean, `tsc -b && vite build` succeeded). CI must rerun on the amended
  report HEAD before merge.
- `git diff --check origin/main...HEAD` — pass on the original report commit;
  rerun/CI confirmation required on the amended HEAD.
- The committed change remains documentation-only; no runtime code or audio is
  part of this pilot PR.

## Next step

After this pilot PR is accepted, create a separate production rollout
Issue/PR that converts all 518 mastered WAVs to the exact MP3 recipe above,
updates runtime URLs/cache handling, runs automated whole-corpus validation,
and performs only the minimal representative cross-device integration checks
listed above before merge.
