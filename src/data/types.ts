export type CharType = 'base' | 'dakuten' | 'handakuten'

export type KanaChar = {
  id: string
  kana: string
  romaji: string
  rowId: string
  type: CharType
  // Shown instead of `romaji` on the Learn flashcard (see CharacterCard.tsx)
  // for characters whose `romaji` is a placeholder rather than a real
  // pronunciation (e.g. ー's romaji is '-', kept 1 character long so the
  // answer-checking length math in lib/answerChecking.ts still lines up —
  // see characters.ts's comment on katakana-chouon). Leave unset for any
  // character whose `romaji` is already meaningful on its own.
  displayLabel?: string
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
  // Optional: every hiragana word has a hand-sourced word-icons/*.webp
  // illustration (a paid/manual effort, not regeneratable by a script —
  // see scripts/ header comments), but new categories may ship content
  // before art exists for it. Absent means "no art yet", not "broken
  // path" — see WordCard.tsx and the 3 mini-games that render word.image
  // for the placeholder they show instead.
  image?: string
  characterIds: string[]
  audioText?: string
}
