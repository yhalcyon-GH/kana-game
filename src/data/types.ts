export type CharType = 'base' | 'dakuten' | 'handakuten'

export type KanaChar = {
  id: string
  kana: string
  romaji: string
  rowId: string
  type: CharType
}

// A top-level script/sound-type grouping (hiragana, katakana, sokuon, ...) —
// see docs/curriculum-extensibility.md for the full design. `learnStyle`
// picks which Learn/Practice shape a row in this category uses:
// 'character-set' is today's flashcard -> recap -> words flow with all four
// mini-games; 'contrast-pairs' (促音/長音) listens through minimal-pair
// words instead of flashcarding a new character, traces words only (no
// isolated-character trace phase), and drops Kana Quiz from Practice.
export type ScriptCategory = {
  id: string
  label: string
  learnStyle: 'character-set' | 'contrast-pairs'
}

export type GojuonRow = {
  id: string
  categoryId: string
  label: string
  characterIds: string[]
  order: number
}

export type AnchorWord = {
  id: string
  kana: string
  romaji: string
  meaning: string
  image: string
  characterIds: string[]
  audioText?: string
}
