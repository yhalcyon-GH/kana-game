import { describe, expect, it } from 'vitest'
import { CHARACTERS_BY_ID } from '../data/characters'
import { ROWS_BY_ID } from '../data/curriculum'
import { WORDS_BY_ROW } from '../data/words'
import { isReviewContentAccessible, isSavedContentAccessible } from './commercialAccess'
import { resolveCharacterSourceCategory, resolveWordSourceCategory } from './commercialContentSource'

describe('commercial content source resolution', () => {
  it('resolves a character category through its canonical character and row records', () => {
    const character = CHARACTERS_BY_ID.a
    expect(character).toBeDefined()
    expect(resolveCharacterSourceCategory(character.id)).toBe(ROWS_BY_ID[character.rowId].categoryId)
  })

  it('resolves a word category only from its canonical WORDS_BY_ROW membership', () => {
    const [rowId, words] = Object.entries(WORDS_BY_ROW).find(([candidateRowId]) => ROWS_BY_ID[candidateRowId].categoryId === 'hiragana')!
    expect(resolveWordSourceCategory(words[0].id)).toBe(ROWS_BY_ID[rowId].categoryId)
  })

  it('fails closed when a character or word source cannot be resolved', () => {
    const unknownCharacterCategory = resolveCharacterSourceCategory('not-a-character')
    const unknownWordCategory = resolveWordSourceCategory('not-a-word')

    expect(unknownCharacterCategory).toBeUndefined()
    expect(unknownWordCategory).toBeUndefined()
    expect(isReviewContentAccessible(unknownCharacterCategory ?? 'unknown', 'active')).toBe(false)
    expect(isSavedContentAccessible(unknownWordCategory ?? 'unknown', 'active')).toBe(false)
  })

  it('fails closed when a word id belongs to more than one canonical row', () => {
    const [, hiraganaWords] = Object.entries(WORDS_BY_ROW).find(([rowId]) => ROWS_BY_ID[rowId].categoryId === 'hiragana')!
    const [, paidWords] = Object.entries(WORDS_BY_ROW).find(([rowId]) => ROWS_BY_ID[rowId].categoryId !== 'hiragana')!
    const duplicatedWord = paidWords[0]

    hiraganaWords.push(duplicatedWord)
    try {
      expect(resolveWordSourceCategory(duplicatedWord.id)).toBeUndefined()
    } finally {
      hiraganaWords.pop()
    }
  })
})
