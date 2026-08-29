import { beforeEach, describe, expect, it } from 'vitest'
import { useProgressStore } from './progressStore'
import { useSavedItemsStore } from './savedItemsStore'

beforeEach(() => {
  localStorage.clear()
  useSavedItemsStore.setState({ savedCharacterIds: [], savedWordIds: [] })
  useProgressStore.getState().resetProgress()
})

describe('savedItemsStore', () => {
  it('saves a character', () => {
    useSavedItemsStore.getState().toggleCharacter('ki')
    expect(useSavedItemsStore.getState().isCharacterSaved('ki')).toBe(true)
    expect(useSavedItemsStore.getState().savedCharacterIds).toEqual(['ki'])
  })

  it('unsaves a previously saved character', () => {
    useSavedItemsStore.getState().toggleCharacter('ki')
    useSavedItemsStore.getState().toggleCharacter('ki')
    expect(useSavedItemsStore.getState().isCharacterSaved('ki')).toBe(false)
    expect(useSavedItemsStore.getState().savedCharacterIds).toEqual([])
  })

  it('saves a word', () => {
    useSavedItemsStore.getState().toggleWord('a-ai')
    expect(useSavedItemsStore.getState().isWordSaved('a-ai')).toBe(true)
    expect(useSavedItemsStore.getState().savedWordIds).toEqual(['a-ai'])
  })

  it('unsaves a previously saved word', () => {
    useSavedItemsStore.getState().toggleWord('a-ai')
    useSavedItemsStore.getState().toggleWord('a-ai')
    expect(useSavedItemsStore.getState().isWordSaved('a-ai')).toBe(false)
    expect(useSavedItemsStore.getState().savedWordIds).toEqual([])
  })

  it('tracks multiple saved characters/words independently', () => {
    useSavedItemsStore.getState().toggleCharacter('ki')
    useSavedItemsStore.getState().toggleCharacter('sa')
    useSavedItemsStore.getState().toggleWord('a-ai')
    expect(useSavedItemsStore.getState().savedCharacterIds).toEqual(['ki', 'sa'])
    expect(useSavedItemsStore.getState().savedWordIds).toEqual(['a-ai'])

    useSavedItemsStore.getState().toggleCharacter('ki')
    expect(useSavedItemsStore.getState().savedCharacterIds).toEqual(['sa'])
    expect(useSavedItemsStore.getState().isWordSaved('a-ai')).toBe(true)
  })

  it('persists to its own localStorage key, separate from progress', async () => {
    const progressBefore = localStorage.getItem('kana-game-progress')

    useSavedItemsStore.getState().toggleCharacter('ki')
    useSavedItemsStore.getState().toggleWord('a-ai')

    const persisted = localStorage.getItem('kana-game-saved-items')
    expect(persisted).not.toBeNull()
    expect(JSON.parse(persisted!).state.savedCharacterIds).toEqual(['ki'])
    expect(JSON.parse(persisted!).state.savedWordIds).toEqual(['a-ai'])
    // Toggling Saved state must never write/change the separate progress key.
    expect(localStorage.getItem('kana-game-progress')).toBe(progressBefore)

    useSavedItemsStore.setState({ savedCharacterIds: [], savedWordIds: [] })
    localStorage.setItem('kana-game-saved-items', persisted!)
    await useSavedItemsStore.persist.rehydrate()

    expect(useSavedItemsStore.getState().savedCharacterIds).toEqual(['ki'])
    expect(useSavedItemsStore.getState().savedWordIds).toEqual(['a-ai'])
  })

  it('is not cleared by Settings\' Reset Progress (progressStore.resetProgress)', () => {
    useSavedItemsStore.getState().toggleCharacter('ki')
    useSavedItemsStore.getState().toggleWord('a-ai')

    useProgressStore.getState().resetProgress()

    expect(useSavedItemsStore.getState().savedCharacterIds).toEqual(['ki'])
    expect(useSavedItemsStore.getState().savedWordIds).toEqual(['a-ai'])
  })

  it('toggling a character/word does not touch Review/SRS, Recommended Path, or any other progressStore state', () => {
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().recordCharacterReviewResult('a', false)
    const before = useProgressStore.getState()
    const snapshot = {
      characters: before.characters,
      words: before.words,
      unlockedRowIds: before.unlockedRowIds,
      taughtRowIds: before.taughtRowIds,
      rowActivityCompletion: before.rowActivityCompletion,
      lastStudied: before.lastStudied,
    }

    useSavedItemsStore.getState().toggleCharacter('a')
    useSavedItemsStore.getState().toggleWord('a-ai')
    useSavedItemsStore.getState().toggleCharacter('ki')

    const after = useProgressStore.getState()
    expect({
      characters: after.characters,
      words: after.words,
      unlockedRowIds: after.unlockedRowIds,
      taughtRowIds: after.taughtRowIds,
      rowActivityCompletion: after.rowActivityCompletion,
      lastStudied: after.lastStudied,
    }).toEqual(snapshot)
  })
})
