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

type SoundLengthQuestionSpec = {
  domain: SoundLengthDomain
  blankIndex: number
  correct: string
  contrast?: 'sokuon' | 'chouon'
  confusable?: string[]
}

// Every word taught by the Sokuon/Chōon curriculum has one explicit spelling
// decision. This is intentionally exhaustive: buildSoundLengthAssessmentPlan
// fails closed if vocabulary is added without a matching entry, so assessment
// behavior can never silently fall back to ID-prefix or vowel heuristics.
const SOUND_LENGTH_QUESTION_SPECS: Record<string, SoundLengthQuestionSpec> = {
  'sokuon-oto': { domain: 'no-insertion', blankIndex: 1, correct: '×', contrast: 'sokuon' },
  'sokuon-otto': { domain: 'sokuon', blankIndex: 1, correct: 'っ' },
  'sokuon-kako': { domain: 'no-insertion', blankIndex: 1, correct: '×', contrast: 'sokuon' },
  'sokuon-kakko': { domain: 'sokuon', blankIndex: 1, correct: 'っ' },
  'sokuon-katakana-bagu': { domain: 'no-insertion', blankIndex: 1, correct: '×', contrast: 'sokuon' },
  'sokuon-katakana-baggu': { domain: 'sokuon', blankIndex: 1, correct: 'ッ' },
  'sokuon-kite': { domain: 'no-insertion', blankIndex: 1, correct: '×', contrast: 'sokuon' },
  'sokuon-kitte': { domain: 'sokuon', blankIndex: 1, correct: 'っ' },
  'sokuon-mate': { domain: 'no-insertion', blankIndex: 1, correct: '×', contrast: 'sokuon' },
  'sokuon-matte': { domain: 'sokuon', blankIndex: 1, correct: 'っ' },
  'sokuon-mote': { domain: 'no-insertion', blankIndex: 1, correct: '×', contrast: 'sokuon' },
  'sokuon-motte': { domain: 'sokuon', blankIndex: 1, correct: 'っ' },
  'sokuon-iki': { domain: 'no-insertion', blankIndex: 1, correct: '×', contrast: 'sokuon' },
  'sokuon-ikki': { domain: 'sokuon', blankIndex: 1, correct: 'っ' },
  'sokuon-machi': { domain: 'no-insertion', blankIndex: 1, correct: '×', contrast: 'sokuon' },
  'sokuon-katakana-macchi': { domain: 'sokuon', blankIndex: 1, correct: 'ッ' },
  'chouon-a-obasan': { domain: 'no-insertion', blankIndex: 2, correct: '×', contrast: 'chouon', confusable: ['あ'] },
  'chouon-a-obaasan': { domain: 'long-vowel', blankIndex: 2, correct: 'あ' },
  'chouon-a-okaasan': { domain: 'long-vowel', blankIndex: 2, correct: 'あ' },
  'chouon-a-maamaa': { domain: 'long-vowel', blankIndex: 1, correct: 'あ' },
  'chouon-i-ojisan': { domain: 'no-insertion', blankIndex: 2, correct: '×', contrast: 'chouon', confusable: ['い'] },
  'chouon-i-ojiisan': { domain: 'long-vowel', blankIndex: 2, correct: 'い' },
  'chouon-i-oniisan': { domain: 'long-vowel', blankIndex: 2, correct: 'い' },
  'chouon-i-ii': { domain: 'long-vowel', blankIndex: 1, correct: 'い' },
  'chouon-u-yuuki': { domain: 'long-vowel', blankIndex: 1, correct: 'う' },
  'chouon-u-suuji': { domain: 'long-vowel', blankIndex: 1, correct: 'う' },
  'chouon-u-fuusen': { domain: 'long-vowel', blankIndex: 1, correct: 'う' },
  'chouon-u-kuuki': { domain: 'long-vowel', blankIndex: 1, correct: 'う' },
  'chouon-e-eiga': { domain: 'long-vowel', blankIndex: 1, correct: 'い', confusable: ['い', 'え'] },
  'chouon-e-yuumei': { domain: 'long-vowel', blankIndex: 3, correct: 'い', confusable: ['い', 'え'] },
  'chouon-e-teinei': { domain: 'long-vowel', blankIndex: 1, correct: 'い', confusable: ['い', 'え'] },
  'chouon-e-oneesan': { domain: 'long-vowel', blankIndex: 2, correct: 'え', confusable: ['い', 'え'] },
  'chouon-e-gakusei': { domain: 'long-vowel', blankIndex: 3, correct: 'い', confusable: ['い', 'え'] },
  'chouon-e-sensei': { domain: 'long-vowel', blankIndex: 3, correct: 'い', confusable: ['い', 'え'] },
  'chouon-o-otouto': { domain: 'long-vowel', blankIndex: 2, correct: 'う', confusable: ['う', 'お'] },
  'chouon-o-ohayou': { domain: 'long-vowel', blankIndex: 3, correct: 'う', confusable: ['う', 'お'] },
  'chouon-o-koukou': { domain: 'long-vowel', blankIndex: 1, correct: 'う', confusable: ['う', 'お'] },
  'chouon-o-ookii': { domain: 'long-vowel', blankIndex: 1, correct: 'お', confusable: ['う', 'お'] },
  'chouon-o-tooi': { domain: 'long-vowel', blankIndex: 1, correct: 'お', confusable: ['う', 'お'] },
  'chouon-o-koori': { domain: 'long-vowel', blankIndex: 1, correct: 'お', confusable: ['う', 'お'] },
  'chouon-o-imouto': { domain: 'long-vowel', blankIndex: 2, correct: 'う', confusable: ['う', 'お'] },
  'chouon-katakana-biru': { domain: 'no-insertion', blankIndex: 1, correct: '×', contrast: 'chouon' },
  'chouon-katakana-biiru': { domain: 'long-vowel', blankIndex: 1, correct: 'ー' },
  'chouon-katakana-koohii': { domain: 'long-vowel', blankIndex: 1, correct: 'ー' },
  'chouon-katakana-koora': { domain: 'long-vowel', blankIndex: 1, correct: 'ー' },
}

