import { describe, expect, it } from 'vitest'
import { isAnswerCorrect, normalizeKana } from './answerChecking'

const INU = { kana: 'いぬ' }

describe('isAnswerCorrect', () => {
  it('accepts an exact kana match', () => {
    expect(isAnswerCorrect('いぬ', INU)).toBe(true)
  })

  it('rejects raw Latin romaji, even when it is the word\'s correct reading', () => {
    expect(isAnswerCorrect('inu', INU)).toBe(false)
    expect(isAnswerCorrect('Inu', INU)).toBe(false)
  })

  it('accepts kana with an NFD-decomposed dakuten as equal to the precomposed form', () => {
    // Precomposed ず is U+305A. Built via code points (not a source literal)
    // since editors/tools tend to silently re-normalize decomposed sequences
    // typed directly into source, defeating the point of this test.
    const precomposedZu = String.fromCharCode(0x305a)
    const decomposedZu = String.fromCharCode(0x3059, 0x3099) // す + combining dakuten
    expect(decomposedZu).not.toBe(precomposedZu)
    expect(decomposedZu.normalize('NFC')).toBe(precomposedZu)

    const nezumi = { kana: `ね${precomposedZu}み` }
    const typedDecomposed = `ね${decomposedZu}み`
    expect(isAnswerCorrect(typedDecomposed, nezumi)).toBe(true)
  })

  it('ignores leading/trailing whitespace', () => {
    expect(isAnswerCorrect('  いぬ  ', INU)).toBe(true)
  })

  it('requires the target script exactly — hiragana input does not satisfy a katakana target, or vice versa', () => {
    const terebi = { kana: 'テレビ' }
    expect(isAnswerCorrect('テレビ', terebi)).toBe(true)
    expect(isAnswerCorrect('てれび', terebi)).toBe(false)
    expect(isAnswerCorrect('terebi', terebi)).toBe(false)

    const sakana = { kana: 'さかな' }
    expect(isAnswerCorrect('さかな', sakana)).toBe(true)
    expect(isAnswerCorrect('サカナ', sakana)).toBe(false)
    expect(isAnswerCorrect('sakana', sakana)).toBe(false)
  })

  it('rejects a wrong answer', () => {
    expect(isAnswerCorrect('ねこ', INU)).toBe(false)
  })

  it('preserves the exact target spelling for special material (sokuon/chōon), rather than accepting a transliteration', () => {
    const otto = { kana: 'おっと' }
    expect(isAnswerCorrect('おっと', otto)).toBe(true)
    expect(isAnswerCorrect('おと', otto)).toBe(false)

    const keeki = { kana: 'ケーキ' }
    expect(isAnswerCorrect('ケーキ', keeki)).toBe(true)
    expect(isAnswerCorrect('ケキ', keeki)).toBe(false)
  })
})

describe('normalizeKana', () => {
  it('trims and NFC-normalizes', () => {
    const decomposedGa = String.fromCharCode(0x304b, 0x3099) // か + combining dakuten
    expect(normalizeKana(`  ${decomposedGa}  `)).toBe(String.fromCharCode(0x304c)) // precomposed が
  })
})
