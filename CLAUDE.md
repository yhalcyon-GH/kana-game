# CLAUDE.md

Guidance for Claude Code sessions working in this repository. Read this first — it should mean you don't need to re-explore the whole codebase from scratch each session.

## What this is

**kana-game** is a hiragana-learning web app built for the developer's child, with an eye toward eventual commercial release (see `docs/` for design proposals; nothing here should assume commercial features exist yet). It teaches one gojūon row at a time (あ行, か行, ...), pairs each row with real everyday vocabulary, and drills both through four graded mini-games plus free-form tracing practice. Progress is tracked locally with a simplified spaced-repetition (Leitner box) system.

Deployed to GitHub Pages via `.github/workflows/deploy.yml` on push to `main`. Base path is `/kana-game/` (see `vite.config.ts`).

## Tech stack

- React 19 + TypeScript + Vite 8, Tailwind CSS 4 (via `@tailwindcss/vite`, no config file — utility classes only)
- React Router 7 (all routes declared in `src/App.tsx`)
- Zustand 5 with `persist` middleware for all client-side state (`src/store/progressStore.ts`) — there is no backend; everything lives in `localStorage`
- Vitest + Testing Library for tests, jsdom environment
- Oxlint for linting (`.oxlintrc.json` — currently untyped rules only; see "Known gaps" below)
- `vite-plugin-pwa` for offline/installable support

Commands:
```
npm run dev      # vite dev server
npm run build    # tsc -b && vite build — this is the authoritative type check, not a separate script
npm run lint     # oxlint
npm test         # vitest run
```
There is no separate `typecheck` script — `npm run build` runs `tsc -b` first, which is the fastest way to type-check without a full build if you kill it after the tsc step, but in practice just run the build.

## Directory structure

```
src/
  data/        Static content: characters, words, curriculum order, stroke paths,
               pitch-accent patterns, feedback voice-line catalog. No React, no logic
               beyond pure lookup/query functions. See "Data model" below.
  lib/         Pure functions: answer checking, distractor picking, SRS math,
               weighted queue building, edit-distance "near miss" detection.
               Framework-agnostic, thoroughly unit-testable (and mostly tested).
  hooks/       React state glue: useCurriculum (the ONE place that combines static
               data + live progress), useTTS (audio playback), useAnswerFeedback
               (per-answer + end-of-session reaction voice/mood), useGameSession
               (shared round/queue/score state machine for the 4 graded games).
  components/  Presentational + small-interaction components, mostly stateless
               given props.
  routes/      Page-level components, one per route in App.tsx. routes/games/
               holds the 4 graded mini-games + Tracing.
  store/       progressStore.ts — the only Zustand store. Owns SRS box state per
               character, unlocked/taught rows, and audio/UI settings.
scripts/       One-off/regeneratable content-build scripts, run manually with
               `npx tsx scripts/<name>.ts` (or `node` for .mjs). Not part of the
               build; nothing in src/ imports from scripts/.
public/audio/  Pre-generated static audio clips: characters/, words/, feedback/.
               Shipped as files, not generated at runtime — see "Audio system".
design/        Non-code creative assets (mascot concept art, source recordings)
               kept for provenance/backup, not referenced by the app at runtime.
docs/          Design proposals and review notes that are reference material, not
               everyday reading — see docs/README.md for an index.
```

## Data model

Three static catalogs in `src/data/`, joined by string ids:

- **`characters.ts`** — every kana character (`CHARACTERS`, 71 entries: 46 base gojūon + 20 dakuten + 5 handakuten). Each has `id`, `kana`, `romaji`, `rowId`, `type: 'base' | 'dakuten' | 'handakuten'`.
- **`curriculum.ts`** — `ROWS`: the 10 gojūon rows in teaching order, each listing its `characterIds` (dakuten/handakuten rows are folded into their base row, taught together — there is no separate が行 row). Pure helper functions here (`getCumulativeCharacterIds`, `getNextRowId`, etc.) have no dependency on progress state.
- **`words.ts`** — `WORDS_BY_ROW`: every row's vocabulary, keyed by row id. Each `AnchorWord` has `kana`, `romaji`, `meaning`, `image`, `characterIds` (which must spell out `kana` exactly — enforced by `curriculum.test.ts`), and an optional `audioText` override (see "Audio system").

**Invariant enforced by `data/curriculum.test.ts`** (not a script — read this file, not a stale comment, if you see one pointing elsewhere): every word uses only characters introduced at or before its row, every `characterIds` entry exists in `CHARACTERS_BY_ID`, and `characterIds` joined together spells `kana` exactly. **This last check assumes one character id = one kana glyph = one mora.** That assumption holds for the current hiragana-only, no-yōon content, but will need to change before adding 拗音 (youon, e.g. りゃ) — see `docs/curriculum-extensibility.md`.

`useCurriculum()` (`src/hooks/useCurriculum.ts`) is the **only** place that should combine this static data with live progress (`useProgressStore`) to answer "what's currently usable" — new screens should go through it rather than reading `data/` and the store separately, so the "practice only uses taught vocabulary" invariant stays in one place.

## Game flow

```
Home (row map) → row's Practice Hub → Learn (steps A/recap/B) → Practice Hub → mini-game → Summary → back to hub
                                    ↘ Tracing (stroke order + free trace)
```

