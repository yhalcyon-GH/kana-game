# Claude Code reference

Detailed repository reference for Claude Code. This is **not** required reading for every session.
Read only the sections relevant to the current task; `CLAUDE.md` at the repository root contains the always-on guidance.

## Product and game flow

`kana-game` is a kana-learning web app. It teaches kana by row, pairs rows with real vocabulary, and practices them through graded mini-games plus tracing. Progress is local-only, persisted with Zustand/localStorage.

Top-level flow:

```text
Home → script/category page → row Practice Hub → Learn / Tracing / graded game → Summary → hub
```

Home routes:
- `/hiragana`
- `/katakana`
- `/youon`
- `/other` for smaller categories such as 促音 and 長音

Rows are navigable even when progress-badged as locked/new/taught/mastered; they are not hard access-gated.

`PracticeHubPage` also serves the Review pseudo-row (`REVIEW_SCOPE_ID = 'review'`).

The four graded games are Kana Quiz, Kana Typing, Listening, and Word Builder. They share `useGameSession` for session state and `useAnswerFeedback` for reactions. Tracing is intentionally ungraded and does not update SRS/mistakes.

## Curriculum model

The main static catalogs are:
- `src/data/characters.ts`
- `src/data/curriculum.ts`
- `src/data/words.ts`

`ScriptCategory`/`categoryId` is the explicit category scope. Current categories are hiragana, katakana, sokuon, chōon, yōon, and Special Katakana (特殊音/tokushuon, `SPECIAL_KATAKANA_CATEGORY_ID`). Special Katakana was removed in 2026-08-15 and later reintroduced as its own shipped, tested category; treat it as current, supported content. See `docs/curriculum-extensibility.md` for that history and current design.

`learnStyle` controls lesson/game flow:
- `character-set`: hiragana, katakana, yōon
- `contrast-pairs`: sokuon, chōon

Branch on `learnStyle`, not a specific category id, when behavior is about lesson shape.

`useCurriculum()` is the single place that should combine static curriculum data with live progress to answer what is currently usable. New screens should not independently combine `src/data/*` with `useProgressStore`.

### Curriculum invariants

`src/data/curriculum.test.ts` enforces important content invariants:
- words may use only characters available by that row/category dependency scope;
- every `characterIds` entry must exist;
- concatenating the referenced character kana must reproduce the word kana.

Category dependencies are explicit (`dependsOnCategoryIds`), not inferred from category declaration order. Do not infer that later categories depend on earlier ones.

Avoid duplicating the same real-world meaning under two spellings within one category.

### Yōon / multi-glyph characters

Yōon ids represent two glyphs but one mora (for example きゃ). This breaks naive "one glyph = one mora" assumptions.

Pitch-accent rendering and `scripts/buildAccentData.mjs` already align by mora through `src/lib/mora.ts`.

Stroke data is different: `scripts/fetchStrokeData.ts` keys off the first code point, so running it for a multi-glyph yōon id would silently store the first glyph's stroke data under the wrong id. **Do not run stroke generation for yōon/multi-glyph character ids.** Missing stroke data should fall back to the existing empty-guide behavior.

Word Builder intentionally splits a yōon spelling into separate glyph tiles during the interaction even though the curriculum character id represents the combined spelling.

## Learn behavior

For `character-set` rows, Learn shows new characters, recap, then buildable words.

For `contrast-pairs` rows, Learn skips isolated-character flashcards and teaches through the word/minimal-pair list. Kana Quiz is not applicable to those rows; both hub visibility and direct navigation should remain guarded.

Chōon rows may have `characterIds: []` because they introduce no new character ids; code that handles them should branch on lesson style before assuming a row has characters.

## Audio system

Runtime audio is pre-generated static `.wav` under:
- `public/audio/characters/`
- `public/audio/words/`
- `public/audio/feedback/`

`useTTS().speak(audioKey, fallbackText)` plays static audio first and uses Web Speech only as fallback. There is no shipped runtime ElevenLabs API call.

Character/word audio generation currently uses `scripts/generateAudioElevenLabs.ts`; feedback lines use a separately produced voice. Provider choice is not permanent. The provider abstraction is documented in `docs/audio-provider-interface.md`.

Word TTS source text is `word.audioText ?? word.kana`. Bare kana may be lexically ambiguous, so new vocabulary may need an `audioText` override.

Generating ElevenLabs audio is a paid external call. Do not run it for real without explicit user approval.

Audio files are checked into git; regeneration is a real repository change.

## Adding content

### Word in an existing row
1. Add it to `words.ts`.
2. Respect curriculum availability and duplicate-meaning rules.
3. Run tests.
4. Check whether `audioText` is needed.
5. Generate audio only with approval.

### Character/row in `character-set`
Typical touch points:
- `characters.ts`
- `curriculum.ts`
- `words.ts`
- possibly `distractors.ts`
- stroke/font generation when applicable

Katakana ids are namespaced (`katakana-*`) because the character dictionary is flat.

### Content in `contrast-pairs`
Learn/Practice/Tracing behavior is already generalized by `learnStyle`. Treat additions as content work unless the requested behavior itself changes.

### Generated data
- `src/data/strokes.ts`: generated from KanjiVG; do not hand-edit.
- `src/data/accents.ts`: generated from the accent dataset pipeline; do not guess pitch accent from memory.

## Architecture map

```text
src/data/        static curriculum/content lookup
src/lib/         framework-agnostic logic
src/hooks/       React state glue and shared session behavior
src/components/  presentational/small interaction components
src/routes/      page-level components and games
src/store/       Zustand progress/settings persistence
scripts/         offline/manual content-generation tooling
public/audio/    generated static runtime audio
design/          source/provenance creative assets, not runtime
docs/            design/history/reference material
```

## Known gaps and stale-content risks

- Oxlint currently uses untyped rules; `npm run build` remains the authoritative TypeScript check.
- There is no configured E2E/browser-test framework, so rendered behavior may still require dev-server/manual verification.
- Provider/credit text has gone stale after audio-provider changes before; when changing providers, search About/README and related credits in the same change.
- Category rollout/history notes can become stale; prefer current code/tests over old narrative docs when they disagree, and update the stale doc if the discrepancy matters.

## Historical decisions worth preserving

- Tokushuon (Special Katakana) was deliberately removed once (2026-08-15) and later reintroduced as its own shipped category; that removal is history, not current status — see the Curriculum data model section above.
- Category dependencies must be explicit, not inferred from ordering.
- Yōon stroke generation is intentionally omitted because the current generator is unsafe for multi-glyph ids.
- Existing game rules, SRS thresholds, answer correctness, and feedback behavior are product behavior, not incidental implementation details.

For deeper category history, see `docs/curriculum-extensibility.md` and the dated review/session notes indexed in `docs/README.md`.
