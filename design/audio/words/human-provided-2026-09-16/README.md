# Word audio provenance — 2026-09-16 (Issue #272)

Source clips for the 8 kana-frequency-audit vocabulary additions (なべ/ネクタイ/ペン/ポケット/ユニフォーム/ゼロ/えんぴつ/これ).

- `<word-id>-source.mp3` — as supplied by the human (split from a single batch recording, see `manifest.json`), before loudness normalization.
- `manifest.json` — the original split manifest (word text, filename, timing offsets in the source batch).

`public/audio/words/<word-id>.mp3` is each source clip run through the same two-pass ffmpeg `loudnorm` (EBU R128, I=-16 LUFS / TP=-1.5 dBTP / LRA=11) used by `scripts/normalizeAudioLoudness.mjs` for the rest of the vocabulary, then resampled to mono 24kHz to match the app's existing word-audio convention.
