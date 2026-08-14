# Curriculum extensibility: adding katakana, sokuon, chōon, yōon, and 特殊音

**Status: design decided in conversation (2026-08-14/15). Katakana, sokuon, and chōon implemented — see "Progress" below. Yōon/特殊音 not yet started.** The open questions from the first draft of this doc have been resolved by the user directly; this version reflects those decisions.

## Progress

- **カタカナ単音 (katakana) — done, `feature/katakana` branch.** Full character set (71 + ー), all 11 rows, 74 vocabulary words, stroke data, font subset. Went first specifically because `learnStyle: 'character-set'` needed zero new Learn/Practice/Tracing code — pure content on top of the already-merged `ScriptCategory`/`Lesson`-adjacent structural foundation (`CATEGORIES`/`ROWS[].categoryId`/category-scoped order helpers). Flagged for the user's review: no word-icon art yet (AnchorWord.image made optional, with a placeholder — see `WordImage.tsx`), ヲ has no vocabulary reinforcement (unlike hiragana's を), and katakana-chouon's romaji (`'-'`) is a placeholder pending real 長音 support.
- **促音 (sokuon) — done, `feature/sokuon` branch (branched from `feature/katakana`).** The first `'contrast-pairs'` category: っ/ッ added to `characters.ts` (stroke data + `CONFUSABLE_PAIRS` vs つ/ツ), one combined `sokuon-row` spanning both scripts, 10 vocabulary words (おと/おっと as the classic minimal pair, plus がっこう/きっぷ/こっち and 5 katakana loanwords — see `words.ts`'s sokuon-row block). This is also where the real `'contrast-pairs'` Learn/Practice/Tracing generalization this doc describes below actually landed, keyed off `learnStyle` (not the category id) in `LearnPage.tsx`/`PracticeHubPage.tsx`/`TracingPage.tsx`/`KanaQuizPage.tsx`/`useCurriculum.ts` — see those files' comments. Also required a structural fix not anticipated by the original draft: `getCumulativeCharacterIds` (`curriculum.ts`) was same-category-only, but sokuon's words need the FULL hiragana+katakana pool, not just っ/ッ — it now also includes every character from any category taught entirely before the row's own (see its updated comment + `curriculum.test.ts`'s "cross-category cumulative characters" tests). Flagged for the user's review: っ/ッ's romaji is a placeholder (`'-'`, same convention as katakana-chouon) since gemination's actual sound varies per word; おっと's and ロケット's pitch-accent entries are missing (accentjiten.com's data was ambiguous for both, and per this project's rule, ambiguous accent is left unresolved rather than guessed — see `scripts/buildAccentData.mjs`'s console output).
- **長音 (chōon) — done, `feature/chouon` branch (branched from `feature/sokuon`).** The second `'contrast-pairs'` category, and confirmed to introduce **zero new characters**: `chouon-row`'s `characterIds` is `[]` (see curriculum.ts's comment). This exercised the "Remaining structural note" below for real, and it held up exactly as anticipated — `LearnPage.tsx`/`TracingPage.tsx`/`PracticeHubPage.tsx`/`KanaQuizPage.tsx`/`useCurriculum.ts` needed **zero code changes**; this was pure content work, confirming the sokuon-era generalization was actually complete. One combined `chouon-row` spanning both scripts, 11 vocabulary words: the user's own おばさん/おばあさん (aunt/grandmother, あ-row) and ビル/ビール (building/beer, katakana ー) minimal pairs, plus おじさん/おじいさん (uncle/grandfather, い-row), すうじ (う-row), せんせい (え-row spelled with い), おとうさん/おかあさん (お-row spelled with う, and あ-row again) to cover hiragana's different long-vowel spelling patterns, and カレー as a second katakana ー review word — see `words.ts`'s chouon-row block. New test coverage added specifically for the zero-characters case: `curriculum.test.ts`'s "chouon is a contrast-pairs category whose row introduces ZERO new characters" suite, and `App.test.tsx`'s "contrast-pairs learnStyle with zero new characters (chōon)" suite (Learn skips the flashcard step and still renders real words, Tracing starts in the word phase without crashing on an empty character pool, Word Builder/Listening still draw distractor tiles from the full hiragana+katakana pool via `dependsOnCategoryIds`, Kana Quiz still redirects away). Also re-ran `scripts/buildAccentData.mjs` for pitch-accent data (added two disambiguation entries to its `MEANING_TO_KANJI` table for すうじ/せんせい, both of which then resolved cleanly to a single source-backed accent — not a guess) and `scripts/subsetKanaFont.mjs` (picked up 促/長/音 into the font subset, which had been missing since sokuon's category label was added but the subset script was never re-run for it — an incidental fix, not new chōon-specific glyphs, since chouon-row's own label is 'ー', already present).
- **拗音/特殊音 — not started.** Both `'character-set'` but still need the "one kana glyph = one mora" fix noted below before either can ship real content.

## Decisions made

1. **特殊音 scope**: extended katakana combinations for loanword sounds (ファ/フィ/ウェ/ティ/ディ/ヴ...), distinct from standard yōon. Confirmed by the user.
2. **Route/URL shape**: nested category routes, `/practice/:categoryId/:lessonId/...` (e.g. `/practice/hiragana/a-row`, `/practice/katakana/a-row`, `/practice/sokuon/...`). Chosen over keeping flat globally-unique row ids, specifically because it keeps future development smoother even though it means migrating every existing hiragana URL (`/practice/a-row` → `/practice/hiragana/a-row`) — an intentional, confirmed tradeoff, not an oversight.
3. **Learn/Practice flow differs by category, in two concrete styles** (not the vaguer "character-set vs. concept" split the first draft proposed):

   **`contrast-pairs` style — 促音 (sokuon) and 長音 (chōon):**
   - Learn = listen to **minimal-pair words** that isolate the rule, not a per-character flashcard sequence. User's own examples:
     - 促音: おと (oto) vs. おっと (otto)
     - 長音: おばさん (obasan) vs. おばあさん (obaasan); ビル (biru) vs. ビール (biiru) — note 長音 deliberately spans both scripts in one lesson, hiragana's vowel-repetition pattern *and* a review/reinforcement of katakana's ー (which was already taught fresh under カタカナ単音, not re-taught here).
   - Tracing is **word-level only** — no separate "trace this one new character in isolation" phase, even for 促音's っ (which is a genuine new glyph). **Implemented in `feature/sokuon`**: `TracingPage.tsx` now branches on `learnStyle` — `'contrast-pairs'` rows start the session directly in the `'words'` phase and check `words.length === 0` for the empty-state guard instead of `charPool.length === 0`, so this also already supports a future 長音 lesson with zero new characters of its own (see "Remaining structural note" below) without further changes.
   - Practice = today's four games **minus Kana Quiz** — confirmed explicitly ("長音と促音はKanaQuizはできないのでなくします"). Kana Quiz's "see an isolated character, pick its reading" premise doesn't fit a duration/rhythm rule. Listening, Kana Typing, and Word Builder all still operate on whole words and remain applicable. **Implemented in `feature/sokuon`**: `PracticeHubPage.tsx` filters the Kana Quiz card out for `'contrast-pairs'` rows, `KanaQuizPage.tsx` also redirects away from direct navigation to the route, and the Review scope (which mixes every taught category) filters `'contrast-pairs'` characters out of just its own Kana Quiz pool via `useCurriculum.ts`'s `isQuizzableCharacterId` — Word Builder's distractor-tile pool is untouched, since っ/ッ are still fine to see as tiles.

   **`character-set` style — 拗音 (yōon), 特殊音, and (by the same logic) カタカナ単音:**
   - Learn works exactly like existing hiragana rows today: flashcard through each new character, recap grid, then vocabulary built from them. Confirmed explicitly ("いままでのひらがなと同様に").
   - Practice = all four existing games, unchanged.

   This replaces the first draft's `kind: 'character-set' | 'concept'` with what's actually a cleaner split — every category has real new characters *except* possibly 長音 (see next point), so the distinguishing factor is the **Learn/Tracing shape** (per-character vs. per-contrast-word), not "has new characters or not."

## Remaining structural note: 長音 introduces zero new characters (confirmed)

促音 introduces one real new glyph (っ) — it needed a `CHARACTERS` entry, stroke data, `CONFUSABLE_PAIRS` (vs つ/ツ), like any other character, just taught via word contrast rather than solo flashcard (done in `feature/sokuon`). 長音 introduces **none**, confirmed when its content was actually written (`feature/chouon`): ー is already taught fresh under カタカナ単音 (it's part of learning katakana itself, not its own lesson), and hiragana's long vowels reuse existing vowel characters — 長音's own lesson only ever *reviews* ー, never introduces it. `chouon-row` is a row with `characterIds: []` — `TracingPage.tsx`'s early-return checks `words.length` instead of `charPool.length` for `'contrast-pairs'` rows specifically (see above), so this case was already handled with no code changes needed; `LearnPage.tsx`'s skip-to-step-B behavior doesn't depend on `characterIds` being non-empty either. See the "Progress" section above for the specific new test coverage this exercised.

## Proposed shape (updated)

```ts
type ScriptCategory = {
  id: string              // 'hiragana' | 'katakana' | 'sokuon' | 'chouon' | 'youon' | 'tokushuon'
  label: string
  learnStyle: 'character-set' | 'contrast-pairs'
  content?: LessonContent // optional intro explanation/video shown before the category's own
                           // Learn content — see original ask for the eventual 動画 -> 説明 -> 練習 flow
}

// Generalizes GojuonRow -> not every lesson is a gojuon row anymore.
type Lesson = {
  id: string
  categoryId: string
  order: number
  label: string
  characterIds?: string[]  // new characters taught by this lesson, if any (empty/absent for
                            // a lesson like 長音 that introduces none)
  contrastWords?: string[] // word ids illustrating the rule, for contrast-pairs lessons —
                            // these words' OWN characterIds still resolve normally against
                            // CHARACTERS; this is just "which words does this lesson show"
}

type LessonContent = {
  explanation: string
  video?: { url: string; durationSec?: number }
}
```

**Not adopted, as of `feature/sokuon`**: the `Lesson`/`contrastWords` rename above was judged unnecessary once sokuon was actually implemented — `GojuonRow`/`AnchorWord` already cover a `'contrast-pairs'` row's needs as-is: `characterIds` still holds the row's new characters (just not flashcarded), and `WORDS_BY_ROW[row.id]` already IS "every word this row shows" for both Learn and Practice, exactly like a `'character-set'` row's step B — no separate `contrastWords` subset was needed. `sokuon-row`'s words are simply ordered as adjacent pairs/families in `words.ts` (おと next to おっと, etc.) to read as a minimal-pair sequence without a schema change. Revisit this if a future `'contrast-pairs'` category genuinely needs a word list that's LARGER than what a single Learn pass should show (not true for 促音).

Still holds from the first draft, unchanged: pitch-accent rendering (`WordCard.tsx`'s `AccentedKana`, `accents.ts`) assumes one kana glyph = one mora = one accent position, which yōon (りゃ = 2 glyphs, 1 mora) will break. Needs a real fix before any yōon word can show a correct accent line — not urgent until yōon content actually exists, but should happen *before* that content is written, not after someone notices the accent line is wrong. (促音's っ is a full mora on its own, so this doesn't affect sokuon's accent lines — `AccentedKana` already renders them correctly.)

## Resolved: mastered badge for zero-new-character lessons

Decided: 長音-style lessons with no new characters of their own never show 🌟 mastered — "taught" (viewed once) is the only completion signal they get. No new accuracy-based mastery metric is introduced. Every other category (促音, 拗音, 特殊音, カタカナ) has real characters and uses the existing taught/mastered mechanism unchanged.

## Next step

The design is fully decided; katakana (`'character-set'`), sokuon, and chōon (both `'contrast-pairs'`) are all implemented — see "Progress" above. What's left:

- **拗音 (yōon) and 特殊音 — next up.** Both `'character-set'`, same shape as katakana, but blocked on the one-kana-glyph-= one-mora accent fix noted above before real content can ship with correct pitch-accent lines.
