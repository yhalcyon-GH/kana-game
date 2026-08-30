# Archived scripts

Not part of the active pipeline (nothing here is imported by anything under
`scripts/`, and none are referenced from `package.json` or `CLAUDE.md`'s
"Adding content" workflows) — each already did its one job. Kept because the
*technique* could be worth reusing, not because the script itself needs to
run again as-is.

- **`azureDragonHD*.ts`** — DragonHD voice experiments (`ja-JP-Nanami:DragonHDLatestNeural`),
  bare-kana forcing, and SAPI phoneme + DragonHD combined. Useful reference
  if a future word needs the same "regular voice gets the accent wrong"
  treatment.
- **`azureRegenerateHiragana.ts`**, **`azureRegenerateRemaining.ts`** — the
  original full-catalog Azure Neural TTS regeneration (hiragana, then
  everything else). Superseded for hiragana by real recordings; still the
  reference implementation the more targeted `../azureRegenerateWordIds.ts`
  was extracted from.
- **`azureScoreDump.ts`** — CLI to dump Azure Pronunciation Assessment scores
  for a whole row at once (`../azurePronunciation.ts` does the single-word
  version, and is still live).
- **`azureSynthesize.ts`** — early Azure candidate-provider trial, before the
  SSML/phoneme approach in `azureRegenerate*.ts` existed.
- **`elevenLabsSingleChars*.ts`**, **`elevenLabsYouonChars.ts`** — the
  ElevenLabs single-character (単音) generation experiments that picked the
  voice/settings later used, before single-character audio was replaced
  with real recordings this session.
- **`testAccentSSML.ts`**, **`testKanaVsKanjiPhoneme.ts`** — SSML/phoneme
  prosody experiments that informed `azureRegenerateWordIds.ts`'s current
  accent-nucleus approach.
- **`regenerateBatch57.ts`**, **`regenerateFlaggedWords.ts`**,
  **`regenerateRowVoice.ts`** — one-off targeted regenerations (a
  Whisper/Azure-flagged batch, a hardcoded bad-clip list, one row with an
  alternate voice). Reference for "how to regenerate a specific subset"
  rather than a script to re-run.
- **`listHiraganaContent.ts`**, **`listRemainingContent.ts`** — coverage
  audits (character/word counts, accent/audioText coverage) for hiragana
  vs. everything else. Reusable shape for auditing a future new category.
