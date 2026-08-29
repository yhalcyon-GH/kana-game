import { groupCharactersByColumn } from '../lib/kanaColumns'
import type { KanaChar } from '../data/types'
import { CharacterCard } from './CharacterCard'

type Props = {
  characters: KanaChar[]
  // Special Katakana's groups (ファフィフェフォ, ティディ, シェジェチェ,
  // ウィウェウォ) don't span all 5 vowel columns, so the normal 5-wide
  // grouped-by-column layout below would leave empty placeholder slots for
  // missing vowels. `compact: true` skips column grouping entirely and
  // renders every character in a single responsive flex-wrap row instead —
  // scoped via this prop rather than sprinkling special-katakana id checks
  // through callers. Normal Hiragana/Katakana/Yōon grids are unaffected
  // (they don't pass this prop).
  compact?: boolean
}

// Shows a row's characters in 五十音図 shape — each dakuten/handakuten
// group on its own line of 5 vowel-column slots, leaving a gap rather than
// left-packing when a group is missing a column (や/ゆ/よ, 拗音 groups, ...).
// See lib/kanaColumns.ts. ん and ー/っ/ッ have no column, so they get their
// own compact line instead of forcing a 5-wide grid around one card.
export function CharacterGrid({ characters, compact = false }: Props) {
  if (compact) {
    return (
      <div className="flex flex-wrap justify-center gap-2 sm:gap-4">
        {characters.map((char) => (
          <CharacterCard key={char.id} char={char} />
        ))}
      </div>
    )
  }
  const rows = groupCharactersByColumn(characters)
  return (
    <div className="flex flex-col items-center gap-4">
      {rows.map((row, i) =>
        'other' in row ? (
          <div key={i} className="flex flex-wrap justify-center gap-4">
            {row.other.map((char) => (
              <CharacterCard key={char.id} char={char} />
            ))}
          </div>
        ) : (
          <div key={i} className="grid grid-cols-5 gap-2 sm:gap-4">
            {row.columns.map((char, col) => (char ? <CharacterCard key={char.id} char={char} /> : <div key={col} />))}
          </div>
        ),
      )}
    </div>
  )
}
