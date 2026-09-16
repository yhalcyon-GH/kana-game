import { CHARACTERS } from '../data/characters'
import { ROWS_BY_ID } from '../data/curriculum'
import { ALL_WORDS } from '../data/words'

// Deterministic, rerunnable audit of how often each taught character id
// (NOT raw Unicode glyph — see the module comment on why that distinction
// matters for yōon/multi-glyph ids and the separate katakana-* namespace)
// appears across the shipped vocabulary in words.ts. Reruns automatically
// pick up new characters/rows/words, so this never goes stale the way a
// one-off manual count would (Issue #272).

export type CharacterFrequency = {
  characterId: string
  kana: string
  romaji: string
  categoryId: string
  rowId: string
  // Total times this character id appears across every word's characterIds
  // (a word using the same character twice, e.g. ここ's ['ko', 'ko'],
  // counts twice here).
  totalOccurrences: number
  // Number of distinct words containing this character id at least once.
  distinctWordCount: number
  wordIds: string[]
}

// Counts every character id's occurrences (and the distinct words it
// appears in) across ALL_WORDS, then joins that against CHARACTERS so every
// taught character is represented even if it never appears in a word at
// all (totalOccurrences: 0) — a naive word-side-only tally would silently
// drop exactly the characters this audit most needs to surface.
export function computeKanaFrequency(): CharacterFrequency[] {
  const occurrences = new Map<string, number>()
  const wordIdsByCharacter = new Map<string, string[]>()

  for (const word of ALL_WORDS) {
    const seenInThisWord = new Set<string>()
    for (const characterId of word.characterIds) {
      occurrences.set(characterId, (occurrences.get(characterId) ?? 0) + 1)
      if (!seenInThisWord.has(characterId)) {
        seenInThisWord.add(characterId)
        const existing = wordIdsByCharacter.get(characterId)
        if (existing) existing.push(word.id)
        else wordIdsByCharacter.set(characterId, [word.id])
      }
    }
  }

  return CHARACTERS.map((character) => {
    const row = ROWS_BY_ID[character.rowId]
    const wordIds = wordIdsByCharacter.get(character.id) ?? []
    return {
      characterId: character.id,
      kana: character.kana,
      romaji: character.romaji,
      categoryId: row?.categoryId ?? 'unknown',
      rowId: character.rowId,
      totalOccurrences: occurrences.get(character.id) ?? 0,
      distinctWordCount: wordIds.length,
      wordIds,
    }
  })
}

// The low-frequency tail: every character at or below `maxOccurrences`
// (default 1 — zero dedicated coverage or exactly one example word),
// sorted worst-first. This is the audit's actionable output — cross-
// reference it against DOCUMENTED_STRUCTURAL_EXCEPTIONS before treating any
// entry as something to fix.
export function getLowFrequencyTail(
  frequencies: CharacterFrequency[],
  maxOccurrences = 1,
): CharacterFrequency[] {
  return frequencies
    .filter((f) => f.totalOccurrences <= maxOccurrences)
    .sort((a, b) => a.totalOccurrences - b.totalOccurrences || a.characterId.localeCompare(b.characterId))
}

// Character ids with zero (or effectively zero) standalone vocabulary
// coverage for a documented, intentional reason — grammatical particles
// that don't occur in standalone words, kana folded in for structural
// completeness only, deliberate duplicate-meaning-across-scripts removals,
// or a genuinely rare mora with no everyday native/loanword vocabulary to
// draw on. These are NOT accidental scarcity, and should not be padded with
// unnatural filler words just to raise their count. Each value cites the
// words.ts/characters.ts comment the exception is drawn from, so this list
// stays auditable against its source rather than trusted blindly — see
// Issue #272's "Required audit" section.
export const DOCUMENTED_STRUCTURAL_EXCEPTIONS: Record<string, string> = {
  wo: 'を is a grammatical particle that essentially never appears inside a standalone word — words.ts represents it with one phrase (みずをのむ) instead. See words.ts header comment.',
  'katakana-wo': 'Modern Japanese never actually writes the を particle in katakana, even inside all-katakana text. See words.ts katakana-ra-row comment.',
  dji: '「ぢ」is rarely used except in special cases (characters.ts note); excluded from Kana Quiz.',
  dzu: '「づ」is rarely used except in special cases (characters.ts note); excluded from Kana Quiz.',
  'katakana-dji': 'ヂ mirrors ぢ — rarely used except in special cases.',
  'katakana-dzu': 'ヅ mirrors づ — rarely used except in special cases.',
  nya: 'にゃんこ (kitty) was cut per the user\'s request (2026-08-15). See words.ts youon-cha-na-row comment.',
  nyo: 'にょきにょき (onomatopoeia) was cut per the user\'s request (2026-08-15). See words.ts youon-cha-na-row comment.',
  hyo: 'ひょう (leopard) was cut here — kept only as ヒョウ in youon-katakana-ha-row, the same duplicate-meaning-across-scripts fix as きゅうり. See words.ts youon-ha-row comment.',
  hyu: 'Real vocabulary/loanwords using ひゅ specifically is scarce; the katakana form is already covered by ヒューズ. See words.ts youon-ha-row comment.',
  byu: 'Real vocabulary/loanwords using びゅ specifically is scarce; the katakana form is already covered by デビュー. See words.ts youon-ha-row comment.',
  pyu: 'Real vocabulary/loanwords using ぴゅ specifically is scarce; the katakana form is already covered by ピュア. See words.ts youon-ha-row comment.',
  rya: 'りゃ vocabulary is thin; even the former katakana example リャマ (llama) was cut. See words.ts youon-ma-ra-row comment.',
  ryu: 'りゅう (dragon) was cut at the user\'s request. See words.ts youon-ma-ra-row comment.',
  pya: 'ぴゃ has essentially no real (non-onomatopoeia) Japanese vocabulary.',
  pyo: 'ぴょんぴょん (onomatopoeia) was cut at the user\'s request (2026-08-15), and no other real ぴょ word exists. See words.ts youon-ha-row comment.',
  myu: 'みゅ has no real native/loanword-adjacent hiragana vocabulary; the katakana form is already covered (ミュージアム, ミュート, ...).',
  'katakana-bya': 'ヒャ/ビャ have no dedicated word — rare even among katakana loanwords. See words.ts youon-katakana-ha-row comment.',
  'katakana-hya': 'ヒャ/ビャ have no dedicated word — rare even among katakana loanwords. See words.ts youon-katakana-ha-row comment.',
  'katakana-nya': 'ニャー (meow) was cut. See words.ts youon-katakana-cha-na-row comment.',
  'katakana-nyo': 'ニョ has no dedicated word — rare even among katakana loanwords. See words.ts youon-katakana-cha-na-row comment.',
  'katakana-rya': 'リャマ (llama) was cut at the user\'s request. See words.ts youon-katakana-ma-ra-row comment.',
  'katakana-ryo': 'リュウ/リョウ (both just a person\'s name, not real vocabulary) were cut. See words.ts youon-katakana-ma-ra-row comment.',
  'katakana-myo': 'ミョ has no dedicated word — rare even among katakana loanwords. See words.ts youon-katakana-ma-ra-row comment.',
}
