# AI-generated word audio archive (2026-08)

A snapshot of every vocabulary-word pronunciation clip as of 2026-08-17.
The user has decided to keep using this AI-generated narrator voice for
word audio going forward (2026-08-19) — only トースト
(`katakana-ta-toosuto`) has been replaced with a real recording so far,
see `words/katakana-ta-toosuto.mp3` (the AI-generated take is kept
alongside it as `words/katakana-ta-toosuto.wav`, distinguished by
extension). This archive is the reference copy of that decision: what's
actually live in `public/audio/words/` today, kept here as a
snapshot/backup rather than relying on git history alone.

**Not included:** the matching character-audio snapshot (single-kana
clips) — those were fully superseded by real recordings for every
hiragana id, with katakana now aliasing to the same hiragana clip (see
`getCharacterAudioId` in `src/data/characters.ts`), so that half of the
original archive had zero remaining value and was discarded. Tamamizu's
(mascot) feedback-line voice (`public/audio/feedback/`) was also never
part of this archive — that voice is separate and unrelated.

## What's here

- `words/` — every vocabulary word clip (262 files) as of 2026-08-17.

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

See `scripts/archive/azureRegenerateHiragana.ts`, `scripts/archive/azureRegenerateRemaining.ts`,
`scripts/archive/azureDragonHD*.ts`, `scripts/archive/elevenLabsSingleChars*.ts`,
`scripts/normalizeAudioVolume.mjs`, and `scripts/buildAccentData.mjs` (pitch
accent dataset) for the generation pipeline — the targeted single-word tool
is `scripts/azureRegenerateWordIds.ts` (still active); the rest are archived
one-time/bulk runs, kept as reference if this voice is wanted again.

## Reuse

To bring any single clip back into the live app, copy it into
`public/audio/words/<id>.wav` (same filenames as the live tree, so this
is a straight copy-over) — useful if a future re-recording pass needs to
revert one word back to the AI voice.
