import { describe, expect, it } from 'vitest'
import type { AnchorWord } from '../data/types'
import { WORDS_BY_ID, WORDS_BY_ROW } from '../data/words'
import { checkWordReading, checkWordReadingAlternatives } from './wordReadingMatching'

const SAKANA: AnchorWord = { id: 'w-sakana', kana: 'さかな', romaji: 'sakana', meaning: 'fish', characterIds: ['sa', 'ka', 'na'] }

describe('checkWordReading', () => {
  it('succeeds on an exact match', () => {
    expect(checkWordReading('さかな', SAKANA)).toEqual({ outcome: 'success' })
  })

  it('requires an exact normalized reading rather than accepting extra speech', () => {
    expect(checkWordReading('さかなです', SAKANA)).toEqual({ outcome: 'incorrect' })
  })

  it('succeeds across katakana/hiragana folding', () => {
    expect(checkWordReading('サカナ', SAKANA)).toEqual({ outcome: 'success' })
  })

  it('accepts safe romaji case, spacing, and hyphen variation', () => {
    expect(checkWordReading('SA-KA NA', SAKANA)).toEqual({ outcome: 'success' })
  })

  it('accepts the word audio text as a common recognition form', () => {
    const oneesan = { ...SAKANA, kana: 'おねえさん', romaji: 'oneesan', audioText: 'お姉さん' }
    expect(checkWordReading('お姉さん', oneesan)).toEqual({ outcome: 'success' })
  })

  it('accepts only target-specific yōon recognition aliases', () => {
    const shashin = {
      ...SAKANA,
      id: 'youon-sha-shashin',
      kana: 'しゃしん',
      romaji: 'shashin',
      audioText: '写真',
      recognitionAliases: ['しやしん'],
    }
    expect(checkWordReading('しやしん', shashin)).toEqual({ outcome: 'success' })
    expect(checkWordReading('写真', shashin)).toEqual({ outcome: 'success' })
  })

  it.each([
    ['きゃく', 'kyaku', 'きやく'],
    ['じゅう', 'juu', 'じゆう'],
    ['びょういん', 'byouin', 'びよういん'],
  ])('does not generically expand small yōon in %s into a different real word', (kana, romaji, transcript) => {
    expect(checkWordReading(transcript, { ...SAKANA, kana, romaji })).toEqual({ outcome: 'incorrect' })
  })

  it('is incorrect for a different real word', () => {
    expect(checkWordReading('いぬ', SAKANA)).toEqual({ outcome: 'incorrect' })
  })

  it.each([
    ['kao', { kana: 'あお', romaji: 'ao' }],
    ['外国', WORDS_BY_ID['ta-soto']],
    ['ティッシュ', WORDS_BY_ID['ta-te']],
  ])('rejects a longer different word that only contains the target: %s', (transcript, target) => {
    expect(checkWordReading(transcript, { ...SAKANA, ...target })).toEqual({ outcome: 'incorrect' })
  })

  it('is unrecognized for an empty transcript', () => {
    expect(checkWordReading('', SAKANA)).toEqual({ outcome: 'unrecognized' })
  })
})

describe('checkWordReadingAlternatives', () => {
  it('succeeds if any of up to 3 alternatives matches', () => {
    expect(checkWordReadingAlternatives(['いぬ', 'さかな', 'ねこ'], SAKANA)).toEqual({ outcome: 'success' })
  })

  it('is incorrect when none match but at least one was recognized speech', () => {
    expect(checkWordReadingAlternatives(['いぬ', 'ねこ'], SAKANA)).toEqual({ outcome: 'incorrect' })
  })

  it('is unrecognized when given no alternatives', () => {
    expect(checkWordReadingAlternatives([], SAKANA)).toEqual({ outcome: 'unrecognized' })
  })
})

describe('yōon vocabulary recognition aliases', () => {
  const words = Object.fromEntries(
    Object.entries(WORDS_BY_ROW)
      .filter(([rowId]) => rowId.startsWith('youon-') || rowId.startsWith('special-katakana-'))
      .flatMap(([, rowWords]) => rowWords.map((word) => [word.id, word])),
  )

  it('keeps canonical kana, audioText/kanji, romaji, and only safe representation aliases valid across the full audited pool', () => {
    for (const word of Object.values(words)) {
      expect(checkWordReading(word.kana, word)).toEqual({ outcome: 'success' })
      expect(checkWordReading(word.romaji.toUpperCase(), word)).toEqual({ outcome: 'success' })
      if (word.audioText) expect(checkWordReading(word.audioText, word)).toEqual({ outcome: 'success' })
      for (const alias of word.recognitionAliases ?? []) {
        expect(checkWordReading(alias, word)).toEqual({ outcome: 'success' })
      }
    }
  })

  it.each([
    ['youon-ma-ra-bimyou', '微妙'],
    ['youon-ma-ra-ryokan', '旅館'],
  ])('accepts a target-specific alias only when it is a safe ASR representation of the correct pronunciation: %s', (id, alias) => {
    expect(checkWordReading(alias, words[id])).toEqual({ outcome: 'success' })
  })

  it.each([
    ['youon-ka-kyaku', 'きやく'],
    ['youon-sha-juu', 'じゆう'],
    ['youon-ha-byouin', 'びよういん'],
    ['youon-ha-hyaku', 'ひやく'],
  ])('keeps unsafe real-word collision %s incorrect', (id, transcript) => {
    expect(checkWordReading(transcript, words[id])).toEqual({ outcome: 'incorrect' })
  })

  it.each([
    ['youon-sha-shashin', 'しやしん'],
    ['youon-cha-na-chuui', 'ちゆうい'],
    ['youon-ma-ra-bimyou', 'びみよう'],
    ['youon-ma-ra-ryokan', 'りよかん'],
    ['youon-katakana-ka-kyabetsu', 'キヤベツ'],
    ['youon-katakana-sha-juusu', 'ジユース'],
    ['special-katakana-fa-figyua', 'フィギユア'],
    ['special-katakana-she-jesuchaa', 'ジェスチヤー'],
  ])('rejects a large や/ゆ/よ pronunciation error for %s', (id, transcript) => {
    expect(checkWordReading(transcript, words[id])).toEqual({ outcome: 'incorrect' })
  })

  it('rejects every allowed form from a different Word Reading target', () => {
    const allWords = Object.values(WORDS_BY_ROW).flat()
    const crossTargetSuccesses: { sourceId: string; targetId: string; form: string }[] = []

    for (const source of allWords) {
      const allowedForms = [source.kana, source.audioText, ...(source.recognitionAliases ?? []), source.romaji]
        .filter((form): form is string => Boolean(form))
      for (const target of allWords) {
        if (source.id === target.id) continue
        for (const form of allowedForms) {
          if (checkWordReading(form, target).outcome === 'success') {
            crossTargetSuccesses.push({ sourceId: source.id, targetId: target.id, form })
          }
        }
      }
    }

    expect(crossTargetSuccesses).toEqual([])
  })
})
