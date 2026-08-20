import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useProgressStore } from '../store/progressStore'
import { REVIEW_SCOPE_ID, useCurriculum } from './useCurriculum'

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

  it('the review scope mixes every taught row\'s words, falling back to all taught words when nothing is due', () => {
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().markRowTaught('ka-row')
    const { result } = renderHook(() => useCurriculum())
    // Freshly taught characters start at box 0, which is always due, so
    // every taught word should come back (nothing to fall back from yet).
    const reviewWords = result.current.getScopeWords(REVIEW_SCOPE_ID)
    const aWords = result.current.getScopeWords('a-row')
    const kaWords = result.current.getScopeWords('ka-row')
    expect(reviewWords.length).toBe(aWords.length + kaWords.length)
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

  // Review inclusion is mistake-driven (reviewScore, see lib/srs.ts), not
  // time-driven — a character only shows up as weak once its own score
  // crosses the threshold, regardless of box or how recently it was seen.
  describe('mistake-driven Review (reviewScore)', () => {
    it('a taught character with reviewScore below the threshold is not weak', () => {
      useProgressStore.getState().markRowTaught('a-row')
      useProgressStore.getState().adjustCharacterReviewScore('a', 4)
      const { result } = renderHook(() => useCurriculum())
      expect(result.current.weakCharacterIds).not.toContain('a')
      expect(result.current.reviewCount).toBe(0)
    })

    it('a character becomes weak once its reviewScore reaches the threshold (5)', () => {
      useProgressStore.getState().markRowTaught('a-row')
      useProgressStore.getState().adjustCharacterReviewScore('a', 5)
      const { result } = renderHook(() => useCurriculum())
      expect(result.current.weakCharacterIds).toContain('a')
      expect(result.current.reviewCount).toBe(1)
    })

    it('a word becomes weak from its OWN score, independent of its characters', () => {
      useProgressStore.getState().markRowTaught('a-row')
      useProgressStore.getState().adjustWordReviewScore('a-ai', 10)
      const { result } = renderHook(() => useCurriculum())
      expect(result.current.weakWords.map((w) => w.id)).toContain('a-ai')
      // Neither of a-ai's own characters was marked weak directly.
      expect(result.current.weakCharacterIds).not.toContain('a')
      expect(result.current.weakCharacterIds).not.toContain('i')
    })

    it("getScopeWords(REVIEW_SCOPE_ID) pulls in a word containing a weak character even if the word's own score is fine", () => {
      useProgressStore.getState().markRowTaught('a-row')
      useProgressStore.getState().adjustCharacterReviewScore('a', 5)
      const { result } = renderHook(() => useCurriculum())
      const reviewWords = result.current.getScopeWords(REVIEW_SCOPE_ID)
      expect(reviewWords.some((w) => w.characterIds.includes('a'))).toBe(true)
    })

    it('falls back to every unlocked word when nothing is weak yet, so Review is never empty', () => {
      useProgressStore.getState().markRowTaught('a-row')
      const { result } = renderHook(() => useCurriculum())
      const reviewWords = result.current.getScopeWords(REVIEW_SCOPE_ID)
      expect(reviewWords.length).toBeGreaterThan(0)
    })
  })
})
