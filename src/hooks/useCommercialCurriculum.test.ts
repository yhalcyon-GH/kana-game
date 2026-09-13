import { createElement, type ReactNode } from 'react'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { EntitlementContext, type EntitlementState } from '../components/EntitlementContext'
import { WORDS_BY_ID } from '../data/words'
import { useProgressStore } from '../store/progressStore'
import { useSavedItemsStore } from '../store/savedItemsStore'
import { REVIEW_SCOPE_ID, useCurriculum } from './useCurriculum'
import { useCommercialCurriculum } from './useCommercialCurriculum'

const user = { userId: 'learner', emailNormalized: 'learner@example.com' }
let state: EntitlementState
function wrapper({ children }: { children: ReactNode }) {
  return createElement(EntitlementContext.Provider, {
    value: { state, refresh: async () => {}, markSignedOut: () => {} },
  }, children)
}

beforeEach(() => {
  state = { status: 'inactive', user }
  useProgressStore.getState().resetProgress()
  useSavedItemsStore.setState({ savedCharacterIds: ['a', 'katakana-a', 'missing'], savedWordIds: ['a-ai', 'sokuon-oto', 'missing'] })
  for (const rowId of ['a-row', 'katakana-a-row', 'sokuon-row']) useProgressStore.getState().markRowTaught(rowId)
  for (const id of ['a', 'katakana-a', 'missing']) useProgressStore.getState().recordCharacterReviewResult(id, false)
  for (const id of ['a-ai', 'sokuon-oto', 'missing']) useProgressStore.getState().recordWordReviewResult(id, false)
})

describe('commercial Review overlay', () => {
  it.each(['signed-out', 'loading', 'inactive', 'unavailable'] as const)('keeps only canonically free Review pools while %s', (status) => {
    state = status === 'signed-out' ? { status, user: null } : { status, user }
    const { result } = renderHook(() => useCommercialCurriculum(), { wrapper })
    expect(WORDS_BY_ID['sokuon-oto'].characterIds).toEqual(['o', 'to'])
    expect(result.current.weakCharacterIds).toEqual(['a'])
    expect(result.current.weakWords.map((w) => w.id)).toEqual(['a-ai'])
    expect(result.current.reviewCharacterCount).toBe(1)
    expect(result.current.reviewWordCount).toBe(1)
    expect(result.current.reviewCount).toBe(2)
    expect(result.current.getScopeWords(REVIEW_SCOPE_ID).map((w) => w.id)).toEqual(['a-ai'])
    expect(result.current.getScopeQuizCharacterIds(REVIEW_SCOPE_ID)).toEqual(['a'])
    expect(result.current.getScopeCharacterIds(REVIEW_SCOPE_ID)).toEqual(['a', 'i', 'u', 'e', 'o', 'n'])
    expect(result.current.unlockedCharacterIds).toEqual(['a', 'i', 'u', 'e', 'o', 'n'])
    expect(result.current.unlockedWords.some((w) => w.id === 'sokuon-oto')).toBe(false)
    expect(result.current.isScopeReady(REVIEW_SCOPE_ID)).toBe(true)
  })

  it('restores retained paid Review items across active -> inactive -> active without any store or storage mutation', () => {
    const progress = JSON.stringify(useProgressStore.getState())
    const saved = JSON.stringify(useSavedItemsStore.getState())
    const storage = JSON.stringify({ ...localStorage })
    state = { status: 'active', user }
    const { result, rerender } = renderHook(() => useCommercialCurriculum(), { wrapper })
    expect(result.current.weakCharacterIds).toEqual(['a', 'katakana-a'])
    expect(result.current.weakWords.map((w) => w.id)).toEqual(['a-ai', 'sokuon-oto'])
    state = { status: 'inactive', user }
    rerender()
    expect(result.current.reviewCount).toBe(2)
    state = { status: 'active', user }
    rerender()
    expect(result.current.reviewCount).toBe(4)
    expect(result.current.getScopeCharacterIds(REVIEW_SCOPE_ID)).toContain('katakana-a')
    expect(result.current.getScopeWords(REVIEW_SCOPE_ID).map((w) => w.id)).toContain('sokuon-oto')
    expect(result.current.weakCharacterIds).not.toContain('missing')
    expect(JSON.stringify(useProgressStore.getState())).toBe(progress)
    expect(JSON.stringify(useSavedItemsStore.getState())).toBe(saved)
    expect(JSON.stringify({ ...localStorage })).toBe(storage)
  })

  it('does not claim Review is ready when only paid content was unlocked', () => {
    useProgressStore.setState({ taughtRowIds: ['katakana-a-row'], characters: {}, words: {} })
    const { result } = renderHook(() => useCommercialCurriculum(), { wrapper })
    expect(result.current.isScopeReady(REVIEW_SCOPE_ID)).toBe(false)
  })

  it('recognizes accessible word-only Review when no character row was unlocked', () => {
    useProgressStore.setState({ taughtRowIds: [], characters: {} })
    useProgressStore.getState().markRowTaught('chouon-a-row')
    state = { status: 'active', user }
    const { result } = renderHook(() => useCommercialCurriculum(), { wrapper })
    expect(result.current.unlockedWords.length).toBeGreaterThan(0)
    expect(result.current.isScopeReady(REVIEW_SCOPE_ID)).toBe(true)
  })

  it('delegates real rows and Recommended/progression results unchanged', () => {
    const { result } = renderHook(() => ({ base: useCurriculum(), commercial: useCommercialCurriculum() }), { wrapper })
    const { base, commercial } = result.current
    for (const scope of ['a-row', 'katakana-a-row', 'sokuon-row', 'missing', undefined]) {
      expect(commercial.getScopeWords(scope)).toEqual(base.getScopeWords(scope))
      expect(commercial.getScopeCharacterIds(scope)).toEqual(base.getScopeCharacterIds(scope))
      expect(commercial.getScopeQuizCharacterIds(scope)).toEqual(base.getScopeQuizCharacterIds(scope))
      expect(commercial.isScopeReady(scope)).toBe(base.isScopeReady(scope))
      expect(commercial.getScopeRounds(scope)).toBe(base.getScopeRounds(scope))
    }
    expect(commercial.globalRecommendedTarget).toEqual(base.globalRecommendedTarget)
    expect(commercial.recommendedCategoryId).toBe(base.recommendedCategoryId)
    expect(commercial.taughtRowIds).toBe(base.taughtRowIds)
    expect(commercial.unlockedRowIds).toBe(base.unlockedRowIds)
  })
})
