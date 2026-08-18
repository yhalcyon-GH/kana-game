# CLAUDE.md

Guidance for Claude Code sessions working in this repository. Read this first — it should mean you don't need to re-explore the whole codebase from scratch each session.

## What this is

**kana-game** is a kana-learning web app built for the developer's child, with an eye toward eventual commercial release (see `docs/` for design proposals; nothing here should assume commercial features exist yet). It teaches one gojūon row at a time (あ行, か行, ...), pairs each row with real everyday vocabulary, and drills both through four graded mini-games plus free-form tracing practice. Progress is tracked locally with a simplified spaced-repetition (Leitner box) system.

Five script categories exist: hiragana, katakana, sokuon (促音, the small-tsu gemination mark), chōon (長音, long vowels), and yōon (拗音, contracted sounds like きゃ/kya) — see `docs/curriculum-extensibility.md` for the full `ScriptCategory` design. **All of it currently lives on the unmerged `feature/katakana` branch, awaiting review — any further category work is a new decision, not something already scoped.** A sixth category, 特殊音 (tokushuon, extended katakana loanword digraphs like ファ/ティ/ヴ), was built and shipped once, then **deliberately removed** at the user's request (2026-08-15) — don't reintroduce it without asking; see `docs/curriculum-extensibility.md`'s Progress notes if it's ever wanted again. Hiragana, katakana, and yōon use `learnStyle: 'character-set'` (flashcard → recap → words, all four mini-games). Sokuon and chōon are both `learnStyle: 'contrast-pairs'`: Learn listens through minimal-pair words (おと vs おっと; おばさん vs おばあさん) instead of flashcarding a character, Tracing is word-level only, and Practice drops Kana Quiz. `LearnPage.tsx`/`PracticeHubPage.tsx`/`TracingPage.tsx` all branch on `learnStyle` (not the category id). Every chōon row also has `characterIds: []` — none introduce new characters of their own (hiragana spells long vowels by repeating/extending existing vowel kana; katakana's ー was already taught under カタカナ単音) — every place that reads a row's characters already branches on `learnStyle` first, so this needed no code changes, only content (see `curriculum.test.ts` and `App.test.tsx`'s zero-new-character coverage). Yōon is `character-set` like katakana (pure content, no flow changes needed) but breaks the "one kana glyph = one mora" assumption baked into pitch-accent rendering (きゃ is 2 glyphs, 1 mora) — see "Known gaps" below.

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
design/        Non-code creative assets kept for provenance/backup, not referenced
               by the app at runtime — split into 音声/ (単音/語彙/キャラクターの声,
               source recordings) and 画像/ (キャラクター mascot concept art,
               語彙イラスト word-icon provenance).
docs/          Design proposals and review notes that are reference material, not
               everyday reading — see docs/README.md for an index.
```

## Data model

Three static catalogs in `src/data/`, joined by string ids:

- **`characters.ts`** — every kana character (`CHARACTERS`: 105 hiragana-id + 129 katakana-id. Each script has 46 base gojūon + 20 dakuten + 5 handakuten, plus katakana's extra ー/chōon character, plus one っ/ッ sokuon character per script, plus the 33-combination 拗音/yōon set per script). Each has `id`, `kana`, `romaji`, `rowId`, `type: 'base' | 'dakuten' | 'handakuten'`. Katakana ids are `katakana-` prefixed (`katakana-ka`, not `ka`) since `CHARACTERS_BY_ID` is a flat dictionary and both scripts share the same romaji. っ/ッ's `romaji` is a placeholder (`'-'`, same convention as katakana's ー) since gemination's actual sound varies per word — see the comment above their entries. Yōon characters (`kya`, `katakana-kya`, ...) are the exception to "one character = one kana glyph": each is 2 glyphs (a base kana + a small ゃゅょ) spelling a single mora — see "one kana glyph = one mora" below. **Word Builder splits a yōon character's 2 glyphs into 2 separate tiles** (き, ゃ — not one combined きゃ tile) for the learner to place individually — see `WordBuilderPage.tsx`'s `TrayTile` comment; `characters.ts`'s `rowId`/`CHARACTERS_BY_ID` structure itself is untouched by this, it's purely a Word Builder rendering/interaction choice.
- **`curriculum.ts`** — `CATEGORIES`: the script categories (hiragana, katakana, sokuon, chōon, yōon; see `types.ts`'s `ScriptCategory`). `ROWS`: every category's gojūon rows in teaching order, each tagged with a `categoryId` and listing its `characterIds` (dakuten/handakuten rows are folded into their base row, taught together — there is no separate が行 row; chōon's 6 rows are the exception, each with `characterIds: []` — chōon introduces no characters of its own, see their comments in `curriculum.ts` and `docs/curriculum-extensibility.md`). `order` is scoped **within** a category — a second category's rows number their own sequence from 0, independent of the first's. Yōon is the one category with real multi-row structure spanning two scripts inside a single category id: since `order` can't restart at 0 mid-category, its 5 hiragana rows (order 0-4) and 5 katakana rows (order 5-9) share one monotonic sequence — see its comment block (ちゃ/にゃ and みゃ/りゃ are each merged into one row per script, since real vocabulary for にゃ/みゃ/りゃ alone was too thin to justify a dedicated row). Pure helper functions here (`getCumulativeCharacterIds`, `getNextRowId`, etc.) all respect that scoping and have no dependency on progress state — with one exception: `getCumulativeCharacterIds` also pulls in every character from any category listed in the row's category's `dependsOnCategoryIds` (e.g. 促音・長音・拗音 all depend on `['hiragana', 'katakana']`, since their words mix real syllables from both scripts). **This is an explicit per-category fact, not inferred from `CATEGORIES`' declared order** — an earlier draft inferred it from order and leaked all of hiragana into katakana's distractor pools (katakana is declared after hiragana but depends on nothing); `curriculum.test.ts`'s "cross-category cumulative characters" suite exists specifically to catch that regression again. `getNextRowId`/`getPreviousRowId` stay same-category-only (cross-category "next row" isn't a meaningful question). `getCategoryPagePath(categoryId)` maps a category to its top-level page route (hiragana/katakana/yōon each dedicated, everything else → `/other`) — used by `HubBreadcrumb.tsx`.
- **`words.ts`** — `WORDS_BY_ROW`: every row's vocabulary, keyed by row id. Each `AnchorWord` has `kana`, `romaji`, `meaning`, `characterIds` (which must spell out `kana` exactly — enforced by `curriculum.test.ts`), an optional `image` (word-icons/*.webp — every hiragana word has one, but it's a real hand-sourced/paid effort, not a script; new categories may ship without it, see `WordImage.tsx`'s placeholder), and an optional `audioText` override (see "Audio system"). Sokuon's row (`sokuon-row`) is a single row spanning both scripts at once — see its comment block. **Vocabulary must never duplicate the same real-world meaning under two different spellings within one category** (e.g. hiragana ぎょうざ vs. katakana ギョーザ both meaning "dumpling") — a lesson learned twice for the same concept confuses more than it reinforces; check existing rows before adding a word.

**Invariant enforced by `data/curriculum.test.ts`** (not a script — read this file, not a stale comment, if you see one pointing elsewhere): every word uses only characters introduced at or before its row (scoped per-category), every `characterIds` entry exists in `CHARACTERS_BY_ID`, and `characterIds` joined together spells `kana` exactly — this holds regardless of glyph-vs-mora count, since it only ever compares concatenated `kana` strings, never counts them.

**One kana glyph = one mora, EXCEPT yōon (拗音).** Most of the codebase assumes one glyph = one mora = one accent position — true for hiragana/katakana/sokuon/chōon content, but false for yōon (きゃ is 2 glyphs, 1 mora). Pitch-accent rendering (`WordCard.tsx`'s `AccentedKana`, built from `accents.ts`) handles this correctly as of 2026-08-16: both the renderer and `scripts/buildAccentData.mjs`'s generation-side guard were changed to align by MORA (via `src/lib/mora.ts`'s `toMorae`) instead of raw character count, so a yōon word's accent line renders properly (each mora's line segment spans as many character-columns as it has glyphs) and future `buildAccentData.mjs` runs can pick up real yōon accents from accentjiten's dataset instead of silently dropping every one. `AccentedKana` still falls back to plain kana whenever there's no verified pattern or the mora count doesn't match — see `WordCard.test.tsx`. The stroke-order side does NOT share this fix and still has the old glyph-based limitation: `StrokeOrderAnimation.tsx`'s `STROKE_PATHS[characterId] ?? []` defaults to an empty guide for a character with no data, and yōon characters are deliberately **never run through** `scripts/fetchStrokeData.ts` — that script keys a fetch off `kana.codePointAt(0)` (the first glyph only), so running it for a 2-glyph id like `kya` would silently write き's stroke path mislabeled as きゃ's, which is worse than no data at all — see `StrokeOrderAnimation.test.tsx`. (Word Builder still shows separate tiles for き and ゃ during the actual building interaction, per the user's request — that's an interaction-level split, unrelated to either of these.)

`useCurriculum()` (`src/hooks/useCurriculum.ts`) is the **only** place that should combine this static data with live progress (`useProgressStore`) to answer "what's currently usable" — new screens should go through it rather than reading `data/` and the store separately, so the "practice only uses taught vocabulary" invariant stays in one place.

## Game flow

```
Home (script chooser) → script page (row map) → row's Practice Hub → Learn (steps A/recap/B) → Practice Hub → mini-game → Summary → back to hub
                                                                    ↘ Tracing (stroke order + free trace)
```

- **Home** (`HomePage`, route `/`) is a top-level chooser with four cards — ひらがな (`/hiragana`), カタカナ (`/katakana`), ようおん (`/youon`), そのほか (`/other`) — not a page of rows itself. This replaced an earlier single flat page that stacked every category's rows together; it was split once enough categories existed that one page got unwieldy, then split again (拗音 promoted to its own page) once 拗音 alone had enough rows to deserve one.
- **Script pages** (`CategoryRowsPage`, shared by all four routes above) show every row as a card (locked/new/taught/mastered), always navigable — rows are never access-gated, only progress-badged. `/hiragana`, `/katakana`, `/youon` each pass a single categoryId; `/other` bundles every category that isn't hiragana/katakana/拗音 (`App.tsx`'s `OTHER_CATEGORY_IDS`, computed from `CATEGORIES` so a newly-added small category just appears there with no route change) — currently 促音/長音. When a page bundles more than one category, `CategoryRowsPage` groups rows under a per-category `<h2>` + optional `ScriptCategory.explanation` (a short English intro paragraph); a single-category page skips the redundant subheading. `GojuonRow` also has its own optional `explanation`, rendered on `LearnPage`'s word-list step, for a row that teaches a specific rule variant within its category (see 長音's 6 rows, one per hiragana vowel-column rule).
- **Practice Hub** (`PracticeHubPage`, route `/practice/:categoryId/:rowId`) is the single hub per row: Learn + Tracing + up to 4 graded games, all as equal activity cards (Kana Quiz is omitted for `'contrast-pairs'` rows — see below). The same route/component also serves the special "Review" pseudo-row (`REVIEW_SCOPE_ID = 'review'`, mixes every taught row's due material across every category) — see `useCurriculum`'s `getScopeWords`/`getScopeCharacterIds`/`getScopeQuizCharacterIds`. It also renders `HubBreadcrumb` (Home → category page → this row, plus prev/next-row quick links via `getPreviousRowId`/`getNextRowId`) — added because the hub used to be a dead end otherwise (only "back to this row" or all the way Home, no way back to the row's parent category page). `GojuonRow.englishLabel` (a short romaji "session name", e.g. `'Ka Row'`, `'Chōon: A'`) and `ScriptCategory.icon` (a single emoji) exist specifically for this nav UI — `label`/kana stay the row-card display name unchanged.
- **Learn** (`LearnPage`) branches on the row's category `learnStyle`: `'character-set'` rows walk new characters one at a time (step A), then a recap grid, then every buildable word for the row (step B) — step A also offers "See them all"/"See the words" jump-ahead links straight to the recap grid or word list, added once katakana's merged first lesson made stepping through every character one at a time to reach them feel slow. `'contrast-pairs'` rows (促音, 長音) skip straight to step B — the word list itself IS the lesson, no isolated-character flashcard step.
- **The 4 graded mini-games** (Kana Quiz, Kana Typing, Listening, Word Builder) share `useGameSession` (round/queue/score state) and `useAnswerFeedback` (per-answer reaction + end-of-session summary reaction). Each owns its own per-round UI/interaction. Kana Quiz specifically doesn't fit `'contrast-pairs'` categories (no single correct isolated reading for っ/ッ) — `PracticeHubPage` hides its card, `KanaQuizPage` also redirects away from direct navigation, and the Review scope filters `'contrast-pairs'` characters out of its own Kana Quiz pool (see `useCurriculum.ts`'s `isQuizzableCharacterId`).
- **Tracing** is deliberately ungraded (see its file header for why) — no SRS interaction, no mistake tracking. `'contrast-pairs'` rows skip its per-character phase and start directly in the word-tracing phase (see the file header for why the old `charPool.length === 0` early-return had to change).
- **PracticeSummary** is the shared finish screen for all 5 games.

If you add a new mini-game, follow an existing one (e.g. `KanaQuizPage.tsx`) as the template for wiring `useGameSession` + `useAnswerFeedback` + `PracticeSummary`.

## Audio system

Every character/word/feedback-line clip is a **pre-generated static `.wav` file** under `public/audio/{characters,words,feedback}/<id>.wav`, played by `useTTS()`'s `speak(audioKey, fallbackText)` — there is no runtime TTS API call in the shipped app; `fallbackText` only feeds the Web Speech API as a last-resort fallback if a clip is missing or fails to load.

Two **separate** ElevenLabs voices are currently in use, generated offline by `scripts/generateAudioElevenLabs.ts` (characters + words) and a manually-produced take for feedback lines (see `src/data/feedback.ts`'s header) — one voices the narrator (character/word pronunciation), the other voices the mascot's in-game reactions. **Do not assume either voice, or ElevenLabs itself, is a permanent choice** — the provider has changed at least twice already (COEIROINK → ElevenLabs) and may change again. See `docs/audio-provider-interface.md` for the abstraction that makes a future switch a provider-swap instead of a game-logic rewrite.

Text sent to TTS for words is `word.audioText ?? word.kana` — bare hiragana is lexically ambiguous to TTS models (wrong accent, wrong word split, or a mispronounced standalone は particle), so most words carry a kanji/katakana `audioText` override. **When adding a new word, check whether it needs one** — if unsure, generate it both ways and listen.

To regenerate character/word audio: `ELEVENLABS_API_KEY=sk_... npx tsx scripts/generateAudioElevenLabs.ts`. This is a **paid API call** — confirm with the user before running it for real (not just as a code-review exercise).

## Adding content

- **New word in an existing row**: add an entry to that row's array in `words.ts` (respecting the "only already-taught characters" rule), then `npm test` to catch invariant violations, then generate its audio clip.
- **New character/row within an existing `'character-set'` category**: touches `characters.ts`, `curriculum.ts`, `words.ts`, likely `distractors.ts` (confusable pairs), then re-run `scripts/fetchStrokeData.ts` and `scripts/subsetKanaFont.mjs` (both read straight from `src/data/`, no manual glyph-list bookkeeping needed) — see the katakana category (`katakana-` prefixed ids throughout) as a worked example of this whole shape, including the id-namespacing convention for a script that reuses hiragana's romaji.
- **New content within an existing `'contrast-pairs'` category** (adding another 促音 or 長音 word): the Learn/Practice/Tracing generalization already exists (see "Game flow" above and `LearnPage.tsx`/`PracticeHubPage.tsx`/`TracingPage.tsx`) — this is now pure content work, same shape as `'character-set'` above, just keyed off `learnStyle: 'contrast-pairs'` instead. `getCumulativeCharacterIds`'s cross-category behavior (see "Data model") means a `'contrast-pairs'` row's words can freely use any character from an earlier category, not just its own — see `sokuon-row` in `words.ts` as a worked example (its words mix hiragana/katakana syllables with っ/ッ, deliberately never yōon characters — chōon does not depend on the yōon category). Chōon's 6 rows are the same pattern but with zero characters of their own (`characterIds: []`) — every word in them still draws on the full hiragana+katakana pool via the same dependency mechanism; each row also carries a rule-specific `explanation` (see its `GojuonRow` field) since chōon has 5 different hiragana spelling rules, not one.
- **New content within 拗音 (yōon)**: same shape as the `'character-set'` bullet above (it's a `'character-set'` category, not `'contrast-pairs'`) — just be aware every yōon `CHARACTERS` entry is 2 glyphs/1 character id, and do NOT run `scripts/fetchStrokeData.ts` for a new yōon character (see the "one kana glyph = one mora" note above for why it would silently write wrong data) — leave it out of `strokes.ts` and let the `?? []` fallback handle it, same as the existing 拗音 characters.
- **特殊音 (tokushuon) no longer exists** — it was built, shipped, then deliberately removed at the user's request (2026-08-15). Don't reintroduce it without asking; see `docs/curriculum-extensibility.md`'s "Progress" section for what it contained and why it was cut, if it's ever wanted again.
- **Stroke order data**: `src/data/strokes.ts` is generated by `scripts/fetchStrokeData.ts` from KanjiVG (CC BY-SA 3.0) — don't hand-edit, re-run the script. Object keys are `JSON.stringify`-escaped (needed once ids stopped being bare identifiers, e.g. `katakana-a`) — don't revert that to save characters. **Exception: never run it for a yōon (or future multi-glyph) character** — see above.
- **Pitch-accent data**: `src/data/accents.ts` is generated by `scripts/buildAccentData.mjs` from accentjiten.com's dataset — never hand-guess accent patterns from memory (a past attempt at this was wrong and had to be reverted).

## Rules for this codebase

- **Don't change existing game rules, answer-correctness logic, SRS/unlock thresholds, or feedback-phrase behavior without explicit confirmation.** These are exactly the kind of "quiet behavior change" that's hard to notice broke something until a learner hits it.
- **Don't guess Japanese pitch accent or pronunciation from memory** — use the accent dataset pipeline (`scripts/buildAccentData.mjs`) or ask.
- **Audio clips are checked into git** (`public/audio/`) — regenerating them is a real, git-visible change (and, for ElevenLabs, a paid one). Don't regenerate speculatively.
- **Run `npm test` and `npm run build` before considering any data/logic change done** — `curriculum.test.ts` in particular catches a whole class of content mistakes cheaply.
- **Prefer small, independently-testable changes over big-bang refactors**, especially anywhere touching `data/`, `store/`, or the answer-checking/SRS logic in `lib/`.
- **`ScriptCategory`/`categoryId` is the explicit scope tag now** (hiragana, katakana, sokuon, chōon, and yōon exist — see "Data model" above, and see `docs/curriculum-extensibility.md` for how each landed). `learnStyle` drives the Learn/Practice/Tracing shape generically (`'character-set'` vs `'contrast-pairs'`) — don't special-case a category id directly in route/flow code; branch on `learnStyle` instead.

## Known gaps / stale-content risk

- Oxlint currently runs **untyped** rules only (see `read.me` template boilerplate `.oxlintrc.json` comment) — type-aware lint (`oxlint-tsgolint`) isn't wired in, so lint won't catch everything `tsc` would.
- No E2E/browser test tooling is configured — manual/dev-server verification (or asking the user to check) is the only way to confirm actual rendered behavior today.
- `AboutPage.tsx`'s audio credit text was stale for a while after an audio-provider switch and needed a manual fix (2026-08) — when swapping providers again, grep for old provider/character names across `src/routes/AboutPage.tsx` and `README.md` and update them in the same change, not as a followup.

## Docs index

See `docs/README.md`.