function promptFromSpec(word: AnchorWord, spec: SoundLengthQuestionSpec): string {
  const chars = [...word.kana]
  if (spec.domain === 'no-insertion') {
    return `${chars.slice(0, spec.blankIndex).join('')}□${chars.slice(spec.blankIndex).join('')}`
  }
  return `${chars.slice(0, spec.blankIndex).join('')}□${chars.slice(spec.blankIndex + 1).join('')}`
}

function choicesFor(word: AnchorWord, spec: SoundLengthQuestionSpec, rng: () => number): string[] {
  const { correct } = spec
  const vowels = hasKatakana(word) ? ['ア', 'イ', 'ウ', 'エ', 'オ'] : ['あ', 'い', 'う', 'え', 'お']
  const marker = hasKatakana(word) ? 'ッ' : 'っ'
  // The diagnostic alternatives are deliberately mandatory.  Shuffling
  // before slicing previously allowed the correct marker to disappear.
  const mandatory = [...new Set([correct, '×', marker, 'ー', ...(spec.confusable ?? [])])]
  const extras = shuffle(vowels.filter((vowel) => !mandatory.includes(vowel)), rng)
  return shuffle([...mandatory, ...extras.slice(0, Math.max(0, 5 - mandatory.length))], rng)
}

function pickDistinct(words: AnchorWord[], count: number, predicate: (word: AnchorWord) => boolean, rng: () => number): AnchorWord[] {
  return shuffle(words.filter(predicate), rng).slice(0, count)
}

export function buildSoundLengthAssessmentPlan(words: readonly AnchorWord[], rng: () => number): SoundLengthAssessmentPlan {
  const pool = [...words]
  const unmapped = pool.filter((word) => !SOUND_LENGTH_QUESTION_SPECS[word.id])
  if (unmapped.length > 0) {
    throw new Error(`Missing explicit Sound Length spec for: ${unmapped.map((word) => word.id).join(', ')}`)
  }
  const sokuon = pickDistinct(pool, 5, (word) => SOUND_LENGTH_QUESTION_SPECS[word.id].domain === 'sokuon', rng)
  const longVowels = pickDistinct(pool, 10, (word) => SOUND_LENGTH_QUESTION_SPECS[word.id].domain === 'long-vowel', rng)
  const shortSokuon = pickDistinct(pool, 3, (word) => SOUND_LENGTH_QUESTION_SPECS[word.id].domain === 'no-insertion' && SOUND_LENGTH_QUESTION_SPECS[word.id].contrast === 'sokuon', rng)
  const shortChouon = pickDistinct(pool, 2, (word) => SOUND_LENGTH_QUESTION_SPECS[word.id].domain === 'no-insertion' && SOUND_LENGTH_QUESTION_SPECS[word.id].contrast === 'chouon', rng)
  const plain = shuffle([...shortSokuon, ...shortChouon], rng)
  if (sokuon.length < 5 || longVowels.length < 10 || plain.length < 5) throw new Error('Insufficient vocabulary coverage for Sokuon/Chōon assessment')
  const make = (domain: SoundLengthDomain, word: AnchorWord): SoundLengthQuestion => {
    const spec = SOUND_LENGTH_QUESTION_SPECS[word.id]
    const correct = spec.correct
    return { domain, word, prompt: promptFromSpec(word, spec), correct, choices: choicesFor(word, spec, rng), diagnostic: domain === 'sokuon' ? 'sokuon' : domain === 'no-insertion' ? 'no-insertion' : correct === 'ー' ? 'katakana-chouon' : 'hiragana-vowel' }
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
