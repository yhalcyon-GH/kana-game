# AI-generated narrator audio archive (2026-08)

A snapshot of every character/word pronunciation clip as of 2026-08-17,
right before switching the narrator voice (characters + vocabulary) over
to the user's own recordings. Kept here for quick reuse if AI-generated
audio is ever wanted again for a specific word, a new script-generation
pass, or comparison against the new recordings.

**Not included:** Tamamizu's (mascot) feedback-line voice
(`public/audio/feedback/`) — that voice is staying as-is, this archive is
narrator audio only.

## What's here

- `characters/` — every single-kana character clip (208 files: hiragana,
  katakana, sokuon, chōon's ー, and all 拗音/yōon combinations).
- `words/` — every vocabulary word clip (262 files).

## Provenance

Built up across several provider switches over the course of one long
session (2026-08-16/17):

1. **ElevenLabs v3** (default voice `LX07LNNrSwlByKloPCtW`, then candidate
   `fWZkPh6JTVXYK2vuJIbv`) — original narrator voice for most word-level
   content.
2. **Azure Neural TTS** (`ja-JP-NanamiNeural`, S0 paid tier) — full
   hiragana/katakana/sokuon/chōon/yōon regeneration, using SSML
   `<phoneme alphabet="sapi">` to combine kanji display text (for natural
   prosody) with an exact accent-marked reading built from `accents.ts`.
3. **Azure HD voice** (`ja-JP-Nanami:DragonHDLatestNeural`) — used
   surgically for specific words the regular voice couldn't get right
   even with accent forcing.
4. **ElevenLabs (again)**, voice `XlX7zKbP19omFrVWQ8CU` — final pass for
   single-character (単音) audio specifically, since the user preferred
   this voice's isolated-character delivery.
5. **Loudness normalization** — every clip run through ffmpeg's
   `loudnorm` (EBU R128, -16 LUFS / -1.5dB true peak) to fix volume
   inconsistency across all the above.

See `scripts/azureRegenerateHiragana.ts`, `scripts/azureRegenerateRemaining.ts`,
`scripts/azureDragonHD*.ts`, `scripts/elevenLabsSingleChars*.ts`,
`scripts/normalizeAudioVolume.mjs`, and `scripts/buildAccentData.mjs` (pitch
accent dataset) for the actual generation pipeline — all still present in
`scripts/` and reusable if this voice is wanted again for a specific word.

## Reuse

To bring any single clip back into the live app, copy it into
`public/audio/characters/<id>.wav` or `public/audio/words/<id>.wav`
(same filenames as the live tree, so this is a straight copy-over).
