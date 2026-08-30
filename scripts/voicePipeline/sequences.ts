// Named, ordered id lists describing the order a recording session reads
// characters aloud in (classic gojuon table order: あいうえお かきくけこ...
// わをん). This is NOT always the same order CHARACTERS is declared in —
// src/data/characters.ts orders katakana by TEACHING order (ン is folded
// into the first katakana lesson, right after カ行), not table order, so
// katakana's sequence below is hand-ordered rather than derived by filtering
// CHARACTERS in-place. Every id here is validated against CHARACTERS_BY_ID
// at import time (see the check at the bottom) — a typo or renamed id fails
// loudly instead of silently mis-mapping a recorded syllable to the wrong
// output filename.
import { CHARACTERS_BY_ID } from '../../src/data/characters'

export type SequenceName = keyof typeof SEQUENCES

export const SEQUENCES = {
  'hiragana-gojuon-46': [
    'a', 'i', 'u', 'e', 'o',
    'ka', 'ki', 'ku', 'ke', 'ko',
    'sa', 'shi', 'su', 'se', 'so',
    'ta', 'chi', 'tsu', 'te', 'to',
    'na', 'ni', 'nu', 'ne', 'no',
    'ha', 'hi', 'fu', 'he', 'ho',
    'ma', 'mi', 'mu', 'me', 'mo',
    'ya', 'yu', 'yo',
    'ra', 'ri', 'ru', 're', 'ro',
    'wa', 'wo', 'n',
  ],
  'hiragana-dakuten-20': [
    'ga', 'gi', 'gu', 'ge', 'go',
    'za', 'ji', 'zu', 'ze', 'zo',
    'da', 'dji', 'dzu', 'de', 'do',
    'ba', 'bi', 'bu', 'be', 'bo',
  ],
  'hiragana-handakuten-5': ['pa', 'pi', 'pu', 'pe', 'po'],
  'katakana-gojuon-46': [
    'katakana-a', 'katakana-i', 'katakana-u', 'katakana-e', 'katakana-o',
    'katakana-ka', 'katakana-ki', 'katakana-ku', 'katakana-ke', 'katakana-ko',
    'katakana-sa', 'katakana-shi', 'katakana-su', 'katakana-se', 'katakana-so',
    'katakana-ta', 'katakana-chi', 'katakana-tsu', 'katakana-te', 'katakana-to',
    'katakana-na', 'katakana-ni', 'katakana-nu', 'katakana-ne', 'katakana-no',
    'katakana-ha', 'katakana-hi', 'katakana-fu', 'katakana-he', 'katakana-ho',
    'katakana-ma', 'katakana-mi', 'katakana-mu', 'katakana-me', 'katakana-mo',
    'katakana-ya', 'katakana-yu', 'katakana-yo',
    'katakana-ra', 'katakana-ri', 'katakana-ru', 'katakana-re', 'katakana-ro',
    'katakana-wa', 'katakana-wo', 'katakana-n',
  ],
  'katakana-dakuten-20': [
    'katakana-ga', 'katakana-gi', 'katakana-gu', 'katakana-ge', 'katakana-go',
    'katakana-za', 'katakana-ji', 'katakana-zu', 'katakana-ze', 'katakana-zo',
    'katakana-da', 'katakana-dji', 'katakana-dzu', 'katakana-de', 'katakana-do',
    'katakana-ba', 'katakana-bi', 'katakana-bu', 'katakana-be', 'katakana-bo',
  ],
  'katakana-handakuten-5': ['katakana-pa', 'katakana-pi', 'katakana-pu', 'katakana-pe', 'katakana-po'],
  'katakana-chouon-mark': ['katakana-chouon'],
  'sokuon-2': ['sokuon', 'katakana-sokuon'],
  'youon-hiragana-33': [
    'kya', 'kyu', 'kyo', 'gya', 'gyu', 'gyo',
    'sha', 'shu', 'sho', 'ja', 'ju', 'jo',
    'cha', 'chu', 'cho', 'nya', 'nyu', 'nyo',
    'hya', 'hyu', 'hyo', 'bya', 'byu', 'byo', 'pya', 'pyu', 'pyo',
    'mya', 'myu', 'myo', 'rya', 'ryu', 'ryo',
  ],
  'youon-katakana-33': [
    'katakana-kya', 'katakana-kyu', 'katakana-kyo', 'katakana-gya', 'katakana-gyu', 'katakana-gyo',
    'katakana-sha', 'katakana-shu', 'katakana-sho', 'katakana-ja', 'katakana-ju', 'katakana-jo',
    'katakana-cha', 'katakana-chu', 'katakana-cho', 'katakana-nya', 'katakana-nyu', 'katakana-nyo',
    'katakana-hya', 'katakana-hyu', 'katakana-hyo', 'katakana-bya', 'katakana-byu', 'katakana-byo',
    'katakana-pya', 'katakana-pyu', 'katakana-pyo',
    'katakana-mya', 'katakana-myu', 'katakana-myo', 'katakana-rya', 'katakana-ryu', 'katakana-ryo',
  ],
} as const satisfies Record<string, readonly string[]>

for (const [name, ids] of Object.entries(SEQUENCES)) {
  for (const id of ids) {
    if (!(id in CHARACTERS_BY_ID)) {
      throw new Error(`sequences.ts: sequence "${name}" references unknown character id "${id}" (not in CHARACTERS_BY_ID)`)
    }
  }
}

export function resolveSequence(name: string): readonly string[] {
  if (!(name in SEQUENCES)) {
    const known = Object.keys(SEQUENCES).join(', ')
    throw new Error(`Unknown sequence "${name}". Known sequences: ${known}`)
  }
  return SEQUENCES[name as SequenceName]
}
