import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  CHOUON_CATEGORY_ID,
  DEFAULT_CATEGORY_ID,
  KATAKANA_CATEGORY_ID,
  ROWS,
  SOKUON_CATEGORY_ID,
  YOUON_CATEGORY_ID,
} from '../data/curriculum'
import { useProgressStore } from '../store/progressStore'
import { REVIEW_SCOPE_ID, useCurriculum } from './useCurriculum'

// Drives every real (non-summary) row in a category to its own Recommended
// Path 'done' state — the exact signal recommendedCategoryId reuses — via
// the existing store actions, rather than reaching into internals.
function completeCategory(categoryId: string) {
  for (const row of ROWS.filter((r) => r.categoryId === categoryId && !r.isSummary)) {
    useProgressStore.getState().markRowTaught(row.id)
    useProgressStore.getState().markRowActivityCompleted(row.id, 'kanaQuiz')
    useProgressStore.getState().markRowActivityCompleted(row.id, 'listening')
    useProgressStore.getState().markRowActivityCompleted(row.id, 'wordBuilder')
  }
}

beforeEach(() => {
  useProgressStore.getState().resetProgress()
})

describe('useCurriculum', () => {
  it('isScopeReady is true for any real row regardless of taught/unlocked status', () => {
    const { result } = renderHook(() => useCurriculum())
    expect(result.current.isScopeReady('ka-row')).toBe(true)
  })

  it('isScopeReady is false for the review scope until at least one row is taught', () => {
    const { result: before } = renderHook(() => useCurriculum())
    expect(before.current.isScopeReady(REVIEW_SCOPE_ID)).toBe(false)

    useProgressStore.getState().markRowTaught('a-row')
    const { result: after } = renderHook(() => useCurriculum())
    expect(after.current.isScopeReady(REVIEW_SCOPE_ID)).toBe(true)
  })

  it('getScopeWords returns a real row\'s own word list', () => {
    const { result } = renderHook(() => useCurriculum())
    const words = result.current.getScopeWords('a-row')
    expect(words.length).toBeGreaterThan(0)
    expect(words.every((w) => w.characterIds.every((c) => ['a', 'i', 'u', 'e', 'o'].includes(c)))).toBe(true)
  })

  it('getScopeCharacterIds returns the cumulative pool (including earlier rows) for a real row', () => {
    const { result } = renderHook(() => useCurriculum())
    const ids = result.current.getScopeCharacterIds('ka-row')
    // ka-row's own characters plus every a-row character introduced before it.
    expect(ids).toEqual(expect.arrayContaining(['a', 'i', 'u', 'e', 'o', 'ka', 'ki', 'ku', 'ke', 'ko']))
  })

  it('getScopeQuizCharacterIds returns only a real row\'s own new characters, not the cumulative pool', () => {
    const { result } = renderHook(() => useCurriculum())
    const ids = result.current.getScopeQuizCharacterIds('ka-row')
    expect(ids.every((id) => !['a', 'i', 'u', 'e', 'o'].includes(id))).toBe(true)
  })

  it('the review scope is empty across every taught row until something is actually missed', () => {
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().markRowTaught('ka-row')
    const { result } = renderHook(() => useCurriculum())
    // No fallback to "everything taught" any more — Review starts empty.
    expect(result.current.getScopeWords(REVIEW_SCOPE_ID)).toEqual([])
  })

  // Regression: a summary row's characterIds hold the FULL aggregated
  // character list for its category, so a naive "does any of this row's
  // characters appear in practicedCharacterIds" check makes the whole
  // summary row (and therefore the whole category) count as practiced the
  // moment a single real character in that category is practiced.
  it('practicing a single character does not unlock the rest of its category through the summary row', () => {
    useProgressStore.getState().recordResult('a', true)
    const { result } = renderHook(() => useCurriculum())
    expect(result.current.unlockedCharacterIds).toContain('a')
    expect(result.current.unlockedCharacterIds).not.toContain('ka')
  })

  it('unknown/undefined scope ids return empty results rather than throwing', () => {
    const { result } = renderHook(() => useCurriculum())
    expect(result.current.getScopeWords(undefined)).toEqual([])
    expect(result.current.getScopeCharacterIds('not-a-real-row')).toEqual([])
    expect(result.current.isScopeReady(undefined)).toBe(false)
  })

  // Kana Quiz doesn't fit 'contrast-pairs' categories (促音/長音 — see
  // docs/curriculum-extensibility.md), so once a contrast-pairs row is
  // taught, its characters shouldn't surface in Review's Kana Quiz pool
  // even though Review otherwise mixes every taught row together.
  it('getScopeQuizCharacterIds excludes contrast-pairs characters from the review scope, but keeps them in getScopeCharacterIds', () => {
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().markRowTaught('sokuon-row')
    // Active character Review has no fallback any more — mark an a-row
    // character (and, for symmetry, a sokuon one) actually weak so this
    // test can tell "excluded because contrast-pairs" apart from "excluded
    // because nothing is active at all".
    useProgressStore.getState().recordCharacterReviewResult('a', false)
    useProgressStore.getState().recordCharacterReviewResult('sokuon', false)
    const { result } = renderHook(() => useCurriculum())

    const quizIds = result.current.getScopeQuizCharacterIds(REVIEW_SCOPE_ID)
    expect(quizIds).not.toEqual(expect.arrayContaining(['sokuon', 'katakana-sokuon']))
    expect(quizIds.length).toBeGreaterThan(0) // a-row's characters are still quizzable

    // Word Builder's distractor-tile pool is a different concern (whole
    // words, not isolated readings) — っ/ッ should still be available there.
    const charIds = result.current.getScopeCharacterIds(REVIEW_SCOPE_ID)
    expect(charIds).toEqual(expect.arrayContaining(['sokuon', 'katakana-sokuon']))
  })

  // ぢ/づ display the same romaji as じ/ず, so Kana Quiz (unlike Kana Typing,
  // which still accepts typing them) excludes them entirely to avoid a
  // duplicate-looking multiple-choice option.
  it('getScopeQuizCharacterIds excludes ぢ/づ from a real row too', () => {
    const { result } = renderHook(() => useCurriculum())
    const ids = result.current.getScopeQuizCharacterIds('ta-row')
    expect(ids).not.toEqual(expect.arrayContaining(['dji', 'dzu']))
    expect(ids).toEqual(expect.arrayContaining(['ta', 'chi', 'tsu', 'te', 'to']))
  })

  // katakana-chouon (ー) has a placeholder romaji ('-', see characters.ts) —
  // it has no isolated pronunciation, so Kana Quiz shouldn't ask "what does
  // ー say" any more than it would for っ/ッ.
  it('getScopeQuizCharacterIds excludes katakana-chouon (ー), which has no real isolated reading', () => {
    const { result } = renderHook(() => useCurriculum())
    const ids = result.current.getScopeQuizCharacterIds('katakana-a-row')
    expect(ids).not.toContain('katakana-chouon')
  })

  // Review inclusion is mistake-driven (active/streak, see lib/srs.ts), not
  // time-driven — a character only shows up as weak once a miss activates
  // it, regardless of box or how recently it was seen. Character Review and
  // word Review are independent pools (Issue #2): a word never appears in
  // word Review merely because it contains a weak character, and vice versa.
  describe('mistake-driven Review (active/streak)', () => {
    it('a taught character that has never been missed is not weak', () => {
      useProgressStore.getState().markRowTaught('a-row')
      const { result } = renderHook(() => useCurriculum())
      expect(result.current.weakCharacterIds).not.toContain('a')
      expect(result.current.reviewCount).toBe(0)
    })

    it('a character becomes weak the moment it is missed', () => {
      useProgressStore.getState().markRowTaught('a-row')
      useProgressStore.getState().recordCharacterReviewResult('a', false)
      const { result } = renderHook(() => useCurriculum())
      expect(result.current.weakCharacterIds).toContain('a')
      expect(result.current.reviewCount).toBe(1)
    })

    it('a character graduates out of Review after two consecutive correct answers', () => {
      useProgressStore.getState().markRowTaught('a-row')
      useProgressStore.getState().recordCharacterReviewResult('a', false)
      useProgressStore.getState().recordCharacterReviewResult('a', true)
      useProgressStore.getState().recordCharacterReviewResult('a', true)
      const { result } = renderHook(() => useCurriculum())
      expect(result.current.weakCharacterIds).not.toContain('a')
    })

    it('a word becomes weak from its OWN miss, independent of its characters', () => {
      useProgressStore.getState().markRowTaught('a-row')
      useProgressStore.getState().recordWordReviewResult('a-ai', false)
      const { result } = renderHook(() => useCurriculum())
      expect(result.current.weakWords.map((w) => w.id)).toContain('a-ai')
      // Neither of a-ai's own characters was marked weak directly.
      expect(result.current.weakCharacterIds).not.toContain('a')
      expect(result.current.weakCharacterIds).not.toContain('i')
      expect(result.current.reviewCharacterCount).toBe(0)
      expect(result.current.reviewWordCount).toBe(1)
      expect(result.current.reviewCount).toBe(1)
    })

    it('counts weak characters and independently weak words as separate Review items', () => {
      useProgressStore.getState().markRowTaught('a-row')
      useProgressStore.getState().recordCharacterReviewResult('a', false)
      useProgressStore.getState().recordWordReviewResult('a-ie', false)
      const { result } = renderHook(() => useCurriculum())
      expect(result.current.reviewCharacterCount).toBe(1)
      expect(result.current.reviewWordCount).toBe(1)
      expect(result.current.reviewCount).toBe(2)
    })

    // Issue #2's core pool-separation rule: か being weak must not
    // automatically pull かさ/さかな/いか (or any word containing か) into
    // word Review — only a word's own miss does that.
    it("getScopeWords(REVIEW_SCOPE_ID) does NOT include a word just because it contains a weak character", () => {
      useProgressStore.getState().markRowTaught('a-row')
      useProgressStore.getState().recordCharacterReviewResult('a', false)
      const { result } = renderHook(() => useCurriculum())
      const reviewWords = result.current.getScopeWords(REVIEW_SCOPE_ID)
      expect(reviewWords).toEqual([])
    })

    it('getScopeQuizCharacterIds(REVIEW_SCOPE_ID) returns only active characters, with no fallback when empty', () => {
      useProgressStore.getState().markRowTaught('a-row')
      const { result: before } = renderHook(() => useCurriculum())
      expect(before.current.getScopeQuizCharacterIds(REVIEW_SCOPE_ID)).toEqual([])

      useProgressStore.getState().recordCharacterReviewResult('a', false)
      const { result: after } = renderHook(() => useCurriculum())
      expect(after.current.getScopeQuizCharacterIds(REVIEW_SCOPE_ID)).toEqual(['a'])
    })

    it('does not fall back to every unlocked word when nothing is weak — Review is genuinely empty', () => {
      useProgressStore.getState().markRowTaught('a-row')
      const { result } = renderHook(() => useCurriculum())
      expect(result.current.getScopeWords(REVIEW_SCOPE_ID)).toEqual([])
    })
  })

  // Issue #21: recommendedCategoryId drives HomePage's section-level
  // "⭐ Recommended" card — reuses the exact same per-row Recommended Path
  // 'done' signal PracticeHubPage already uses (see completeCategory above),
  // walked in CATEGORIES' declared order (hiragana -> katakana -> sokuon ->
  // chōon -> yōon).
  describe('recommendedCategoryId', () => {
    it('recommends hiragana before anything is learned', () => {
      const { result } = renderHook(() => useCurriculum())
      expect(result.current.recommendedCategoryId).toBe(DEFAULT_CATEGORY_ID)
    })

    it('moves to katakana once every hiragana row is done', () => {
      completeCategory(DEFAULT_CATEGORY_ID)
      const { result } = renderHook(() => useCurriculum())
      expect(result.current.recommendedCategoryId).toBe(KATAKANA_CATEGORY_ID)
    })

    it('moves to sokuon once hiragana and katakana are both done', () => {
      completeCategory(DEFAULT_CATEGORY_ID)
      completeCategory(KATAKANA_CATEGORY_ID)
      const { result } = renderHook(() => useCurriculum())
      expect(result.current.recommendedCategoryId).toBe(SOKUON_CATEGORY_ID)
    })

    it('moves to chōon once sokuon is also done', () => {
      completeCategory(DEFAULT_CATEGORY_ID)
      completeCategory(KATAKANA_CATEGORY_ID)
      completeCategory(SOKUON_CATEGORY_ID)
      const { result } = renderHook(() => useCurriculum())
      expect(result.current.recommendedCategoryId).toBe(CHOUON_CATEGORY_ID)
    })

    it('moves to yōon once chōon is also done', () => {
      completeCategory(DEFAULT_CATEGORY_ID)
      completeCategory(KATAKANA_CATEGORY_ID)
      completeCategory(SOKUON_CATEGORY_ID)
      completeCategory(CHOUON_CATEGORY_ID)
      const { result } = renderHook(() => useCurriculum())
      expect(result.current.recommendedCategoryId).toBe(YOUON_CATEGORY_ID)
    })

    it('recommends nothing once every category is done', () => {
      completeCategory(DEFAULT_CATEGORY_ID)
      completeCategory(KATAKANA_CATEGORY_ID)
      completeCategory(SOKUON_CATEGORY_ID)
      completeCategory(CHOUON_CATEGORY_ID)
      completeCategory(YOUON_CATEGORY_ID)
      const { result } = renderHook(() => useCurriculum())
      expect(result.current.recommendedCategoryId).toBeNull()
    })
  })
})
