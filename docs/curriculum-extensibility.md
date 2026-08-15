# Curriculum extensibility: adding katakana, sokuon, chōon, yōon, and 特殊音

**Status: design decided in conversation (2026-08-14/15). Katakana implemented (branch `feature/katakana`) — see "Progress" below. Sokuon/chōon/yōon/特殊音 not yet started.** The open questions from the first draft of this doc have been resolved by the user directly; this version reflects those decisions.

## Progress

- **カタカナ単音 (katakana) — done, `feature/katakana` branch.** Full character set (71 + ー), all 9 rows, 81 vocabulary words, stroke data, font subset. ー (chōon) and ン are taught in the first row (katakana-a-row) rather than a dedicated final row, and ワ/ヲ are folded into the last row (katakana-ra-row) alongside ラ~ロ — see curriculum.ts's ROWS comment for why. Went first specifically because `learnStyle: 'character-set'` needed zero new Learn/Practice/Tracing code — pure content on top of the already-merged `ScriptCategory`/`Lesson`-adjacent structural foundation (`CATEGORIES`/`ROWS[].categoryId`/category-scoped order helpers). Flagged for the user's review: no word-icon art yet (AnchorWord.image made optional, with a placeholder — see `WordImage.tsx`), ヲ has no vocabulary reinforcement (unlike hiragana's を), and katakana-chouon's romaji (`'-'`) is a placeholder pending real 長音 support.
- **促音/長音/拗音/特殊音 — not started.** These need the `'contrast-pairs'` Learn/Practice/Tracing changes described below, which katakana didn't touch.

## Decisions made

1. **特殊音 scope**: extended katakana combinations for loanword sounds (ファ/フィ/ウェ/ティ/ディ/ヴ...), distinct from standard yōon. Confirmed by the user.
2. **Route/URL shape**: nested category routes, `/practice/:categoryId/:lessonId/...` (e.g. `/practice/hiragana/a-row`, `/practice/katakana/a-row`, `/practice/sokuon/...`). Chosen over keeping flat globally-unique row ids, specifically because it keeps future development smoother even though it means migrating every existing hiragana URL (`/practice/a-row` → `/practice/hiragana/a-row`) — an intentional, confirmed tradeoff, not an oversight.
3. **Learn/Practice flow differs by category, in two concrete styles** (not the vaguer "character-set vs. concept" split the first draft proposed):

   **`contrast-pairs` style — 促音 (sokuon) and 長音 (chōon):**
   - Learn = listen to **minimal-pair words** that isolate the rule, not a per-character flashcard sequence. User's own examples:
     - 促音: おと (oto) vs. おっと (otto)
     - 長音: おばさん (obasan) vs. おばあさん (obaasan); ビル (biru) vs. ビール (biiru) — note 長音 deliberately spans both scripts in one lesson, hiragana's vowel-repetition pattern *and* a review/reinforcement of katakana's ー (which was already taught fresh under カタカナ単音, not re-taught here).
   - Tracing is **word-level only** — no separate "trace this one new character in isolation" phase, even for 促音's っ (which is a genuine new glyph). This is a real implementation detail: `TracingPage.tsx` currently early-returns when `charPool.length === 0` (see `if (charPool.length === 0) return null`), which would incorrectly hide Tracing entirely for 長音 if that category has zero new characters of its own (see below) — needs adjusting to support a words-only pass.
   - Practice = today's four games **minus Kana Quiz** — confirmed explicitly ("長音と促音はKanaQuizはできないのでなくします"). Kana Quiz's "see an isolated character, pick its reading" premise doesn't fit a duration/rhythm rule. Listening, Kana Typing, and Word Builder all still operate on whole words and remain applicable.

   **`character-set` style — 拗音 (yōon), 特殊音, and (by the same logic) カタカナ単音:**
   - Learn works exactly like existing hiragana rows today: flashcard through each new character, recap grid, then vocabulary built from them. Confirmed explicitly ("いままでのひらがなと同様に").
   - Practice = all four existing games, unchanged.

   This replaces the first draft's `kind: 'character-set' | 'concept'` with what's actually a cleaner split — every category has real new characters *except* possibly 長音 (see next point), so the distinguishing factor is the **Learn/Tracing shape** (per-character vs. per-contrast-word), not "has new characters or not."

## Remaining structural note: 長音 may introduce zero new characters

促音 introduces one real new glyph (っ) — it needs a `CHARACTERS` entry, stroke data, audio, like any other character, just taught via word contrast rather than solo flashcard. 長音, though, might introduce **none**: ー is already taught fresh under カタカナ単音 (it's part of learning katakana itself, not its own lesson), and hiragana's long vowels reuse existing vowel characters — 長音's own lesson only ever *reviews* ー, never introduces it. If that's right, 長音 is a lesson with `characterIds: []` (or no new-character step at all), which is exactly the case that breaks `TracingPage.tsx`'s current early-return, and is worth deciding explicitly during implementation rather than being discovered as a bug.

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

Still holds from the first draft, unchanged: pitch-accent rendering (`WordCard.tsx`'s `AccentedKana`, `accents.ts`) assumes one kana glyph = one mora = one accent position, which yōon (りゃ = 2 glyphs, 1 mora) will break. Needs a real fix before any yōon word can show a correct accent line — not urgent until yōon content actually exists, but should happen *before* that content is written, not after someone notices the accent line is wrong.

## Resolved: mastered badge for zero-new-character lessons

Decided: 長音-style lessons with no new characters of their own never show 🌟 mastered — "taught" (viewed once) is the only completion signal they get. No new accuracy-based mastery metric is introduced. Every other category (促音, 拗音, 特殊音, カタカナ) has real characters and uses the existing taught/mastered mechanism unchanged.

## Next step

The design is fully decided and the structural foundation plus katakana (the first `'character-set'` category) are implemented — see "Progress" above. What's left is the harder half: 促音/長音 need the actual `'contrast-pairs'` Learn/Practice/Tracing changes this doc describes (word-contrast Learn instead of per-character flashcards, words-only Tracing, Kana Quiz dropped from Practice), which no existing category has exercised yet. Start a new session/task specifically for that when ready — this document plus its "Proposed shape" section, and the katakana branch as a reference for the parts that *don't* change, should be enough context to begin without re-deriving the design.
