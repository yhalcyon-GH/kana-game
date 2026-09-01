# Runtime audio MP3 rollout (Issue #159)

- Starting WAV inventory: **518 files / 49,373,726 bytes**
- Production MP3 inventory: **518 files / 11,556,483 bytes**
- Actual reduction: **76.6%** (37,817,243 bytes saved)
- Encoder: `ffmpeg version 6.1.1-3ubuntu5 Copyright (c) 2000-2023 the FFmpeg developers`
- Recipe: `libmp3lame`, 96 kbps CBR, mono, preserve each source's 44.1 kHz or 24 kHz rate
- Source: current mastered WAVs; **no re-normalization, EQ, gain, trimming, or dynamics processing**

## Whole-corpus validation

All 518 files passed the production gate.

For the **508 files without a human-approved exception**, automation confirmed:

- MP3 decode success
- mono and source sample-rate preservation
- exact decoded PCM sample-count preservation
- no newly introduced PCM clipping
- 5 ms RMS onset/ending boundary checks at -35/-40/-45 dBFS, each within 20 ms
- one MP3 for every source WAV relative path

For the **10 automated outliers**, the exact A/B pairs were human-listened after the gate surfaced them. All were confirmed acceptable: no onset/end truncation, no click/pop, and no obvious pronunciation or quality degradation. The approved exception set is limited to the 10 reviewed paths and only allows the observed small sample-count/boundary differences; clipping, metadata/decode failures, a new path, >50 sample delta, or >50 ms boundary delta still fails automatically.

Maximum observed boundary deltas across all files and all three thresholds:

- leading: **40.00 ms**
- trailing: **34.92 ms**
- new clipping: **0 files**

Earlier single-threshold gates also flagged seven files (`pyu`, `a-ie`, `sokuon-iki`, `ni`, `nu`, `ro`, `so`). Targeted automated diagnostics showed threshold-dependent/frame-quantized boundary flips rather than consistent onset/end loss; those were resolved mechanically and did not require human listening.

## Runtime integration

`StaticFileProvider` changes from `.wav` to `.mp3`, with its URL contract test updated. Existing Workbox runtime caching matches `/audio/` independent of extension, so no cache-policy change is needed.

## Verification policy

Human verification is risk-based. Broad listening or routine physical-device checks are not required when whole-corpus and runtime-integration automation passes; escalate only a concrete unresolved anomaly. The 10 outliers above were escalated because automation could not conclusively classify them, and all 10 passed targeted listening.

## Current-main synchronization

The final rollout was rebased onto main `c5422a24e6640ef84eefeedc6031ee35cfbed368`. Main had renamed 13 word IDs after the corpus validation run. Their already-validated MP3 blobs were reused byte-for-byte under the new IDs, so no re-encoding or audio-content change occurred. The detailed JSON records the 13 path mappings under `main_sync`.
