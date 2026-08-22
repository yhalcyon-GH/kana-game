export type CharType = 'base' | 'dakuten' | 'handakuten'

export type KanaChar = {
  id: string
  kana: string
  romaji: string
  rowId: string
  type: CharType
  // Shown instead of `romaji` on the Learn flashcard (see CharacterCard.tsx)
  // for characters whose `romaji` is a placeholder rather than a real
  // pronunciation (e.g. ー's romaji is '-', kept 1 character long so the
  // answer-checking length math in lib/answerChecking.ts still lines up —
  // see characters.ts's comment on katakana-chouon). Leave unset for any
  // character whose `romaji` is already meaningful on its own.
  displayLabel?: string
  // A short red advisory shown under the character the first time it's
  // taught (LearnPage's step A only, not the recap grid or other games) —
  // e.g. ぢ/づ's "rarely used, except in special cases" note. Leave unset
  // for any character with nothing special to flag.
  note?: string
}

// A top-level script/sound-type grouping (hiragana, katakana, sokuon, ...) —
// see docs/curriculum-extensibility.md for the full design. `learnStyle`
// picks which Learn/Practice shape a row in this category uses:
// 'character-set' is today's flashcard -> recap -> words flow with all four
// mini-games; 'contrast-pairs' (促音/長音) listens through minimal-pair
// words instead of flashcarding a new character, traces words only (no
// isolated-character trace phase), and drops Kana Quiz from Practice.
export type ScriptCategory = {
  id: string
  label: string
  learnStyle: 'character-set' | 'contrast-pairs'
  // Other categories this one's content draws characters from, if any — see
  // getCumulativeCharacterIds in curriculum.ts. A cross-cutting category
  // like 促音 (whose words mix hiragana AND katakana syllables, since it's
  // taught after both scripts are known) lists both; an independent script
  // track like katakana lists none, since learning it doesn't require or
  // build on hiragana. Do NOT infer this from CATEGORIES array order —
  // "comes later in the list" isn't the same claim as "depends on."
  dependsOnCategoryIds?: string[]
  // Short English intro shown once at the top of this category's section on
  // CategoryRowsPage (see App.tsx's /other, /youon routes etc.) — answers
  // "what is this sound category" for a category whose whole point is a
  // rule (促音/長音/拗音), not obvious from a row-card grid alone. Absent
  // for hiragana/katakana, whose rows speak for themselves.
  explanation?: string
  // Single emoji shown alongside `label` in navigation (breadcrumbs, the
  // home page chooser) — added so a learner who can't read `label` (real
  // kana, e.g. カタカナ) yet still has a visual anchor to recognize the
  // category by while navigating. Not shown on RowMap's row cards, which
  // already show real kana front and center.
  icon?: string
  // Kanji-free stand-in for `label`, shown wherever a total beginner (who
  // may not read ANY kana yet, let alone kanji) would otherwise see raw
  // kanji — HubBreadcrumb, route page titles, a multi-category page's
  // per-category subheading. `label` itself (促音/長音/拗音) stays the real
  // term, used in body copy once the learner has some footing. Unset for
  // hiragana/katakana, whose `label` is already kana-only.
  displayLabel?: string
}

export type GojuonRow = {
  id: string
  categoryId: string
  label: string
  characterIds: string[]
  order: number
  // Short English note shown above this row's word grid on LearnPage (step
  // B) — for a row that teaches a SPECIFIC rule variant within its category
  // (e.g. 長音's per-vowel-row spelling rules), not covered by the
  // category-level `explanation` above, which only introduces the concept
  // once in general terms.
  explanation?: string
  // Short romaji/English "session name" (e.g. 'Ka Row', 'Chōon: A') used in
  // navigation UI (breadcrumbs, prev/next session links on the Practice
  // Hub) where a foreign learner needs to recognize/distinguish a row
  // without necessarily being able to read `label`'s kana yet. `label`
  // itself stays kana-only and remains the row-card display name — this is
  // additive, not a replacement.
  englishLabel?: string
  // Marks a synthetic "summary" row (added after a category's/page's last
  // real row) whose Learn shows every character + every word in the
  // category at once (no per-character flashcard step) and whose Practice
  // draws a fixed 15-question pool from the whole category instead of just
  // this row — see RowMap's ⭐ badge and useCurriculum's summary handling.
  isSummary?: boolean
  // Optional presentation-only split of this row's new-character flashcard
  // step (LearnPage step A) into small logical sound groups (e.g. か行
  // then が行) — each batch gets its own browse-only recap before moving
  // to the next, instead of stepping through every new character before
  // any recap at all. Purely a Learn UI grouping: `characterIds` remains
  // the single source of truth for unlock/mastery/Practice/Review, and
  // flattening `learnBatches` (in order) must equal `characterIds` exactly
  // — see curriculum.test.ts. Absent for rows that don't need it (5 or
  // fewer characters), which keep the original single flashcard -> recap
  // flow unchanged.
  learnBatches?: string[][]
}

export type AnchorWord = {
  id: string
  kana: string
  romaji: string
  meaning: string
  // Optional: every hiragana word has a hand-sourced word-icons/*.webp
  // illustration (a paid/manual effort, not regeneratable by a script —
  // see scripts/ header comments), but new categories may ship content
  // before art exists for it. Absent means "no art yet", not "broken
  // path" — see WordCard.tsx and the 3 mini-games that render word.image
  // for the placeholder they show instead.
  image?: string
  characterIds: string[]
  audioText?: string
}