- **Home** (`HomePage`) shows every row as a card (locked/new/taught/mastered), always navigable — rows are never access-gated, only progress-badged.
- **Practice Hub** (`PracticeHubPage`, route `/practice/:rowId`) is the single hub per row: Learn + Tracing + the 4 graded games, all as equal activity cards. The same route/component also serves the special "Review" pseudo-row (`REVIEW_SCOPE_ID = 'review'`, mixes every taught row's due material) — see `useCurriculum`'s `getScopeWords`/`getScopeCharacterIds`/`getScopeQuizCharacterIds`.
- **Learn** (`LearnPage`) walks new characters one at a time, then a recap grid, then every buildable word for the row.
- **The 4 graded mini-games** (Kana Quiz, Kana Typing, Listening, Word Builder) share `useGameSession` (round/queue/score state) and `useAnswerFeedback` (per-answer reaction + end-of-session summary reaction). Each owns its own per-round UI/interaction.
- **Tracing** is deliberately ungraded (see its file header for why) — no SRS interaction, no mistake tracking.
- **PracticeSummary** is the shared finish screen for all 5 games.

If you add a new mini-game, follow an existing one (e.g. `KanaQuizPage.tsx`) as the template for wiring `useGameSession` + `useAnswerFeedback` + `PracticeSummary`.

## Audio system

Every character/word/feedback-line clip is a **pre-generated static `.wav` file** under `public/audio/{characters,words,feedback}/<id>.wav`, played by `useTTS()`'s `speak(audioKey, fallbackText)` — there is no runtime TTS API call in the shipped app; `fallbackText` only feeds the Web Speech API as a last-resort fallback if a clip is missing or fails to load.

Two **separate** ElevenLabs voices are currently in use, generated offline by `scripts/generateAudioElevenLabs.ts` (characters + words) and a manually-produced take for feedback lines (see `src/data/feedback.ts`'s header) — one voices the narrator (character/word pronunciation), the other voices the mascot's in-game reactions. **Do not assume either voice, or ElevenLabs itself, is a permanent choice** — the provider has changed at least twice already (COEIROINK → ElevenLabs) and may change again. See `docs/audio-provider-interface.md` for the abstraction that makes a future switch a provider-swap instead of a game-logic rewrite.

Text sent to TTS for words is `word.audioText ?? word.kana` — bare hiragana is lexically ambiguous to TTS models (wrong accent, wrong word split, or a mispronounced standalone は particle), so most words carry a kanji/katakana `audioText` override. **When adding a new word, check whether it needs one** — if unsure, generate it both ways and listen.

To regenerate character/word audio: `ELEVENLABS_API_KEY=sk_... npx tsx scripts/generateAudioElevenLabs.ts`. This is a **paid API call** — confirm with the user before running it for real (not just as a code-review exercise).

## Adding content

- **New word in an existing row**: add an entry to that row's array in `words.ts` (respecting the "only already-taught characters" rule), then `npm test` to catch invariant violations, then generate its audio clip.
- **New character/row**: this is bigger — touches `characters.ts`, `curriculum.ts`, likely `distractors.ts` (confusable pairs), and the SRS unlock chain in `progressStore.ts`. See `docs/curriculum-extensibility.md` before doing this for a genuinely new script category (katakana, sokuon, etc.) rather than more hiragana rows — there's a real design decision to make first about how non-hiragana categories fit the current row-based model.
- **Stroke order data**: `src/data/strokes.ts` is generated by `scripts/fetchStrokeData.ts` from KanjiVG (CC BY-SA 3.0) — don't hand-edit, re-run the script.
- **Pitch-accent data**: `src/data/accents.ts` is generated by `scripts/buildAccentData.mjs` from accentjiten.com's dataset — never hand-guess accent patterns from memory (a past attempt at this was wrong and had to be reverted).

## Rules for this codebase

- **Don't change existing game rules, answer-correctness logic, SRS/unlock thresholds, or feedback-phrase behavior without explicit confirmation.** These are exactly the kind of "quiet behavior change" that's hard to notice broke something until a learner hits it.
- **Don't guess Japanese pitch accent or pronunciation from memory** — use the accent dataset pipeline (`scripts/buildAccentData.mjs`) or ask.
- **Audio clips are checked into git** (`public/audio/`) — regenerating them is a real, git-visible change (and, for ElevenLabs, a paid one). Don't regenerate speculatively.
- **Run `npm test` and `npm run build` before considering any data/logic change done** — `curriculum.test.ts` in particular catches a whole class of content mistakes cheaply.
- **Prefer small, independently-testable changes over big-bang refactors**, especially anywhere touching `data/`, `store/`, or the answer-checking/SRS logic in `lib/`.
- **The `type: 'hiragana'` scope is implicit today** — nothing in the current data model says "this is hiragana" because nothing else exists yet. Don't bolt on katakana/sokuon/etc. content ad hoc; see `docs/curriculum-extensibility.md` for the intended shape first.

## Known gaps / stale-content risk

- Oxlint currently runs **untyped** rules only (see `read.me` template boilerplate `.oxlintrc.json` comment) — type-aware lint (`oxlint-tsgolint`) isn't wired in, so lint won't catch everything `tsc` would.
- No E2E/browser test tooling is configured — manual/dev-server verification (or asking the user to check) is the only way to confirm actual rendered behavior today.
- `AboutPage.tsx`'s audio credit text was stale for a while after an audio-provider switch and needed a manual fix (2026-08) — when swapping providers again, grep for old provider/character names across `src/routes/AboutPage.tsx` and `README.md` and update them in the same change, not as a followup.

## Docs index

See `docs/README.md`.
