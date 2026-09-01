import { describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORY_ID, getNextRowId, getPreviousRowId, KATAKANA_CATEGORY_ID, ROWS, ROWS_BY_ID } from './curriculum'
import { HIRAGANA_SIMILAR_LETTERS_ROW_ID, KATAKANA_SIMILAR_LETTERS_ROW_ID } from './similarLetters'

describe('Similar Letters synthetic rows', () => {
  it('exist exactly once each, in hiragana and katakana respectively', () => {
    expect(ROWS.filter((r) => r.id === HIRAGANA_SIMILAR_LETTERS_ROW_ID)).toHaveLength(1)
    expect(ROWS.filter((r) => r.id === KATAKANA_SIMILAR_LETTERS_ROW_ID)).toHaveLength(1)
    expect(ROWS_BY_ID[HIRAGANA_SIMILAR_LETTERS_ROW_ID].categoryId).toBe(DEFAULT_CATEGORY_ID)
    expect(ROWS_BY_ID[KATAKANA_SIMILAR_LETTERS_ROW_ID].categoryId).toBe(KATAKANA_CATEGORY_ID)
  })

  it('are flagged isSimilarLetters and NOT isSummary', () => {
    expect(ROWS_BY_ID[HIRAGANA_SIMILAR_LETTERS_ROW_ID].isSimilarLetters).toBe(true)
    expect(ROWS_BY_ID[HIRAGANA_SIMILAR_LETTERS_ROW_ID].isSummary).toBeUndefined()
    expect(ROWS_BY_ID[KATAKANA_SIMILAR_LETTERS_ROW_ID].isSimilarLetters).toBe(true)
  })

  it("learnBatches (= confusion groups) flatten exactly to characterIds, in order, matching curriculum.test.ts's own invariant", () => {
    const h = ROWS_BY_ID[HIRAGANA_SIMILAR_LETTERS_ROW_ID]
    const k = ROWS_BY_ID[KATAKANA_SIMILAR_LETTERS_ROW_ID]
    expect(h.learnBatches!.flat()).toEqual(h.characterIds)
    expect(k.learnBatches!.flat()).toEqual(k.characterIds)
    expect(h.learnBatches).toHaveLength(7)
    expect(k.learnBatches).toHaveLength(8)
  })

  it('never gets spliced into the real hiragana/katakana row-to-row chain', () => {
    // ra-row is the last real hiragana row (Issue #155 merged わ・を into it
    // and deleted wa-row); its "next" is still hiragana-summary, not
    // Similar Letters — same for katakana-ra-row.
    expect(getNextRowId('ra-row')).toBe('hiragana-summary')
    expect(getNextRowId('katakana-ra-row')).toBe('katakana-summary')
    expect(getPreviousRowId(HIRAGANA_SIMILAR_LETTERS_ROW_ID)).toBeNull()
    expect(getNextRowId(HIRAGANA_SIMILAR_LETTERS_ROW_ID)).toBeNull()
  })
})
