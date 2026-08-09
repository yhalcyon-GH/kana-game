import { describe, expect, it } from 'vitest'
import { isAnswerCorrect, normalizeKana, normalizeRomaji } from './answerChecking'

const INU = { kana: 'いぬ', romaji: 'inu' }

describe('isAnswerCorrect', () => {
  it('accepts an exact kana match', () => {
    expect(isAnswerCorrect('いぬ', INU)).toBe(true)
  })

  it('accepts romaji, case-insensitively', () => {
    expect(isAnswerCorrect('Inu', INU)).toBe(true)
    expect(isAnswerCorrect('INU', INU)).toBe(true)
  })

  it('accepts romaji typed in full-width (some JP mobile keyboards default to this)', () => {
    // Full-width "Inu": U+FF29 U+FF4E U+FF55
    const fullWidthInu = String.fromCharCode(0xff29, 0xff4e, 0xff55)
    expect(isAnswerCorrect(fullWidthInu, INU)).toBe(true)
  })

  it('accepts kana with an NFD-decomposed dakuten as equal to the precomposed form', () => {
    // Precomposed ず is U+305A. Built via code points (not a source literal)
    // since editors/tools tend to silently re-normalize decomposed sequences
    // typed directly into source, defeating the point of this test.
    const precomposedZu = String.fromCharCode(0x305a)
    const decomposedZu = String.fromCharCode(0x3059, 0x3099) // す + combining dakuten
    expect(decomposedZu).not.toBe(precomposedZu)
    expect(decomposedZu.normalize('NFC')).toBe(precomposedZu)

    const nezumi = { kana: `ね${precomposedZu}み`, romaji: 'nezumi' }
    const typedDecomposed = `ね${decomposedZu}み`
    expect(isAnswerCorrect(typedDecomposed, nezumi)).toBe(true)
  })

  it('ignores leading/trailing whitespace', () => {
    expect(isAnswerCorrect('  いぬ  ', INU)).toBe(true)
    expect(isAnswerCorrect('  inu  ', INU)).toBe(true)
  })

  it('rejects a wrong answer', () => {
    expect(isAnswerCorrect('ねこ', INU)).toBe(false)
    expect(isAnswerCorrect('neko', INU)).toBe(false)
  })

  it('accepts a multi-word romaji phrase with normalized internal spacing', () => {
    const phrase = { kana: 'みずをのむ', romaji: 'mizu wo nomu' }
    expect(isAnswerCorrect('mizu  wo   nomu', phrase)).toBe(true)
    expect(isAnswerCorrect('MIZU WO NOMU', phrase)).toBe(true)
  })
})

describe('normalizeRomaji', () => {
  it('lowercases, trims, and collapses whitespace', () => {
    expect(normalizeRomaji('  Sushi  ')).toBe('sushi')
    expect(normalizeRomaji('mizu   wo  nomu')).toBe('mizu wo nomu')
  })
})

describe('normalizeKana', () => {
  it('trims and NFC-normalizes', () => {
    const decomposedGa = String.fromCharCode(0x304b, 0x3099) // か + combining dakuten
    expect(normalizeKana(`  ${decomposedGa}  `)).toBe(String.fromCharCode(0x304c)) // precomposed が
  })
})
