import type { AnchorWord } from '../data/types'

export type SoundLengthDomain = 'sokuon' | 'long-vowel' | 'no-insertion'
export type SoundLengthQuestion = {
  domain: SoundLengthDomain
  word: AnchorWord
  prompt: string
  correct: string
  choices: string[]
  diagnostic: 'sokuon' | 'hiragana-vowel' | 'katakana-chouon' | 'no-insertion'
}

export type SoundLengthAssessmentPlan = { questions: SoundLengthQuestion[] }

export function createSoundLengthRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0
    return state / 4294967296
  }
}

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function hasKatakana(word: AnchorWord) { return /[ァ-ヺー]/u.test(word.kana) }
function isSokuon(word: AnchorWord) { return word.characterIds.includes('sokuon') || word.characterIds.includes('katakana-sokuon') }
function isLongVowel(word: AnchorWord) {
  return word.characterIds.includes('katakana-chouon') || /[あいうえお][あいうえお]/u.test(word.kana) || /[いえうお]/u.test(word.kana) && word.id.startsWith('chouon-')
}

function vowelForLong(word: AnchorWord): string {
  if (hasKatakana(word)) return 'ー'
  if (word.id.startsWith('chouon-a-')) return 'あ'
  if (word.id.startsWith('chouon-i-')) return 'い'
  if (word.id.startsWith('chouon-u-')) return 'う'
  if (word.id.startsWith('chouon-e-')) return word.id === 'chouon-e-oneesan' ? 'え' : 'い'
  if (word.id.startsWith('chouon-o-')) return ['chouon-o-ookii', 'chouon-o-tooi', 'chouon-o-koori'].includes(word.id) ? 'お' : 'う'
  return 'う'
}

export function buildSoundLengthPrompt(word: AnchorWord, correct: string, domain: SoundLengthDomain): string {
  const chars = [...word.kana]
  if (domain === 'no-insertion') {
    // × means no character belongs between these two existing kana; preserve
    // the whole word rather than replacing one of its characters.
    const insertionIndex = Math.max(1, Math.min(chars.length - 1, Math.floor(chars.length / 2)))
    return `${chars.slice(0, insertionIndex).join('')}□${chars.slice(insertionIndex).join('')}`
  }
  const index = domain === 'sokuon'
    ? chars.findIndex((char) => char === 'っ' || char === 'ッ')
    : domain === 'long-vowel' && correct === 'ー'
      ? chars.findIndex((char) => char === 'ー')
      : domain === 'long-vowel'
        ? chars.findIndex((char, i) => i > 0 && char === correct)
        : Math.max(1, chars.length - 1)
  const safeIndex = index >= 0 ? index : Math.max(1, chars.length - 1)
  return `${chars.slice(0, safeIndex).join('')}□${chars.slice(safeIndex + 1).join('')}`
}

function choicesFor(word: AnchorWord, correct: string, domain: SoundLengthDomain, rng: () => number): string[] {
  const vowels = hasKatakana(word) ? ['ア', 'イ', 'ウ', 'エ', 'オ'] : ['あ', 'い', 'う', 'え', 'お']
  const required = domain === 'long-vowel' && (word.id.startsWith('chouon-e-') || word.id.startsWith('chouon-katakana-e-'))
    ? (hasKatakana(word) ? ['イ', 'エ'] : ['い', 'え'])
    : domain === 'long-vowel' && (word.id.startsWith('chouon-o-') || word.id.startsWith('chouon-katakana-o-'))
      ? (hasKatakana(word) ? ['ウ', 'オ'] : ['う', 'お'])
      : [correct]
  const marker = hasKatakana(word) ? 'ッ' : 'っ'
  // The diagnostic alternatives are deliberately mandatory.  Shuffling
  // before slicing previously allowed the correct marker to disappear.
  const mandatory = [...new Set([correct, '×', marker, 'ー', ...required])]
  const extras = shuffle(vowels.filter((vowel) => !mandatory.includes(vowel)), rng)
  return shuffle([...mandatory, ...extras.slice(0, Math.max(0, 5 - mandatory.length))], rng)
}

function pickDistinct(words: AnchorWord[], count: number, predicate: (word: AnchorWord) => boolean, rng: () => number): AnchorWord[] {
  return shuffle(words.filter(predicate), rng).slice(0, count)
}

export function buildSoundLengthAssessmentPlan(words: readonly AnchorWord[], rng: () => number): SoundLengthAssessmentPlan {
  const pool = [...words]
  const sokuon = pickDistinct(pool, 5, isSokuon, rng)
  const longVowels = pickDistinct(pool, 10, isLongVowel, rng)
  const used = new Set([...sokuon, ...longVowels].map((word) => word.id))
  const plain = pickDistinct(pool, 5, (word) => !used.has(word.id) && !isSokuon(word) && !isLongVowel(word), rng)
  if (sokuon.length < 5 || longVowels.length < 10 || plain.length < 5) throw new Error('Insufficient vocabulary coverage for Sokuon/Chōon assessment')
  const make = (domain: SoundLengthDomain, word: AnchorWord): SoundLengthQuestion => {
    const correct = domain === 'sokuon' ? (word.kana.includes('ッ') ? 'ッ' : 'っ') : domain === 'long-vowel' ? vowelForLong(word) : '×'
    return { domain, word, prompt: buildSoundLengthPrompt(word, correct, domain), correct, choices: choicesFor(word, correct, domain, rng), diagnostic: domain === 'sokuon' ? 'sokuon' : domain === 'no-insertion' ? 'no-insertion' : correct === 'ー' ? 'katakana-chouon' : 'hiragana-vowel' }
  }
  const blocks = {
    sokuon: shuffle(sokuon.map((w) => make('sokuon', w)), rng),
    'long-vowel': shuffle(longVowels.map((w) => make('long-vowel', w)), rng),
    'no-insertion': shuffle(plain.map((w) => make('no-insertion', w)), rng),
  }
  // With a 10/5/5 quota, five repeated four-question slots are a simple
  // complete schedule: every slot has one long-vowel item and two distinct
  // contrast items, so no feasible seed can produce a run of three domains.
  const contrastOrder = shuffle(['sokuon', 'no-insertion'] as const, rng)
  const result: SoundLengthQuestion[] = []
  for (let i = 0; i < 5; i++) {
    result.push(blocks['long-vowel'].shift()!)
    result.push(blocks[contrastOrder[0]].shift()!)
    result.push(blocks['long-vowel'].shift()!)
    result.push(blocks[contrastOrder[1]].shift()!)
  }
  return { questions: result }
}
