import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { useProgressStore } from '../store/progressStore'
import { useTrackLastStudied } from './useTrackLastStudied'

beforeEach(() => {
  useProgressStore.getState().resetProgress()
})

function wrapper(initialPath: string) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="*" element={children} />
      </Routes>
    </MemoryRouter>
  )
}

describe('useTrackLastStudied (Issue #23)', () => {
  it('records a real row\'s Learn page as the resume target', () => {
    renderHook(() => useTrackLastStudied(), { wrapper: wrapper('/learn/hiragana/a-row') })
    expect(useProgressStore.getState().lastStudied).toEqual({ categoryId: 'hiragana', rowId: 'a-row', activity: 'learn' })
  })

  it('records a real row\'s Kana Quiz page as the resume target', () => {
    renderHook(() => useTrackLastStudied(), { wrapper: wrapper('/practice/hiragana/a-row/kana-quiz') })
    expect(useProgressStore.getState().lastStudied).toEqual({
      categoryId: 'hiragana',
      rowId: 'a-row',
      activity: 'kanaQuiz',
    })
  })

  it('does not record the Practice Hub itself', () => {
    renderHook(() => useTrackLastStudied(), { wrapper: wrapper('/practice/hiragana/a-row') })
    expect(useProgressStore.getState().lastStudied).toBeNull()
  })

  it('does not record any Review route', () => {
    renderHook(() => useTrackLastStudied(), { wrapper: wrapper('/practice/review/kana-quiz') })
    expect(useProgressStore.getState().lastStudied).toBeNull()
  })

  it('does not record a summary row', () => {
    renderHook(() => useTrackLastStudied(), { wrapper: wrapper('/learn/hiragana/hiragana-summary') })
    expect(useProgressStore.getState().lastStudied).toBeNull()
  })

  it('does not clobber a valid previous entry when navigating to a non-resumable screen', () => {
    useProgressStore.getState().setLastStudied({ categoryId: 'hiragana', rowId: 'a-row', activity: 'learn' })
    renderHook(() => useTrackLastStudied(), { wrapper: wrapper('/settings') })
    expect(useProgressStore.getState().lastStudied).toEqual({ categoryId: 'hiragana', rowId: 'a-row', activity: 'learn' })
  })

  it('does not affect Recommended Path, completion, Review, or mastery state', () => {
    renderHook(() => useTrackLastStudied(), { wrapper: wrapper('/practice/hiragana/a-row/word-builder') })
    const state = useProgressStore.getState()
    expect(state.rowActivityCompletion).toEqual({})
    expect(state.taughtRowIds).toEqual([])
    expect(state.characters).toEqual({})
    expect(state.words).toEqual({})
  })
})
